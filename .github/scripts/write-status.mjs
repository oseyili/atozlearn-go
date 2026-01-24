import fs from "node:fs";

const must = (k) => {
  const v = process.env[k];
  if (!v) return { missing: true, value: null };
  return { missing: false, value: v.trim().replace(/\/+$/, "") };
};

const PROD_BASE_URL = must("PROD_BASE_URL");
const SUPABASE_FUNCTIONS_BASE = must("SUPABASE_FUNCTIONS_BASE");

async function probe(url, method) {
  try {
    const res = await fetch(url, { method, redirect: "follow" });
    const text = await res.text().catch(() => "");
    return {
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
      contentType: res.headers.get("content-type"),
      bodyPreview: (text ?? "").slice(0, 140),
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
    },
    urls: {
      frontend: PROD_BASE_URL.value ? `${PROD_BASE_URL.value}/` : null,
      health: SUPABASE_FUNCTIONS_BASE.value ? `${SUPABASE_FUNCTIONS_BASE.value}/health` : null,
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

  fs.writeFileSync("ops/last-orchestrator-check.json", JSON.stringify(report, null, 2));
  console.log("Wrote ops/last-orchestrator-check.json");
})();
