import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";

function Auth() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");

  async function signIn(e) {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setMsg(error ? error.message : "Signed in");
  }

  async function signUp(e) {
    e.preventDefault();
    const { error } = await supabase.auth.signUp({ email, password });
    setMsg(error ? error.message : "Check email to confirm");
  }

  return (
    <form onSubmit={signIn} style={{ maxWidth: 360, margin: "40px auto" }}>
      <h2>AtoZlearn-go</h2>
      <input placeholder="email" value={email} onChange={e=>setEmail(e.target.value)} />
      <input placeholder="password" type="password" value={password} onChange={e=>setPassword(e.target.value)} />
      <button>Sign in</button>
      <button type="button" onClick={signUp}>Sign up</button>
      <p>{msg}</p>
    </form>
  );
}

function App() {
  const [session, setSession] = useState(null);
  const [courses, setCourses] = useState([]);
  const [lessons, setLessons] = useState([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  async function loadCourses() {
    const { data } = await supabase.from("courses").select("*");
    setCourses(data || []);
  }

  async function enroll(course_id) {
    await supabase.from("enrollments").insert({ course_id });
    await loadLessons(course_id);
  }

  async function loadLessons(course_id) {
    const { data } = await supabase.from("lessons").select("*").eq("course_id", course_id);
    setLessons(data || []);
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  if (!session) return <Auth />;

  return (
    <div style={{ maxWidth: 720, margin: "40px auto" }}>
      <button onClick={signOut}>Sign out</button>
      <h3>Courses</h3>
      <button onClick={loadCourses}>Load courses</button>
      <ul>
        {courses.map(c => (
          <li key={c.id}>
            {c.title}
            <button onClick={() => enroll(c.id)}>Enroll</button>
          </li>
        ))}
      </ul>

      <h3>Lessons (visible only if enrolled)</h3>
      <ul>
        {lessons.map(l => <li key={l.id}>{l.title}</li>)}
      </ul>
    </div>
  );
}

export default App;
