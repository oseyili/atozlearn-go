import { useEffect, useMemo, useState } from "react";
import { Routes, Route, Link, useNavigate, useParams, useLocation } from "react-router-dom";
import { supabase } from "./lib/supabase";
import "./styles.css";

/* -------------------- helpers -------------------- */

const SUBJECT_ICONS = {
  Mathematics: "∑", Science: "⚗", "Computer Science": "⌘", Engineering: "⚙",
  "Data & AI": "🧠", Cybersecurity: "🛡", Business: "📈", Finance: "💷",
  Economics: "🏦", "English & Writing": "✍", History: "🏛", Geography: "🗺",
  Languages: "🌍", "Arts & Design": "🎨", Music: "🎵", "Health & Wellness": "💪",
  Psychology: "🧩", Law: "⚖", Medicine: "🩺", Education: "🎓",
  Marketing: "📣", "Career Skills": "🧰", "Exam Prep": "📝", General: "📚",
};

function subjectOf(c) {
  return (c?.subject || c?.category || "General").toString().trim() || "General";
}

function thumbStyle(seed) {
  let h = 0;
  const s = (seed || "course").toString();
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return { background: `linear-gradient(135deg, hsla(${h},90%,65%,.95), hsla(${(h + 45) % 360},90%,60%,.95))` };
}

function useQuery() {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
}

async function fetchAllCoursesPaged() {
  // Loads ALL courses (7000+) reliably.
  const pageSize = 1000;
  let from = 0;
  let out = [];
  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from("courses")
      .select("id,title,description,subject,category,created_at")
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) throw error;
    out = out.concat(data || []);
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }

  // De-dupe safety
  const m = new Map();
  for (const c of out) {
    const k = c?.id || `t:${c?.title || Math.random()}`;
    if (!m.has(k)) m.set(k, c);
  }
  return Array.from(m.values());
}

/* -------------------- auth hooks -------------------- */

function useSession() {
  const [session, setSession] = useState(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, sess) => setSession(sess));
    return () => sub.subscription.unsubscribe();
  }, []);
  return session;
}

function useEnrollments(session) {
  const [enrollments, setEnrollments] = useState([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!session?.user?.id) {
      setEnrollments([]);
      setErr("");
      return;
    }
    (async () => {
      setErr("");
      const { data, error } = await supabase
        .from("enrollments")
        .select("course_id,is_paid,payment_status,created_at")
        .eq("user_id", session.user.id);

      if (error) setErr(error.message);
      setEnrollments(data || []);
    })();
  }, [session?.user?.id]);

  const enrollMap = useMemo(() => {
    const m = new Map();
    for (const e of enrollments) m.set(e.course_id, e);
    return m;
  }, [enrollments]);

  return { enrollments, enrollMap, enrollErr: err };
}

/* -------------------- App -------------------- */

export default function App() {
  const session = useSession();

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brandMark">A</div>
          <div>
            <div className="brandName">AtoZlearn-go</div>
            <div className="brandTag">Professional Learning Portal</div>
          </div>
        </div>

        <nav className="nav">
          <Link to="/">Portal</Link>
          <Link to="/subjects">Subjects</Link>
          <Link to="/courses">Courses</Link>
          {!session ? (
            <Link className="btn" to="/login">Login</Link>
          ) : (
            <button className="btn" onClick={() => supabase.auth.signOut()}>Sign out</button>
          )}
        </nav>
      </header>

      <main className="main">
        <Routes>
          <Route path="/" element={<MasterPortal session={session} />} />
          <Route path="/login" element={<Auth />} />
          <Route path="/subjects" element={<SubjectsPage />} />
          <Route path="/subjects/:subject" element={<SubjectCourses session={session} />} />
          <Route path="/courses" element={<CoursesPage session={session} />} />
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

/* -------------------- Auth -------------------- */

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
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="password" />

        {msg && <div className="notice">{msg}</div>}

        <div className="authActions">
          <button className="cta" disabled={busy} onClick={signIn}>Sign in</button>
          <button className="btn" disabled={busy} onClick={signUp}>Sign up</button>
        </div>
      </div>
    </section>
  );
}

/* -------------------- Master Portal (diagnostic + reliable loading) -------------------- */

