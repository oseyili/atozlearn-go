const must = (k) => {
  const v = process.env[k];
  if (!v) {
    console.error(`MISSING SECRET: ${k}`);
    throw new Error(`Missing env: ${k}`);
  }
  return v.trim();
};

const PROD_BASE_URL = must("PROD_BASE_URL").replace(/\/+$/, "");
const SUPABASE_FUNCTIONS_BASE = must("SUPABASE_FUNCTIONS_BASE").replace(/\/+$/, "");

function describeUrls() {
  console.log("=== Healthcheck configuration ===");
  console.log("PROD_BASE_URL:", PROD_BASE_URL);
  console.log("SUPABASE_FUNCTIONS_BASE:", SUPABASE_FUNCTIONS_BASE);
  if (!SUPABASE_FUNCTIONS_BASE.includes("/functions/v1")) {
    console.log("WARN: SUPABASE_FUNCTIONS_BASE does not include /functions/v1 (likely wrong).");
  }
  console.log("Frontend URL:", `${PROD_BASE_URL}/`);
  console.log("Health URL:", `${SUPABASE_FUNCTIONS_BASE}/health`);
  console.log("=================================");
}

async function fetchWithRetry(url, opts, attempts = 3) {
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(url, { redirect: "follow", ...opts });
      const text = await res.text().catch(() => "");
      return { res, text };
    } catch (e) {
      lastErr = e;
      console.log(`RETRY ${i}/${attempts} failed for ${url}:`, e?.message ?? e);
      await new Promise(r => setTimeout(r, 500 * i));
    }
  }
  throw lastErr;
}

async function check(name, url, opts = {}) {
  console.log(`\n--- CHECK: ${name} ---`);
  console.log("URL:", url);
  console.log("METHOD:", opts.method ?? "GET");

  const { res, text } = await fetchWithRetry(url, opts, 3);

  console.log("STATUS:", res.status, res.statusText);
  console.log("HEADERS: content-type =", res.headers.get("content-type"));
  console.log("BODY (first 300 chars):");
  console.log((text ?? "").slice(0, 300));

  if (!res.ok) {
    throw new Error(`[${name}] Non-2xx status: ${res.status}`);
  }
  console.log(`OK: ${name}`);
}

(async () => {
  describeUrls();

  // Frontend alive
  await check("frontend", `${PROD_BASE_URL}/`, { method: "GET" });

  // Health function (no JWT, no Stripe)
  await check("health OPTIONS", `${SUPABASE_FUNCTIONS_BASE}/health`, { method: "OPTIONS" });
  await check("health GET", `${SUPABASE_FUNCTIONS_BASE}/health`, { method: "GET" });

  console.log("\nOK: healthchecks passed");
})().catch((e) => {
  console.error("\nHEALTHCHECK FAILED:");
  console.error(e?.message ?? e);
  process.exit(1);
});
