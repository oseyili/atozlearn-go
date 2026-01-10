import Stripe from "https://esm.sh/stripe@14?target=denonext";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SITE_URL = Deno.env.get("SITE_URL")!;

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: "2024-11-20",
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    const authHeader = req.headers.get("authorization");
    const apiKey = req.headers.get("apikey");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return json({ error: "Missing Authorization header" }, 401);
    }

    if (!apiKey) {
      return json({ error: "Missing apikey header" }, 401);
    }

    const { course_id } = await req.json();
    if (!course_id) {
      return json({ error: "Missing course_id" }, 400);
    }

    // 🔐 User-scoped client (JWT validation happens here)
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: {
          authorization: authHeader,
          apikey: SUPABASE_ANON_KEY,
        },
      },
    });

    const { data: userData, error: userError } =
      await userClient.auth.getUser();

    if (userError || !userData?.user) {
      return json({ error: "Invalid JWT" }, 401);
    }

    const user_id = userData.user.id;
    const email = userData.user.email ?? undefined;

    // 🔑 Admin client for DB writes
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Ensure enrollment row exists
    await admin.from("enrollments").upsert({
      user_id,
      course_id,
      is_paid: false,
      payment_status: "unpaid",
    });

    // 💳 Create Stripe Checkout
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
            },
          },
        },
      ],
      success_url: `${SITE_URL}/courses/${course_id}?paid=1`,
      cancel_url: `${SITE_URL}/courses/${course_id}?canceled=1`,
      metadata: {
        user_id,
        course_id,
      },
    });

    await admin
      .from("enrollments")
      .update({ stripe_session_id: session.id })
      .eq("user_id", user_id)
      .eq("course_id", course_id);

    return json({ url: session.url });
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : String(err) },
      500
    );
  }
});
