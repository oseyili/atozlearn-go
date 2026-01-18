# Windows PowerShell (run from repo root: C:\Users\oseyi\Documents\atozlearngo)
# This script:
# 1) Creates/updates:
#    - .github/workflows/deploy.yml
#    - .github/workflows/health.yml
#    - .github/workflows/autofix.yml
#    - .github/scripts/healthcheck.mjs
#    - .github/scripts/autofix.mjs
# 2) Commits + pushes to origin/main
# 3) Prints the exact GitHub Secrets required (so platforms run independently)
#
# NOTE: GitHub "Workflow permissions: Read & write" cannot be toggled from plain git.
# If you have GitHub CLI (gh) authenticated, the script will also attempt to enable it automatically.

Set-ExecutionPolicy -Scope Process Bypass -Force
$ErrorActionPreference = "Stop"

function Info($m){ Write-Host "[INFO] $m" -ForegroundColor Cyan }
function Ok($m){ Write-Host "[ OK ] $m" -ForegroundColor Green }
function Warn($m){ Write-Host "[WARN] $m" -ForegroundColor Yellow }

# --- Sanity checks ---
if (-not (Test-Path ".\package.json")) { throw "Run this from your repo root (package.json not found)." }
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw "git not found. Install Git for Windows." }

# Ensure directories
New-Item -ItemType Directory -Force ".github\workflows" | Out-Null
New-Item -ItemType Directory -Force ".github\scripts"   | Out-Null

# ---------------------------
# deploy.yml
# ---------------------------
$deployYml = @'
name: Deploy (Build gate + Supabase)

on:
  push:
    branches: ["main"]
  workflow_dispatch:

concurrency:
  group: deploy-main
  cancel-in-progress: true

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: "npm"

      - name: Install
        run: npm ci

      - name: Build gate (never deploy broken frontend)
        env:
          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}
        run: npm run build

      - uses: supabase/setup-cli@v1
        with:
          version: latest

      - name: Link project
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
        run: supabase link --project-ref "${{ secrets.SUPABASE_PROJECT_REF }}"

      - name: Sync secrets to Supabase
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
        run: |
          supabase secrets set STRIPE_SECRET_KEY="${{ secrets.STRIPE_SECRET_KEY }}"
          supabase secrets set STRIPE_WEBHOOK_SECRET="${{ secrets.STRIPE_WEBHOOK_SECRET }}"
          supabase secrets set HEALTHCHECK_API_KEY="${{ secrets.HEALTHCHECK_API_KEY }}"

      - name: Deploy Edge Functions
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
        run: |
          supabase functions deploy create-checkout
          supabase functions deploy stripe-webhook
'@
Set-Content -Path ".github\workflows\deploy.yml" -Value $deployYml -Encoding UTF8
Ok "Wrote .github/workflows/deploy.yml"

# ---------------------------
# health.yml
# ---------------------------
$healthYml = @'
name: Production Health Check

on:
  schedule:
    - cron: "*/10 * * * *"
  workflow_dispatch:

concurrency:
  group: health-main
  cancel-in-progress: false

jobs:
  health:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Run health checks
        env:
          PROD_BASE_URL: ${{ secrets.PROD_BASE_URL }}
          SUPABASE_FUNCTIONS_BASE: ${{ secrets.SUPABASE_FUNCTIONS_BASE }}
          HEALTHCHECK_API_KEY: ${{ secrets.HEALTHCHECK_API_KEY }}
        run: node .github/scripts/healthcheck.mjs
'@
Set-Content -Path ".github\workflows\health.yml" -Value $healthYml -Encoding UTF8
Ok "Wrote .github/workflows/health.yml"

# ---------------------------
# healthcheck.mjs
# ---------------------------
$healthcheckMjs = @'
const must = (k) => {
  const v = process.env[k];
  if (!v) throw new Error(`Missing env: ${k}`);
  return v;
};

const PROD_BASE_URL = must("PROD_BASE_URL");
const SUPABASE_FUNCTIONS_BASE = must("SUPABASE_FUNCTIONS_BASE");
const HEALTHCHECK_API_KEY = must("HEALTHCHECK_API_KEY");

async function check(name, url, opts = {}) {
  const res = await fetch(url, opts);
  const text = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(`[${name}] ${res.status} ${res.statusText}\n${text.slice(0, 600)}`);
  }
}

