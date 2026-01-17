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