function MasterPortal({ session }) {
  const nav = useNavigate();
  const { enrollments, enrollMap, enrollErr } = useEnrollments(session);

  const [courses, setCourses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const list = await fetchAllCoursesPaged();
      setCourses(list);

      const subs = Array.from(new Set(list.map(subjectOf))).sort((a, b) => a.localeCompare(b));
      setSubjects(subs);
    } catch (e) {
      setErr(e?.message || "Failed to load courses (likely RLS policy missing).");
      setCourses([]);
      setSubjects([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const paidCourses = useMemo(() => {
    if (!session?.user?.id) return [];
    const paidIds = new Set(
      (enrollments || [])
        .filter((e) => e.is_paid === true || e.payment_status === "paid")
        .map((e) => e.course_id)
    );
    return courses.filter((c) => paidIds.has(c.id));
  }, [courses, enrollments, session?.user?.id]);

  return (
    <section>
      <div className="portalHero">
        <div className="portalHeroLeft">
          <div className="portalKicker">Master Portal</div>
          <h1 className="portalTitle">Learn anything, from A to Z</h1>
          <p className="muted">Subjects + courses load from your database. Paid courses unlock lessons.</p>

          <div className="portalMeta">
            {session ? <span className="pill ok">Signed in: {session.user.email}</span> : <span className="pill warn">Sign in for paid courses</span>}
            <span className="pill">Courses: {loading ? "…" : courses.length}</span>
            <span className="pill">Subjects: {loading ? "…" : subjects.length}</span>
          </div>

          <div className="portalActions">
            <button className="cta" onClick={() => nav("/subjects")}>Browse Subjects</button>
            <button className="btn" onClick={() => nav("/courses")}>Browse Courses</button>
            <button className="btn" onClick={load}>{loading ? "Loading…" : "Reload"}</button>
          </div>

          {(err || enrollErr) && (
            <div className="notice error">
              <div><b>Portal diagnostic</b></div>
              {err && <div>Courses error: {err}</div>}
              {enrollErr && <div>Enrollments error: {enrollErr}</div>}
              <div className="muted">If courses are 0, your RLS SELECT policy on courses is missing.</div>
            </div>
          )}
        </div>

        <div className="portalHeroRight">
          <div className="heroCard">
            <div className="heroCardTitle">Quick Start</div>
            <ol className="heroSteps">
              <li>Open a Subject</li>
              <li>Pick a Course</li>
              <li>Enroll & Pay</li>
              <li>Continue lessons</li>
            </ol>
            <div className="heroTip">Paid courses will appear below automatically.</div>
          </div>
        </div>
      </div>

      <div className="sectionRow">
        <h2>Subjects</h2>
        <div className="muted">Click a subject to view its courses</div>
      </div>

      {loading && <div className="notice">Loading subjects…</div>}

      {!loading && subjects.length === 0 && (
        <div className="notice error">
          No subjects found because no courses were returned. This is almost always **RLS blocking courses**.
        </div>
      )}

      <div className="subjectGrid">
        {subjects.map((s) => (
          <Link key={s} to={`/subjects/${encodeURIComponent(s)}`} className="subjectCard">
            <div className="subjectIcon">{SUBJECT_ICONS[s] || SUBJECT_ICONS.General}</div>
            <div className="subjectInfo">
              <div className="subjectTitle">{s}</div>
              <div className="muted">
                {courses.filter((c) => subjectOf(c) === s).length} courses
              </div>
            </div>
            <div className="subjectArrow">→</div>
          </Link>
        ))}
      </div>

      <div className="tableCard">
        <div className="tableTitleRow">
          <h2>Paid Courses</h2>
          <div className="muted">Shown only when signed in and marked paid in enrollments</div>
        </div>

        {!session && <div className="notice">Sign in to view paid courses.</div>}

        {session && (
          <div className="tableWrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Course</th>
                  <th>Subject</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {paidCourses.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <div className="rowCourse">
                        <div className="thumb" style={thumbStyle(c.id || c.title)} />
                        <div>
                          <div className="tdStrong">{c.title}</div>
                          <div className="muted">{c.description}</div>
                        </div>
                      </div>
                    </td>
                    <td className="muted">{subjectOf(c)}</td>
                    <td><span className="status ok">PAID</span></td>
                    <td className="tdRight"><Link className="linkBtn" to={`/courses/${c.id}`}>Open →</Link></td>
                  </tr>
                ))}
                {paidCourses.length === 0 && (
                  <tr>
                    <td colSpan={4} className="muted">
                      No paid courses yet. After payment, the webhook must mark enrollments as paid.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

/* -------------------- Subjects page -------------------- */

function SubjectsPage() {
  const [courses, setCourses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr("");
      try {
        const list = await fetchAllCoursesPaged();
        setCourses(list);
        setSubjects(Array.from(new Set(list.map(subjectOf))).sort((a, b) => a.localeCompare(b)));
      } catch (e) {
        setErr(e?.message || "Failed to load subjects");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <section>
      <div className="pageHead">
        <h2>Subjects</h2>
        <div className="muted">Database-driven</div>
      </div>

      {loading && <div className="notice">Loading…</div>}
      {err && <div className="notice error">{err}</div>}

      <div className="subjectGrid">
        {subjects.map((s) => (
          <Link key={s} to={`/subjects/${encodeURIComponent(s)}`} className="subjectCard">
            <div className="subjectIcon">{SUBJECT_ICONS[s] || SUBJECT_ICONS.General}</div>
            <div className="subjectInfo">
              <div className="subjectTitle">{s}</div>
              <div className="muted">{courses.filter((c) => subjectOf(c) === s).length} courses</div>
            </div>
            <div className="subjectArrow">→</div>
          </Link>
        ))}
      </div>
    </section>
  );
}

/* -------------------- subject -> courses -------------------- */

function SubjectCourses({ session }) {
  const { subject } = useParams();
  const subj = decodeURIComponent(subject || "");
  const { enrollMap } = useEnrollments(session);

  const [courses, setCourses] = useState([]);
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr("");
      try {
        const list = await fetchAllCoursesPaged();
        setCourses(list.filter((c) => subjectOf(c) === subj));
      } catch (e) {
        setErr(e?.message || "Failed to load courses");
      } finally {
        setLoading(false);
      }
    })();
  }, [subj]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return courses;
    return courses.filter((c) => `${c.title} ${c.description}`.toLowerCase().includes(s));
  }, [q, courses]);

  return (
    <section>
      <div className="pageHead">
        <h2>{subj}</h2>
        <input className="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" />
      </div>

      {loading && <div className="notice">Loading…</div>}
      {err && <div className="notice error">{err}</div>}

      <div className="courseGrid">
        {filtered.map((c) => {
          const e = enrollMap.get(c.id);
          const paid = e?.is_paid === true || e?.payment_status === "paid";
          return (
            <Link key={c.id} to={`/courses/${c.id}`} className="courseCard">
              <div className="thumbLg" style={thumbStyle(c.id || c.title)} />
              <div className="courseCardBody">
                <div className="courseCardTitle">{c.title}</div>
                <div className="muted">{c.description}</div>
                <div className="courseCardMeta">
                  <span className={`status ${paid ? "ok" : e ? "warn" : "bad"}`}>
                    {paid ? "PAID" : e ? "ENROLLED" : "LOCKED"}
                  </span>
                  <span className="pill">{subjectOf(c)}</span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

/* -------------------- courses page -------------------- */

function CoursesPage({ session }) {
  const { enrollMap } = useEnrollments(session);

  const [courses, setCourses] = useState([]);
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr("");
      try {
        setCourses(await fetchAllCoursesPaged());
      } catch (e) {
        setErr(e?.message || "Failed to load courses");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return courses;
    return courses.filter((c) => `${c.title} ${c.description} ${subjectOf(c)}`.toLowerCase().includes(s));
  }, [q, courses]);

  return (
    <section>
      <div className="pageHead">
        <h2>All Courses</h2>
        <input className="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search courses…" />
      </div>

      {loading && <div className="notice">Loading… (7000+)</div>}
      {err && <div className="notice error">{err}</div>}

      <div className="courseGrid">
        {filtered.map((c) => {
          const e = enrollMap.get(c.id);
          const paid = e?.is_paid === true || e?.payment_status === "paid";
          return (
            <Link key={c.id} to={`/courses/${c.id}`} className="courseCard">
              <div className="thumbLg" style={thumbStyle(c.id || c.title)} />
              <div className="courseCardBody">
                <div className="courseCardTitle">{c.title}</div>
                <div className="muted">{c.description}</div>
                <div className="courseCardMeta">
                  <span className={`status ${paid ? "ok" : e ? "warn" : "bad"}`}>
                    {paid ? "PAID" : e ? "ENROLLED" : "LOCKED"}
                  </span>
                  <span className="pill">{subjectOf(c)}</span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

/* -------------------- course detail -------------------- */

function CourseDetail({ session }) {
  const { id } = useParams();
  const nav = useNavigate();
  const query = useQuery();
  const { enrollMap } = useEnrollments(session);

  const [course, setCourse] = useState(null);
  const [lessons, setLessons] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const enrollment = enrollMap.get(id);
  const isPaid = enrollment?.is_paid === true || enrollment?.payment_status === "paid";

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("courses").select("*").eq("id", id).single();
      if (error) setErr(error.message);
      setCourse(data || null);
    })();
  }, [id]);

  useEffect(() => {
    (async () => {
      setErr("");
      const { data, error } = await supabase
        .from("lessons")
        .select("id,title,lesson_number,created_at")
        .eq("course_id", id)
        .order("lesson_number", { ascending: true })
        .limit(200);

      if (error) setErr(error.message);
      setLessons(data || []);
    })();
  }, [id, isPaid]);

  async function startPayment() {
    if (!session) return nav("/login");
    setBusy(true);
    setErr("");

    try {
      const { data: refreshed, error: refreshErr } = await supabase.auth.refreshSession();
      if (refreshErr) throw refreshErr;

      const token = refreshed?.session?.access_token;
      if (!token) throw new Error("Session expired. Sign out and sign in again.");

      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: { course_id: id },
        headers: { Authorization: `Bearer ${token}` },
      });

      if (error) throw new Error(error.message);
      if (!data?.url) throw new Error("No checkout URL returned.");
      window.location.href = data.url;
    } catch (e) {
      setErr(e?.message || "Payment failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="coursePage">
      <div className="courseHeader">
        <div className="rowCourse">
          <div className="thumbLg" style={thumbStyle(course?.id || course?.title)} />
          <div>
            <h2 style={{ margin: 0 }}>{course?.title || "Course"}</h2>
            <p className="muted" style={{ marginTop: 6 }}>{course?.description || ""}</p>
            <div className="portalMeta" style={{ marginTop: 10 }}>
              <span className="pill">{subjectOf(course)}</span>
              {isPaid ? <span className="pill ok">Paid</span> : <span className="pill warn">Locked</span>}
            </div>
            {query.get("paid") === "1" && <div className="notice">Payment success. Refresh to unlock lessons.</div>}
          </div>
        </div>

        <div className="courseActions">
          {!isPaid ? (
            <button className="cta" disabled={busy} onClick={startPayment}>
              {busy ? "Redirecting…" : "Enroll & Pay"}
            </button>
          ) : (
            <span className="status ok">PAID</span>
          )}
        </div>
      </div>

      {err && <div className="notice error">{err}</div>}

      <div className="tableCard">
        <div className="tableTitleRow">
          <h2>Lessons</h2>
          <div className="muted">{isPaid ? "Unlocked" : "Locked until you enroll & pay"}</div>
        </div>

        {!isPaid && <div className="notice">Lessons locked by database security until paid.</div>}

        <div className="tableWrap">
          <table className="table">
            <thead>
              <tr><th>#</th><th>Lesson</th><th>Created</th></tr>
            </thead>
            <tbody>
              {lessons.map((l) => (
                <tr key={l.id}>
                  <td className="muted">{l.lesson_number ?? "-"}</td>
                  <td className="tdStrong">{l.title}</td>
                  <td className="muted">{l.created_at ? new Date(l.created_at).toLocaleDateString() : "-"}</td>
                </tr>
              ))}
              {lessons.length === 0 && (
                <tr>
                  <td colSpan={3} className="muted">{isPaid ? "No lessons found." : "Locked."}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
