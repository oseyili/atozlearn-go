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
              <Link to="/admin/payments">Admin â€¢ Payments Audit</Link>
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
        Â© {new Date().getFullYear()} AtoZlearn-go â€¢ Secure payments â€¢ Progress tracking â€¢ Support
      </div>
    </div>
  );
}
