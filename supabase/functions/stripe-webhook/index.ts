import Stripe from "https://esm.sh/stripe@14?target=denonext";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-11-20" });

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  try {
    if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) return json({ error: "Missing Stripe env" }, 500);
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return json({ error: "Missing Supabase env" }, 500);

    const sig = req.headers.get("stripe-signature");
    if (!sig) return json({ error: "Missing stripe-signature" }, 400);

    const rawBody = await req.text();
    const event = await stripe.webhooks.constructEventAsync(rawBody, sig, STRIPE_WEBHOOK_SECRET);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;

      const course_id = (session.metadata?.course_id ?? "").toString();
      const user_id = (session.metadata?.user_id ?? "").toString();

      if (!course_id || !user_id) return json({ error: "Missing metadata course_id/user_id" }, 400);

      const amount_cents = session.amount_total ?? null;
      const currency = session.currency ?? null;

      // purchases: insert paid
      await supabase.from("purchases").insert({
        user_id,
        course_id,
        stripe_checkout_session_id: session.id,
        stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : null,
        amount_cents,
        currency,
        status: "paid",
      });

      // enrollments: upsert
      await supabase.from("enrollments").upsert({ user_id, course_id }, { onConflict: "user_id,course_id" });
    }

    return json({ received: true }, 200);
  } catch (e) {
    return json({ error: String(e?.message ?? e) }, 400);
  }
});