(async () => {
  await check("frontend", `${PROD_BASE_URL}/`);
  await check("create-checkout OPTIONS", `${SUPABASE_FUNCTIONS_BASE}/create-checkout`, { method: "OPTIONS" });

  await check("create-checkout health", `${SUPABASE_FUNCTIONS_BASE}/create-checkout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-healthcheck-key": HEALTHCHECK_API_KEY,
    },
    body: JSON.stringify({ healthcheck: true }),
  });

  console.log("OK: healthchecks passed");
})().catch((e) => {
  console.error("HEALTHCHECK FAILED:\n", e);
  process.exit(1);
});
'@
Set-Content -Path ".github\scripts\healthcheck.mjs" -Value $healthcheckMjs -Encoding UTF8
Ok "Wrote .github/scripts/healthcheck.mjs"

# ---------------------------
# autofix.yml
# ---------------------------
$autofixYml = @'
name: Autofix Agent

on:
  workflow_run:
    workflows:
      - "Deploy (Build gate + Supabase)"
      - "Production Health Check"
    types:
      - completed
  workflow_dispatch:

permissions:
  contents: write
  pull-requests: write

concurrency:
  group: autofix-main
  cancel-in-progress: false

jobs:
  autofix:
    if: ${{ github.event_name == 'workflow_dispatch' || github.event.workflow_run.conclusion == 'failure' }}
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Apply deterministic patches (idempotent)
        run: node .github/scripts/autofix.mjs

      - name: Create Pull Request (only if changed)
        id: cpr
        uses: peter-evans/create-pull-request@v6
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          branch: "autofix/bot"
          delete-branch: true
          title: "Autofix: recover build/auth/health failures"
          commit-message: "Autofix: apply deterministic recovery patches"
          body: |
            This PR was generated automatically after a failed Deploy/Health run.

            Fixes applied (idempotent):
            - Ensure src/supabaseClient.js exists and is canonical
            - Normalize src/main.jsx import to ./supabaseClient
            - Best-effort patch create-checkout for JWT forwarding + HEALTHCHECK bypass

            If checks pass, this PR will auto-merge.
          labels: |
            autofix
            bot

      - name: Enable auto-merge (squash)
        if: ${{ steps.cpr.outputs.pull-request-number }}
        uses: peter-evans/enable-pull-request-automerge@v3
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          pull-request-number: ${{ steps.cpr.outputs.pull-request-number }}
          merge-method: squash
'@
Set-Content -Path ".github\workflows\autofix.yml" -Value $autofixYml -Encoding UTF8
Ok "Wrote .github/workflows/autofix.yml"

# ---------------------------
# autofix.mjs
# ---------------------------
$autofixMjs = @'
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

/**
 * Patch 1: Ensure canonical src/supabaseClient.js exists
 */
const supabaseClientJs = `import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase environment variables");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
`;

note(changedWrite("src/supabaseClient.js", supabaseClientJs), "Ensure src/supabaseClient.js");

/**
 * Patch 2: Normalize src/main.jsx import to ./supabaseClient (best-effort, idempotent)
 */
note(
  replaceInFile("src/main.jsx", (txt) => {
    const re = /from\s+['"](\.\/|\.\.\/|\.\/lib\/|\.\/utils\/|\.\/services\/|\.\/config\/)?supabaseClient(\.(js|jsx|ts|tsx))?['"]/g;
    return txt.replace(re, 'from "./supabaseClient"');
  }),
  "Normalize src/main.jsx import path (if present)"
);

/**
 * Patch 3: Best-effort patch create-checkout for:
 * - HEALTHCHECK_API_KEY bypass
 * - Authorization Bearer forwarding into Supabase createClient via global headers
 */
const fnPath = "supabase/functions/create-checkout/index.ts";

note(
  replaceInFile(fnPath, (txt) => {
    let out = txt;

    // Ensure HEALTHCHECK_API_KEY env read exists
    if (!out.includes("HEALTHCHECK_API_KEY")) {
      const envBlockRe = /(const\s+SUPABASE_ANON_KEY\s*=\s*Deno\.env\.get\([^)]*\)![^\n]*\n)/;
      if (envBlockRe.test(out)) {
        out = out.replace(envBlockRe, `$1const HEALTHCHECK_API_KEY = Deno.env.get("HEALTHCHECK_API_KEY") ?? null;\n`);
      } else {
        out = `const HEALTHCHECK_API_KEY = Deno.env.get("HEALTHCHECK_API_KEY") ?? null;\n` + out;
      }
    }

    // Ensure authHeader exists in handler
    if (!out.match(/const\s+authHeader\s*=\s*req\.headers\.get\(/)) {
      const serveRe = /Deno\.serve\s*\(\s*async\s*\(\s*req\s*\)\s*=>\s*\{\s*/;
      if (serveRe.test(out)) {
        out = out.replace(
          serveRe,
          (m) => m + `const authHeader = req.headers.get("authorization") || req.headers.get("Authorization") || "";\n`
        );
      }
    }

    // Ensure createClient forwards Authorization
    const hasForwarded =
      out.includes("global: { headers: { Authorization: authHeader") ||
      out.includes("global:{headers:{Authorization:authHeader");

    if (!hasForwarded) {
      out = out.replace(
        /createClient\(\s*SUPABASE_URL\s*,\s*SUPABASE_ANON_KEY\s*\)/g,
        'createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } })'
      );
    }

    // Add deterministic healthcheck bypass early in handler if missing
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

      const insertAfterCorsRe = /(const\s+CORS\s*=\s*corsHeaders\([^)]*\)\s*;\s*\n)/;
      if (insertAfterCorsRe.test(out)) {
        out = out.replace(insertAfterCorsRe, `$1${bypass}\n`);
      } else {
        const serveStartRe = /Deno\.serve\s*\(\s*async\s*\(\s*req\s*\)\s*=>\s*\{\s*/;
        if (serveStartRe.test(out)) {
          out = out.replace(serveStartRe, (m) => m + bypass + "\n");
        }
      }
    }

    return out;
  }),
  "Patch create-checkout for JWT forwarding + healthcheck bypass (best-effort)"
);

console.log(`Done. Changes applied: ${changes}`);
'@
Set-Content -Path ".github\scripts\autofix.mjs" -Value $autofixMjs -Encoding UTF8
Ok "Wrote .github/scripts/autofix.mjs"

# --- Optional: try to enable GitHub Actions workflow write perms via gh (if installed + authenticated) ---
$gh = Get-Command gh -ErrorAction SilentlyContinue
if ($gh) {
  try {
    $repo = (git config --get remote.origin.url)
    if ($repo) {
      Info "Attempting to enable Actions 'read/write' permissions via gh (best-effort)..."
      # This requires gh auth and repo admin rights. If it fails, you must toggle it in GitHub UI.
      gh api -X PUT repos/:owner/:repo/actions/permissions/workflow -f default_workflow_permissions=write -f can_approve_pull_request_reviews=true | Out-Null
      Ok "Requested Actions workflow write permissions."
    }
  } catch {
    Warn "Could not set Actions permissions automatically (needs repo admin + gh auth). If autofix cannot merge PRs, enable:"
    Warn "Repo Settings -> Actions -> General -> Workflow permissions -> Read and write"
    Warn "and 'Allow GitHub Actions to create and approve pull requests'."
  }
} else {
  Warn "GitHub CLI (gh) not found. If autofix cannot merge PRs, enable:"
  Warn "Repo Settings -> Actions -> General -> Workflow permissions -> Read and write"
  Warn "and 'Allow GitHub Actions to create and approve pull requests'."
}

# --- Commit & push ---
Info "Committing and pushing automation files..."
git add .github\workflows\deploy.yml .github\workflows\health.yml .github\workflows\autofix.yml .github\scripts\healthcheck.mjs .github\scripts\autofix.mjs
git commit -m "ci: add deploy+health+autofix autonomous pipeline" | Out-Host
git push origin main | Out-Host
Ok "Pushed to origin/main"

Write-Host ""
Ok "AUTONOMOUS PIPELINE INSTALLED."
Write-Host ""
Write-Host "GitHub Secrets required (Repo -> Settings -> Secrets and variables -> Actions):" -ForegroundColor Yellow
Write-Host "  SUPABASE_ACCESS_TOKEN" -ForegroundColor Yellow
Write-Host "  SUPABASE_PROJECT_REF" -ForegroundColor Yellow
Write-Host "  STRIPE_SECRET_KEY" -ForegroundColor Yellow
Write-Host "  STRIPE_WEBHOOK_SECRET" -ForegroundColor Yellow
Write-Host "  VITE_SUPABASE_URL" -ForegroundColor Yellow
Write-Host "  VITE_SUPABASE_ANON_KEY" -ForegroundColor Yellow
Write-Host "  PROD_BASE_URL" -ForegroundColor Yellow
Write-Host "  SUPABASE_FUNCTIONS_BASE" -ForegroundColor Yellow
Write-Host "  HEALTHCHECK_API_KEY" -ForegroundColor Yellow
Write-Host ""
Write-Host "What happens now:" -ForegroundColor White
Write-Host "- Every push to main runs Deploy workflow (build gate + Supabase deploy)" -ForegroundColor White
Write-Host "- Health workflow runs every 10 min" -ForegroundColor White
Write-Host "- If Deploy/Health fails, Autofix opens PR + auto-merges (if Actions perms allow)" -ForegroundColor White
