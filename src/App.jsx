import { useEffect, useMemo, useState } from "react";
import { Link, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { supabase } from "./lib/supabase";

function Topbar({ session }) {
  const navigate = useNavigate();

  async function signOut() {
    await supabase.auth.signOut();
    navigate("/");
  }

  return (
    <div className="topbar">
      <div className="topbar-inner">
        <div className="brand">
          <div className="brand-badge" />
          <div>
            <div style={{ fontSize: 15 }}>AtoZlearn-go</div>
            <div className="small">Learning Portal</div>
          </div>
        </div>

        <div className="nav">
          <Link to="/">Portal</Link>
          <Link to="/courses">Courses</Link>
          {session ? (
            <button className="btn btn-danger" onClick={signOut}>Sign out</button>
          ) : (
            <Link to="/login" className="badge">Sign in</Link>
          )}
        </div>
      </div>
    </div>
  );
}

function AuthPage() {
  const [mode, setMode] = useState("signin"); // signin | signup
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setMsg("");
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMsg("Signup created. If email confirmation is enabled, check your inbox.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        setMsg("Signed in.");
      }
    } catch (err) {
      setMsg(err?.message || "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container">
      <div className="grid">
        <div className="card">
          <div className="h1">{mode === "signup" ? "Create account" : "Sign in"}</div>
          <p className="p">Access courses, enroll, and track your lesson progress.</p>
          <div className="sep" />

          <form onSubmit={submit}>
            <div className="row" style={{ gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div className="small">Email</div>
                <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
              </div>
              <div style={{ flex: 1 }}>
                <div className="small">Password</div>
                <input className="input" value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
              </div>
            </div>

            <div className="row" style={{ marginTop: 12 }}>
              <button className={`btn btn-primary`} disabled={busy}>
                {busy ? "Working..." : mode === "signup" ? "Sign up" : "Sign in"}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
                disabled={busy}
              >
                Switch to {mode === "signup" ? "Sign in" : "Sign up"}
              </button>
            </div>

            {msg && <div style={{ marginTop: 12 }} className={msg.toLowerCase().includes("error") ? "error" : "notice"}>{msg}</div>}
          </form>
        </div>

        <div className="card">
          <div className="h2">How it works</div>
          <p className="p">
            <strong>Courses</strong> are visible only if published.<br/>
            <strong>Lessons</strong> are locked until you enroll.<br/>
            Progress is saved per user per lesson.
          </p>
          <div className="sep" />
          <div className="badge">Secure by RLS policies</div>
        </div>
      </div>
    </div>
  );
}

function Portal({ session }) {
  return (
    <div className="container">
      <div className="grid">
        <div className="card">
          <div className="h1">Master Portal</div>
          <p className="p">
            Welcome to AtoZlearn-go. Use the portal to enroll and track progress.
          </p>
          <div className="sep" />
          <div className="row">
            <Link className="btn btn-primary" to="/courses">Browse courses</Link>
            {!session && <Link className="btn" to="/login">Sign in</Link>}
          </div>

          {session && (
            <>
              <div className="sep" />
              <div className="badge">Signed in as: {session.user.email}</div>
            </>
          )}
        </div>

        <div className="card">
          <div className="h2">Status</div>
          <p className="p">
            {session ? (
              <span className="success">Authenticated</span>
            ) : (
              <span className="notice">Not signed in</span>
            )}
          </p>
          <div className="sep" />
          <p className="p small">
            Tip: your Render rewrite rule already makes deep links work (e.g. /courses/123).
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Courses page uses pagination so it works with 7,000+ courses.
 * Vite/Supabase: use range(from, to). 50 per page.
 */
function CoursesPage({ session }) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const pageCount = useMemo(() => (total == null ? null : Math.ceil(total / pageSize)), [total]);

  async function load() {
    setBusy(true);
    setErr("");
    try {
      const from = page * pageSize;
      const to = from + pageSize - 1;

      // published-only policy already applies.
      let query = supabase
        .from("courses")
        .select("id,title,description,is_published,created_at", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, to);

      if (q.trim()) query = query.ilike("title", `%${q.trim()}%`);

      const { data, count, error } = await query;
      if (error) throw error;

      setRows(data || []);
      setTotal(count ?? 0);
    } catch (e) {
      setErr(e?.message || "Failed to load courses");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  function canNext() {
    if (total == null) return false;
    return (page + 1) * pageSize < total;
  }

  return (
    <div className="container">
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <div className="h1">Courses</div>
            <p className="p">Browse published courses. Enroll to unlock lessons.</p>
          </div>
          <div className="badge">{total == null ? "…" : `${total} courses`}</div>
        </div>

        <div className="sep" />

        <div className="row">
          <input className="input" placeholder="Search course title…" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn btn-primary" onClick={() => { setPage(0); load(); }} disabled={busy}>
            {busy ? "Loading..." : "Search"}
          </button>
        </div>

        {err && <div style={{ marginTop: 10 }} className="error">{err}</div>}

        <div className="sep" />

        <table className="table">
          <thead>
            <tr>
              <th style={{ width: "55%" }}>Course</th>
              <th>Description</th>
              <th style={{ width: 150 }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td>
                  <Link to={`/courses/${c.id}`} className="badge">{c.title}</Link>
                  <div className="small">ID: {c.id}</div>
                </td>
                <td className="small">{c.description || "—"}</td>
                <td>
                  <Link className="btn" to={`/courses/${c.id}`}>View</Link>
                </td>
              </tr>
            ))}
            {!busy && rows.length === 0 && (
              <tr>
                <td colSpan={3} className="notice">No courses found.</td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="sep" />

        <div className="row" style={{ justifyContent: "space-between" }}>
          <div className="small">
            Page {page + 1}{pageCount ? ` of ${pageCount}` : ""}
          </div>
          <div className="row">
            <button className="btn" disabled={page === 0 || busy} onClick={() => setPage((p) => Math.max(0, p - 1))}>Prev</button>
            <button className="btn" disabled={!canNext() || busy} onClick={() => setPage((p) => p + 1)}>Next</button>
          </div>
        </div>

        {!session && (
          <div className="sep" />
        )}
        {!session && (
          <div className="notice">
            <strong>Tip:</strong> Sign in before enrolling (lessons are locked by your RLS).
          </div>
        )}
      </div>
    </div>
  );
}

function CourseDetail({ session }) {
  const { id } = useParams();
  const navigate = useNavigate();

  const [course, setCourse] = useState(null);
  const [lessons, setLessons] = useState([]);
  const [enrolled, setEnrolled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function loadCourse() {
    setBusy(true);
    setErr("");
    try {
      const { data, error } = await supabase.from("courses").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      setCourse(data || null);
    } catch (e) {
      setErr(e?.message || "Failed to load course");
    } finally {
      setBusy(false);
    }
  }

  async function checkEnrollment() {
    if (!session) return setEnrolled(false);
    const { data } = await supabase.from("enrollments").select("course_id").eq("course_id", id).limit(1);
    setEnrolled((data || []).length > 0);
  }

  async function loadLessons() {
    // lessons policy requires enrollment
    const { data, error } = await supabase
      .from("lessons")
      .select("id,title,position")
      .eq("course_id", id)
      .order("position", { ascending: true });

    if (error) {
      // if not enrolled, RLS typically returns empty/permission result
      setLessons([]);
      return;
    }
    setLessons(data || []);
  }

  async function enroll() {
    if (!session) {
      navigate("/login");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const { error } = await supabase.from("enrollments").insert({ course_id: id });
      if (error) throw error;
      setEnrolled(true);
      await loadLessons();
    } catch (e) {
      setErr(e?.message || "Enroll failed");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    loadCourse();
    checkEnrollment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, session]);

  useEffect(() => {
    if (enrolled) loadLessons();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enrolled]);

  return (
    <div className="container">
      <div className="card">
        <button className="btn" onClick={() => navigate("/courses")}>← Back to courses</button>

        <div className="sep" />

        {err && <div className="error">{err}</div>}
        {busy && !course && <div className="notice">Loading…</div>}

        {course && (
          <>
            <div className="h1">{course.title}</div>
            <p className="p">{course.description || "—"}</p>

            <div className="sep" />

            <div className="row" style={{ justifyContent: "space-between" }}>
              <div className="badge">
                {session ? `Signed in: ${session.user.email}` : "Not signed in"}
              </div>
              <div className="row">
                {!enrolled ? (
                  <button className="btn btn-ok" onClick={enroll} disabled={busy}>
                    {busy ? "Enrolling…" : "Enroll to unlock lessons"}
                  </button>
                ) : (
                  <span className="badge">Enrolled</span>
                )}
              </div>
            </div>

            <div className="sep" />

            <div className="h2">Lessons</div>
            {!enrolled ? (
              <p className="p">
                Lessons are locked until you enroll (this is enforced by your database security).
              </p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 90 }}>#</th>
                    <th>Lesson</th>
                    <th style={{ width: 160 }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {lessons.map((l) => (
                    <tr key={l.id}>
                      <td className="small">{l.position}</td>
                      <td>{l.title}</td>
                      <td>
                        <Link className="btn btn-primary" to={`/lesson/${l.id}`}>Open</Link>
                      </td>
                    </tr>
                  ))}
                  {lessons.length === 0 && (
                    <tr><td colSpan={3} className="notice">No lessons found (or still locked).</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function LessonPage({ session }) {
  const { id } = useParams();
  const navigate = useNavigate();

  const [lesson, setLesson] = useState(null);
  const [completed, setCompleted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function loadLesson() {
    setBusy(true);
    setErr("");
    try {
      // lessons are protected by RLS (enrollment required)
      const { data, error } = await supabase
        .from("lessons")
        .select("id,title,content,course_id,position")
        .eq("id", id)
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error("Lesson not found (or access denied).");
      setLesson(data);

      if (session) {
        const { data: p } = await supabase
          .from("progress")
          .select("completed")
          .eq("lesson_id", id)
          .limit(1);
        setCompleted((p?.[0]?.completed) || false);
      }
    } catch (e) {
      setErr(e?.message || "Failed to load lesson");
    } finally {
      setBusy(false);
    }
  }

  async function markComplete() {
    if (!session) {
      navigate("/login");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const { error } = await supabase.from("progress").upsert({
        lesson_id: id,
        completed: true,
        updated_at: new Date().toISOString()
      });
      if (error) throw error;
      setCompleted(true);
    } catch (e) {
      setErr(e?.message || "Failed to save progress");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    loadLesson();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, session]);

  return (
    <div className="container">
      <div className="card">
        <button className="btn" onClick={() => navigate(-1)}>← Back</button>
        <div className="sep" />

        {err && <div className="error">{err}</div>}
        {busy && !lesson && <div className="notice">Loading…</div>}

        {lesson && (
          <>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div>
                <div className="h1">{lesson.title}</div>
                <div className="small">Lesson #{lesson.position}</div>
              </div>
              <div className="row">
                <span className="badge">{completed ? "Completed ✅" : "Not completed"}</span>
                <button className="btn btn-ok" onClick={markComplete} disabled={busy || completed}>
                  {completed ? "Saved" : busy ? "Saving…" : "Mark complete"}
                </button>
              </div>
            </div>

            <div className="sep" />

            <div className="card" style={{ background: "rgba(255,255,255,.04)" }}>
              <div className="p" style={{ whiteSpace: "pre-wrap" }}>
                {lesson.content}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
      setReady(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s ?? null);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  if (!ready) return null;

  return (
    <>
      <Topbar session={session} />
      <Routes>
        <Route path="/" element={<Portal session={session} />} />
        <Route path="/login" element={<AuthPage />} />
        <Route path="/courses" element={<CoursesPage session={session} />} />
        <Route path="/courses/:id" element={<CourseDetail session={session} />} />
        <Route path="/lesson/:id" element={<LessonPage session={session} />} />
        <Route path="*" element={<div className="container"><div className="card"><div className="h1">Not found</div><p className="p">That page doesn’t exist.</p></div></div>} />
      </Routes>
    </>
  );
}
