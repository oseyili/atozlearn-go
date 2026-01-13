import { useEffect, useMemo, useState } from "react";
import { Routes, Route, Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "./lib/supabase";
import "./styles.css";

/* -------------------- UTIL -------------------- */

async function readableToText(maybeStream) {
  try {
    if (!maybeStream) return "";
    // Supabase sometimes returns a ReadableStream in error.context.body
    if (typeof maybeStream === "string") return maybeStream;
    return await new Response(maybeStream).text();
  } catch {
    return "";
  }
}

/* -------------------- APP -------------------- */

function App() {
  const [session, setSession] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, sess) => {
      setSession(sess);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brandMark">A</div>
          <div>
            <div className="brandName">AtoZlearn-go</div>
            <div className="brandTag">Master Learning Portal</div>
          </div>
        </div>

        <nav className="nav">
          <Link to="/">Portal</Link>
          <Link to="/courses">Courses</Link>
          {!session ? (
            <Link className="btn" to="/login">
              Login
            </Link>
          ) : (
            <button className="btn" onClick={() => supabase.auth.signOut()}>
              Sign out
            </button>
          )}
        </nav>
      </header>

      <main className="main">
        <Routes>
          <Route path="/" element={<MasterPortal session={session} />} />
          <Route path="/login" element={<Auth />} />
          <Route path="/courses" element={<Courses />} />
          <Route path="/courses/:id" element={<CourseDetail session={session} />} />
        </Routes>
      </main>

      <footer className="footer">
        <span>© {new Date().getFullYear()} AtoZlearn-go</span>
        <span className="muted">Secure payments • Progress tracking • Support</span>
      </footer>
    </div>
  );
}

/* -------------------- MASTER PORTAL -------------------- */

function MasterPortal({ session }) {
  const subjects = useMemo(
    () => [
      { k: "math", t: "Mathematics", d: "Algebra, calculus, statistics, and more" },
      { k: "sci", t: "Science", d: "Biology, chemistry, physics, earth science" },
      { k: "cs", t: "Computer Science", d: "Programming, web, AI, data structures" },
      { k: "bus", t: "Business", d: "Entrepreneurship, management, finance" },
      { k: "fin", t: "Finance", d: "Investing, budgeting, accounting basics" },
      { k: "eng", t: "English & Writing", d: "Grammar, writing, comprehension" },
      { k: "hist", t: "History", d: "World history, modern history, civics" },
      { k: "lang", t: "Languages", d: "Learn languages and improve fluency" },
      { k: "art", t: "Arts & Design", d: "Design thinking, creativity, visual arts" },
      { k: "health", t: "Health & Wellness", d: "Fitness, wellbeing, healthy habits" },
      { k: "career", t: "Career Skills", d: "CV, interviews, workplace excellence" },
      { k: "exam", t: "Exam Prep", d: "Study plans, practice, confidence" },
    ],
    []
  );

  return (
    <section className="portal">
      <div className="heroCard">
        <div className="heroText">
          <h1>Welcome to your Master Learning Portal</h1>
          <p>
            Choose a subject, enroll, unlock lessons, track progress, and pay securely.
          </p>

          <div className="heroMeta">
            {session ? (
              <span className="pill ok">Signed in</span>
            ) : (
              <span className="pill warn">Sign in to enroll</span>
            )}
            <span className="pill">All subjects</span>
            <span className="pill">Structured lessons</span>
            <span className="pill">Secure payments</span>
          </div>

          <div className="heroActions">
            <Link className="cta" to="/courses">
              Browse Courses
            </Link>
            {!session && (
              <Link className="btn" to="/login">
                Sign in / Sign up
              </Link>
            )}
          </div>
        </div>

        <div className="heroPanel">
          <div className="panelTitle">Quick Start</div>
          <ol className="steps">
            <li>Open Courses</li>
            <li>Pick a course</li>
            <li>Enroll & Pay</li>
            <li>Unlock lessons</li>
          </ol>
          <div className="supportBox">
            <div className="supportTitle">Need help?</div>
            <div className="muted">
              Use the in-app help panel on each course page.
            </div>
          </div>
        </div>
      </div>

      <h2 className="sectionTitle">Subjects</h2>
      <div className="grid">
        {subjects.map((s) => (
          <Link key={s.k} className="card" to="/courses">
            <div className="cardTitle">{s.t}</div>
            <div className="cardDesc">{s.d}</div>
            <div className="cardLink">Explore →</div>
          </Link>
        ))}
      </div>
    </section>
  );
}

