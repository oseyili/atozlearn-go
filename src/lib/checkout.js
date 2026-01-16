import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Put your Stripe LIVE price id here (must start with "price_")
 * Example: "price_1Qxxxx..."
 */
const LIVE_TEST_PRICE_ID = "price_1SqBAADZOfW62KCwTzOwoFIs"; // <-- replace this

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Call this on "Enroll & Pay"
 */
export async function enrollAndPay(courseId) {
  try {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session) {
      alert("You must be logged in to enroll.");
      return;
    }

    const res = await fetch(`${SUPABASE_URL}/functions/v1/create-checkout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        course_id: courseId,

        // 🔥 Force Stripe to use your LIVE price for a safe live test
        price_id: LIVE_TEST_PRICE_ID,

        success_url: `${window.location.origin}/payment-success`,
        cancel_url: `${window.location.origin}/courses/${courseId}`,
      }),
    });

    // create-checkout always returns JSON
    const json = await res.json();

    // Helpful error popup instead of "No checkout url returned"
    if (!json.ok || !json.url) {
      console.error("create-checkout response:", json);
      alert(
        "Checkout failed:\n" +
          (json?.error || "No error message") +
          (json?.details ? "\n\nDetails:\n" + json.details : "")
      );
      return;
    }

    // Redirect to Stripe checkout
    window.location.href = json.url;
  } catch (err) {
    console.error("Enroll & Pay failed:", err);
    alert("Unexpected error starting payment. Check console.");
  }
}
