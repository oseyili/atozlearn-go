import { useEffect, useMemo, useState } from "react";
import { Link, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { supabase } from "./lib/supabase";

/* =========================
   Small UI helpers
========================= */
function Button({ className = "btn", ...props }) {
  return <button className={className} {...props} />;
}
function Input(props) {
  return <input className="input" {...props} />;
}
function Card({ children }) {
  return <div className="card">{children}</div>;
}

/* =========================
   Layout / Topbar
========================= */
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
            <div style={{ fontSize: 15, fontWeight: 900 }}>AtoZlearn-go</div>
            <div className="small">Learning Portal</div>
          </div>
        </div>

        <div className="nav">
          <Link to="/">Portal</Link>
          <Link to="/courses">Courses</Link>
          <Link to="/help">Help</Link>
          {session ? (
            <Button className="btn btn-danger" onClick={signOut}>
              Sign out
            </Button>
          ) : (
            <Link to="/login" className="badge">
              Sign in
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

/* =========================
   Auth (real)
========================= */
function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState("signin"); // signin | signup
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMsg("Account created. If email confirmation is enabled, confirm your email then sign in.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate("/");
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
        <Card>
          <div className="h1">{mode === "signup" ? "Create account" : "Sign in"}</div>
          <p className="p">Access courses, enroll, pay to unlock lessons, and track progress.</p>
          <div className="sep" />

          <form onSubmit={submit}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <div className="small">Email</div>
                <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
              </div>
              <div>
                <div className="small">Password</div>
                <Input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
              </div>
            </div>

            <div className="row" style={{ marginTop: 12 }}>
              <Button className="btn btn-primary" disabled={busy}>
                {busy ? "Working..." : mode === "signup" ? "Sign up" : "Sign in"}
              </Button>
              <Button
                type="button"
                className="btn"
                onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
                disabled={busy}
              >
                Switch to {mode === "signup" ? "Sign in" : "Sign up"}
              </Button>
            </div>

            {msg && <div style={{ marginTop: 12 }} className={msg.toLowerCase().includes("error") ? "error" : "notice"}>{msg}</div>}
          </form>
        </Card>

        <Card>
          <div className="h2">Security model</div>
          <p className="p">
            <strong>Courses</strong>: only published are visible.<br />
            <strong>Lessons</strong>: only visible when enrolled <em>and</em> paid (enforced by RLS).<br />
            <strong>Progress</strong>: only you can update your progress.
          </p>
          <div className="sep" />
          <div className="badge">Backed by Supabase Postgres + RLS</div>
        </Card>
      </div>
    </div>
  );
}

/* =========================
   Master Portal
========================= */
function Portal({ session }) {
  return (
    <div className="container">
      <div className="grid">
        <Card>
          <div className="h1">Master Portal</div>
          <p className="p">
            Browse courses, enroll, pay to unlock lessons, and track completion.
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
        </Card>

        <Card>
          <div className="h2">What to do next</div>
          <p className="p">
            1) Load courses<br />
            2) Open a course<br />
            3) Enroll<br />
            4) Pay to unlock<br />
            5) Complete lessons
          </p>
          <div className="sep" />
          <Link to="/help" className="btn">Student Help</Link>
        </Card>
      </div>
    </div>
  );
}

