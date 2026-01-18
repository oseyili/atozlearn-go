import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../supabaseClient";

export default function AdminPaymentsPage() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [rows, setRows] = useState([]);
  const [limit, setLimit] = useState(200);
  const [error, setError] = useState("");

  const paidCount = useMemo(() => rows.filter(r => r.paid || r.is_paid).length, [rows]);

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const adminRes = await supabase.rpc("is_admin");
      if (adminRes.error) throw adminRes.error;
      const ok = !!adminRes.data;
      setIsAdmin(ok);

      if (!ok) {
        setRows([]);
        return;
      }

      const { data, error } = await supabase.rpc("admin_get_payments", { p_limit: Number(limit) || 200 });
      if (error) throw error;
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e?.message || String(e));
      setRows([]);
      setIsAdmin(false);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  return (
    <div style={{ padding: 16, fontFamily: "system-ui, sans-serif", maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ opacity: 0.7, fontSize: 14 }}>
            <Link to="/portal" style={{ textDecoration: "none" }}>Portal</Link>{" "}
            <span style={{ opacity: 0.4 }}>/</span>{" "}
            <span>Admin Payments</span>
          </div>
          <h1 style={{ margin: "8px 0 0" }}>Admin â€¢ Payments Audit</h1>
          <div style={{ opacity: 0.75, marginTop: 6 }}>
            Shows enrollments + Stripe IDs + subscription state. Read-only.
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ display: "flex", gap: 8, alignItems: "center", opacity: 0.85 }}>
            Limit
            <input
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              style={{ width: 90, padding: "8px 10px" }}
            />
          </label>

          <button
            disabled={loading || busy}
            onClick={async () => { setBusy(true); try { await refresh(); } finally { setBusy(false); } }}
            style={{ padding: "10px 12px" }}
          >
            Refresh
          </button>
        </div>
      </div>

      {error ? (
        <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: "rgba(255,0,0,0.08)" }}>
          <b>Error:</b> {error}
        </div>
      ) : null}

      {!loading && !isAdmin ? (
        <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: "rgba(0,0,0,0.03)" }}>
          <b>Access denied.</b>
          <div style={{ opacity: 0.8, marginTop: 6 }}>
            Your user is not in <code>public.admin_users</code>.
          </div>
        </div>
      ) : null}

      {isAdmin ? (
        <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div style={{ padding: 10, border: "1px solid rgba(0,0,0,0.12)", borderRadius: 10 }}>
            <b>Rows:</b> {rows.length}
          </div>
          <div style={{ padding: 10, border: "1px solid rgba(0,0,0,0.12)", borderRadius: 10 }}>
            <b>Paid:</b> {paidCount}
          </div>
        </div>
      ) : null}

      {isAdmin ? (
        <div style={{ marginTop: 14, overflowX: "auto", border: "1px solid rgba(0,0,0,0.12)", borderRadius: 10 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", background: "rgba(0,0,0,0.03)" }}>
                <th style={{ padding: 10 }}>User</th>
                <th style={{ padding: 10 }}>Course</th>
                <th style={{ padding: 10, width: 90 }}>Paid</th>
                <th style={{ padding: 10, width: 140 }}>Status</th>
                <th style={{ padding: 10, width: 120 }}>Paid At</th>
                <th style={{ padding: 10 }}>Stripe</th>
                <th style={{ padding: 10, width: 180 }}>Subscription</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.enrollment_id} style={{ borderTop: "1px solid rgba(0,0,0,0.08)" }}>
                  <td style={{ padding: 10 }}>
                    <div style={{ fontWeight: 700 }}>{r.user_email || r.user_id}</div>
                    <div style={{ opacity: 0.7, fontSize: 12 }}>{r.user_id}</div>
                  </td>

                  <td style={{ padding: 10 }}>
                    <div style={{ fontWeight: 700 }}>{r.course_title || "Course"}</div>
                    <div style={{ opacity: 0.7, fontSize: 12 }}>{r.course_id}</div>
                    <div style={{ marginTop: 6 }}>
                      <Link to={`/course/${r.course_id}`}>Open</Link>
                    </div>
                  </td>

                  <td style={{ padding: 10, fontWeight: 800 }}>
                    {(r.paid || r.is_paid) ? "YES" : "NO"}
                  </td>

                  <td style={{ padding: 10 }}>{r.payment_status || "-"}</td>

                  <td style={{ padding: 10, opacity: 0.8 }}>
                    {r.paid_at ? new Date(r.paid_at).toLocaleDateString() : "-"}
                  </td>

                  <td style={{ padding: 10, opacity: 0.85 }}>
                    <div style={{ fontSize: 12 }}>session: {r.stripe_session_id || "-"}</div>
                    <div style={{ fontSize: 12 }}>customer: {r.stripe_customer_id || "-"}</div>
                    <div style={{ fontSize: 12 }}>sub: {r.stripe_subscription_id || "-"}</div>
                  </td>

                  <td style={{ padding: 10 }}>
                    <div><b>{r.subscription_status || "-"}</b></div>
                    {r.cancel_at_period_end ? (
                      <div style={{ opacity: 0.8, fontSize: 12 }}>
                        Cancels at period end
                        {r.current_period_end ? ` (${new Date(r.current_period_end).toLocaleDateString()})` : ""}
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}

              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 12, opacity: 0.75 }}>
                    {loading ? "Loading..." : "No rows."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
