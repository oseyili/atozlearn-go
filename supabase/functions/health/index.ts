function corsHeaders(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-healthcheck-key",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const CORS = corsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  return new Response(JSON.stringify({ ok: true, ts: new Date().toISOString() }), {
    status: 200,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
});