/* =========================
   Courses page (pagination + search)
========================= */
function CoursesPage() {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const pageCount = useMemo(() => (total == null ? null : Math.ceil(total / pageSize)), [total]);

  async function load(resetPage = false) {
    setBusy(true);
    setErr("");
    try {
      const nextPage = resetPage ? 0 : page;
      const from = nextPage * pageSize;
      const to = from + pageSize - 1;

      let query = supabase
        .from("courses")
        .select("id,title,description,created_at", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, to);

      if (q.trim()) query = query.ilike("title", `%${q.trim()}%`);

      const { data, count, error } = await query;
      if (error) throw error;

      setRows(data || []);
      setTotal(count ?? 0);
      if (resetPage) setPage(0);
    } catch (e) {
      setErr(e?.message || "Failed to load courses");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  function canNext() {
    if (total == null) return false;
    return (page + 1) * pageSize < total;
  }

  return (
    <div className="container">
      <Card>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <div className="h1">Courses</div>
            <p className="p">Published courses only. Open a course to enroll and unlock.</p>
          </div>
          <div className="badge">{total == null ? "…" : `${total} courses`}</div>
        </div>

        <div className="sep" />

        <div className="row">
          <Input placeholder="Search course title…" value={q} onChange={(e) => setQ(e.target.value)} />
          <Button className="btn btn-primary" onClick={() => load(true)} disabled={busy}>
            {busy ? "Loading..." : "Search"}
          </Button>
        </div>

        {err && <div style={{ marginTop: 10 }} className="error">{err}</div>}

        <div className="sep" />

        <table className="table">
          <thead>
            <tr>
              <th style={{ width: "60%" }}>Course</th>
              <th>Description</th>
              <th style={{ width: 130 }}>Open</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td>
                  <div style={{ fontWeight: 800 }}>{c.title}</div>
                  <div className="small">ID: {c.id}</div>
                </td>
                <td className="small">{c.description || "—"}</td>
                <td>
                  <Link className="btn btn-primary" to={`/courses/${c.id}`}>Open</Link>
                </td>
              </tr>
            ))}
            {!busy && rows.length === 0 && (
              <tr><td colSpan={3} className="notice">No courses found.</td></tr>
            )}
          </tbody>
        </table>

        <div className="sep" />
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div className="small">Page {page + 1}{pageCount ? ` of ${pageCount}` : ""}</div>
          <div className="row">
            <Button className="btn" disabled={page === 0 || busy} onClick={() => setPage((p) => Math.max(0, p - 1))}>Prev</Button>
            <Button className="btn" disabled={!canNext() || busy} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

/* =========================
   Course Detail: enroll + pay + lessons
========================= */
function CourseDetail({ session }) {
  const { id } = useParams();
  const navigate = useNavigate();

  const [course, setCourse] = useState(null);
  const [lessons, setLessons] = useState([]);

  const [enrollment, setEnrollment] = useState(null); // { course_id, user_id, is_paid }
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const isEnrolled = !!enrollment;
  const isPaid = !!enrollment?.is_paid;

  async function loadCourse() {
    setBusy(true);
    setErr("");
    try {
      const { data, error } = await supabase.from("courses").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Course not found (or not published).");
      setCourse(data);
    } catch (e) {
      setErr(e?.message || "Failed to load course");
    } finally {
      setBusy(false);
    }
  }

  async function loadEnrollment() {
    if (!session) {
      setEnrollment(null);
      return;
    }
    const { data, error } = await supabase
      .from("enrollments")
      .select("course_id,user_id,is_paid")
      .eq("course_id", id)
      .eq("user_id", session.user.id)
      .maybeSingle();

    if (error) {
      setEnrollment(null);
      return;
    }
    setEnrollment(data || null);
  }

  async function loadLessons() {
    // lessons are protected by RLS (enrolled + paid)
    const { data, error } = await supabase
      .from("lessons")
      .select("id,title,position")
      .eq("course_id", id)
      .order("position", { ascending: true });

    if (error) {
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
      const payload = {
        user_id: session.user.id, // ✅ required for your RLS policy
        course_id: id,
        is_paid: false
      };

      const { error } = await supabase.from("enrollments").insert(payload);

      // If already enrolled (duplicate PK), treat as success
      if (error && !String(error.message || "").toLowerCase().includes("duplicate")) {
        throw error;
      }

      await loadEnrollment();
      // lessons still locked until is_paid=true
    } catch (e) {
      setErr(e?.message || "Enroll failed");
    } finally {
      setBusy(false);
    }
  }

  // ✅ Payment hook: YOU must implement a real payment backend to set is_paid=true.
  // This UI is production-correct: it calls an endpoint you control.
  async function startPayment() {
    if (!session) {
      navigate("/login");
      return;
    }
    setBusy(true);
    setErr("");

    try {
      // EXPECTED: you will create a Supabase Edge Function (recommended) called "create-checkout"
      // that returns: { url: "https://checkout.stripe.com/..." }
      // It must verify the user, and on webhook success set enrollments.is_paid = true
      const { data: s } = await supabase.auth.getSession();
      const token = s?.session?.access_token;

      if (!token) throw new Error("No session token");

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_EDGE_BASE}/create-checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ course_id: id })
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Payment start failed");
      }

      const json = await res.json();
      if (!json?.url) throw new Error("No checkout URL returned");
      window.location.href = json.url;
    } catch (e) {
      setErr(e?.message || "Payment failed");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    loadCourse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    loadEnrollment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, id]);

  useEffect(() => {
    if (isPaid) loadLessons();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPaid]);

  return (
    <div className="container">
      <Card>
        <Button className="btn" onClick={() => navigate("/courses")}>← Back</Button>
        <div className="sep" />

        {err && <div className="error">{err}</div>}
        {busy && !course && <div className="notice">Loading…</div>}

        {course && (
          <>
            <div className="h1">{course.title}</div>
            <p className="p">{course.description || "—"}</p>

            <div className="sep" />

            <div className="row" style={{ justifyContent: "space-between" }}>
              <div className="badge">{session ? `Signed in: ${session.user.email}` : "Not signed in"}</div>

              <div className="row">
                {!isEnrolled ? (
                  <Button className="btn btn-ok" onClick={enroll} disabled={busy}>
                    {busy ? "Enrolling…" : "Enroll"}
                  </Button>
                ) : (
                  <span className="badge">Enrolled</span>
                )}

                {isEnrolled && !isPaid && (
                  <Button className="btn btn-primary" onClick={startPayment} disabled={busy}>
                    {busy ? "Starting…" : "Pay to unlock lessons"}
                  </Button>
                )}

                {isEnrolled && isPaid && <span className="badge">Paid ✅</span>}
              </div>
            </div>

            <div className="sep" />

            <div className="h2">Lessons</div>

            {!isEnrolled && (
              <p className="p">Enroll to begin. Lessons remain locked until payment is completed.</p>
            )}

            {isEnrolled && !isPaid && (
              <p className="p">
                You are enrolled, but lessons are locked until payment is completed.
              </p>
            )}

            {isPaid && (
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 90 }}>#</th>
                    <th>Lesson</th>
                    <th style={{ width: 160 }}>Open</th>
                  </tr>
                </thead>
                <tbody>
                  {lessons.map((l) => (
                    <tr key={l.id}>
                      <td className="small">{l.position}</td>
                      <td>{l.title}</td>
                      <td><Link className="btn btn-primary" to={`/lesson/${l.id}`}>Open</Link></td>
                    </tr>
                  ))}
                  {lessons.length === 0 && (
                    <tr><td colSpan={3} className="notice">No lessons found.</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </>
        )}
      </Card>

      <div className="small" style={{ marginTop: 12 }}>
        Note: Payment requires a backend (recommended: Supabase Edge Function + Stripe webhook).
      </div>
    </div>
  );
}

/* =========================
   Lesson Page + Progress (RLS-safe)
========================= */
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
          .eq("user_id", session.user.id)
          .maybeSingle();
        setCompleted(!!p?.completed);
      } else {
        setCompleted(false);
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
      // ✅ RLS-safe: include user_id (your policies check auth.uid() = user_id)
      const { error } = await supabase.from("progress").upsert({
        user_id: session.user.id,
        lesson_id: id,
        completed: true,
        updated_at: new Date().toISOString(),
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
      <Card>
        <Button className="btn" onClick={() => navigate(-1)}>← Back</Button>
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
                <Button className="btn btn-ok" onClick={markComplete} disabled={busy || completed}>
                  {completed ? "Saved" : busy ? "Saving…" : "Mark complete"}
                </Button>
              </div>
            </div>

            <div className="sep" />

            <Card>
              <div className="p" style={{ whiteSpace: "pre-wrap" }}>
                {lesson.content}
              </div>
            </Card>
          </>
        )}
      </Card>
    </div>
  );
}

