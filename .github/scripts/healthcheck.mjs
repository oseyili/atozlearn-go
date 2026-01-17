const must = (k) => {
  const v = process.env[k];
  if (!v) throw new Error(`Missing env: ${k}`);
  return v;
};

const PROD_BASE_URL = must("PROD_BASE_URL");
const SUPABASE_FUNCTIONS_BASE = must("SUPABASE_FUNCTIONS_BASE");

async function check(name, url, opts = {}) {
  const res = await fetch(url, opts);
  const text = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(`[${name}] ${res.status} ${res.statusText}\n${text.slice(0, 600)}`);
  }
  console.log(`OK: ${name}`);
}

(async () => {
  // 1) Frontend alive
  await check("frontend", `${PROD_BASE_URL}/`);

  // 2) Health function reachable (no JWT, no Stripe)
  await check("health OPTIONS", `${SUPABASE_FUNCTIONS_BASE}/health`, { method: "OPTIONS" });
  await check("health GET", `${SUPABASE_FUNCTIONS_BASE}/health`, { method: "GET" });

  console.log("OK: healthchecks passed");
})().catch((e) => {
  console.error("HEALTHCHECK FAILED:\n", e);
  process.exit(1);
});
