async function startPayment() {
  if (!session) {
    nav("/login");
    return;
  }

  setBusy(true);
  setErr("");

  try {
    // ✅ Always refresh right before payment (fixes "token is expired")
    const { data: refreshed, error: refreshErr } = await supabase.auth.refreshSession();
    if (refreshErr) throw refreshErr;

    const token = refreshed?.session?.access_token;
    if (!token) throw new Error("Session expired. Please sign out and sign in again.");

    // ✅ Call Edge Function via Supabase SDK, but force the fresh token header
    const { data, error } = await supabase.functions.invoke("create-checkout", {
      body: { course_id: id },
      headers: { Authorization: `Bearer ${token}` },
    });

    if (error) {
      const status = error?.context?.status;
      const body = error?.context?.body;
      throw new Error(`Edge error ${status ?? ""}: ${body ?? error.message}`);
    }

    if (!data?.url) throw new Error("No checkout URL returned from server.");
    window.location.href = data.url;
  } catch (e) {
    setErr(e?.message || "Payment failed");
  } finally {
    setBusy(false);
  }
}