/* =========================
   Help: support ticket widget (RLS-safe)
========================= */
function HelpPage({ session }) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg("");

    try {
      if (!session) throw new Error("Please sign in first.");

      const payload = {
        user_id: session.user.id,
        subject,
        message
      };

      const { error } = await supabase.from("support_tickets").insert(payload);
      if (error) throw error;

      setSubject("");
      setMessage("");
      setMsg("Ticket submitted. Support will respond soon.");
    } catch (e2) {
      setMsg(e2?.message || "Failed to submit ticket");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container">
      <Card>
        <div className="h1">Student Help</div>
        <p className="p">Send a support request. This is stored in your database (not a demo).</p>
        <div className="sep" />

        <form onSubmit={submit}>
          <div className="small">Subject</div>
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} required />

          <div className="small" style={{ marginTop: 10 }}>Message</div>
          <textarea
            className="input"
            style={{ minHeight: 140 }}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            required
          />

          <div className="row" style={{ marginTop: 12 }}>
            <Button className="btn btn-primary" disabled={busy}>
              {busy ? "Sending…" : "Submit ticket"}
            </Button>
          </div>

          {msg && <div style={{ marginTop: 12 }} className={msg.includes("submitted") ? "success" : "error"}>{msg}</div>}
        </form>
      </Card>
    </div>
  );
}

/* =========================
   App Root
========================= */
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
        <Route path="/courses" element={<CoursesPage />} />
        <Route path="/courses/:id" element={<CourseDetail session={session} />} />
        <Route path="/lesson/:id" element={<LessonPage session={session} />} />
        <Route path="/help" element={<HelpPage session={session} />} />
        <Route path="*" element={<div className="container"><Card><div className="h1">Not found</div><p className="p">That page doesn’t exist.</p></Card></div>} />
      </Routes>
    </>
  );
}
