// FORCE-DEPLOY MARKER: stripe-webhook v5 2026-01-18
// Adds: audit logging, subscription status sync, refund handling, and enrollment updates.

import Stripe from "https://esm.sh/stripe@14?target=denonext";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2023-10-16" });
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function logEvent(event: Stripe.Event) {
  // Store raw event for auditing / debugging. Idempotent on stripe_event_id.
  await supabase.from("payment_events").upsert(
    [{ stripe_event_id: event.id, event_type: event.type, payload: event as any }],
    { onConflict: "stripe_event_id" },
  );
}

async function upsertEnrollment(params: {
  userId: string;
  courseId: string;
  paid: boolean;
  paymentStatus: string;
  sessionId?: string | null;
  customerId?: string | null;
  subscriptionId?: string | null;
}) {
  const row = {
    user_id: params.userId,
    course_id: params.courseId,

    paid: params.paid,
    is_paid: params.paid,
    payment_status: params.paymentStatus,
    paid_at: params.paid ? new Date().toISOString() : null,

    stripe_session_id: params.sessionId ?? null,
    stripe_customer_id: params.customerId ?? null,
    stripe_subscription_id: params.subscriptionId ?? null,
  };

  const { error } = await supabase
    .from("enrollments")
    .upsert([row], { onConflict: "user_id,course_id" });

  if (error) throw error;
}

async function upsertSubscription(params: {
  userId: string;
  courseId: string;
  customerId?: string | null;
  subscriptionId: string;
  priceId?: string | null;
  status?: string | null;
  cancelAtPeriodEnd?: boolean | null;
  currentPeriodEnd?: number | null; // unix seconds
  canceledAt?: number | null; // unix seconds
}) {
  const toIso = (sec?: number | null) =>
    sec ? new Date(sec * 1000).toISOString() : null;

  const { error } = await supabase.from("user_subscriptions").upsert(
    [{
      user_id: params.userId,
      course_id: params.courseId,
      stripe_customer_id: params.customerId ?? null,
      stripe_subscription_id: params.subscriptionId,
      stripe_price_id: params.priceId ?? null,
      status: params.status ?? null,
      cancel_at_period_end: params.cancelAtPeriodEnd ?? null,
      current_period_end: toIso(params.currentPeriodEnd),
      canceled_at: toIso(params.canceledAt),
      updated_at: new Date().toISOString(),
    }],
    { onConflict: "stripe_subscription_id" },
  );

  if (error) throw error;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const sig = req.headers.get("stripe-signature");
  if (!sig) return json({ error: "Missing stripe-signature" }, 400);

  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: "Invalid signature", message: msg }, 400);
  }

  try {
    await logEvent(event);

    // 1) Checkout completed (often fires right away)
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;

      const userId = session.metadata?.user_id;
      const courseId = session.metadata?.course_id;

      if (userId && courseId) {
        await upsertEnrollment({
          userId: String(userId),
          courseId: String(courseId),
          paid: true,
          paymentStatus: "paid",
          sessionId: session.id,
          customerId: typeof session.customer === "string" ? session.customer : null,
          subscriptionId: typeof session.subscription === "string" ? session.subscription : null,
        });
      }

      return json({ ok: true, handled: event.type });
    }

    // 2) Invoice paid (reliable “money succeeded” signal for subscriptions)
    if (event.type === "invoice.paid") {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId =
        typeof invoice.subscription === "string" ? invoice.subscription : null;

      if (!subscriptionId) return json({ ok: true, handled: event.type, note: "no subscription id" });

      const sub = await stripe.subscriptions.retrieve(subscriptionId);

      const userId = sub.metadata?.user_id;
      const courseId = sub.metadata?.course_id;

      if (userId && courseId) {
        await upsertEnrollment({
          userId: String(userId),
          courseId: String(courseId),
          paid: true,
          paymentStatus: "paid",
          customerId: typeof invoice.customer === "string" ? invoice.customer : null,
          subscriptionId,
        });

        const priceId = sub.items.data?.[0]?.price?.id
          ? String(sub.items.data[0].price.id)
          : null;

        await upsertSubscription({
          userId: String(userId),
          courseId: String(courseId),
          customerId: typeof invoice.customer === "string" ? invoice.customer : null,
          subscriptionId,
          priceId,
          status: sub.status,
          cancelAtPeriodEnd: sub.cancel_at_period_end,
          currentPeriodEnd: sub.current_period_end ?? null,
          canceledAt: sub.canceled_at ?? null,
        });
      }

      return json({ ok: true, handled: event.type });
    }

    // 3) Subscription status updates / deletions
    if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      const sub = event.data.object as Stripe.Subscription;

      const userId = sub.metadata?.user_id;
      const courseId = sub.metadata?.course_id;

      if (userId && courseId) {
        const priceId = sub.items.data?.[0]?.price?.id
          ? String(sub.items.data[0].price.id)
          : null;

        await upsertSubscription({
          userId: String(userId),
          courseId: String(courseId),
          customerId: typeof sub.customer === "string" ? sub.customer : null,
          subscriptionId: sub.id,
          priceId,
          status: sub.status,
          cancelAtPeriodEnd: sub.cancel_at_period_end,
          currentPeriodEnd: sub.current_period_end ?? null,
          canceledAt: sub.canceled_at ?? null,
        });

        // Business rule: if deleted, mark payment_status=canceled but keep paid=true
        // (access can remain until you decide otherwise)
        if (event.type === "customer.subscription.deleted") {
          await upsertEnrollment({
            userId: String(userId),
            courseId: String(courseId),
            paid: true,
            paymentStatus: "canceled",
            customerId: typeof sub.customer === "string" ? sub.customer : null,
            subscriptionId: sub.id,
          });
        }
      }

      return json({ ok: true, handled: event.type });
    }

    // 4) Refunds: lock access by marking unpaid
    if (event.type === "charge.refunded") {
      const charge = event.data.object as Stripe.Charge;
      const customerId = typeof charge.customer === "string" ? charge.customer : null;

      if (customerId) {
        // Find the latest subscription in our DB for this customer
        const { data: rows, error } = await supabase
          .from("user_subscriptions")
          .select("user_id, course_id, stripe_subscription_id")
          .eq("stripe_customer_id", customerId)
          .order("updated_at", { ascending: false })
          .limit(1);

        if (error) throw error;

        const row = rows?.[0];
        if (row?.user_id && row?.course_id) {
          await upsertEnrollment({
            userId: String(row.user_id),
            courseId: String(row.course_id),
            paid: false,
            paymentStatus: "refunded",
            customerId,
            subscriptionId: row.stripe_subscription_id ?? null,
          });
        }
      }

      return json({ ok: true, handled: event.type });
    }

    return json({ ok: true, ignored: event.type });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ ok: false, error: "Webhook handler error", message: msg }, 500);
  }
});
