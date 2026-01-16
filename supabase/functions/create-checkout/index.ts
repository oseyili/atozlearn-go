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

function originFrom(req: Request) {
  const o = req.headers.get("origin") || "";
  if (o) return o.replace(/\/$/, "");
  const r = req.headers.get("referer") || "";
  try { if (r) return new URL(r).origin; } catch (_) {}
  return "";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return res200({ ok: false, error: "Method not allowed" });

  try {
    const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    if (!STRIPE_SECRET_KEY) return res200({ ok: false, error: "Missing STRIPE_SECRET_KEY" });
    if (!SUPABASE_URL) return res200({ ok: false, error: "Missing SUPABASE_URL" });
    if (!SUPABASE_ANON_KEY) return res200({ ok: false, error: "Missing SUPABASE_ANON_KEY" });

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return res200({ ok: false, error: "Missing Authorization Bearer token" });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const userRes = await supabase.auth.getUser();
    const user = userRes.data?.user;
    if (!user || userRes.error) return res200({ ok: false, error: "Not authenticated" });

    let body: any = {};
    try { body = await req.json(); } catch (_) { body = {}; }

    const course_id = safeString(body.course_id);

    // Optional: still accept an explicit price_id if you ever need it
    const price_id = safeString(body.price_id);

    if (!course_id) return res200({ ok: false, error: "Missing course_id" });

    const base = originFrom(req);
    const success_url = safeString(body.success_url) || (base ? `${base}/payment-success` : "");
    const cancel_url = safeString(body.cancel_url) || (base ? `${base}/payment-cancel` : "");

    if (!success_url || !cancel_url) {
      return res200({ ok: false, error: "Missing success_url/cancel_url and could not infer origin" });
    }

    // Load course record (includes permanent Stripe price mapping)
    const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: courseRow, error: courseErr } = await anon
      .from("portal_courses")
      .select("title,currency,list_price,stripe_price_id")
      .eq("id", course_id)
      .maybeSingle();

    if (courseErr) {
      return res200({ ok: false, error: "Failed to load course", details: courseErr });
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2023-10-16" });

    // Pricing priority:
    // 1) explicit price_id from client (rare)
    // 2) courseRow.stripe_price_id (PERMANENT mapping)
    // 3) fallback computed from list_price (works even without Stripe product)
    let line_items: Stripe.Checkout.SessionCreateParams.LineItem[];

    const mappedPriceId = safeString(courseRow?.stripe_price_id);

    if (price_id) {
      line_items = [{ price: price_id, quantity: 1 }];
    } else if (mappedPriceId) {
      line_items = [{ price: mappedPriceId, quantity: 1 }];
    } else {
      const title = courseRow?.title || "Course Enrollment";
      const currency = (courseRow?.currency || "GBP").toString().toLowerCase();
      const lp = Number(courseRow?.list_price);
      const unit_amount = Number.isFinite(lp) && lp > 0 ? Math.round(lp * 100) : 1000; // £10 fallback

      line_items = [{
        price_data: { currency, product_data: { name: title }, unit_amount },
        quantity: 1,
      }];
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items,
      success_url,
      cancel_url,
      metadata: {
        user_id: user.id,
        course_id,
      },
    });

    console.log("Checkout session created", {
      session_id: session.id,
      user_id: user.id,
      course_id,
      used_mapped_price: !!mappedPriceId && !price_id,
      used_explicit_price: !!price_id,
    });

    return res200({ ok: true, url: session.url });
  } catch (e) {
    console.error("create-checkout error:", e?.stack || e?.message || e);
    return res200({ ok: false, error: "create-checkout failed", details: e?.message || String(e) });
  }
});
