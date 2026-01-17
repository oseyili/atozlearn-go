import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export async function enrollAndPay(courseId) {
  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
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
      body: JSON.stringify({ course_id, successUrl: `${window.location.origin}/success?session_id={CHECKOUT_SESSION_ID}`, cancelUrl: `${window.location.origin}/cancel` }),
    });

    const json = await res.json();

    if (!json.ok || !json.url) {
      console.error("create-checkout response:", json);
      alert(
        "Checkout failed:\n" +
          (json?.error || "No error message") +
          (json?.details ? "\n\nDetails:\n" + JSON.stringify(json.details, null, 2) : "")
      );
      return;
    }

    window.location.href = json.url;
  } catch (err) {
    console.error("Enroll & Pay failed:", err);
    alert("Unexpected error starting payment. Check console.");
  }
}

