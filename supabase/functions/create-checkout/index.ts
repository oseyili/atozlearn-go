import Stripe from "https://esm.sh/stripe@14?target=denonext";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE_URL = Deno.env.get("SITE_URL")!;

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-11-20" });

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return json({ error: "Use POST" }, 405);

    // Require user auth (frontend sends Bearer token)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization" }, 401);

    // Verify user from token
    const anon = Deno.env.get("SUPABASE_ANON_KEY");
    if (!anon) return json({ error: "Missing SUPABASE_ANON_KEY secret" }, 500);

    const userClient = createClient(SUPABASE_URL, anon, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);

    const user_id = userData.user.id;
    const email = userData.user.email ?? undefined;

    const { course_id } = await req.json();
    if (!course_id) return json({ error: "Missing course_id" }, 400);

    // Server-side admin client (bypasses RLS safely here)
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Ensure enrollment exists (idempotent)
    await admin.from("enrollments").upsert({
      user_id,
      course_id,
      is_paid: false,
      payment_status: "unpaid",
    });

    // Create Stripe Checkout session (one-time payment)
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: email,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "gbp",
            unit_amount: 499, // £4.99 - change later
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

    await admin
      .from("enrollments")
      .update({ stripe_session_id: session.id })
      .eq("user_id", user_id)
      .eq("course_id", course_id);

    return json({ url: session.url });
  } catch (e) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
