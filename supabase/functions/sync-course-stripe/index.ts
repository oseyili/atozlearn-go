import Stripe from "https://esm.sh/stripe@14?target=denonext";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const HOOK_SECRET = Deno.env.get("HOOK_SECRET") ?? "";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const hook = req.headers.get("x-hook-secret") ?? "";
    if (!HOOK_SECRET || hook !== HOOK_SECRET) return json({ error: "Unauthorized" }, 401);

    if (!STRIPE_SECRET_KEY) return json({ error: "Missing STRIPE_SECRET_KEY" }, 500);
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return json({ error: "Missing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY" }, 500);

    const body = await req.json().catch(() => ({}));
    const courseId = body?.course_id;
    if (!courseId) return json({ error: "Missing course_id" }, 400);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2023-10-16" });

    // Read course data (expects: title/name, price_cents, currency, stripe_product_id, stripe_price_id)
    const { data: course, error: readErr } = await supabase
      .from("courses")
      .select("id,title,name,price_cents,currency,stripe_product_id,stripe_price_id")
      .eq("id", courseId)
      .single();

    if (readErr) return json({ error: "Course read failed", details: readErr.message }, 500);
    if (!course) return json({ error: "Course not found" }, 404);

    const title = course.title ?? course.name ?? Course ;
    const priceCents = Number(course.price_cents ?? 0);
    const currency = String(course.currency ?? "gbp").toLowerCase();

    if (!Number.isFinite(priceCents) || priceCents <= 0) {
      return json({ error: "Invalid price_cents (must be > 0)" }, 400);
    }

    let productId = course.stripe_product_id as string | null;
    let priceId = course.stripe_price_id as string | null;

    // Create product if missing
    if (!productId) {
      const product = await stripe.products.create({
        name: title,
        metadata: { course_id: String(course.id) },
      });
      productId = product.id;

      const { error: upErr } = await supabase
        .from("courses")
        .update({ stripe_product_id: productId })
        .eq("id", course.id);

      if (upErr) return json({ error: "Failed to save stripe_product_id", details: upErr.message }, 500);
    }

    // Create price if missing
    if (!priceId) {
      const price = await stripe.prices.create({
        product: productId!,
        unit_amount: priceCents,
        currency,
        metadata: { course_id: String(course.id) },
      });
      priceId = price.id;

      const { error: upErr2 } = await supabase
        .from("courses")
        .update({ stripe_price_id: priceId })
        .eq("id", course.id);

      if (upErr2) return json({ error: "Failed to save stripe_price_id", details: upErr2.message }, 500);
    }

    return json({ ok: true, course_id: course.id, stripe_product_id: productId, stripe_price_id: priceId }, 200);
  } catch (e) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
