// supabase/functions/stripe-webhook/index.ts
import Stripe from "https://esm.sh/stripe@14?target=denonext";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

/**
 * REQUIRED SECRETS in Supabase Dashboard -> Project Settings -> Edge Functions -> Secrets:
 * - STRIPE_SECRET_KEY
 * - STRIPE_WEBHOOK_SECRET
 * - SERVICE_ROLE_KEY          <-- IMPORTANT: do NOT use SUPABASE_ prefix
 * - SUPABASE_URL              (auto provided in many setups, but safe if present)
 *
 * This webhook:
 * - Verifies Stripe signature
 * - On checkout.session.completed:
 *    - reads session.metadata.user_id and session.metadata.course_id
 *    - upserts public.course_entitlements to status='active'
 */

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, stripe-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.method !== "POST") return json(405, { ok: false, error: "Method not allowed" });

  // Validate required env
  if (!STRIPE_SECRET_KEY) return json(500, { ok: false, error: "Missing STRIPE_SECRET_KEY secret" });
  if (!STRIPE_WEBHOOK_SECRET) return json(500, { ok: false, error: "Missing STRIPE_WEBHOOK_SECRET secret" });
  if (!SERVICE_ROLE_KEY) return json(500, { ok: false, error: "Missing SERVICE_ROLE_KEY secret" });
  if (!SUPABASE_URL) return json(500, { ok: false, error: "Missing SUPABASE_URL env" });

  const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2023-10-16" });
  const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const sig = req.headers.get("stripe-signature");
  if (!sig) return json(400, { ok: false, error: "Missing stripe-signature header" });

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, STRIPE_WEBHOOK_SECRET);
  } catch (_err) {
    return json(400, { ok: false, error: "Invalid webhook signature" });
  }

  // Only handle what we need
  if (event.type !== "checkout.session.completed") {
    return json(200, { ok: true, ignored: event.type });
  }

  const session = event.data.object as Stripe.Checkout.Session;

  // We EXPECT these to be set in create-checkout:
  // session.metadata.user_id
  // session.metadata.course_id
  const user_id = session.metadata?.user_id;
  const course_id = session.metadata?.course_id;

  if (!user_id || !course_id) {
    // This is the #1 reason "payment success but still locked"
    // Fix by ensuring create-checkout sets metadata correctly.
    return json(200, {
      ok: true,
      warning: "Missing user_id/course_id in session.metadata (cannot unlock lessons)",
      metadata: session.metadata ?? null,
    });
  }

  // Upsert entitlement active
  const { error } = await supabaseAdmin
    .from("course_entitlements")
    .upsert(
      {
        user_id,
        course_id,
        status: "active",
        paid_at: new Date().toISOString(),
      },
      { onConflict: "user_id,course_id" },
    );

  if (error) {
    return json(500, { ok: false, error: "Failed to upsert entitlement", details: error });
  }

  return json(200, { ok: true, unlocked: { user_id, course_id } });
});
