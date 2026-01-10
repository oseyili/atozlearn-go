async function startPayment() {
  if (!session) {
    nav("/login");
    return;
  }

  setBusy(true);
  setErr("");

  try {
    // ✅ force a fresh token right before payment
    const { data: s, error: sErr } = await supabase.auth.getSession();
    if (sErr) throw sErr;

    const token = s?.session?.access_token;
    if (!token) throw new Error("You are not signed in. Please sign out and sign in again.");

    // ✅ invoke WITH Authorization header so it cannot be missing
    const { data, error } = await supabase.functions.invoke("create-checkout", {
      body: { course_id: id },
      headers: { Authorization: `Bearer ${token}` },
    });

    if (error) {
      const status = error?.context?.status;
      const body = error?.context?.body;
      throw new Error(`Edge error ${status ?? ""}: ${body ?? error.message}`);
    }

    if (!data?.url) throw new Error("No checkout URL returned.");
    window.location.href = data.url;
  } catch (e) {
    setErr(e?.message || "Payment failed");
  } finally {
    setBusy(false);
  }
}
