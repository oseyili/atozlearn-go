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

  const [courseQuery, setCourseQuery] = useState("");
  const [activeTab, setActiveTab] = useState("paid"); // paid | courses | subjects

  const signedInLabel = useMemo(() => {
    if (!user?.email) return "Not signed in";
    return `Signed in: ${user.email}`;
  }, [user]);

  const filteredCourses = useMemo(() => {
    const q = courseQuery.trim().toLowerCase();
    if (!q) return courses;
    return courses.filter((c) => {
      const title = (c.title ?? "").toLowerCase();
      const id = (c.id ?? "").toLowerCase();
      return title.includes(q) || id.includes(q);
    });
  }, [courses, courseQuery]);

  const stats = useMemo(
    () => ({
      courses: courses.length,
      subjects: subjects.length,
      paidCourses: paidCourses.length,
    }),
    [courses.length, subjects.length, paidCourses.length]
  );

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

  useEffect(() => {
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const TabButton = ({ id, label, count }) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`tabBtn ${activeTab === id ? "tabBtnActive" : ""}`}
      type="button"
    >
      <span>{label}</span>
      <span className="pill">{count}</span>
    </button>
  );

  return (
    <div className="page">
      <div className="topbar">
        <div className="brand">
          <div className="logo">A</div>
          <div>
            <div className="title">AtoZlearn-go</div>
            <div className="subtitle">Professional Learning Portal</div>
          </div>
        </div>

        <div className="actions">
          <div className="statusText">{signedInLabel}</div>

          <button className="btn" onClick={refreshAll} disabled={loading || busy} type="button">
            Reload
          </button>

          {user ? (
            <button className="btn btnGhost" onClick={signOut} disabled={loading || busy} type="button">
              Sign out
            </button>
          ) : (
            <Link className="btn btnGhost" to="/login">
              Sign in
            </Link>
          )}
        </div>
      </div>

      {error ? (
        <div className="alert">
          <b>Error:</b> {error}
        </div>
      ) : null}

      <div className="hero">
        <div>
          <h1 className="h1">Master Portal</h1>
          <div className="muted">Subjects + courses load from your database. Paid courses unlock lessons.</div>

          {isAdmin ? (
            <div style={{ marginTop: 10 }}>
              <Link to="/admin/payments" className="adminLink">
                Admin • Payments Audit
              </Link>
            </div>
          ) : null}
        </div>

        <div className="stats">
          <div className="statCard">
            <div className="statLabel">Courses</div>
            <div className="statValue">{stats.courses}</div>
          </div>
          <div className="statCard">
            <div className="statLabel">Subjects</div>
            <div className="statValue">{stats.subjects}</div>
          </div>
          <div className="statCard">
            <div className="statLabel">Paid courses</div>
            <div className="statValue">{stats.paidCourses}</div>
          </div>
        </div>
      </div>

      <div className="tabs">
        <TabButton id="paid" label="Paid Courses" count={paidCourses.length} />
        <TabButton id="courses" label="Browse Courses" count={courses.length} />
        <TabButton id="subjects" label="Subjects" count={subjects.length} />
      </div>

      {activeTab === "paid" ? (
        <div className="section">
          <div className="sectionHeader">
            <div>
              <div className="sectionTitle">Paid Courses</div>
              <div className="mutedSmall">Shown only when signed in and marked paid in enrollments.</div>
            </div>
          </div>

          {!user ? (
            <div className="empty">Sign in to see your paid courses.</div>
          ) : paidCourses.length === 0 ? (
            <div className="empty">No paid courses yet. After payment, the webhook must mark enrollments as paid.</div>
          ) : (
            <div className="grid">
              {paidCourses.map((p) => (
                <div className="card" key={p.course_id}>
                  <div className="cardTitle">{p.course_title ?? "Course"}</div>
                  <div className="mutedSmall">{p.course_id}</div>

                  <div className="cardRow">
                    <span className="badge badgePaid">PAID</span>
                    <button className="btn" onClick={() => nav(`/course/${p.course_id}`)} type="button">
                      Open
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {activeTab === "courses" ? (
        <div className="section">
          <div className="sectionHeader">
            <div>
              <div className="sectionTitle">Browse Courses</div>
              <div className="mutedSmall">Showing latest 200 for performance. Use search.</div>
            </div>

            <div className="searchWrap">
              <input
                className="search"
                value={courseQuery}
                onChange={(e) => setCourseQuery(e.target.value)}
                placeholder="Search by title or course id..."
              />
              <div className="mutedSmall" style={{ textAlign: "right" }}>
                Showing {filteredCourses.length}/{courses.length}
              </div>
            </div>
          </div>

          <div className="tableWrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Course</th>
                  <th style={{ width: 260 }}>Course ID</th>
                  <th style={{ width: 120 }} />
                </tr>
              </thead>
              <tbody>
                {filteredCourses.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <div className="tdStrong">{c.title ?? "Course"}</div>
                      <div className="mutedSmall">{c.created_at ? new Date(c.created_at).toLocaleDateString() : "-"}</div>
                    </td>
                    <td className="mutedSmall">{c.id}</td>
                    <td style={{ textAlign: "right" }}>
                      <button className="btn btnGhost" onClick={() => nav(`/course/${c.id}`)} type="button">
                        Open
                      </button>
                    </td>
                  </tr>
                ))}

                {filteredCourses.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="emptyRow">
                      {loading ? "Loading..." : "No matching courses."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {activeTab === "subjects" ? (
        <div className="section">
          <div className="sectionHeader">
            <div>
              <div className="sectionTitle">Subjects</div>
              <div className="mutedSmall">Browse subjects (course filter view can be added next).</div>
            </div>
          </div>

          {subjects.length === 0 ? (
            <div className="empty">{loading ? "Loading..." : "No subjects found."}</div>
          ) : (
            <div className="grid">
              {subjects.map((s) => (
                <div className="card" key={s.id}>
                  <div className="cardTitle">📚 {s.name}</div>
                  <div className="mutedSmall">{s.id}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      <div className="footer">© {new Date().getFullYear()} AtoZlearn-go • Secure payments • Progress tracking • Support</div>

      <style>{`
        .page{max-width:1100px;margin:0 auto;padding:16px;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#0f172a;}
        .topbar{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;padding:10px 12px;border:1px solid rgba(15,23,42,.10);border-radius:16px;background:#fff;box-shadow:0 8px 20px rgba(15,23,42,.05);}
        .brand{display:flex;align-items:center;gap:12px}
        .logo{width:38px;height:38px;border-radius:12px;background:rgba(2,132,199,.12);display:grid;place-items:center;font-weight:900}
        .title{font-weight:900;font-size:14px;letter-spacing:.2px}
        .subtitle{opacity:.7;font-size:12px;margin-top:2px}
        .actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:flex-end}
        .statusText{opacity:.75;font-size:12px}
        .btn{padding:10px 12px;border-radius:12px;border:1px solid rgba(15,23,42,.14);background:#0f172a;color:#fff;font-weight:700;cursor:pointer}
        .btn:disabled{opacity:.55;cursor:not-allowed}
        .btnGhost{background:#fff;color:#0f172a}
        .alert{margin-top:12px;padding:12px;border-radius:12px;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2)}
        .hero{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap;margin-top:14px;padding:14px;border-radius:16px;background:linear-gradient(180deg, rgba(2,132,199,.08), rgba(2,132,199,.03));border:1px solid rgba(2,132,199,.15)}
        .h1{margin:0;font-size:22px;letter-spacing:-.2px}
        .muted{opacity:.78;margin-top:6px}
        .mutedSmall{opacity:.7;font-size:12px}
        .adminLink{display:inline-block;padding:8px 10px;border:1px solid rgba(15,23,42,.14);border-radius:12px;background:#fff;text-decoration:none;color:#0f172a;font-weight:700}
        .stats{display:flex;gap:10px;flex-wrap:wrap}
        .statCard{min-width:140px;padding:10px 12px;border-radius:14px;background:#fff;border:1px solid rgba(15,23,42,.10)}
        .statLabel{opacity:.7;font-size:12px}
        .statValue{font-size:18px;font-weight:900;margin-top:2px}
        .tabs{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}
        .tabBtn{display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:14px;border:1px solid rgba(15,23,42,.14);background:#fff;font-weight:800;cursor:pointer}
        .tabBtnActive{background:#0f172a;color:#fff}
        .pill{font-size:12px;padding:2px 8px;border-radius:999px;border:1px solid rgba(15,23,42,.14);opacity:.9}
        .tabBtnActive .pill{border-color:rgba(255,255,255,.35)}
        .section{margin-top:14px;padding:14px;border:1px solid rgba(15,23,42,.10);border-radius:16px;background:#fff;box-shadow:0 8px 20px rgba(15,23,42,.04)}
        .sectionHeader{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap}
        .sectionTitle{font-weight:900;font-size:16px}
        .empty{margin-top:10px;padding:12px;border-radius:12px;background:rgba(15,23,42,.03);border:1px dashed rgba(15,23,42,.18);opacity:.85}
        .grid{margin-top:12px;display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px}
        .card{padding:12px;border-radius:16px;border:1px solid rgba(15,23,42,.10);background:#fff}
        .cardTitle{font-weight:900}
        .cardRow{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:10px}
        .badge{display:inline-flex;align-items:center;padding:4px 10px;border-radius:999px;border:1px solid rgba(15,23,42,.14);font-size:12px;font-weight:900}
        .badgePaid{background:rgba(34,197,94,.12);border-color:rgba(34,197,94,.30)}
        .searchWrap{display:flex;flex-direction:column;gap:6px;min-width:280px}
        .search{padding:10px 12px;border-radius:14px;border:1px solid rgba(15,23,42,.14);outline:none}
        .tableWrap{margin-top:12px;overflow:auto;border-radius:16px;border:1px solid rgba(15,23,42,.10)}
        .table{width:100%;border-collapse:collapse}
        .table th{font-size:12px;text-transform:uppercase;letter-spacing:.06em;opacity:.7;background:rgba(15,23,42,.03);text-align:left;padding:10px}
        .table td{padding:10px;border-top:1px solid rgba(15,23,42,.08);vertical-align:top}
        .tdStrong{font-weight:900}
        .emptyRow{padding:14px;opacity:.75;text-align:center}
        .footer{margin-top:16px;opacity:.6;font-size:12px;text-align:center}
      `}</style>
    </div>
  );
}
