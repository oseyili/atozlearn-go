async function startPayment() {
  // Must be signed in to pay
  if (!session) {
    navigate("/login");
    return;
  }

  setBusy(true);
  setErr("");

  try {
    // Always get a fresh session token
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;

    const token = data?.session?.access_token;
    if (!token) throw new Error("No access token. Please sign out and sign in again.");

    // This must be set in Render + local .env
    const base = import.meta.env.VITE_SUPABASE_EDGE_BASE;
    if (!base) throw new Error("Missing VITE_SUPABASE_EDGE_BASE. Add it in Render Environment.");

    // Call Edge Function
    const res = await fetch(`${base}/create-checkout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({ course_id: id }),
    });

    // If the function returns an error, show it clearly
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `Checkout failed (${res.status})`);
    }

    const json = await res.json();
    if (!json?.url) throw new Error("No checkout URL returned from server.");

    // Redirect to Stripe Checkout
    window.location.href = json.url;
  } catch (e) {
    setErr(e?.message || "Failed to start payment");
  } finally {
    setBusy(false);
  }
}

export default App;

