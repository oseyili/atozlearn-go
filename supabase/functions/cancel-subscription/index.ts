// FORCE-DEPLOY MARKER: cancel-subscription v1 2026-01-18
// Cancels a user's subscription for a given course at period end (safe default).
// Requires JWT (verify_jwt=true in supabase/config.toml for this function).

import Stripe from "https://esm.sh/stripe@14?target=denonext";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "*";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return json({ error: "Missing Authorization Bearer token" }, 401);
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const courseId = payload?.courseId;
  if (!courseId) return json({ error: "Missing required field", required: ["courseId"] }, 400);

  // Identify current user from JWT
  const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userRes, error: userErr } = await supabaseAuth.auth.getUser();
  const userId = userRes?.user?.id;
  if (userErr || !userId) return json({ error: "Invalid user session" }, 401);

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Find subscription id for this user/course
  const { data: row, error: readErr } = await supabaseAdmin
    .from("user_subscriptions")
    .select("stripe_subscription_id")
    .eq("user_id", userId)
    .eq("course_id", courseId)
    .maybeSingle();

  if (readErr) return json({ error: "DB read failed", message: readErr.message }, 500);
  if (!row?.stripe_subscription_id) return json({ error: "No subscription found" }, 404);

  const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2023-10-16" });

  try {
    // Cancel at period end (keeps access until end of paid period)
    const updated = await stripe.subscriptions.update(row.stripe_subscription_id, {
      cancel_at_period_end: true,
    });

    // Mirror in DB immediately (webhook will also sync)
    await supabaseAdmin.from("user_subscriptions").upsert(
      [{
        user_id: userId,
        course_id: courseId,
        stripe_subscription_id: updated.id,
        stripe_customer_id: typeof updated.customer === "string" ? updated.customer : null,
        status: updated.status,
        cancel_at_period_end: updated.cancel_at_period_end,
        current_period_end: updated.current_period_end
          ? new Date(updated.current_period_end * 1000).toISOString()
          : null,
        canceled_at: updated.canceled_at
          ? new Date(updated.canceled_at * 1000).toISOString()
          : null,
        updated_at: new Date().toISOString(),
      }],
      { onConflict: "stripe_subscription_id" },
    );

    return json({
      ok: true,
      subscription_id: updated.id,
      cancel_at_period_end: updated.cancel_at_period_end,
      current_period_end: updated.current_period_end,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: "Stripe error", message: msg }, 500);
  }
});
