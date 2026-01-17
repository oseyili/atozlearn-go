// supabase/functions/create-checkout/index.ts
import Stripe from "https://esm.sh/stripe@14?target=denonext";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
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

    if (!STRIPE_SECRET_KEY) return json({ error: "Missing STRIPE_SECRET_KEY env var" }, 500);
    if (!SUPABASE_URL) return json({ error: "Missing SUPABASE_URL env var" }, 500);
    if (!SUPABASE_ANON_KEY) return json({ error: "Missing SUPABASE_ANON_KEY env var" }, 500);
    if (!SUPABASE_SERVICE_ROLE_KEY) return json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY env var" }, 500);

    const authHeader = req.headers.get("authorization") ?? "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return json({ error: "Missing Authorization Bearer token" }, 401);
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
          hint: "Send { successUrl, cancelUrl } or set SITE_URL as a Supabase secret.",
        },
        400,
      );
    }

    // 1) Verify user from JWT (use anon key + user's Authorization header)
    const supabaseUserClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const { data: userData, error: userErr } = await supabaseUserClient.auth.getUser();
    if (userErr || !userData?.user) {
      return json({ error: "Invalid JWT" }, 401);
    }
    const userId = userData.user.id;

    // 2) Read course + stripe_price_id using service role (server-side only)
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const { data: course, error: courseErr } = await supabaseAdmin
      .from("courses")
      .select("id,stripe_price_id")
      .eq("id", courseId)
      .single();

    if (courseErr) {
      return json({ error: "Course lookup failed", details: courseErr.message }, 500);
    }

    let priceId = course?.stripe_price_id as string | null;

    // 3) Self-heal: if price missing, trigger sync-course-stripe (internal server call) then re-fetch
    if (!priceId) {
      // Only attempt if HOOK_SECRET exists (your sync-course-stripe uses x-hook-secret)
      const HOOK_SECRET = Deno.env.get("HOOK_SECRET") ?? "";
      if (HOOK_SECRET) {
        const syncUrl = `${SUPABASE_URL}/functions/v1/sync-course-stripe`;
        const syncResp = await fetch(syncUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-hook-secret": HOOK_SECRET,
          },
          body: JSON.stringify({ course_id: courseId }),
        });

        // Even if sync fails, we continue to return a meaningful error
        if (syncResp.ok) {
          const { data: course2 } = await supabaseAdmin
            .from("courses")
            .select("stripe_price_id")
            .eq("id", courseId)
            .single();
          priceId = (course2?.stripe_price_id as string | null) ?? null;
        }
      }
    }

    if (!priceId) {
      return json(
        { error: "Course has no stripe_price_id (sync may still be running). Try again shortly." },
        409,
      );
    }

    // 4) Create Stripe Checkout Session with REQUIRED metadata
    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2023-10-16" });

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        course_id: String(courseId),
        user_id: String(userId),
      },
    });

    if (!session.url) return json({ error: "Stripe session created but no url returned" }, 500);

    return json({ url: session.url }, 200);
  } catch (e) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
