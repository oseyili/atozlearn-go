// supabase/functions/create-checkout/index.ts
import Stripe from "https://esm.sh/stripe@14?target=denonext";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

/**
 * REQUIRED SECRETS (Supabase Dashboard -> Project Settings -> Edge Functions -> Secrets):
 * - STRIPE_SECRET_KEY
 *
 * Auto-provided by Supabase for Edge Functions (do NOT create these as secrets):
 * - SUPABASE_URL
 * - SUPABASE_ANON_KEY
 *
 * What this function does:
 * - Requires the caller to be logged in (Authorization: Bearer <JWT>)
 * - Requires course_id, success_url, cancel_url, and (preferably) price_id
 * - Creates a Stripe Checkout Session with metadata:
 *     user_id = Supabase auth user id
 *     course_id = the course being purchased
 *
 * The stripe-webhook uses that metadata to upsert course_entitlements => active
 */

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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

  // Validate env
  if (!STRIPE_SECRET_KEY) return json(500, { ok: false, error: "Missing STRIPE_SECRET_KEY secret" });
  if (!SUPABASE_URL) return json(500, { ok: false, error: "Missing SUPABASE_URL env" });
  if (!SUPABASE_ANON_KEY) return json(500, { ok: false, error: "Missing SUPABASE_ANON_KEY env" });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return json(401, { ok: false, error: "Missing Authorization Bearer token" });
    }

    // Use the caller's JWT so we can resolve the user_id securely
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return json(401, { ok: false, error: "Invalid/expired session (not authenticated)" });
    }

    // Body expected from frontend:
    // {
    //   course_id: string (uuid),
    //   price_id: string (Stripe price id)  <-- recommended
    //   success_url: string,
    //   cancel_url: string
    // }
    const body = await req.json().catch(() => ({}));
    const course_id = String(body.course_id ?? "").trim();
    const price_id = String(body.price_id ?? "").trim();
    const success_url = String(body.success_url ?? "").trim();
    const cancel_url = String(body.cancel_url ?? "").trim();

    if (!course_id) return json(400, { ok: false, error: "Missing course_id" });
    if (!success_url) return json(400, { ok: false, error: "Missing success_url" });
    if (!cancel_url) return json(400, { ok: false, error: "Missing cancel_url" });

    // Strongly recommended: require a Stripe price_id so we don't accidentally charge wrong amount.
    // If you truly want fallback pricing, remove this check.
    if (!price_id) {
      return json(400, {
        ok: false,
        error: "Missing price_id (Stripe Price). Provide price_id from your course/pricing config.",
      });
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2023-10-16" });

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: price_id, quantity: 1 }],
      success_url,
      cancel_url,

      // ✅ THIS IS THE KEY TO UNLOCKING LESSONS:
      // the webhook reads these and upserts course_entitlements(active)
      metadata: {
        user_id: user.id,
        course_id,
      },
    });

    return json(200, { ok: true, url: session.url });
  } catch (e) {
    return json(500, { ok: false, error: e?.message ?? "Unknown error" });
  }
});
