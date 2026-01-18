# install-autopilot-next.ps1 (COMPLETE)
# Creates Admin Payments page + wires routes + portal link.
# Commits + pushes a clean branch for PR.

$ErrorActionPreference = "Stop"

function WriteFile($path, $content) {
  $dir = Split-Path -Parent $path
  if ($dir -and !(Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  Set-Content -Path $path -Value $content -Encoding UTF8
  Write-Host "Wrote: $path"
}

cd "C:\Users\oseyi\Documents\atozlearngo"

# --- FULL FILE: src/pages/AdminPaymentsPage.jsx ---
$adminPayments = @'
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
          <h1 style={{ margin: "8px 0 0" }}>Admin • Payments Audit</h1>
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
'@

WriteFile ".\src\pages\AdminPaymentsPage.jsx" $adminPayments

# --- FULL FILE REPLACEMENT: src/App.jsx ---
$app = @'
import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import PortalPage from "./pages/PortalPage.jsx";
import CoursePage from "./pages/CoursePage.jsx";
import AdminPaymentsPage from "./pages/AdminPaymentsPage.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/portal" replace />} />

      <Route path="/portal" element={<PortalPage />} />
      <Route path="/course/:courseId" element={<CoursePage />} />

      {/* Admin */}
      <Route path="/admin/payments" element={<AdminPaymentsPage />} />

      <Route path="/success" element={<Navigate to="/portal" replace />} />
      <Route path="/cancel" element={<Navigate to="/portal" replace />} />

      <Route path="*" element={<Navigate to="/portal" replace />} />
    </Routes>
  );
}
'@

WriteFile ".\src\App.jsx" $app

# --- FULL FILE REPLACEMENT: src/pages/PortalPage.jsx (adds Admin link, gated by is_admin()) ---
$portal = @'
import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

