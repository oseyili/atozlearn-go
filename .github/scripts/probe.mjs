import fs from "node:fs";

const must = (k) => {
  const v = process.env[k];
  if (!v) return { missing: true, value: null };
  return { missing: false, value: v.trim().replace(/\/+$/, "") };
};

const PROD_BASE_URL = must("PROD_BASE_URL");
const SUPABASE_FUNCTIONS_BASE = must("SUPABASE_FUNCTIONS_BASE");
const HEALTHCHECK_API_KEY = must("HEALTHCHECK_API_KEY");
const STRIPE_SECRET_KEY = must("STRIPE_SECRET_KEY"); // optional but recommended

async function probe(url, method, headers = {}, body = undefined) {
  try {
    const res = await fetch(url, {
      method,
      redirect: "follow",
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text().catch(() => "");
    return {
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
      contentType: res.headers.get("content-type"),
      bodyPreview: (text ?? "").slice(0, 180),
    };
  } catch (e) {
    return { ok: false, error: e?.message ?? String(e) };
  }
}

async function stripeProbe() {
  // Minimal Stripe “is key valid” probe without charging: GET /v1/account
  if (STRIPE_SECRET_KEY.missing) return { skipped: true, reason: "STRIPE_SECRET_KEY missing" };
  try {
    const res = await fetch("https://api.stripe.com/v1/account", {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${STRIPE_SECRET_KEY.value}`,
      },
    });
    const text = await res.text().catch(() => "");
    return {
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
      bodyPreview: text.slice(0, 180),
    };
  } catch (e) {
    return { ok: false, error: e?.message ?? String(e) };
  }
}

(async () => {
  const report = {
    ts: new Date().toISOString(),
    secretsPresent: {
      PROD_BASE_URL: !PROD_BASE_URL.missing,
      SUPABASE_FUNCTIONS_BASE: !SUPABASE_FUNCTIONS_BASE.missing,
      HEALTHCHECK_API_KEY: !HEALTHCHECK_API_KEY.missing,
      STRIPE_SECRET_KEY: !STRIPE_SECRET_KEY.missing,
    },
    urls: {
      frontend: PROD_BASE_URL.value ? `${PROD_BASE_URL.value}/` : null,
      health: SUPABASE_FUNCTIONS_BASE.value ? `${SUPABASE_FUNCTIONS_BASE.value}/health` : null,
      checkout: SUPABASE_FUNCTIONS_BASE.value ? `${SUPABASE_FUNCTIONS_BASE.value}/create-checkout` : null,
    },
    results: {},
  };

  if (report.urls.frontend) {
    report.results.frontend = await probe(report.urls.frontend, "GET");
  }

  if (report.urls.health) {
    report.results.health_OPTIONS = await probe(report.urls.health, "OPTIONS");
    report.results.health_GET = await probe(report.urls.health, "GET");
  }

  // Checkout probe uses HEALTHCHECK_API_KEY bypass (no JWT, no Stripe charge)
  if (report.urls.checkout && !HEALTHCHECK_API_KEY.missing) {
    const headers = {
      "Content-Type": "application/json",
      "x-healthcheck-key": HEALTHCHECK_API_KEY.value,
    };
    report.results.checkout_bypass = await probe(
      report.urls.checkout,
      "POST",
      headers,
      { healthcheck: true }
    );
  }

  report.results.stripe_account = await stripeProbe();

  fs.writeFileSync("ops/last-orchestrator-check.json", JSON.stringify(report, null, 2));
  console.log("Wrote ops/last-orchestrator-check.json");

  // Gate logic: define “global standards” = frontend 200, health 200, checkout bypass 200, Stripe probe 200 (if key provided)
  const must200 = (r) => r && r.status === 200;
  const frontendOk = must200(report.results.frontend);
  const healthOk = must200(report.results.health_GET);
  const checkoutOk = report.results.checkout_bypass ? must200(report.results.checkout_bypass) : true; // if missing key, we don't fail this probe
  const stripeOk = STRIPE_SECRET_KEY.missing ? true : must200(report.results.stripe_account);

  if (frontendOk && healthOk && checkoutOk && stripeOk) process.exit(0);
  process.exit(1);
})();
