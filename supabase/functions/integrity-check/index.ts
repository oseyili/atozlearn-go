import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async () => {
  const out: any = {
    ok: true,
    time: new Date().toISOString(),
    checks: {},
  };

  // Uses Service Role if available (best), else falls back to anon (may be limited by RLS).
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!url || !anon) {
    return json({ ok: false, error: "Missing SUPABASE_URL or SUPABASE_ANON_KEY" }, 500);
  }

  const key = svc || anon;
  const mode = svc ? "service_role" : "anon_limited";
  out.checks.auth_mode = mode;

  try {
    const supabase = createClient(url, key);

    // Lightweight existence checks (won't leak data)
    const tables = ["subjects", "courses", "enrollments"];
    for (const t of tables) {
      const { error } = await supabase.from(t).select("*").limit(1);
      if (error) throw new Error(`${t}: ${error.message}`);
    }
    out.checks.tables = "ok";
  } catch (e) {
    out.ok = false;
    out.checks.tables = e?.message || String(e);
  }

  // Deep-ish integrity signals (counts). Requires service role for reliable results.
  try {
    const supabase = createClient(url, key);

    // Count subjects
    const s = await supabase.from("subjects").select("id", { count: "exact", head: true });
    if (s.error) throw new Error(`subjects count: ${s.error.message}`);

    // Count courses
    const c = await supabase.from("courses").select("id", { count: "exact", head: true });
    if (c.error) throw new Error(`courses count: ${c.error.message}`);

    out.checks.counts = {
      subjects: s.count ?? null,
      courses: c.count ?? null,
      note: mode === "anon_limited"
        ? "Counts may be limited by RLS; set SUPABASE_SERVICE_ROLE_KEY in function env for authoritative integrity."
        : "Authoritative (service role).",
    };

    // Simple regression guard: expect “a lot” of courses if service role is set
    if (mode === "service_role" && typeof c.count === "number" && c.count < 1000) {
      out.ok = false;
      out.checks.regression = `Course count unexpectedly low (${c.count}).`;
    } else {
      out.checks.regression = "ok";
    }
  } catch (e) {
    out.ok = false;
    out.checks.counts = e?.message || String(e);
  }

  return json(out, out.ok ? 200 : 500);
});
