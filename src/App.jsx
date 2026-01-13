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

          <Route path="/subjects" element={<SubjectsPage session={session} />} />
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

/* -------------------- Data hooks -------------------- */

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

  const map = useMemo(() => {
    const m = new Map();
    for (const e of enrollments) m.set(e.course_id, e);
    return m;
  }, [enrollments]);

  return { enrollments, enrollMap: map, enrollErr: err };
}

async function fetchCourses(limit = 5000) {
  const { data, error } = await supabase
    .from("courses")
    .select("id,title,description,subject,category,created_at")
    .limit(limit);

  if (error) throw error;

  // Dedupe safely (some seeds duplicate)
  const cleaned = uniqBy(data || [], (c) => c.id || `t:${c.title}`);
  return cleaned;
}

/* -------------------- Master Portal -------------------- */

function MasterPortal({ session }) {
  const nav = useNavigate();
  const { enrollments, enrollMap } = useEnrollments(session);

  const [courses, setCourses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        setErr("");
        const list = await fetchCourses(5000);
        setCourses(list);

        // Build subject list from DB (fallback fields: subject or category)
        const subs = uniqBy(
          list
            .map((c) => (c.subject || c.category || "General").toString().trim())
            .filter(Boolean),
          (s) => s.toLowerCase()
        ).sort((a, b) => a.localeCompare(b));

        setSubjects(subs);
      } catch (e) {
        setErr(e.message || "Failed to load portal data");
      }
    })();
  }, []);

  const paidCourses = useMemo(() => {
    if (!session?.user?.id) return [];
    const paidIds = new Set(
      enrollments
        .filter((e) => e.is_paid === true || e.payment_status === "paid")
        .map((e) => e.course_id)
    );
    return courses.filter((c) => paidIds.has(c.id));
  }, [courses, enrollments, session?.user?.id]);

  return (
    <section>
      <div className="portalHeader">
        <div>
          <h1 className="portalTitle">Master Portal</h1>
          <p className="muted">
            Subjects and courses are linked to your database. Paid courses appear automatically.
          </p>
          {session ? (
            <div className="pill ok">Signed in: {session.user.email}</div>
          ) : (
            <div className="pill warn">Sign in to see your paid courses</div>
          )}
        </div>

        <div className="portalActions">
          <button className="btn" onClick={() => nav("/subjects")}>Browse Subjects</button>
          <button className="cta" onClick={() => nav("/courses")}>Browse Courses</button>
        </div>
      </div>

      {err && <div className="notice error">{err}</div>}

      {/* TABLE 1: SUBJECTS */}
      <div className="tableCard">
        <div className="tableTitleRow">
          <h2>Subjects</h2>
          <div className="muted">Click a subject to view its courses</div>
        </div>

        <div className="tableWrap">
          <table className="table">
            <thead>
              <tr>
                <th>Subject</th>
                <th>Courses</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {subjects.map((s) => {
                const count = courses.filter(
                  (c) => (c.subject || c.category || "General").toString().trim() === s
                ).length;

                return (
                  <tr key={s}>
                    <td className="tdStrong">{s}</td>
                    <td className="muted">{count}</td>
                    <td className="tdRight">
                      <Link className="linkBtn" to={`/subjects/${encodeURIComponent(s)}`}>
                        Open →
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {subjects.length === 0 && (
                <tr>
                  <td colSpan={3} className="muted">No subjects found yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* TABLE 2: PAID COURSES */}
      <div className="tableCard">
        <div className="tableTitleRow">
          <h2>Paid Courses</h2>
          <div className="muted">These are unlocked for you</div>
        </div>

        {!session && <div className="notice">Sign in to view your paid courses.</div>}

        {session && (
          <div className="tableWrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Course</th>
                  <th>Subject</th>
                  <th>Paid</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {paidCourses.map((c) => (
                  <tr key={c.id}>
                    <td className="tdStrong">{c.title}</td>
                    <td className="muted">{(c.subject || c.category || "General").toString()}</td>
                    <td>
                      <span className="status ok">PAID</span>
                    </td>
                    <td className="tdRight">
                      <Link className="linkBtn" to={`/courses/${c.id}`}>Open →</Link>
                    </td>
                  </tr>
                ))}
                {paidCourses.length === 0 && (
                  <tr>
                    <td colSpan={4} className="muted">
                      No paid courses yet. Go to Courses → open a course → Enroll & Pay.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Quick access */}
      <div className="quickRow">
        <div className="quickCard">
          <div className="quickTitle">All Courses</div>
          <div className="muted">Search and open any course</div>
          <Link className="cta" to="/courses">Open Courses</Link>
        </div>
        <div className="quickCard">
          <div className="quickTitle">Support</div>
          <div className="muted">Help is shown inside each course page</div>
          <Link className="btn" to="/courses">Go to a course</Link>
        </div>
      </div>
    </section>
  );
}

/* -------------------- Subjects page -------------------- */

function SubjectsPage({ session }) {
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
          list
            .map((c) => (c.subject || c.category || "General").toString().trim())
            .filter(Boolean),
          (s) => s.toLowerCase()
        ).sort((a, b) => a.localeCompare(b));

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

      <div className="tableCard">
        <div className="tableWrap">
          <table className="table">
            <thead>
              <tr>
                <th>Subject</th>
                <th>Courses</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {subjects.map((s) => {
                const count = courses.filter(
                  (c) => (c.subject || c.category || "General").toString().trim() === s
                ).length;

                return (
                  <tr key={s}>
                    <td className="tdStrong">{s}</td>
                    <td className="muted">{count}</td>
                    <td className="tdRight">
                      <Link className="linkBtn" to={`/subjects/${encodeURIComponent(s)}`}>Open →</Link>
                    </td>
                  </tr>
                );
              })}
              {subjects.length === 0 && (
                <tr>
                  <td colSpan={3} className="muted">No subjects found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {!session && <div className="notice">Sign in to see paid courses in the Portal.</div>}
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
        const filtered = list.filter(
          (c) => (c.subject || c.category || "General").toString().trim() === subj
        );
        setCourses(filtered);
      } catch (e) {
        setErr(e.message || "Failed to load subject courses");
      }
    })();
  }, [subj]);

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
        <h2>{subj}</h2>
        <input className="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search in this subject…" />
      </div>

      {err && <div className="notice error">{err}</div>}

      <div className="tableCard">
        <div className="tableWrap">
          <table className="table">
            <thead>
              <tr>
                <th>Course</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const e = enrollMap.get(c.id);
                const paid = e?.is_paid === true || e?.payment_status === "paid";
                const status = paid ? "PAID" : e ? "ENROLLED" : "LOCKED";

                return (
                  <tr key={c.id}>
                    <td>
                      <div className="tdStrong">{c.title}</div>
                      <div className="muted">{c.description}</div>
                    </td>
                    <td>
                      <span className={`status ${paid ? "ok" : e ? "warn" : "bad"}`}>{status}</span>
                    </td>
                    <td className="tdRight">
                      <Link className="linkBtn" to={`/courses/${c.id}`}>Open →</Link>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={3} className="muted">No courses found for this subject.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

/* -------------------- Courses page -------------------- */

function CoursesPage({ session }) {
  const { enrollMap } = useEnrollments(session);

  const [courses, setCourses] = useState([]);
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        setErr("");
        const list = await fetchCourses(5000);
        setCourses(list);
      } catch (e) {
        setErr(e.message || "Failed to load courses");
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return courses;
    return courses.filter(
      (c) =>
        (c.title || "").toLowerCase().includes(s) ||
        (c.description || "").toLowerCase().includes(s) ||
        (c.subject || c.category || "").toString().toLowerCase().includes(s)
    );
  }, [q, courses]);

  return (
    <section>
      <div className="pageHead">
        <h2>All Courses</h2>
        <input className="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search courses…" />
      </div>

      {err && <div className="notice error">{err}</div>}

      <div className="tableCard">
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
              {filtered.map((c) => {
                const e = enrollMap.get(c.id);
                const paid = e?.is_paid === true || e?.payment_status === "paid";
                const status = paid ? "PAID" : e ? "ENROLLED" : "LOCKED";

                return (
                  <tr key={c.id}>
                    <td>
                      <div className="tdStrong">{c.title}</div>
                      <div className="muted">{c.description}</div>
                    </td>
                    <td className="muted">{(c.subject || c.category || "General").toString()}</td>
                    <td>
                      <span className={`status ${paid ? "ok" : e ? "warn" : "bad"}`}>{status}</span>
                    </td>
                    <td className="tdRight">
                      <Link className="linkBtn" to={`/courses/${c.id}`}>Open →</Link>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="muted">No courses found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

/* -------------------- Course detail + Lessons -------------------- */

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

  // Load lessons (will return empty if RLS blocks)
  useEffect(() => {
    (async () => {
      setErr("");
      const { data, error } = await supabase
        .from("lessons")
        .select("id,title,lesson_number,created_at")
        .eq("course_id", id)
        .order("lesson_number", { ascending: true })
        .limit(200);

      // If blocked by RLS, Supabase often returns empty (not error).
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
      // Refresh token before Edge call (prevents expired JWT)
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
        <div>
          <h2>{course?.title || "Course"}</h2>
          <p className="muted">{course?.description || ""}</p>

          {query.get("paid") === "1" && (
            <div className="notice">Payment success. If lessons don’t unlock immediately, refresh.</div>
          )}
          {query.get("canceled") === "1" && (
            <div className="notice">Payment canceled.</div>
          )}
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
            <li>After paying, return to this course page and refresh.</li>
            <li>If lessons remain locked, sign out/in then refresh the course.</li>
            <li>Lessons are protected by database security.</li>
          </ul>
        </div>
      )}

      <div className="tableCard">
        <div className="tableTitleRow">
          <h2>Lessons</h2>
          <div className="muted">
            {isPaid ? "Unlocked" : "Locked until you enroll & pay"}
          </div>
        </div>

        {!isPaid && (
          <div className="notice">
            Lessons are locked until you enroll & pay (enforced by database policies).
          </div>
        )}

        {isPaid && lessons.length === 0 && (
          <div className="notice">No lessons found for this course.</div>
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
