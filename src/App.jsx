import { useEffect, useMemo, useState } from "react";
import { Link, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { supabase } from "./lib/supabase";

const SUBJECTS = [
  "Mathematics", "English", "Science", "Biology", "Chemistry", "Physics",
  "Computer Science", "Programming", "Data Science", "AI", "Cybersecurity",
  "Business", "Finance", "Accounting", "Economics", "Marketing",
  "History", "Geography", "Politics", "Law",
  "Health", "Medicine", "Nursing", "Psychology",
  "Art", "Design", "Music", "Photography",
  "Languages", "French", "Spanish", "German",
  "Engineering", "Architecture",
  "Exam Prep", "Kids", "Professional"
];

function cx(...a) { return a.filter(Boolean).join(" "); }

function Topbar({ session }) {
  const nav = useNavigate();
  async function signOut() {
    await supabase.auth.signOut();
    nav("/login");
  }
  return (
    <div className="topbar">
      <div className="topbar-inner">
        <div className="brand">
          <div className="logo">A</div>
          <div>
            <div className="brand-title">AtoZlearn-go</div>
            <div className="brand-sub">Master Learning Portal</div>
          </div>
        </div>

        <div className="topnav">
          <Link to="/">Portal</Link>
          <Link to="/courses">Courses</Link>
          <Link to="/help">Help</Link>
          {session ? (
            <>
              <span className="pill">Signed in: {session.user.email}</span>
              <button className="btn btn-ghost" onClick={signOut}>Sign out</button>
            </>
          ) : (
            <Link className="btn btn-primary" to="/login">Sign in</Link>
          )}
        </div>
      </div>
    </div>
  );
}

function Shell({ left, children }) {
  return (
    <div className="shell">
      <div className="sidebar">{left}</div>
      <div className="content">{children}</div>
    </div>
  );
}

function AuthPage() {
  const nav = useNavigate();
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMsg("Account created. If email confirmation is enabled, confirm then sign in.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        nav("/");
      }
    } catch (e2) {
      setMsg(e2?.message || "Auth failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="center">
      <div className="card" style={{ maxWidth: 520 }}>
        <div className="h1">{mode === "signup" ? "Create your account" : "Sign in"}</div>
        <div className="p">Access courses, enroll, pay to unlock lessons, and learn.</div>

        <form onSubmit={submit} className="form">
          <label className="label">Email</label>
          <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />

          <label className="label">Password</label>
          <input className="input" value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />

          <div className="row">
            <button className="btn btn-primary" disabled={busy}>
              {busy ? "Working..." : mode === "signup" ? "Sign up" : "Sign in"}
            </button>
            <button type="button" className="btn btn-ghost" disabled={busy}
              onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
            >
              Switch to {mode === "signup" ? "Sign in" : "Sign up"}
            </button>
          </div>

          {msg && <div className={msg.toLowerCase().includes("failed") || msg.toLowerCase().includes("error") ? "alert alert-error" : "alert"}>{msg}</div>}
        </form>
      </div>
    </div>
  );
}

function Portal() {
  return (
    <div className="card">
      <div className="h1">Master Portal</div>
      <div className="p">Choose a subject, search courses, enroll, pay, and unlock lessons (RLS enforced).</div>
      <div className="grid2" style={{ marginTop: 14 }}>
        <div className="tile">
          <div className="h2">Browse by subject</div>
          <div className="p">Use the left menu to filter. You can also search course titles.</div>
        </div>
        <div className="tile">
          <div className="h2">Fast access</div>
          <div className="row">
            <Link className="btn btn-primary" to="/courses">Open Courses</Link>
            <Link className="btn btn-ghost" to="/help">Student Help</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function CoursesPage({ subject, onSubject }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(0);
  const pageSize = 30;

  async function load(reset = false) {
    const p = reset ? 0 : page;
    setBusy(true);
    setErr("");
    try {
      let query = supabase
        .from("courses")
        .select("id,title,description,created_at")
        .order("created_at", { ascending: false })
        .range(p * pageSize, p * pageSize + pageSize - 1);

      if (q.trim()) query = query.ilike("title", `%${q.trim()}%`);
      // Subject filter: simple title match (works immediately without schema changes)
      if (subject) query = query.ilike("title", `%${subject}%`);

      const { data, error } = await query;
      if (error) throw error;

      setRows(data || []);
      if (reset) setPage(0);
    } catch (e) {
      setErr(e?.message || "Failed to load courses");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { load(false); /* eslint-disable-next-line */ }, [page, subject]);

  return (
    <div className="card">
      <div className="row space">
        <div>
          <div className="h1">Courses</div>
          <div className="p">Filter by subject + search. Open a course to enroll and pay.</div>
        </div>
        <div className="pill">{subject ? `Subject: ${subject}` : "All subjects"}</div>
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <input className="input" placeholder="Search course title…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn btn-primary" onClick={() => load(true)} disabled={busy}>{busy ? "Loading..." : "Search"}</button>
        <button className="btn btn-ghost" onClick={() => { setQ(""); onSubject(""); }} disabled={busy}>Clear</button>
      </div>

      {err && <div className="alert alert-error" style={{ marginTop: 12 }}>{err}</div>}

      <div className="list" style={{ marginTop: 14 }}>
        {rows.map((c) => (
          <div className="list-item" key={c.id}>
            <div>
              <div className="li-title">{c.title}</div>
              <div className="li-sub">{c.description || "—"}</div>
            </div>
            <Link className="btn btn-primary" to={`/courses/${c.id}`}>Open</Link>
          </div>
        ))}
        {!busy && rows.length === 0 && <div className="alert">No courses found.</div>}
      </div>

      <div className="row space" style={{ marginTop: 14 }}>
        <button className="btn btn-ghost" disabled={page === 0 || busy} onClick={() => setPage((p) => Math.max(0, p - 1))}>Prev</button>
        <div className="pill">Page {page + 1}</div>
        <button className="btn btn-ghost" disabled={busy || rows.length < pageSize} onClick={() => setPage((p) => p + 1)}>Next</button>
      </div>
    </div>
  );
}

function CourseDetail({ session }) {
  const { id } = useParams();
  const nav = useNavigate();

  const [course, setCourse] = useState(null);
  const [enrollment, setEnrollment] = useState(null);
  const [lessons, setLessons] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const isEnrolled = !!enrollment;
  const isPaid = !!enrollment?.is_paid;

  async function loadAll() {
    setBusy(true);
    setErr("");
    try {
      const { data: c, error: cErr } = await supabase.from("courses").select("*").eq("id", id).maybeSingle();
      if (cErr) throw cErr;
      if (!c) throw new Error("Course not found.");
      setCourse(c);

      if (session) {
        const { data: e } = await supabase
          .from("enrollments")
          .select("course_id,user_id,is_paid")
          .eq("course_id", id)
          .eq("user_id", session.user.id)
          .maybeSingle();
        setEnrollment(e || null);
      } else {
        setEnrollment(null);
      }

      // lessons only load if paid (RLS enforced)
      if (session) {
        const { data: l, error: lErr } = await supabase
          .from("lessons")
          .select("id,title,position")
          .eq("course_id", id)
          .order("position", { ascending: true });
        if (!lErr) setLessons(l || []);
        else setLessons([]);
      } else {
        setLessons([]);
      }
    } catch (e2) {
      setErr(e2?.message || "Failed to load course");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { loadAll(); /* eslint-disable-next-line */ }, [id, session]);

  async function enroll() {
    if (!session) { nav("/login"); return; }
    setBusy(true); setErr("");
    try {
      const { error } = await supabase.from("enrollments").insert({
        user_id: session.user.id,
        course_id: id,
        is_paid: false,
      });
      if (error) throw error;
      await loadAll();
    } catch (e2) {
      setErr(e2?.message || "Enroll failed (check RLS policy).");
    } finally {
      setBusy(false);
    }
  }

  // ✅ Fix payment: use invoke (no JWT mismatch) + show real error message
  async function startPayment() {
    if (!session) { nav("/login"); return; }
    setBusy(true); setErr("");
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: { course_id: id },
      });

      if (error) {
        // This is the EXACT non-2xx reason returned by the Edge Function
        throw new Error(error.message || "Edge Function failed");
      }
      if (!data?.url) throw new Error("No checkout URL returned.");

      window.location.href = data.url;
    } catch (e2) {
      setErr(e2?.message || "Payment failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <button className="btn btn-ghost" onClick={() => nav("/courses")}>← Back to Courses</button>

      {busy && !course && <div className="alert">Loading…</div>}
      {err && <div className="alert alert-error" style={{ marginTop: 12 }}>{err}</div>}

      {course && (
        <>
          <div className="h1" style={{ marginTop: 8 }}>{course.title}</div>
          <div className="p">{course.description || "—"}</div>

          <div className="row" style={{ marginTop: 14 }}>
            {!isEnrolled ? (
              <button className="btn btn-primary" onClick={enroll} disabled={busy}>
                {busy ? "Enrolling…" : "Enroll"}
              </button>
            ) : (
              <span className="pill">Enrolled</span>
            )}

            {isEnrolled && !isPaid && (
              <button className="btn btn-primary" onClick={startPayment} disabled={busy}>
                {busy ? "Starting…" : "Pay to unlock lessons"}
              </button>
            )}

            {isEnrolled && isPaid && <span className="pill">Paid ✅ Lessons unlocked</span>}
          </div>

          <div className="hr" />

          <div className="h2">Lessons</div>
          {!isPaid && <div className="alert">Lessons are locked until payment (enforced by database security).</div>}

          {isPaid && (
            <div className="list">
              {lessons.map((l) => (
                <div className="list-item" key={l.id}>
                  <div>
                    <div className="li-title">{l.position}. {l.title}</div>
                  </div>
                  <Link className="btn btn-ghost" to={`/lesson/${l.id}`}>Open</Link>
                </div>
              ))}
              {lessons.length === 0 && <div className="alert">No lessons found.</div>}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function HelpPage() {
  return (
    <div className="card">
      <div className="h1">Student Help</div>
      <div className="p">If something breaks, take a screenshot + tell support what you clicked.</div>
      <div className="hr" />
      <div className="alert">
        Tip: If payment fails, the exact reason will show as a red error box.
      </div>
    </div>
  );
}

function LessonPage() {
  return (
    <div className="card">
      <div className="h1">Lesson</div>
      <div className="p">Lesson page can be expanded next (content + progress).</div>
    </div>
  );
}

function App() {
  const [session, setSession] = useState(null);
  const [subject, setSubject] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_ev, s) => setSession(s ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  const left = useMemo(() => (
    <>
      <div className="side-title">Subjects</div>
      <button className={cx("side-item", !subject && "active")} onClick={() => setSubject("")}>All subjects</button>
      <div className="side-list">
        {SUBJECTS.map((s) => (
          <button key={s} className={cx("side-item", subject === s && "active")} onClick={() => setSubject(s)}>
            {s}
          </button>
        ))}
      </div>
      <div className="side-foot">
        <div className="small">Database security: RLS enforced</div>
      </div>
    </>
  ), [subject]);

  return (
    <>
      <Topbar session={session} />
      <Shell left={left}>
        <Routes>
          <Route path="/" element={<Portal />} />
          <Route path="/login" element={<AuthPage />} />
          <Route path="/courses" element={<CoursesPage subject={subject} onSubject={setSubject} />} />
          <Route path="/courses/:id" element={<CourseDetail session={session} />} />
          <Route path="/lesson/:id" element={<LessonPage />} />
          <Route path="/help" element={<HelpPage />} />
          <Route path="*" element={<div className="card"><div className="h1">Not found</div></div>} />
        </Routes>
      </Shell>
    </>
  );
}

export default App;
