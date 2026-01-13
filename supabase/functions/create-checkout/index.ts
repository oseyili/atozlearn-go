import Stripe from "https://esm.sh/stripe@14?target=denonext";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE_URL = Deno.env.get("SITE_URL")!;

// ✅ FIX: Do NOT set apiVersion (your value was rejected). Stripe SDK will use a valid default.
const stripe = new Stripe(STRIPE_SECRET_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, Authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function extractJwt(authHeader: string) {
  if (!authHeader) return "";
  return authHeader.replace(/^Bearer\s+/i, "").trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  try {
    const authHeader =
      req.headers.get("authorization") ??
      req.headers.get("Authorization") ??
      "";

    const jwt = extractJwt(authHeader);
    if (!jwt) return json({ error: "Missing JWT (Authorization: Bearer ...)" }, 401);

    const body = await req.json().catch(() => ({}));
    const course_id = body?.course_id;
    if (!course_id) return json({ error: "Missing course_id" }, 400);

    // Validate user with explicit JWT
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: userData, error: userErr } = await userClient.auth.getUser(jwt);
    if (userErr || !userData?.user) {
      return json({ error: "Invalid JWT", details: userErr?.message }, 401);
    }

    const user_id = userData.user.id;
    const email = userData.user.email ?? undefined;

    // Admin client for DB writes
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Ensure enrollment exists (unpaid until webhook marks paid)
    const { error: upsertErr } = await admin.from("enrollments").upsert({
      user_id,
      course_id,
      is_paid: false,
      payment_status: "unpaid",
    });

    if (upsertErr) return json({ error: upsertErr.message }, 400);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: email,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "gbp",
            unit_amount: 499,
            product_data: {
              name: "AtoZlearn-go Course Access",
              description: "Unlock lessons for this course",
            },
          },
        },
      ],
      success_url: `${SITE_URL}/courses/${course_id}?paid=1`,
      cancel_url: `${SITE_URL}/courses/${course_id}?canceled=1`,
      metadata: { user_id, course_id },
    });

    const { error: updErr } = await admin
      .from("enrollments")
      .update({ stripe_session_id: session.id })
      .eq("user_id", user_id)
      .eq("course_id", course_id);

    if (updErr) return json({ error: updErr.message }, 400);

    return json({ url: session.url }, 200);
  } catch (e) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
