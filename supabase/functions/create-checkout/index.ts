import Stripe from "https://esm.sh/stripe@14?target=denonext";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SITE_URL = Deno.env.get("SITE_URL") ?? "";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extraHeaders },
  });
}

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const auth = req.headers.get("authorization") ?? "";

    if (!STRIPE_SECRET_KEY) return json({ error: "Missing STRIPE_SECRET_KEY env var" }, 500);
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return json({ error: "Missing SUPABASE_URL or SUPABASE_ANON_KEY env var" }, 500);
    }

    const body = await req.json().catch(() => ({}));

    const courseId = body?.course_id;
    if (!courseId) return json({ error: "Missing course_id" }, 400);

    const successUrl =
      body?.successUrl ??
      (SITE_URL ? `${SITE_URL}/success?session_id={CHECKOUT_SESSION_ID}` : null);
    const cancelUrl = body?.cancelUrl ?? (SITE_URL ? `${SITE_URL}/cancel` : null);

    if (!successUrl || !cancelUrl) {
      return json(
        {
          error: "Missing successUrl/cancelUrl (and SITE_URL is not set)",
          hint: "Send { successUrl, cancelUrl } in request body, or set SITE_URL in Supabase secrets.",
        },
        400,
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: auth ? { Authorization: auth } : {} },
    });

    const { data: course, error: courseErr } = await supabase
      .from("courses")
      .select("stripe_price_id")
      .eq("id", courseId)
      .single();

    if (courseErr) return json({ error: "Course lookup failed", details: courseErr.message }, 500);

    const priceId = course?.stripe_price_id;
    if (!priceId) return json({ error: "Course has no stripe_price_id" }, 400);

    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2023-10-16" });

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { course_id: String(courseId) },
    });

    if (!session.url) return json({ error: "Stripe session created but no url returned" }, 500);

    return json({ url: session.url }, 200);
  } catch (e) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
