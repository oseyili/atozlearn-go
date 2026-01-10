import { useEffect, useState } from "react";
import { Routes, Route, Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "./lib/supabase";

/* ---------- UI helpers ---------- */
const Button = (p) => <button {...p} />;
const Card = ({ children }) => <div style={{ padding: 20, border: "1px solid #ddd", marginBottom: 20 }}>{children}</div>;
const Input = (p) => <input {...p} />;

/* ---------- Auth ---------- */
function AuthPage() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");

  async function submit(e) {
    e.preventDefault();
    setErr("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setErr(error.message);
    else nav("/");
  }

  return (
    <Card>
      <h2>Sign in</h2>
      <form onSubmit={submit}>
        <Input placeholder="email" value={email} onChange={e => setEmail(e.target.value)} />
        <br />
        <Input type="password" placeholder="password" value={password} onChange={e => setPassword(e.target.value)} />
        <br />
        <Button>Sign in</Button>
        {err && <p style={{ color: "red" }}>{err}</p>}
      </form>
    </Card>
  );
}

/* ---------- Courses ---------- */
function Courses() {
  const [courses, setCourses] = useState([]);

  useEffect(() => {
    supabase.from("courses").select("id,title,description").then(({ data }) => {
      setCourses(data || []);
    });
  }, []);

  return (
    <Card>
      <h2>Courses</h2>
      {courses.map(c => (
        <div key={c.id}>
          <strong>{c.title}</strong>
          <p>{c.description}</p>
          <Link to={`/courses/${c.id}`}>Open</Link>
          <hr />
        </div>
      ))}
    </Card>
  );
}

/* ---------- Course Detail + Payment ---------- */
function CourseDetail({ session }) {
  const { id } = useParams();
  const nav = useNavigate();

  const [course, setCourse] = useState(null);
  const [enroll, setEnroll] = useState(null);
  const [lessons, setLessons] = useState([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.from("courses").select("*").eq("id", id).single()
      .then(({ data }) => setCourse(data));
  }, [id]);

  useEffect(() => {
    if (!session) return;
    supabase.from("enrollments")
      .select("*")
      .eq("course_id", id)
      .eq("user_id", session.user.id)
      .maybeSingle()
      .then(({ data }) => setEnroll(data));
  }, [session, id]);

  useEffect(() => {
    if (enroll?.is_paid) {
      supabase.from("lessons")
        .select("id,title")
        .eq("course_id", id)
        .order("position")
        .then(({ data }) => setLessons(data || []));
    }
  }, [enroll, id]);

  async function doEnroll() {
    if (!session) return nav("/login");
    await supabase.from("enrollments").insert({
      user_id: session.user.id,
      course_id: id,
      is_paid: false,
    });
    location.reload();
  }

  /* ✅ STRIPE PAYMENT – CORRECT WAY */
  async function startPayment() {
    setBusy(true);
    setErr("");
    try {
      const { data, error } = await supabase.functions.invoke(
        "create-checkout",
        { body: { course_id: id } }
      );
      if (error) throw error;
      window.location.href = data.url;
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!course) return null;

  return (
    <Card>
      <h2>{course.title}</h2>
      <p>{course.description}</p>

      {!enroll && <Button onClick={doEnroll}>Enroll</Button>}
      {enroll && !enroll.is_paid && <Button onClick={startPayment} disabled={busy}>Pay to unlock</Button>}

      {err && <p style={{ color: "red" }}>{err}</p>}

      {enroll?.is_paid && (
        <>
          <h3>Lessons</h3>
          {lessons.map(l => <div key={l.id}>{l.title}</div>)}
        </>
      )}
    </Card>
  );
}

/* ---------- App ---------- */
export default function App() {
  const [session, setSession] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    supabase.auth.onAuthStateChange((_e, s) => setSession(s));
  }, []);

  return (
    <>
      <nav>
        <Link to="/">Home</Link> | <Link to="/courses">Courses</Link>
        {session && <Button onClick={() => supabase.auth.signOut()}>Sign out</Button>}
      </nav>

      <Routes>
        <Route path="/" element={<Courses />} />
        <Route path="/login" element={<AuthPage />} />
        <Route path="/courses" element={<Courses />} />
        <Route path="/courses/:id" element={<CourseDetail session={session} />} />
      </Routes>
    </>
  );
}
