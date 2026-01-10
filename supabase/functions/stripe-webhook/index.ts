import Stripe from "https://esm.sh/stripe@14?target=denonext";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Stripe secrets
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;

// Supabase
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!;

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: "2024-11-20",
});

function text(body: string, status = 200) {
  return new Response(body, { status });
}

Deno.serve(async (req) => {
  try {
    const sig = req.headers.get("Stripe-Signature");
    if (!sig) return text("Missing Stripe-Signature", 400);

    // Stripe requires raw body for verification
    const rawBody = await req.text();

    const event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      STRIPE_WEBHOOK_SECRET
    );

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;

      const user_id = session.metadata?.user_id;
      const course_id = session.metadata?.course_id;

      if (user_id && course_id) {
        const admin = createClient(
          SUPABASE_URL,
          SERVICE_ROLE_KEY
        );

        await admin
          .from("enrollments")
          .update({
            is_paid: true,
            payment_status: "paid",
            paid_at: new Date().toISOString(),
          })
          .eq("user_id", user_id)
          .eq("course_id", course_id);
      }
    }

    return text("ok", 200);
  } catch (err) {
    return text(`Webhook error: ${String(err)}`, 400);
  }
});
