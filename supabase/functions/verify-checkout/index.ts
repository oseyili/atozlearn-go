import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14?target=denonext";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function res200(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function safeString(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return res200({ ok: false, error: "Method not allowed" });

  try {
    const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY") ?? "";

    if (!STRIPE_SECRET_KEY) return res200({ ok: false, error: "Missing STRIPE_SECRET_KEY" });
    if (!SUPABASE_URL) return res200({ ok: false, error: "Missing SUPABASE_URL" });
    if (!SUPABASE_ANON_KEY) return res200({ ok: false, error: "Missing SUPABASE_ANON_KEY" });
    if (!SERVICE_ROLE_KEY) return res200({ ok: false, error: "Missing SERVICE_ROLE_KEY" });

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return res200({ ok: false, error: "Missing Authorization Bearer token" });
    }

    const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const userRes = await supabaseUser.auth.getUser();
    const user = userRes.data?.user;
    if (!user || userRes.error) return res200({ ok: false, error: "Not authenticated" });

    let body: any = {};
    try { body = await req.json(); } catch (_) { body = {}; }

    const session_id = safeString(body.session_id);
    const course_id = safeString(body.course_id);

    if (!session_id) return res200({ ok: false, error: "Missing session_id" });
    if (!course_id) return res200({ ok: false, error: "Missing course_id" });

    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2023-10-16" });
    const session = await stripe.checkout.sessions.retrieve(session_id);

    if (session.payment_status !== "paid") {
      return res200({ ok: false, error: "Payment not confirmed as paid", payment_status: session.payment_status });
    }

    const metaCourse = session.metadata?.course_id;
    const metaUser = session.metadata?.user_id;

    if (metaCourse && metaCourse !== course_id) {
      return res200({ ok: false, error: "Course mismatch", metaCourse, course_id });
    }
    if (metaUser && metaUser !== user.id) {
      return res200({ ok: false, error: "User mismatch", metaUser, user_id: user.id });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { error } = await supabaseAdmin
      .from("course_entitlements")
      .upsert(
        { user_id: user.id, course_id, status: "active", paid_at: new Date().toISOString() },
        { onConflict: "user_id,course_id" },
      );

    if (error) return res200({ ok: false, error: "Failed to unlock entitlement", details: error });

    return res200({ ok: true, unlocked: { user_id: user.id, course_id } });
  } catch (e) {
    console.error("verify-checkout error:", e?.stack || e?.message || e);
    return res200({ ok: false, error: "verify-checkout failed", details: e?.message || String(e) });
  }
});
