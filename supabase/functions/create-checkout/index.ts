const HEALTHCHECK_API_KEY = Deno.env.get("HEALTHCHECK_API_KEY") ?? null;
﻿// FORCE-DEPLOY MARKER: create-checkout v6 2026-01-18
// Repair rule: attach {user_id, course_id} to Stripe metadata for webhook unlock.

import Stripe from "https://esm.sh/stripe@14?target=denonext";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const PRICE_DEFAULT = Deno.env.get("STRIPE_PRICE_DEFAULT")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
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
  
// Deterministic healthcheck bypass (does not require JWT / Stripe)
try {
  const hcKey = req.headers.get("x-healthcheck-key") || "";
  if (HEALTHCHECK_API_KEY && hcKey === HEALTHCHECK_API_KEY) {
    const body = await req.json().catch(() => ({}));
    if (body?.healthcheck === true) {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
  }
} catch (_) {}

const authHeader = req.headers.get("authorization") || req.headers.get("Authorization") || "";
if (req.method === "OPTIONS") return json({ ok: true, marker: "create-checkout-v6" }, 200);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return json({ marker: "create-checkout-v6", error: "Invalid JSON body" }, 400);
  }

  const userId = payload?.userId;
  const courseId = payload?.courseId;

  const successUrl =
    payload?.successUrl ?? "https://atozlearn-go.onrender.com/success";
  const cancelUrl =
    payload?.cancelUrl ?? "https://atozlearn-go.onrender.com/cancel";

  if (!userId || !courseId) {
    return json(
      {
        marker: "create-checkout-v6",
        error: "Missing required fields",
        required: ["userId", "courseId"],
      },
      400,
    );
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2023-10-16" });

  try {
    // Subscription because your price is recurring
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: PRICE_DEFAULT, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        user_id: String(userId),
        course_id: String(courseId),
      },
      subscription_data: {
        metadata: {
          user_id: String(userId),
          course_id: String(courseId),
        },
      },
    });

    return json({ marker: "create-checkout-v6", id: session.id, url: session.url }, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ marker: "create-checkout-v6", error: "Stripe error", message: msg }, 500);
  }
});