export default function PortalPage() {
  const nav = useNavigate();

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const [subjects, setSubjects] = useState([]);
  const [courses, setCourses] = useState([]);
  const [paidCourses, setPaidCourses] = useState([]);

  const [error, setError] = useState("");

  const signedInLabel = useMemo(() => {
    if (!user?.email) return "Not signed in";
    return `Signed in: ${user.email}`;
  }, [user]);

  async function loadUser() {
    const { data, error } = await supabase.auth.getUser();
    if (error) return null;
    return data?.user ?? null;
  }

  async function loadIsAdmin() {
    const { data, error } = await supabase.rpc("is_admin");
    if (error) return false;
    return !!data;
  }

  async function loadSubjects() {
    const { data, error } = await supabase
      .from("subjects")
      .select("id,name")
      .order("name", { ascending: true });

    if (error) return [];
    return data ?? [];
  }

  async function loadCourses() {
    const { data, error } = await supabase
      .from("courses")
      .select("id,title,subject,created_at")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) return [];
    return data ?? [];
  }

  async function loadPaidCourses() {
    const { data, error } = await supabase.rpc("get_paid_courses");
    if (error) return [];
    return data ?? [];
  }

  async function refreshAll() {
    setLoading(true);
    setError("");
    try {
      const u = await loadUser();
      setUser(u);

      const admin = u ? await loadIsAdmin() : false;
      setIsAdmin(admin);

      const [s, c] = await Promise.all([loadSubjects(), loadCourses()]);
      setSubjects(s);
      setCourses(c);

      if (u) {
        const pc = await loadPaidCourses();
        setPaidCourses(pc);
      } else {
        setPaidCourses([]);
      }
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  async function signOut() {
    setBusy(true);
    try {
      await supabase.auth.signOut();
      await refreshAll();
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { refreshAll(); }, []);

  return (
    <div style={{ padding: 16, fontFamily: "system-ui, sans-serif", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Master Portal</h1>
          <div style={{ opacity: 0.75, marginTop: 4 }}>Learn anything, from A to Z</div>
          <div style={{ opacity: 0.75, marginTop: 6 }}>{signedInLabel}</div>

          {isAdmin ? (
            <div style={{ marginTop: 8 }}>
              <Link to="/admin/payments">Admin • Payments Audit</Link>
            </div>
          ) : null}
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={refreshAll} disabled={loading || busy} style={{ padding: "10px 12px" }}>
            Reload
          </button>
          {user ? (
            <button onClick={signOut} disabled={loading || busy} style={{ padding: "10px 12px" }}>
              Sign out
            </button>
          ) : (
            <Link to="/login" style={{ padding: "10px 12px", display: "inline-block" }}>
              Sign in
            </Link>
          )}
        </div>
      </div>

      {error ? (
        <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: "rgba(255,0,0,0.08)" }}>
          <b>Error:</b> {error}
        </div>
      ) : null}

      <div style={{ marginTop: 14, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div style={{ padding: 10, border: "1px solid rgba(0,0,0,0.12)", borderRadius: 10 }}>
          <b>Courses:</b> {courses.length}
        </div>
        <div style={{ padding: 10, border: "1px solid rgba(0,0,0,0.12)", borderRadius: 10 }}>
          <b>Subjects:</b> {subjects.length}
        </div>
        <div style={{ padding: 10, border: "1px solid rgba(0,0,0,0.12)", borderRadius: 10 }}>
          <b>Paid Courses:</b> {paidCourses.length}
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <h2 style={{ marginBottom: 8 }}>Paid Courses</h2>
        {!user ? (
          <div style={{ opacity: 0.7 }}>Sign in to see your paid courses.</div>
        ) : paidCourses.length === 0 ? (
          <div style={{ opacity: 0.7 }}>
            No paid courses yet. After payment, the webhook must mark enrollments as paid.
          </div>
        ) : (
          <div style={{ overflowX: "auto", border: "1px solid rgba(0,0,0,0.12)", borderRadius: 10 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", background: "rgba(0,0,0,0.03)" }}>
                  <th style={{ padding: 10 }}>Course</th>
                  <th style={{ padding: 10, width: 160 }}>Status</th>
                  <th style={{ padding: 10, width: 120 }}>Open</th>
                </tr>
              </thead>
              <tbody>
                {paidCourses.map((p) => (
                  <tr key={p.course_id} style={{ borderTop: "1px solid rgba(0,0,0,0.08)" }}>
                    <td style={{ padding: 10, fontWeight: 700 }}>{p.course_title ?? p.course_id}</td>
                    <td style={{ padding: 10 }}>PAID</td>
                    <td style={{ padding: 10 }}>
                      <button onClick={() => nav(`/course/${p.course_id}`)} style={{ padding: "8px 10px" }}>
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{ marginTop: 18 }}>
        <h2 style={{ marginBottom: 8 }}>Browse Courses (latest 200)</h2>
        <div style={{ overflowX: "auto", border: "1px solid rgba(0,0,0,0.12)", borderRadius: 10 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", background: "rgba(0,0,0,0.03)" }}>
                <th style={{ padding: 10 }}>Title</th>
                <th style={{ padding: 10, width: 220 }}>Course ID</th>
                <th style={{ padding: 10, width: 120 }}>Open</th>
              </tr>
            </thead>
            <tbody>
              {courses.map((c) => (
                <tr key={c.id} style={{ borderTop: "1px solid rgba(0,0,0,0.08)" }}>
                  <td style={{ padding: 10, fontWeight: 700 }}>{c.title ?? "Course"}</td>
                  <td style={{ padding: 10, opacity: 0.75 }}>{c.id}</td>
                  <td style={{ padding: 10 }}>
                    <button onClick={() => nav(`/course/${c.id}`)} style={{ padding: "8px 10px" }}>
                      Open
                    </button>
                  </td>
                </tr>
              ))}
              {courses.length === 0 && (
                <tr>
                  <td colSpan={3} style={{ padding: 12, opacity: 0.7 }}>
                    No courses found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ marginTop: 18, opacity: 0.6, fontSize: 12 }}>
        © {new Date().getFullYear()} AtoZlearn-go • Secure payments • Progress tracking • Support
      </div>
    </div>
  );
}
'@

WriteFile ".\src\pages\PortalPage.jsx" $portal

# --- Branch + commit + push (PR workflow, avoids ruleset issues) ---
git fetch origin | Out-Null
git switch -c fix/admin-audit-ui 2>$null
if ($LASTEXITCODE -ne 0) { git switch fix/admin-audit-ui }

git add -A
git status

git commit -m "Add admin payments audit page + route + portal link" 2>$null
git push -u origin fix/admin-audit-ui
Write-Host ""
Write-Host "DONE: pushed branch fix/admin-audit-ui. Open PR on GitHub and merge." -ForegroundColor Green
