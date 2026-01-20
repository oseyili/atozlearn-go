import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

export default function PortalPage() {
  const nav = useNavigate();

  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const [subjects, setSubjects] = useState([]);
  const [courses, setCourses] = useState([]);
  const [paidCourses, setPaidCourses] = useState([]);

  const [tab, setTab] = useState("paid");
const [activeSubject, setActiveSubject] = useState(null);
  const [query, setQuery] = useState("");

  const paidIds = useMemo(() => new Set(paidCourses.map(p => p.course_id)), [paidCourses]);

const stats = useMemo(() => ({
    subjects: subjects.length,
    courses: courses.length,
    paid: paidCourses.length
  }), [subjects, courses, paidCourses]);

  const filteredCourses = useMemo(() => {
  let list = courses;
  if (activeSubject) list = list.filter(c => c.subject === activeSubject);
  if (!query) return list;
  const q = query.toLowerCase();
  return list.filter(c =>
    (c.title || "").toLowerCase().includes(q) ||
    (c.id || "").toLowerCase().includes(q)
  );
}, [query, courses, activeSubject]);

  const [progress, setProgress] = useState({});

useEffect(() => {
    (async () => {
      setLoading(true);

      const { data: u } = await supabase.auth.getUser();
      setUser(u?.user ?? null);

      if (u?.user) {
        const { data: admin } = await supabase.rpc("is_admin");
        setIsAdmin(!!admin);
      }

      const [{ data: s }, { data: c }, { data: p }] = await Promise.all([
        supabase.from("subjects").select("id,name").order("name"),
        supabase.from("courses").select("id,title,created_at").limit(200),
        supabase.rpc("get_paid_courses")
      ]);

      setSubjects(s || []);
      setCourses(c || []);
      setPaidCourses(p || []);
if (u?.user) {
  const { data: prog } = await supabase
    .from("course_progress")
    .select("course_id,progress");
  setProgress(Object.fromEntries((prog||[]).map(r=>[r.course_id,r.progress])));
}
      setLoading(false);
    })();
  }, []);

  return (
    <div className="page">
      {/* TOP BAR */}
      <header className="topbar">
        <div className="brand">
          <div className="logo">A</div>
          <div>
            <div className="title">AtoZlearn-go</div>
            <div className="subtitle">Professional Learning Portal</div>
          </div>
        </div>

        <div className="actions">
          {user ? (
            <>
              <span className="status">Signed in</span>
              <button className="btn ghost" onClick={() => supabase.auth.signOut()}>
                Sign out
              </button>
            </>
          ) : (
            <Link to="/login" className="btn ghost">Sign in</Link>
          )}
        </div>
      </header>

      {/* HERO */}
      <section className="hero">
        <div>
          <h1>Master Portal</h1>
          <p>Browse subjects, unlock courses, and continue learning.</p>

          {isAdmin && (
  <div className="adminPanel">
    <b>Admin Overview</b>
    <div>Total Courses: {courses.length}</div>
    <div>Paid Enrollments: {paidCourses.length}</div>
  </div>
)
            <Link to="/admin/payments" className="admin">
              Admin • Payments Audit
            </Link>
          )}
        </div>

        <div className="stats">
          <Stat label="Subjects" value={stats.subjects} />
          <Stat label="Courses" value={stats.courses} />
          <Stat label="Paid Courses" value={stats.paid} accent />
        </div>
      </section>

      {/* TABS */}
      <nav className="tabs">
        <Tab id="paid" active={tab} onClick={setTab} label="Paid Courses" />
        <Tab id="courses" active={tab} onClick={setTab} label="Browse Courses" />
        <Tab id="subjects" active={tab} onClick={setTab} label="Subjects" />
      </nav>

      {/* CONTENT */}
      <main className="content">
        {loading && <div className="empty">Loading…</div>}

        {!loading && tab === "paid" && (
          paidCourses.length === 0
            ? <div className="empty">No paid courses yet.</div>
            : <Grid items={paidCourses} onOpen={id => nav(`/course/${id}`)} />
        )}

        {!loading && tab === "courses" && (
          <>
            <input
              className="search"
              placeholder="Search courses…"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
            <Grid items={filteredCourses} paidIds={paidIds} onOpen={id => nav(`/course/${id}`)} />
          </>
        )}

        {!loading && tab === "subjects" && (
          <Grid items={subjects.map(s => ({ id: s.id, title: s.name }))} />
        )}
      </main>

      <footer className="footer">
        © {new Date().getFullYear()} AtoZlearn-go · Secure · Scalable · Professional
      </footer>

      <style>{`
.thumb{
  height:120px;
  border-radius:12px;
  background:linear-gradient(135deg,#6366f1,#22c55e);
  margin-bottom:8px;
}
        .page{max-width:1100px;margin:auto;padding:16px;font-family:system-ui}
        .topbar{display:flex;justify-content:space-between;align-items:center}
        .brand{display:flex;gap:12px;align-items:center}
        .logo{width:42px;height:42px;border-radius:12px;background:#2563eb;color:#fff;
              display:grid;place-items:center;font-weight:900}
        .hero{margin:24px 0;padding:24px;border-radius:20px;
              background:linear-gradient(135deg,#2563eb,#0ea5e9);color:#fff;
              display:flex;justify-content:space-between;gap:24px;flex-wrap:wrap}
        .stats{display:flex;gap:12px}
        .stat{background:#fff;color:#000;padding:14px;border-radius:14px;min-width:120px}
        .tabs{display:flex;gap:10px;margin-bottom:12px}
        .tab{padding:10px 14px;border-radius:14px;border:1px solid #ccc;cursor:pointer}
        .tab.active{background:#2563eb;color:#fff}
        .content{min-height:240px}
        .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}
        .card{border:1px solid #ddd;border-radius:16px;padding:14px}
        .btn{padding:10px 14px;border-radius:12px;background:#2563eb;color:#fff;border:none}
        .ghost{background:#fff;color:#000}
        .search{padding:12px;border-radius:14px;border:1px solid #ccc;width:100%;margin-bottom:12px}
        .empty{opacity:.7;padding:20px;text-align:center}
        .footer{text-align:center;opacity:.6;margin-top:32px}
        .admin{display:inline-block;margin-top:8px;color:#fff;text-decoration:underline}
      `}</style>
    </div>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div className="stat" style={accent ? { borderLeft: "6px solid #2563eb" } : {}}>
      <div style={{ fontSize: 12, opacity: .7 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 900 }}>{value}</div>
    </div>
  );
}

function Tab({ id, label, active, onClick }) {
  return (
    <button className={`tab ${active === id ? "active" : ""}`} onClick={() => onClick(id)}>
      {label}
    </button>
  );
}

function Grid({ items, onOpen, paidIds }) { {
  return (
    <div className="grid">
      {items.map(i => (
        <div key={i.id} className="card">
  <div className="thumb"></div>
          <div style={{ fontWeight: 800 }}>{i.title || "Item"}</div>
          <div style={{ fontSize: 12, opacity: .6 }}>{i.id}</div>
          {paidIds && !paidIds.has(i.id)
  ? <div style={{opacity:.6,marginTop:10}}>?? Locked</div>
  : onOpen && (
            <button className="btn" style={{ marginTop: 10 }} onClick={() => onOpen(i.id)}>
              Open
            </button>
          )}
        </div>
      ))}
    </div>
  );
}





