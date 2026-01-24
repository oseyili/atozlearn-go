import Stripe from "https://esm.sh/stripe@14?target=denonext";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const PRICE_DEFAULT = Deno.env.get("STRIPE_PRICE_DEFAULT")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const PROD_BASE_URL = Deno.env.get("PROD_BASE_URL") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function safeJson(text: string): any | null {
  try {
    if (!text) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function pickBaseUrl(req: Request): string {
  // Prefer explicit PROD_BASE_URL (recommended), else Origin header, else empty.
  const origin = req.headers.get("origin") || "";
  if (PROD_BASE_URL) return PROD_BASE_URL.replace(/\/$/, "");
  return origin.replace(/\/$/, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true, marker: "create-checkout-v7" }, 200);

  if (req.method !== "POST") {
    return json({ marker: "create-checkout-v7", error: "Method not allowed" }, 405);
  }

  const raw = await req.text();
  const body = safeJson(raw);
  if (!body) {
    return json({ marker: "create-checkout-v7", error: "Invalid JSON body" }, 400);
  }

  const courseId = body?.courseId;
  if (!courseId) {
    return json({ marker: "create-checkout-v7", error: "Missing required fields", required: ["courseId"] }, 400);
  }

  // Derive userId automatically:
  // 1) Try Authorization: Bearer <JWT> (if client sends it)
  // 2) Fallback to body.userId (for backward compatibility)
  let userId: string | null = null;

  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const jwt = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";

  if (jwt) {
    const authed = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });

    const { data: userRes, error: userErr } = await authed.auth.getUser();
    if (!userErr && userRes?.user?.id) userId = userRes.user.id;
  }

  if (!userId && typeof body?.userId === "string" && body.userId.trim()) {
    userId = body.userId.trim();
  }

  if (!userId) {
    return json(
      {
        marker: "create-checkout-v7",
        error: "Missing user context",
        hint: "Client must send Authorization Bearer token OR include userId in JSON body.",
      },
      401
    );
  }

  // Stripe
  const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2023-10-16" });

  const baseUrl = pickBaseUrl(req);
  // Safe fallbacks (won’t contain secrets)
  const successUrl = (baseUrl ? `${baseUrl}/portal?checkout=success` : "https://example.com/success");
  const cancelUrl = (baseUrl ? `${baseUrl}/portal?checkout=cancel` : "https://example.com/cancel");

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: PRICE_DEFAULT, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        marker: "create-checkout-v7",
        userId,
        courseId,
      },
    });

    return json({ marker: "create-checkout-v7", url: session.url, id: session.id }, 200);
  } catch (e) {
    return json({ marker: "create-checkout-v7", error: e?.message || String(e) }, 500);
  }
});
