import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function exists(p) {
  return fs.existsSync(path.join(root, p));
}

function read(p) {
  return fs.readFileSync(path.join(root, p), "utf8");
}

function write(p, content) {
  const full = path.join(root, p);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, "utf8");
}

function changedWrite(p, content) {
  if (exists(p)) {
    const cur = read(p);
    if (cur === content) return false;
  }
  write(p, content);
  return true;
}

function replaceInFile(p, replacer) {
  if (!exists(p)) return false;
  const cur = read(p);
  const next = replacer(cur);
  if (next === cur) return false;
  write(p, next);
  return true;
}

let changes = 0;
function note(changed, label) {
  if (changed) {
    changes++;
    console.log(`[PATCH] ${label}`);
  } else {
    console.log(`[SKIP ] ${label}`);
  }
}

const supabaseClientJs = `import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase environment variables");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
`;

note(changedWrite("src/supabaseClient.js", supabaseClientJs), "Ensure src/supabaseClient.js");

note(
  replaceInFile("src/main.jsx", (txt) => {
    const re = /from\\s+['"](\\.\\/|\\.\\.\\/|\\.\\/lib\\/|\\.\\/utils\\/|\\.\\/services\\/|\\.\\/config\\/)?supabaseClient(\\.(js|jsx|ts|tsx))?['"]/g;
    return txt.replace(re, 'from "./supabaseClient"');
  }),
  "Normalize src/main.jsx import path (if present)"
);

const fnPath = "supabase/functions/create-checkout/index.ts";

note(
  replaceInFile(fnPath, (txt) => {
    let out = txt;

    if (!out.includes("HEALTHCHECK_API_KEY")) {
      const envBlockRe = /(const\\s+SUPABASE_ANON_KEY\\s*=\\s*Deno\\.env\\.get\\([^)]*\\)![^\\n]*\\n)/;
      if (envBlockRe.test(out)) {
        out = out.replace(envBlockRe, `$1const HEALTHCHECK_API_KEY = Deno.env.get("HEALTHCHECK_API_KEY") ?? null;\\n`);
      } else {
        out = `const HEALTHCHECK_API_KEY = Deno.env.get("HEALTHCHECK_API_KEY") ?? null;\\n` + out;
      }
    }

    if (!out.match(/const\\s+authHeader\\s*=\\s*req\\.headers\\.get\\(/)) {
      const serveRe = /Deno\\.serve\\s*\\(\\s*async\\s*\\(\\s*req\\s*\\)\\s*=>\\s*\\{\\s*/;
      if (serveRe.test(out)) {
        out = out.replace(
          serveRe,
          (m) => m + `const authHeader = req.headers.get("authorization") || req.headers.get("Authorization") || "";\\n`
        );
      }
    }

    const hasForwarded =
      out.includes("global: { headers: { Authorization: authHeader") ||
      out.includes("global:{headers:{Authorization:authHeader");

    if (!hasForwarded) {
      out = out.replace(
        /createClient\\(\\s*SUPABASE_URL\\s*,\\s*SUPABASE_ANON_KEY\\s*\\)/g,
        'createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } })'
      );
    }

    if (!out.includes("x-healthcheck-key") && !out.includes("healthcheck")) {
      const bypass = `
// Deterministic healthcheck bypass (does not require JWT / Stripe)
try {
  const hcKey = req.headers.get("x-healthcheck-key") || "";
  if (HEALTHCHECK_API_KEY && hcKey === HEALTHCHECK_API_KEY) {
    const body = await req.json().catch(() => ({}));
    if (body?.healthcheck === true) {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
  }
} catch (_) {}
`;

      const insertAfterCorsRe = /(const\\s+CORS\\s*=\\s*corsHeaders\\([^)]*\\)\\s*;\\s*\\n)/;
      if (insertAfterCorsRe.test(out)) {
        out = out.replace(insertAfterCorsRe, `$1${bypass}\\n`);
      } else {
        const serveStartRe = /Deno\\.serve\\s*\\(\\s*async\\s*\\(\\s*req\\s*\\)\\s*=>\\s*\\{\\s*/;
        if (serveStartRe.test(out)) {
          out = out.replace(serveStartRe, (m) => m + bypass + "\\n");
        }
      }
    }

    return out;
  }),
  "Patch create-checkout for JWT forwarding + healthcheck bypass (best-effort)"
);

console.log(`Done. Changes applied: ${changes}`);
