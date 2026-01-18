// FORCE-DEPLOY MARKER: restore-purchases v1 2026-01-18
// Allows a signed-in user to restore entitlements by syncing Stripe subscriptions
// back into enrollments/user_subscriptions based on Stripe metadata.
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

function isActiveLike(status: string) {
  // Treat these as “has access”
  return ["active", "trialing", "past_due", "unpaid"].includes(status);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return json({ error: "Missing Authorization Bearer token" }, 401);
  }

  const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userRes, error: userErr } = await supabaseAuth.auth.getUser();
  const userId = userRes?.user?.id;
  const email = userRes?.user?.email ?? null;

  if (userErr || !userId) return json({ error: "Invalid user session" }, 401);

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2023-10-16" });

  // Try to find Stripe customer id we already stored
  const { data: eRows } = await supabaseAdmin
    .from("enrollments")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .not("stripe_customer_id", "is", null)
    .limit(1);

  let customerId: string | null = eRows?.[0]?.stripe_customer_id ?? null;

  // Fallback: find customer by email (works if Stripe customer email is set)
  if (!customerId && email) {
    const customers = await stripe.customers.list({ email, limit: 1 });
    customerId = customers.data?.[0]?.id ?? null;
  }

  if (!customerId) {
    return json({ ok: true, restored: 0, note: "No Stripe customer found for this user." });
  }

  // Pull subscriptions for this customer
  const subs = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 50,
  });

  let restored = 0;

  for (const sub of subs.data) {
    // We only restore subscriptions that were created by OUR checkout flow:
    // i.e., must include metadata user_id + course_id
    const metaUserId = sub.metadata?.user_id ? String(sub.metadata.user_id) : "";
    const metaCourseId = sub.metadata?.course_id ? String(sub.metadata.course_id) : "";

    if (!metaUserId || !metaCourseId) continue;
    if (metaUserId !== String(userId)) continue;

    const active = isActiveLike(sub.status);
    const priceId = sub.items.data?.[0]?.price?.id ? String(sub.items.data[0].price.id) : null;

    // Restore enrollment
    await supabaseAdmin.from("enrollments").upsert(
      [{
        user_id: userId,
        course_id: metaCourseId,
        paid: active,
        is_paid: active,
        payment_status: active ? "paid" : sub.status,
        paid_at: active ? new Date().toISOString() : null,
        stripe_customer_id: customerId,
        stripe_subscription_id: sub.id,
      }],
      { onConflict: "user_id,course_id" },
    );

    // Restore subscription audit
    await supabaseAdmin.from("user_subscriptions").upsert(
      [{
        user_id: userId,
        course_id: metaCourseId,
        stripe_customer_id: customerId,
        stripe_subscription_id: sub.id,
        stripe_price_id: priceId,
        status: sub.status,
        cancel_at_period_end: sub.cancel_at_period_end,
        current_period_end: sub.current_period_end
          ? new Date(sub.current_period_end * 1000).toISOString()
          : null,
        canceled_at: sub.canceled_at
          ? new Date(sub.canceled_at * 1000).toISOString()
          : null,
        updated_at: new Date().toISOString(),
      }],
      { onConflict: "stripe_subscription_id" },
    );

    restored++;
  }

  return json({ ok: true, restored, customerId });
});
