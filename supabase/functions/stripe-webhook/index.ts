import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14?target=denonext";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, stripe-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function res200(body: unknown) {
  // Always 200 so Stripe won't keep retrying noisily; errors are recorded in DB log.
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return res200({ ok: false, error: "Method not allowed" });

  const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  const WHSEC_TEST = Deno.env.get("STRIPE_WEBHOOK_SECRET_TEST") ?? "";
  const WHSEC_LIVE = Deno.env.get("STRIPE_WEBHOOK_SECRET_LIVE") ?? "";
  const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY") ?? "";
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";

  const admin =
    (SUPABASE_URL && SERVICE_ROLE_KEY) ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY) : null;

  async function logRow(row: any) {
    try {
      if (!admin) return;
      await admin.from("webhook_event_log").insert(row);
    } catch (e) {
      console.error("webhook_event_log insert failed:", e?.message || e);
    }
  }

  // Env checks (self-diagnosing)
  if (!STRIPE_SECRET_KEY || !SERVICE_ROLE_KEY || !SUPABASE_URL) {
    const msg = `Missing env/secret: ${
      !STRIPE_SECRET_KEY ? "STRIPE_SECRET_KEY " : ""
    }${!SERVICE_ROLE_KEY ? "SERVICE_ROLE_KEY " : ""}${!SUPABASE_URL ? "SUPABASE_URL " : ""}`.trim();

    await logRow({
      event_type: null,
      signature_ok: null,
      verified_as: null,
      ok: false,
      message: msg,
      payload: null,
    });

    return res200({ ok: false, error: msg });
  }

  if (!WHSEC_TEST && !WHSEC_LIVE) {
    const msg = "Missing STRIPE_WEBHOOK_SECRET_TEST and STRIPE_WEBHOOK_SECRET_LIVE";
    await logRow({
      event_type: null,
      signature_ok: null,
      verified_as: null,
      ok: false,
      message: msg,
      payload: { hint: "Set both whsec_... secrets once; webhook will auto-match forever." },
    });
    return res200({ ok: false, error: msg });
  }

  const sig = req.headers.get("stripe-signature") ?? "";
  if (!sig) {
    await logRow({
      event_type: null,
      signature_ok: false,
      verified_as: null,
      ok: false,
      message: "Missing stripe-signature header",
      payload: null,
    });
    return res200({ ok: false, error: "Missing stripe-signature header" });
  }

  // Stripe needs raw body
  const rawBody = await req.text();

  const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2023-10-16" });

  // Auto-verify with TEST then LIVE
  let event: Stripe.Event | null = null;
  let verified_as: "test" | "live" | null = null;

  if (WHSEC_TEST) {
    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, WHSEC_TEST);
      verified_as = "test";
    } catch (_) {}
  }
  if (!event && WHSEC_LIVE) {
    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, WHSEC_LIVE);
      verified_as = "live";
    } catch (_) {}
  }

  if (!event) {
    await logRow({
      event_type: null,
      signature_ok: false,
      verified_as: null,
      ok: false,
      message: "Invalid webhook signature (neither TEST nor LIVE secret matched)",
      payload: {
        endpoint_expected: "https://<project-ref>.functions.supabase.co/stripe-webhook",
        hint: "Update STRIPE_WEBHOOK_SECRET_TEST / _LIVE with the whsec_ from Stripe endpoints.",
      },
    });
    return res200({ ok: false, error: "Invalid webhook signature" });
  }

  // We have a verified event
  const eventType = event.type;

  if (eventType !== "checkout.session.completed") {
    await logRow({
      event_type: eventType,
      signature_ok: true,
      verified_as,
      ok: true,
      message: "Ignored event type",
      payload: { event_type: eventType },
    });
    return res200({ ok: true, ignored: eventType, verified_as });
  }

  const session = event.data.object as Stripe.Checkout.Session;

  const user_id = session.metadata?.user_id;
  const course_id = session.metadata?.course_id;

  if (!user_id || !course_id) {
    await logRow({
      event_type: eventType,
      signature_ok: true,
      verified_as,
      ok: false,
      message: "Missing user_id/course_id in session.metadata",
      payload: { metadata: session.metadata ?? null, session_id: session.id },
    });
    return res200({ ok: true, warning: "Missing metadata", verified_as });
  }

  // Unlock entitlement
  const { error } = await admin!
    .from("course_entitlements")
    .upsert(
      { user_id, course_id, status: "active", paid_at: new Date().toISOString() },
      { onConflict: "user_id,course_id" },
    );

  if (error) {
    await logRow({
      event_type: eventType,
      signature_ok: true,
      verified_as,
      ok: false,
      message: "Entitlement upsert failed",
      user_id,
      course_id,
      payload: { error, session_id: session.id },
    });
    return res200({ ok: false, error: "Entitlement upsert failed", verified_as });
  }

  await logRow({
    event_type: eventType,
    signature_ok: true,
    verified_as,
    ok: true,
    message: "Entitlement unlocked",
    user_id,
    course_id,
    payload: { session_id: session.id },
  });

  return res200({ ok: true, unlocked: { user_id, course_id }, verified_as });
});
