import { useEffect, useState } from "react";
import { Routes, Route, Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "./lib/supabase";
import "./styles.css";

/* -------------------- MAIN APP -------------------- */

function App() {
  const [session, setSession] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <div className="app">
      <header className="topbar">
        <h1>AtoZlearn-go</h1>
        <nav>
          <Link to="/">Home</Link>
          <Link to="/courses">Courses</Link>
          {session ? (
            <button onClick={() => supabase.auth.signOut()}>Sign out</button>
          ) : (
            <Link to="/login">Login</Link>
          )}
        </nav>
      </header>

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Auth />} />
        <Route path="/courses" element={<Courses />} />
        <Route path="/courses/:id" element={<CourseDetail session={session} />} />
      </Routes>
    </div>
  );
}

/* -------------------- HOME -------------------- */

function Home() {
  return (
    <section className="hero">
      <h2>Learn everything, from A to Z</h2>
      <p>Professional courses across all subject areas.</p>
      <Link className="cta" to="/courses">Browse Courses</Link>
    </section>
  );
}

/* -------------------- AUTH -------------------- */

function Auth() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <section className="auth">
      <h2>Sign in / Sign up</h2>
      <input placeholder="Email" onChange={e => setEmail(e.target.value)} />
      <input type="password" placeholder="Password" onChange={e => setPassword(e.target.value)} />
      <button onClick={() => supabase.auth.signInWithPassword({ email, password })}>Sign in</button>
      <button onClick={() => supabase.auth.signUp({ email, password })}>Sign up</button>
    </section>
  );
}

/* -------------------- COURSES -------------------- */

function Courses() {
  const [courses, setCourses] = useState([]);

  useEffect(() => {
    supabase.from("courses").select("*").limit(50).then(({ data }) => {
      setCourses(data || []);
    });
  }, []);

  return (
    <section className="grid">
      {courses.map(c => (
        <Link key={c.id} className="card" to={`/courses/${c.id}`}>
          <h3>{c.title}</h3>
          <p>{c.description}</p>
        </Link>
      ))}
    </section>
  );
}

/* -------------------- COURSE DETAIL + PAYMENT -------------------- */

function CourseDetail({ session }) {
  const { id } = useParams();
  const nav = useNavigate();
  const [course, setCourse] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.from("courses").select("*").eq("id", id).single()
      .then(({ data }) => setCourse(data));
  }, [id]);

  async function startPayment() {
    if (!session) {
      nav("/login");
      return;
    }

    setBusy(true);
    setErr("");

    try {
      // ✅ FIX: refresh token before Edge call
      const { data: refreshed, error } = await supabase.auth.refreshSession();
      if (error) throw error;

      const token = refreshed?.session?.access_token;
      if (!token) throw new Error("Session expired. Please sign in again.");

      const { data, error: fnError } = await supabase.functions.invoke(
        "create-checkout",
        {
          body: { course_id: id },
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (fnError) {
        throw new Error(fnError.context?.body || fnError.message);
      }

      window.location.href = data.url;
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!course) return <p>Loading…</p>;

  return (
    <section className="course">
      <h2>{course.title}</h2>
      <p>{course.description}</p>

      {err && <p className="error">{err}</p>}

      <button disabled={busy} onClick={startPayment}>
        {busy ? "Redirecting…" : "Enroll & Pay"}
      </button>
    </section>
  );
}

/* -------------------- EXPORT -------------------- */

export default App;