/* -------------------- AUTH -------------------- */

function Auth() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  async function signIn() {
    setBusy(true);
    setMsg("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return setMsg(error.message);
    nav("/");
  }

  async function signUp() {
    setBusy(true);
    setMsg("");
    const { error } = await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (error) return setMsg(error.message);
    setMsg("Account created. Now sign in.");
  }

  return (
    <section className="auth">
      <h2>Sign in / Sign up</h2>
      <div className="authBox">
        <label>Email</label>
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email" />
        <label>Password</label>
        <input
          value={password}
          type="password"
          onChange={(e) => setPassword(e.target.value)}
          placeholder="password"
        />

        {msg && <div className="notice">{msg}</div>}

        <div className="authActions">
          <button className="cta" disabled={busy} onClick={signIn}>
            Sign in
          </button>
          <button className="btn" disabled={busy} onClick={signUp}>
            Sign up
          </button>
        </div>
      </div>
    </section>
  );
}

/* -------------------- COURSES -------------------- */

function Courses() {
  const [courses, setCourses] = useState([]);
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      setErr("");
      const { data, error } = await supabase.from("courses").select("*").limit(200);
      if (error) setErr(error.message);
      setCourses(data || []);
    })();
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return courses;
    return courses.filter(
      (c) =>
        (c.title || "").toLowerCase().includes(s) ||
        (c.description || "").toLowerCase().includes(s)
    );
  }, [q, courses]);

  return (
    <section>
      <div className="pageHead">
        <h2>Courses</h2>
        <input
          className="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search courses…"
        />
      </div>

      {err && <div className="notice">{err}</div>}

      <div className="grid">
        {filtered.map((c) => (
          <Link key={c.id} className="card" to={`/courses/${c.id}`}>
            <div className="cardTitle">{c.title}</div>
            <div className="cardDesc">{c.description}</div>
            <div className="cardLink">Open course →</div>
          </Link>
        ))}
      </div>
    </section>
  );
}

/* -------------------- COURSE DETAIL + PAYMENT -------------------- */

function CourseDetail({ session }) {
  const { id } = useParams();
  const nav = useNavigate();

  const [course, setCourse] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("courses").select("*").eq("id", id).single();
      setCourse(data);
    })();
  }, [id]);

  async function startPayment() {
    if (!session) {
      nav("/login");
      return;
    }

    setBusy(true);
    setErr("");

    try {
      // ✅ Always refresh right before calling Edge (prevents expired JWT)
      const { data: refreshed, error: refreshErr } = await supabase.auth.refreshSession();
      if (refreshErr) throw refreshErr;

      const token = refreshed?.session?.access_token;
      if (!token) throw new Error("Session expired. Please sign out and sign in again.");

      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: { course_id: id },
        headers: { Authorization: `Bearer ${token}` },
      });

      if (error) {
        const status = error?.context?.status;
        const bodyText = await readableToText(error?.context?.body);
        throw new Error(bodyText || `Edge error ${status ?? ""}: ${error.message}`);
      }

      if (!data?.url) throw new Error("No checkout URL returned.");
      window.location.href = data.url;
    } catch (e) {
      setErr(e?.message || "Payment failed");
    } finally {
      setBusy(false);
    }
  }

  if (!course) return <div className="notice">Loading course…</div>;

  return (
    <section className="coursePage">
      <div className="courseHeader">
        <div>
          <h2>{course.title}</h2>
          <p className="muted">{course.description}</p>
        </div>

        <div className="courseActions">
          <button className="btn" onClick={() => setHelpOpen((v) => !v)}>
            {helpOpen ? "Hide Help" : "Help"}
          </button>
          <button className="cta" disabled={busy} onClick={startPayment}>
            {busy ? "Redirecting…" : "Enroll & Pay"}
          </button>
        </div>
      </div>

      {err && <div className="notice error">{err}</div>}

      {helpOpen && (
        <div className="helpPanel">
          <div className="helpTitle">Student Help</div>
          <ul>
            <li>If payment fails, sign out and sign in again (refreshes token).</li>
            <li>After successful payment, return to this course page.</li>
            <li>Lessons unlock after enrollment/payment is recorded.</li>
          </ul>
        </div>
      )}

      <div className="notice">
        Lessons unlock after you enroll & pay (secured by your database policies).
      </div>
    </section>
  );
}

/* -------------------- EXPORT -------------------- */

export default App;
