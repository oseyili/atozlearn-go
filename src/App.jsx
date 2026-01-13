import { useEffect, useMemo, useState } from "react";
import { Routes, Route, Link, useNavigate, useParams, useLocation } from "react-router-dom";
import { supabase } from "./lib/supabase";
import "./styles.css";

/* -------------------- Helpers -------------------- */

function uniqBy(arr, keyFn) {
  const m = new Map();
  for (const x of arr || []) {
    const k = keyFn(x);
    if (!m.has(k)) m.set(k, x);
  }
  return Array.from(m.values());
}

function fmtDate(d) {
  try {
    return new Date(d).toLocaleDateString();
  } catch {
    return "";
  }
}

function useQuery() {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
}

function subjectOf(course) {
  return (course?.subject || course?.category || "General").toString().trim() || "General";
}

// Deterministic “thumbnail” gradient per course title/id (no extra DB fields needed)
function thumbStyle(seed) {
  let h = 0;
  const s = (seed || "course").toString();
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return {
    background: `linear-gradient(135deg, hsla(${h}, 90%, 65%, .95), hsla(${(h + 45) % 360}, 90%, 60%, .95))`,
  };
}

const SUBJECT_ICONS = {
  Mathematics: "∑",
  Science: "⚗",
  "Computer Science": "⌘",
  Engineering: "⚙",
  "Data & AI": "🧠",
  Cybersecurity: "🛡",
  Business: "📈",
  Finance: "💷",
  Economics: "🏦",
  "English & Writing": "✍",
  History: "🏛",
  Geography: "🗺",
  Languages: "🌍",
  "Arts & Design": "🎨",
  Music: "🎵",
  "Health & Wellness": "💪",
  Psychology: "🧩",
  Law: "⚖",
  Medicine: "🩺",
  Education: "🎓",
  Marketing: "📣",
  "Career Skills": "🧰",
  "Exam Prep": "📝",
  General: "📚",
};

async function fetchCourses(limit = 5000) {
  const { data, error } = await supabase
    .from("courses")
    .select("id,title,description,subject,category,created_at")
    .limit(limit);

  if (error) throw error;
  return uniqBy(data || [], (c) => c.id || `t:${c.title}`);
}

/* -------------------- App -------------------- */

function App() {
  const [session, setSession] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, sess) => setSession(sess));
    return () => sub.subscription.unsubscribe();
  }, []);

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

/* -------------------- Enrollments + Progress -------------------- */

function useEnrollments(session) {
  const [enrollments, setEnrollments] = useState([]);

  useEffect(() => {
    if (!session?.user?.id) return void setEnrollments([]);
    (async () => {
      const { data } = await supabase
        .from("enrollments")
        .select("course_id,is_paid,payment_status,created_at")
        .eq("user_id", session.user.id);
      setEnrollments(data || []);
    })();
  }, [session?.user?.id]);

  const enrollMap = useMemo(() => {
    const m = new Map();
    for (const e of enrollments) m.set(e.course_id, e);
    return m;
  }, [enrollments]);

  return { enrollments, enrollMap };
}

// Pull progress % if your progress table exists + RLS allows it.
// Safe fallback: 0% if anything fails.
function useProgress(session) {
  const [progressMap, setProgressMap] = useState(new Map());

  useEffect(() => {
    if (!session?.user?.id) return void setProgressMap(new Map());
    (async () => {
      try {
        const { data, error } = await supabase
          .from("progress")
          .select("course_id,percent_complete,updated_at")
          .eq("user_id", session.user.id);

        if (error) throw error;

        const m = new Map();
        for (const p of data || []) {
          const pct = Math.max(0, Math.min(100, Number(p.percent_complete ?? 0)));
          m.set(p.course_id, { pct, updated_at: p.updated_at });
        }
        setProgressMap(m);
      } catch {
        setProgressMap(new Map());
      }
    })();
  }, [session?.user?.id]);

  return progressMap;
}

/* -------------------- Master Portal (extended) -------------------- */

