import { supabase } from "../supabaseClient";

/**
 * Creates a Stripe Checkout session for a course.
 * Uses supabase.functions.invoke so apikey + Authorization are handled correctly.
 * Also includes userId in body as a fallback (server accepts either).
 */
export async function createCheckout(courseId) {
  if (!courseId) throw new Error("Missing courseId");

  const { data: userRes } = await supabase.auth.getUser();
  const userId = userRes?.user?.id || null;

  const { data, error } = await supabase.functions.invoke("create-checkout", {
    body: { courseId, userId },
  });

  if (error) throw error;
  if (!data?.url) throw new Error(data?.error || "No checkout url returned");
  return data.url;
}
