import { useEffect, useState } from "react";
import { Link, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { supabase } from "./lib/supabase";

function Button({ className = "btn", ...props }) {
  return <button className={className} {...props} />;
}
function Input(props) {
  return <input className="input" {...props} />;
}
function Card({ children }) {
  return <div className="card">{children}</div>;
}

function Topbar({ session }) {
  const navigate = useNavigate();

  async function signOut() {
    await supabase.auth.signOut();
    navigate("/login");
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

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState("signin");
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

            {msg && (
              <div style={{ marginTop: 12 }} className={msg.toLowerCase().includes("error") ? "error" : "notice"}>
                {msg}
              </div>
            )}
          </form>
        </Card>

        <Card>
          <div className="h2">Security model</div>
          <p className="p">
            <strong>Courses</strong>: published only.<br />
            <strong>Lessons</strong>: enrolled + paid only (RLS enforced).<br />
            <strong>Progress</strong>: only you can update.
          </p>
          <div className="sep" />
          <div className="badge">Supabase Postgres + RLS</div>
        </Card>
      </div>
    </div>
  );
}

function Portal({ session }) {
  return (
    <div className="container">
      <div className="grid">
        <Card>
          <div className="h1">Master Portal</div>
          <p className="p">Browse courses, enroll, pay to unlock lessons, and track completion.</p>
          <div className="sep" />
          <div className="row">
            <Link className="btn btn-primary" to="/courses">
              Browse courses
            </Link>
            {!session && (
              <Link className="btn" to="/login">
                Sign in
              </Link>
            )}
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
            1) Open courses<br />
            2) Enroll<br />
            3) Pay to unlock<br />
            4) Open lessons
          </p>
          <div className="sep" />
          <Link to="/help" className="btn">
            Student Help
          </Link>
        </Card>
      </div>
    </div>
  );
}

function CoursesPage() {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

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

  const canNext = total != null ? (page + 1) * pageSize < total : false;

  return (
    <div className="container">
      <Card>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <div className="h1">Courses</div>
            <p className="p">Open a course to enroll and unlock lessons.</p>
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
                  <Link className="btn btn-primary" to={`/courses/${c.id}`}>
                    Open
                  </Link>
                </td>
              </tr>
            ))}
            {!busy && rows.length === 0 && (
              <tr>
                <td colSpan={3} className="notice">
                  No courses found.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="sep" />
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div className="small">Page {page + 1}</div>
          <div className="row">
            <Button className="btn" disabled={page === 0 || busy} onClick={() => setPage((p) => Math.max(0, p - 1))}>
              Prev
            </Button>
            <Button className="btn" disabled={!canNext || busy} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

function CourseDetail({ session }) {
  const { id } = useParams();
  const navigate = useNavigate();

  const [course, setCourse] = useState(null);
  const [lessons, setLessons] = useState([]);
  const [enrollment, setEnrollment] = useState(null);
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
    const { data } = await supabase
      .from("enrollments")
      .select("course_id,user_id,is_paid")
      .eq("course_id", id)
      .eq("user_id", session.user.id)
      .maybeSingle();

    setEnrollment(data || null);
  }

  async function loadLessons() {
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
      const { error } = await supabase.from("enrollments").insert({
        user_id: session.user.id,
        course_id: id,
        is_paid: false,
      });

      if (error && !String(error.message || "").toLowerCase().includes("duplicate")) {
        throw error;
      }

      await loadEnrollment();
    } catch (e) {
      setErr(e?.message || "Enroll failed");
    } finally {
      setBusy(false);
    }
  }

  // ✅ Correct startPayment lives INSIDE CourseDetail so it has session, navigate, setBusy, id etc
  async function startPayment() {
    if (!session) {
      navigate("/login");
      return;
    }

    setBusy(true);
    setErr("");

    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;

      const token = data?.session?.access_token;
      if (!token) throw new Error("No access token. Please sign out and sign in again.");

      const base = import.meta.env.VITE_SUPABASE_EDGE_BASE;
      if (!base) throw new Error("Missing VITE_SUPABASE_EDGE_BASE in Render Environment.");

      const res = await fetch(`${base}/create-checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ course_id: id }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Checkout failed (${res.status})`);
      }

      const json = await res.json();
      if (!json?.url) throw new Error("No checkout URL returned from server.");

      window.location.href = json.url;
    } catch (e) {
      setErr(e?.message || "Failed to start payment");
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
        <Button className="btn" onClick={() => navigate("/courses")}>
          ← Back
        </Button>
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

            {!isEnrolled && <p className="p">Enroll first. Lessons unlock only after payment.</p>}
            {isEnrolled && !isPaid && <p className="p">Payment required to unlock lessons.</p>}

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
                      <td>
                        <Link className="btn btn-primary" to={`/lesson/${l.id}`}>
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {lessons.length === 0 && (
                    <tr>
                      <td colSpan={3} className="notice">
                        No lessons found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

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

      const { error } = await supabase.from("support_tickets").insert({
        user_id: session.user.id,
        subject,
        message,
      });

      if (error) throw error;

      setSubject("");
      setMessage("");
      setMsg("Ticket submitted.");
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
        <p className="p">Submit a support ticket (stored in your database).</p>
        <div className="sep" />

        <form onSubmit={submit}>
          <div className="small">Subject</div>
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} required />

          <div className="small" style={{ marginTop: 10 }}>
            Message
          </div>
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

function LessonPage() {
  return (
    <div className="container">
      <Card>
        <div className="h1">Lesson</div>
        <p className="p">Lesson view can be added next (you already have DB + RLS working).</p>
      </Card>
    </div>
  );
}

function NotFound() {
  return (
    <div className="container">
      <Card>
        <div className="h1">Not found</div>
        <p className="p">That page doesn’t exist.</p>
      </Card>
    </div>
  );
}

function App() {
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
        <Route path="/lesson/:id" element={<LessonPage />} />
        <Route path="/help" element={<HelpPage session={session} />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}

export default App;
