import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

export default function PortalPage() {
  const UI_BUILD = "UI_PRO_2026-01-23_22-23-13";
  const nav = useNavigate();

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const [subjects, setSubjects] = useState([]);
  const [courses, setCourses] = useState([]);
  const [paidCourses, setPaidCourses] = useState([]);
  const [enrollments, setEnrollments] = useState([]);

  const [activeTab, setActiveTab] = useState("paid"); // paid | courses | subjects | enrollments
  const [courseQuery, setCourseQuery] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("all");

  const signedInLabel = useMemo(() => {
    if (!user?.email) return "Not signed in";
    return Signed in: ;
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
       param($m) if([int]$m.Groups[1].Value -lt 7000){".limit(7000)"} else {$m.Value} ;
    if (error) return [];
    return data ?? [];
  }

  async function loadPaidCourses() {
    const { data, error } = await supabase.rpc("get_paid_courses");
    if (error) return [];
    return data ?? [];
  }

  async function loadEnrollments() {
    try {
      const { data, error } = await supabase
        .from("enrollments")
        .select("id,course_id,status,created_at")
        .order("created_at", { ascending: false })
         param($m) if([int]$m.Groups[1].Value -lt 7000){".limit(7000)"} else {$m.Value} ;
      if (error) return [];
      return data ?? [];
    } catch {
      return [];
    }
  }

  const courseTitleById = useMemo(() => {
    const m = new Map();
    for (const c of courses) m.set(c.id, c.title ?? "Course");
    return m;
  }, [courses]);

  const paidIdsFromEnrollments = useMemo(() => {
    const set = new Set();
    for (const e of enrollments) {
      const st = String(e?.status ?? "").toLowerCase();
      const paid = st === "paid" || e?.status === true;
      if (paid && e?.course_id) set.add(e.course_id);
    }
    return set;
  }, [enrollments]);

  const paidList = useMemo(() => {
    // Prefer RPC if present, otherwise use paid enrollments as fallback.
    if (Array.isArray(paidCourses) && paidCourses.length) return paidCourses;
    const out = [];
    for (const id of paidIdsFromEnrollments) {
      out.push({ course_id: id, course_title: courseTitleById.get(id) ?? "Course" });
    }
    return out;
  }, [paidCourses, paidIdsFromEnrollments, courseTitleById]);

  const isUnlocked = (courseId) => {
    if (!user) return false;
    if (paidIdsFromEnrollments.has(courseId)) return true;
    return paidCourses.some((p) => p.course_id === courseId);
  };

  const filteredCourses = useMemo(() => {
    const q = courseQuery.trim().toLowerCase();
    return courses.filter((c) => {
      const matchesQ = !q || (String(c.title ?? "").toLowerCase().includes(q) || String(c.id ?? "").toLowerCase().includes(q));
      const matchesSubject = subjectFilter === "all" || String(c.subject ?? "") === subjectFilter;
      return matchesQ && matchesSubject;
    });
  }, [courses, courseQuery, subjectFilter]);

  const stats = useMemo(() => ({
    subjects: subjects.length,
    courses: courses.length,
    paid: paidList.length,
    enrollments: enrollments.length,
  }), [subjects.length, courses.length, paidList.length, enrollments.length]);

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
        const [pc, en] = await Promise.all([loadPaidCourses(), loadEnrollments()]);
        setPaidCourses(pc);
        setEnrollments(en);
      } else {
        setPaidCourses([]);
        setEnrollments([]);
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

  const TabButton = ({ id, label, count, icon }) => (
    <button
      type="button"
      onClick={() => setActiveTab(id)}
      className={	abBtn }
    >
      <span className="tabIcon">{icon}</span>
      <span>{label}</span>
      <span className="pill">{count}</span>
    </button>
  );

  return (
    <div className="page">
      <div className="topbar">
        <div className="brand">
          <div className="logo">A</div>
          <div className="brandText">
            <div className="title">AtoZlearn-go</div>
            <div className="subtitle">Master Portal • Professional Learning</div>
            <div className="uiBadge">LIVE • {UI_BUILD}</div>
          </div>
        </div>

        <div className="actions">
          <div className="statusText">{signedInLabel}</div>
          <button className="btn" onClick={refreshAll} disabled={loading || busy} type="button">Reload</button>
          {user ? (
            <button className="btn btnGhost" onClick={signOut} disabled={loading || busy} type="button">Sign out</button>
          ) : (
            <Link className="btn btnGhost" to="/login">Sign in</Link>
          )}
        </div>
      </div>

      {error ? (
        <div className="alert"><b>Error:</b> {error}</div>
      ) : null}

      <div className="hero">
        <div className="heroLeft">
          <div className="heroKicker">Professional Learning Portal</div>
          <h1 className="h1">Master Portal</h1>
          <div className="muted">
            Browse subjects & courses, enroll with Stripe, and unlock content immediately after payment.
          </div>

          <div className="heroCTA">
            <button className="btn" onClick={() => setActiveTab("courses")} type="button">Browse Courses</button>
            <button className="btn btnGhost" onClick={() => setActiveTab("paid")} type="button">My Paid Courses</button>
            {isAdmin ? (
              <Link to="/admin/payments" className="adminLink">Admin • Payments Audit</Link>
            ) : null}
          </div>
        </div>

        <div className="stats">
          <div className="statCard statBlue"><div className="statLabel">Courses</div><div className="statValue">{stats.courses}</div></div>
          <div className="statCard statPurple"><div className="statLabel">Subjects</div><div className="statValue">{stats.subjects}</div></div>
          <div className="statCard statGreen"><div className="statLabel">Paid</div><div className="statValue">{stats.paid}</div></div>
          <div className="statCard statAmber"><div className="statLabel">Enrollments</div><div className="statValue">{stats.enrollments}</div></div>
        </div>
      </div>

      <div className="tabs">
        <TabButton id="paid" label="Paid Courses" count={paidList.length} icon="✅" />
        <TabButton id="courses" label="Browse Courses" count={courses.length} icon="📚" />
        <TabButton id="subjects" label="Subjects" count={subjects.length} icon="🧩" />
        <TabButton id="enrollments" label="Enrollments" count={enrollments.length} icon="🧾" />
      </div>

      {activeTab === "paid" ? (
        <div className="section">
          <div className="sectionHeader">
            <div>
              <div className="sectionTitle">Paid Courses</div>
              <div className="mutedSmall">All unlocked courses in a clean professional table.</div>
            </div>
          </div>

          {!user ? (
            <div className="empty">Sign in to see your paid courses.</div>
          ) : paidList.length === 0 ? (
            <div className="empty">
              No paid courses yet. If you already paid, the webhook must mark your enrollment as <b>paid</b>.
              <div className="mutedSmall" style={{ marginTop: 8 }}>Go to <b>Enrollments</b> tab to verify status.</div>
            </div>
          ) : (
            <div className="tableWrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Course</th>
                    <th style={{ width: 290 }}>Course ID</th>
                    <th style={{ width: 140, textAlign: "right" }}>Status</th>
                    <th style={{ width: 160, textAlign: "right" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {paidList.map((p) => (
                    <tr key={p.course_id}>
                      <td>
                        <div className="tdStrong">{p.course_title ?? "Course"}</div>
                        <div className="mutedSmall">Unlocked content</div>
                      </td>
                      <td className="mutedSmall mono">{p.course_id}</td>
                      <td style={{ textAlign: "right" }}><span className="badge badgePaid">PAID</span></td>
                      <td style={{ textAlign: "right" }}>
                        <button className="btn btnGhost" onClick={() => nav(\/course/\\)} type="button">Open</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {activeTab === "courses" ? (
        <div className="section">
          <div className="sectionHeader">
            <div>
              <div className="sectionTitle">Browse Courses</div>
              <div className="mutedSmall">Professional filtering • lock state • enroll/pay call-to-action.</div>
            </div>

            <div className="filters">
              <div className="filterItem">
                <div className="filterLabel">Subject</div>
                <select className="select" value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)}>
                  <option value="all">All subjects</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div className="filterItem grow">
                <div className="filterLabel">Search</div>
                <input
                  className="search"
                  value={courseQuery}
                  onChange={(e) => setCourseQuery(e.target.value)}
                  placeholder="Search by course title or ID..."
                />
                <div className="mutedSmall right">Showing {filteredCourses.length}/{courses.length}</div>
              </div>
            </div>
          </div>

          <div className="tableWrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Course</th>
                  <th style={{ width: 290 }}>Course ID</th>
                  <th style={{ width: 150, textAlign: "right" }}>Access</th>
                  <th style={{ width: 170, textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredCourses.map((c) => {
                  const unlocked = isUnlocked(c.id);
                  return (
                    <tr key={c.id}>
                      <td>
                        <div className="tdStrong">{c.title ?? "Course"}</div>
                        <div className="mutedSmall">
                          {c.created_at ? new Date(c.created_at).toLocaleDateString() : "-"}
                          {c.subject ? <span className="dot">•</span> : null}
                          {c.subject ? <span className="pillLite mono">{c.subject}</span> : null}
                        </div>
                      </td>
                      <td className="mutedSmall mono">{c.id}</td>
                      <td style={{ textAlign: "right" }}>
                        {!user ? (
                          <span className="badge badgePending">SIGN IN</span>
                        ) : unlocked ? (
                          <span className="badge badgeUnlocked">UNLOCKED</span>
                        ) : (
                          <span className="badge badgeLocked">LOCKED</span>
                        )}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {!user ? (
                          <Link className="btn btnGhost" to="/login">Sign in</Link>
                        ) : unlocked ? (
                          <button className="btn btnGhost" onClick={() => nav(\/course/\\)} type="button">Open</button>
                        ) : (
                          <button className="btn" onClick={() => nav(\/checkout?courseId=\\)} type="button">Enroll / Pay</button>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {filteredCourses.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="emptyRow">{loading ? "Loading..." : "No matching courses."}</td>
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
              <div className="mutedSmall">Clean subject cards with strong visual hierarchy.</div>
            </div>
          </div>

          {subjects.length === 0 ? (
            <div className="empty">{loading ? "Loading..." : "No subjects found."}</div>
          ) : (
            <div className="grid">
              {subjects.map((s) => (
                <button
                  key={s.id}
                  className="subjectCard"
                  type="button"
                  onClick={() => {
                    setSubjectFilter(s.id);
                    setActiveTab("courses");
                  }}
                >
                  <div className="subjectTitle">📚 {s.name}</div>
                  <div className="mutedSmall mono">{s.id}</div>
                  <div className="subjectHint">View courses →</div>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {activeTab === "enrollments" ? (
        <div className="section">
          <div className="sectionHeader">
            <div>
              <div className="sectionTitle">Enrollments</div>
              <div className="mutedSmall">Source of truth for payment unlock status.</div>
            </div>
          </div>

          {!user ? (
            <div className="empty">Sign in to view enrollments.</div>
          ) : enrollments.length === 0 ? (
            <div className="empty">No enrollments found yet.</div>
          ) : (
            <div className="tableWrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th style={{ width: 290 }}>Course ID</th>
                    <th style={{ width: 160, textAlign: "right" }}>Status</th>
                    <th style={{ width: 170, textAlign: "right" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {enrollments.map((e) => {
                    const st = String(e?.status ?? "").toLowerCase();
                    const paid = st === "paid" || e?.status === true;
                    return (
                      <tr key={e.id}>
                        <td><div className="tdStrong">{e.created_at ? new Date(e.created_at).toLocaleString() : "-"}</div></td>
                        <td className="mutedSmall mono">{e.course_id}</td>
                        <td style={{ textAlign: "right" }}>
                          <span className={adge }>{paid ? "PAID" : "PENDING"}</span>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <button className="btn btnGhost" onClick={() => nav(\/course/\\)} type="button">Open</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      <div className="footer">© {new Date().getFullYear()} AtoZlearn-go • Secure payments • Progress tracking</div>

      <style>{\
        .page{max-width:1200px;margin:0 auto;padding:16px;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#0f172a;background:radial-gradient(1200px 600px at 20% -10%, rgba(14,165,233,.18), transparent 60%),radial-gradient(900px 500px at 90% 0%, rgba(139,92,246,.14), transparent 55%),linear-gradient(180deg, rgba(248,250,252,1), rgba(241,245,249,1));}
        .topbar{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;padding:14px 16px;border:1px solid rgba(15,23,42,.10);border-radius:20px;background:linear-gradient(135deg,#fff,rgba(240,249,255,.75));box-shadow:0 16px 40px rgba(15,23,42,.08);position:sticky;top:10px;z-index:5;backdrop-filter:blur(10px);}
        .brand{display:flex;align-items:center;gap:12px}
        .logo{width:44px;height:44px;border-radius:16px;background:linear-gradient(135deg, rgba(14,165,233,.22), rgba(34,197,94,.16));display:grid;place-items:center;font-weight:1000;border:1px solid rgba(15,23,42,.10)}
        .brandText{display:flex;flex-direction:column}
        .title{font-weight:1000;font-size:14px;letter-spacing:.2px}
        .subtitle{opacity:.75;font-size:12px;margin-top:2px}
        .uiBadge{display:inline-flex;align-items:center;margin-top:8px;padding:6px 10px;border-radius:999px;font-weight:950;font-size:12px;border:1px solid rgba(15,23,42,.12);background:linear-gradient(135deg, rgba(34,197,94,.18), rgba(14,165,233,.14));width:fit-content}
        .actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:flex-end}
        .statusText{opacity:.75;font-size:12px}
        .btn{padding:10px 14px;border-radius:16px;border:1px solid rgba(15,23,42,.14);background:#0f172a;color:#fff;font-weight:900;cursor:pointer;transition:transform .06s ease, box-shadow .12s ease}
        .btn:hover{transform:translateY(-1px);box-shadow:0 16px 32px rgba(15,23,42,.14)}
        .btn:disabled{opacity:.55;cursor:not-allowed}
        .btnGhost{background:#fff;color:#0f172a;box-shadow:none}
        .alert{margin-top:12px;padding:12px;border-radius:16px;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2)}
        .hero{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap;margin-top:14px;padding:18px;border-radius:22px;background:linear-gradient(135deg, rgba(14,165,233,.18), rgba(139,92,246,.12), rgba(34,197,94,.10));border:1px solid rgba(15,23,42,.10);box-shadow:0 18px 40px rgba(15,23,42,.08)}
        .heroLeft{max-width:560px}
        .heroKicker{font-weight:900;font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.8}
        .h1{margin:6px 0 0 0;font-size:26px;letter-spacing:-.3px}
        .muted{opacity:.82;margin-top:8px;line-height:1.35}
        .mutedSmall{opacity:.74;font-size:12px}
        .heroCTA{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}
        .adminLink{display:inline-flex;align-items:center;padding:10px 12px;border:1px solid rgba(15,23,42,.14);border-radius:16px;background:#fff;text-decoration:none;color:#0f172a;font-weight:900}
        .stats{display:flex;gap:10px;flex-wrap:wrap;align-items:stretch}
        .statCard{min-width:150px;padding:12px 14px;border-radius:18px;border:1px solid rgba(15,23,42,.10);box-shadow:0 12px 26px rgba(15,23,42,.06);background:#fff}
        .statBlue{background:linear-gradient(180deg, rgba(14,165,233,.18), #fff)}
        .statPurple{background:linear-gradient(180deg, rgba(139,92,246,.16), #fff)}
        .statGreen{background:linear-gradient(180deg, rgba(34,197,94,.16), #fff)}
        .statAmber{background:linear-gradient(180deg, rgba(245,158,11,.16), #fff)}
        .statLabel{opacity:.75;font-size:12px;font-weight:800}
        .statValue{font-size:20px;font-weight:1000;margin-top:2px}
        .tabs{display:flex;gap:12px;flex-wrap:wrap;margin-top:14px}
        .tabBtn{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:18px;border:1px solid rgba(15,23,42,.14);background:#fff;font-weight:950;cursor:pointer;transition:transform .08s ease, box-shadow .14s ease}
        .tabBtn:hover{transform:translateY(-1px);box-shadow:0 16px 32px rgba(15,23,42,.12)}
        .tabBtnActive{background:#0f172a;color:#fff;box-shadow:0 16px 32px rgba(15,23,42,.16)}
        .tabIcon{font-size:16px}
        .pill{font-size:12px;padding:2px 8px;border-radius:999px;border:1px solid rgba(15,23,42,.14);opacity:.9}
        .tabBtnActive .pill{border-color:rgba(255,255,255,.35)}
        .section{margin-top:14px;padding:16px;border:1px solid rgba(15,23,42,.10);border-radius:22px;background:linear-gradient(180deg,#fff,rgba(248,250,252,.88));box-shadow:0 18px 40px rgba(15,23,42,.07)}
        .sectionHeader{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap}
        .sectionTitle{font-weight:1000;font-size:16px}
        .empty{margin-top:10px;padding:12px;border-radius:16px;background:rgba(15,23,42,.03);border:1px dashed rgba(15,23,42,.18);opacity:.9}
        .filters{display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end}
        .filterItem{display:flex;flex-direction:column;gap:6px}
        .filterItem.grow{min-width:320px;flex:1}
        .filterLabel{font-size:12px;font-weight:900;opacity:.75}
        .select,.search{padding:10px 12px;border-radius:16px;border:1px solid rgba(15,23,42,.14);outline:none;background:#fff}
        .right{text-align:right}
        .tableWrap{margin-top:12px;overflow:auto;border-radius:22px;border:1px solid rgba(15,23,42,.10);box-shadow:0 18px 40px rgba(15,23,42,.06)}
        .table{width:100%;border-collapse:collapse}
        .table th{font-size:12px;text-transform:uppercase;letter-spacing:.06em;opacity:.75;background:rgba(15,23,42,.03);text-align:left;padding:12px;position:sticky;top:0;z-index:2}
        .table td{padding:12px;border-top:1px solid rgba(15,23,42,.08);vertical-align:top}
        .table tbody tr:nth-child(odd){background:rgba(15,23,42,.012)}
        .table tbody tr:hover{background:rgba(14,165,233,.06)}
        .tdStrong{font-weight:1000}
        .emptyRow{padding:14px;opacity:.75;text-align:center}
        .badge{display:inline-flex;align-items:center;padding:4px 10px;border-radius:999px;border:1px solid rgba(15,23,42,.14);font-size:12px;font-weight:950}
        .badgePaid{background:rgba(34,197,94,.14);border-color:rgba(34,197,94,.34)}
        .badgePending{background:rgba(245,158,11,.16);border-color:rgba(245,158,11,.34)}
        .badgeLocked{background:rgba(239,68,68,.12);border-color:rgba(239,68,68,.30)}
        .badgeUnlocked{background:rgba(14,165,233,.14);border-color:rgba(14,165,233,.34)}
        .grid{margin-top:12px;display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}
        .subjectCard{padding:14px;border-radius:22px;border:1px solid rgba(15,23,42,.10);background:linear-gradient(135deg, rgba(14,165,233,.10), rgba(139,92,246,.08), rgba(34,197,94,.06));text-align:left;cursor:pointer;transition:transform .08s ease, box-shadow .14s ease}
        .subjectCard:hover{transform:translateY(-1px);box-shadow:0 18px 40px rgba(15,23,42,.10)}
        .subjectTitle{font-weight:1000;font-size:15px}
        .subjectHint{margin-top:10px;font-weight:950;opacity:.85}
        .mono{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace}
        .pillLite{display:inline-flex;align-items:center;padding:2px 8px;border-radius:999px;border:1px solid rgba(15,23,42,.12);background:rgba(255,255,255,.7)}
        .dot{margin:0 8px;opacity:.6}
        .footer{margin-top:16px;opacity:.65;font-size:12px;text-align:center}
      \}</style>
    </div>
  );
}