function MasterPortal({ session }) {
  const nav = useNavigate();
  const { enrollments } = useEnrollments(session);
  const progressMap = useProgress(session);

  const [courses, setCourses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        setErr("");
        const list = await fetchCourses(5000);
        setCourses(list);

        const subs = uniqBy(
          list.map((c) => subjectOf(c)).filter(Boolean),
          (s) => s.toLowerCase()
        ).sort((a, b) => a.localeCompare(b));

        setSubjects(subs);
      } catch (e) {
        setErr(e.message || "Failed to load portal");
      }
    })();
  }, []);

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
          <h1 className="portalTitle">Everything you need, in one place</h1>
          <p className="muted">
            Subjects and courses load from your database. Paid courses unlock lessons automatically.
          </p>

          <div className="portalMeta">
            {session ? (
              <span className="pill ok">Signed in: {session.user.email}</span>
            ) : (
              <span className="pill warn">Sign in to see paid courses</span>
            )}
            <span className="pill">Database-driven</span>
            <span className="pill">Secure payments</span>
            <span className="pill">Progress tracking</span>
          </div>

          <div className="portalActions">
            <button className="cta" onClick={() => nav("/subjects")}>Browse Subjects</button>
            <button className="btn" onClick={() => nav("/courses")}>Browse Courses</button>
          </div>
        </div>

        <div className="portalHeroRight">
          <div className="heroCard">
            <div className="heroCardTitle">Quick Start</div>
            <ol className="heroSteps">
              <li>Open a Subject</li>
              <li>Select a Course</li>
              <li>Enroll & Pay</li>
              <li>Continue lessons</li>
            </ol>
            <div className="heroTip">
              Tip: Paid courses will appear below automatically.
            </div>
          </div>
        </div>
      </div>

      {err && <div className="notice error">{err}</div>}

      {/* SUBJECTS GRID (cards with icons) */}
      <div className="sectionRow">
        <h2>Subjects</h2>
        <div className="muted">Click a subject to view courses</div>
      </div>

      <div className="subjectGrid">
        {subjects.map((s) => {
          const icon = SUBJECT_ICONS[s] || SUBJECT_ICONS.General;
          const count = courses.filter((c) => subjectOf(c) === s).length;
          return (
            <Link key={s} to={`/subjects/${encodeURIComponent(s)}`} className="subjectCard">
              <div className="subjectIcon">{icon}</div>
              <div className="subjectInfo">
                <div className="subjectTitle">{s}</div>
                <div className="muted">{count} courses</div>
              </div>
              <div className="subjectArrow">→</div>
            </Link>
          );
        })}
        {subjects.length === 0 && <div className="notice">No subjects found yet.</div>}
      </div>

      {/* PAID COURSES TABLE (with progress) */}
      <div className="tableCard">
        <div className="tableTitleRow">
          <h2>Paid Courses</h2>
          <div className="muted">Continue where you left off</div>
        </div>

        {!session && <div className="notice">Sign in to view your paid courses.</div>}

        {session && (
          <div className="tableWrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Course</th>
                  <th>Subject</th>
                  <th>Progress</th>
                  <th>Last updated</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {paidCourses.map((c) => {
                  const p = progressMap.get(c.id);
                  const pct = p?.pct ?? 0;
                  return (
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
                      <td>
                        <div className="progressWrap">
                          <div className="progressBar">
                            <div className="progressFill" style={{ width: `${pct}%` }} />
                          </div>
                          <div className="muted">{pct}%</div>
                        </div>
                      </td>
                      <td className="muted">{p?.updated_at ? fmtDate(p.updated_at) : "-"}</td>
                      <td className="tdRight">
                        <Link className="linkBtn" to={`/courses/${c.id}`}>Continue →</Link>
                      </td>
                    </tr>
                  );
                })}
                {paidCourses.length === 0 && (
                  <tr>
                    <td colSpan={5} className="muted">
                      No paid courses yet. Go to Courses → open a course → Enroll & Pay.
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

/* -------------------- Subjects Page -------------------- */

function SubjectsPage() {
  const [courses, setCourses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        setErr("");
        const list = await fetchCourses(5000);
        setCourses(list);

        const subs = uniqBy(list.map((c) => subjectOf(c)), (s) => s.toLowerCase())
          .sort((a, b) => a.localeCompare(b));

        setSubjects(subs);
      } catch (e) {
        setErr(e.message || "Failed to load subjects");
      }
    })();
  }, []);

  return (
    <section>
      <div className="pageHead">
        <h2>Subjects</h2>
        <div className="muted">Database-driven subjects</div>
      </div>

      {err && <div className="notice error">{err}</div>}

      <div className="subjectGrid">
        {subjects.map((s) => {
          const icon = SUBJECT_ICONS[s] || SUBJECT_ICONS.General;
          const count = courses.filter((c) => subjectOf(c) === s).length;
          return (
            <Link key={s} to={`/subjects/${encodeURIComponent(s)}`} className="subjectCard">
              <div className="subjectIcon">{icon}</div>
              <div className="subjectInfo">
                <div className="subjectTitle">{s}</div>
                <div className="muted">{count} courses</div>
              </div>
              <div className="subjectArrow">→</div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

/* -------------------- Subject -> Courses -------------------- */

function SubjectCourses({ session }) {
  const { subject } = useParams();
  const { enrollMap } = useEnrollments(session);

  const [courses, setCourses] = useState([]);
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");

  const subj = decodeURIComponent(subject || "");

  useEffect(() => {
    (async () => {
      try {
        setErr("");
        const list = await fetchCourses(5000);
        setCourses(list.filter((c) => subjectOf(c) === subj));
      } catch (e) {
        setErr(e.message || "Failed to load courses");
      }
    })();
  }, [subj]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return courses;
    return courses.filter(
      (c) => (c.title || "").toLowerCase().includes(s) || (c.description || "").toLowerCase().includes(s)
    );
  }, [q, courses]);

  return (
    <section>
      <div className="pageHead">
        <h2>{subj}</h2>
        <input className="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search in this subject…" />
      </div>

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
        {filtered.length === 0 && <div className="notice">No courses found.</div>}
      </div>
    </section>
  );
}

/* -------------------- Courses Page -------------------- */

function CoursesPage({ session }) {
  const { enrollMap } = useEnrollments(session);

  const [courses, setCourses] = useState([]);
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        setErr("");
        setCourses(await fetchCourses(5000));
      } catch (e) {
        setErr(e.message || "Failed to load courses");
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return courses;
    return courses.filter((c) => {
      const text = `${c.title} ${c.description} ${subjectOf(c)}`.toLowerCase();
      return text.includes(s);
    });
  }, [q, courses]);

  return (
    <section>
      <div className="pageHead">
        <h2>All Courses</h2>
        <input className="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search courses…" />
      </div>

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

/* -------------------- Course Detail + Lessons + Payment -------------------- */

function CourseDetail({ session }) {
  const { id } = useParams();
  const nav = useNavigate();
  const query = useQuery();

  const { enrollMap } = useEnrollments(session);

  const [course, setCourse] = useState(null);
  const [lessons, setLessons] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);

  const enrollment = enrollMap.get(id);
  const isPaid = enrollment?.is_paid === true || enrollment?.payment_status === "paid";

  useEffect(() => {
    (async () => {
      setErr("");
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
        .limit(250);

      if (error) setErr(error.message);
      setLessons(data || []);
    })();
  }, [id, isPaid]);

  async function startPayment() {
    if (!session) {
      nav("/login");
      return;
    }

    setBusy(true);
    setErr("");

    try {
      const { data: refreshed, error: refreshErr } = await supabase.auth.refreshSession();
      if (refreshErr) throw refreshErr;

      const token = refreshed?.session?.access_token;
      if (!token) throw new Error("Session expired. Please sign out and sign in again.");

      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: { course_id: id },
        headers: { Authorization: `Bearer ${token}` },
      });

      if (error) {
        const bodyText =
          typeof error?.context?.body === "string"
            ? error.context.body
            : await new Response(error?.context?.body).text().catch(() => "");
        throw new Error(bodyText || error.message);
      }

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

            {query.get("paid") === "1" && (
              <div className="notice">Payment success. If lessons don’t unlock immediately, refresh.</div>
            )}
            {query.get("canceled") === "1" && (
              <div className="notice">Payment canceled.</div>
            )}
          </div>
        </div>

        <div className="courseActions">
          <button className="btn" onClick={() => setHelpOpen((v) => !v)}>
            {helpOpen ? "Hide Help" : "Help"}
          </button>

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

      {helpOpen && (
        <div className="helpPanel">
          <div className="helpTitle">Student Help</div>
          <ul>
            <li>After paying, return here and refresh.</li>
            <li>If lessons remain locked, sign out/in then refresh.</li>
            <li>Lessons are protected by database security.</li>
          </ul>
        </div>
      )}

      <div className="tableCard">
        <div className="tableTitleRow">
          <h2>Lessons</h2>
          <div className="muted">{isPaid ? "Unlocked" : "Locked until you enroll & pay"}</div>
        </div>

        {!isPaid && (
          <div className="notice">
            Lessons are locked until you enroll & pay (enforced by database policies).
          </div>
        )}

        <div className="tableWrap">
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Lesson</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {lessons.map((l) => (
                <tr key={l.id}>
                  <td className="muted">{l.lesson_number ?? "-"}</td>
                  <td className="tdStrong">{l.title}</td>
                  <td className="muted">{fmtDate(l.created_at)}</td>
                </tr>
              ))}
              {lessons.length === 0 && (
                <tr>
                  <td colSpan={3} className="muted">
                    {isPaid ? "No lessons found." : "Locked."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

export default App;
