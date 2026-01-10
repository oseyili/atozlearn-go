async function startPayment() {
  if (!session) {
    nav("/login");
    return;
  }

  setBusy(true);
  setErr("");

  try {
    const { data, error } = await supabase.functions.invoke("create-checkout", {
      body: { course_id: id },
    });

    // ✅ Show the REAL error body instead of generic "non-2xx"
    if (error) {
      const status = error?.context?.status;
      const body = error?.context?.body;
      throw new Error(`Edge error ${status ?? ""}: ${body ?? error.message}`);
    }

    if (!data?.url) {
      throw new Error("No checkout URL returned from Edge Function.");
    }

    window.location.href = data.url;
  } catch (e) {
    setErr(e?.message || "Payment failed");
  } finally {
    setBusy(false);
  }
}
