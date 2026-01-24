/* FILE: src/App.jsx */
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";

function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  return (
    <div style={{ minHeight: "100vh", background: "#070A12", color: "#fff", fontFamily: "ui-sans-serif,system-ui" }}>
      <div style={{ maxWidth: 520, margin: "0 auto", padding: "64px 16px" }}>
        <div style={card}>
          <div style={{ fontWeight: 950, fontSize: 26, letterSpacing: -0.6 }}>Sign in</div>
          <div style={{ opacity: 0.7, marginTop: 6 }}>AtoZlearn-go</div>

          <div style={{ marginTop: 18, display: "grid", gap: 10 }}>
            <input style={inp} placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <input style={inp} placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            {err ? <div style={errBox}>{err}</div> : null}
            <button
              style={btnPrimary}
              disabled={loading}
              onClick={async () => {
                setErr(""); setLoading(true);
                try {
                  const { error } = await supabase.auth.signInWithPassword({ email, password });
                  if (error) throw error;
                  nav("/portal", { replace: true });
                } catch (e) {
                  setErr(e?.message ?? String(e));
                } finally {
                  setLoading(false);
                }
              }}
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MasterPortal() {
  const nav = useNavigate();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [home, setHome] = useState(null);
  const [subjects, setSubjects] = useState([]);
  const [paid, setPaid] = useState([]);

  useEffect(() => {
    (async () => {
      setErr(""); setLoading(true);
      try {
        const { data: h, error: he } = await supabase.from("v_portal_home").select("*").single();
        if (he) throw he;
        setHome(h);

        const { data: s, error: se } = await supabase
          .from("v_subjects")
          .select("subject,courses")
          .order("courses", { ascending: false })
          .limit(24);
        if (se) throw se;
        setSubjects(s || []);

        const { data: p, error: pe } = await supabase
          .from("v_paid_courses")
          .select("id,title,description,subject,price,created_at")
          .order("created_at", { ascending: false })
          .limit(30);
        if (pe) throw pe;
        setPaid(p || []);
      } catch (e) {
        setErr(e?.message ?? String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "#070A12", color: "#fff", fontFamily: "ui-sans-serif,system-ui" }}>
      <div style={glowA} />
      <div style={glowB} />

      <div style={topbar}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, display: "grid", placeItems: "center", background: "rgba(99,102,241,.18)", border: "1px solid rgba(255,255,255,.08)", fontWeight: 950 }}>A</div>
            <div>
              <div style={{ fontWeight: 950, letterSpacing: -0.2 }}>AtoZlearn-go</div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>Professional Master Portal</div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button style={btnGhost} onClick={() => location.reload()} disabled={loading}>Reload</button>
            <button
              style={btnGhost}
              onClick={async () => { await supabase.auth.signOut(); nav("/login", { replace: true }); }}
            >
              Sign out
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 16px" }}>
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 40, fontWeight: 950, letterSpacing: -1 }}>Learn anything, from A to Z</div>
              <div style={{ marginTop: 6, opacity: 0.72 }}>
                Live from views: <b>v_portal_home</b>, <b>v_subjects</b>, <b>v_paid_courses</b>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <span style={chip}>Active courses: {loading ? "…" : (home?.active_courses ?? 0)}</span>
              <span style={chip}>Subjects: {loading ? "…" : (home?.subjects ?? 0)}</span>
              <span style={chip}>Paid courses: {loading ? "…" : (home?.paid_courses ?? 0)}</span>
            </div>
          </div>

          {err ? <div style={errBox}>{err}</div> : null}

          <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button style={btnPrimary} onClick={() => document.getElementById("subjects")?.scrollIntoView({ behavior: "smooth" })}>Browse Subjects</button>
            <button style={btnGhost} onClick={() => document.getElementById("paid")?.scrollIntoView({ behavior: "smooth" })}>Paid Courses</button>
          </div>
        </div>

        <div id="subjects" style={{ marginTop: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
            <div style={{ fontWeight: 950, fontSize: 20, letterSpacing: -0.4 }}>Subjects</div>
            <div style={{ opacity: 0.65, fontSize: 13 }}>Top subjects from v_subjects</div>
          </div>

          <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 12 }}>
            {(subjects || []).map((s) => (
              <div key={s.subject} style={tile} onClick={() => nav(`/subjects/${encodeURIComponent(s.subject)}`)}>
                <div style={{ fontWeight: 950 }}>{s.subject}</div>
                <div style={{ opacity: 0.7, fontSize: 13 }}>{s.courses} courses</div>
              </div>
            ))}
            {!loading && (subjects?.length || 0) === 0 ? <div style={{ opacity: 0.7 }}>No subjects found.</div> : null}
          </div>
        </div>

        <div id="paid" style={{ marginTop: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
            <div style={{ fontWeight: 950, fontSize: 20, letterSpacing: -0.4 }}>Paid Courses</div>
            <div style={{ opacity: 0.65, fontSize: 13 }}>Latest from v_paid_courses</div>
          </div>

          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            {(paid || []).map((c) => (
              <div key={c.id} style={row}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 950, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {c.title || "Untitled course"}
                  </div>
                  <div style={{ opacity: 0.7, fontSize: 13, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                    {c.description || "A structured learning path with lessons, practice, and progress tracking."}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <span style={chip}>{c.subject || "General"}</span>
                  <button style={btnGhost} onClick={() => nav(`/courses/${c.id}`)}>Open →</button>
                </div>
              </div>
            ))}
            {!loading && (paid?.length || 0) === 0 ? <div style={{ opacity: 0.7 }}>No paid courses found.</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/portal" element={<MasterPortal />} />
        <Route path="/" element={<Navigate to="/portal" replace />} />
        <Route path="*" element={<Navigate to="/portal" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

const card = { border: "1px solid rgba(255,255,255,.08)", background: "rgba(255,255,255,.04)", borderRadius: 18, padding: 18, boxShadow: "0 20px 60px rgba(0,0,0,.55)" };
const chip = { display: "inline-flex", gap: 8, alignItems: "center", padding: "6px 10px", borderRadius: 999, border: "1px solid rgba(255,255,255,.10)", background: "rgba(255,255,255,.05)", fontSize: 12, opacity: 0.92 };
const btnPrimary = { padding: "10px 14px", borderRadius: 12, border: "1px solid rgba(99,102,241,.35)", background: "rgba(99,102,241,.92)", color: "#fff", fontWeight: 950, cursor: "pointer" };
const btnGhost = { padding: "10px 14px", borderRadius: 12, border: "1px solid rgba(255,255,255,.10)", background: "rgba(255,255,255,.05)", color: "#fff", fontWeight: 900, cursor: "pointer" };
const inp = { width: "100%", padding: "12px 12px", borderRadius: 12, border: "1px solid rgba(255,255,255,.10)", background: "rgba(255,255,255,.05)", color: "#fff", outline: "none" };
const tile = { cursor: "pointer", padding: 14, borderRadius: 16, border: "1px solid rgba(255,255,255,.08)", background: "rgba(255,255,255,.03)" };
const row = { display: "flex", justifyContent: "space-between", gap: 14, alignItems: "center", padding: 14, borderRadius: 16, border: "1px solid rgba(255,255,255,.08)", background: "rgba(255,255,255,.03)" };
const errBox = { marginTop: 14, padding: "10px 12px", borderRadius: 12, background: "rgba(244,63,94,.12)", border: "1px solid rgba(244,63,94,.25)" };
const topbar = { position: "sticky", top: 0, backdropFilter: "blur(12px)", background: "rgba(7,10,18,.75)", borderBottom: "1px solid rgba(255,255,255,.08)", zIndex: 20 };
const glowA = { position: "fixed", inset: 0, zIndex: -1, pointerEvents: "none", background: "radial-gradient(900px 420px at 50% -10%, rgba(99,102,241,.18), transparent 60%)" };
const glowB = { position: "fixed", inset: 0, zIndex: -1, pointerEvents: "none", background: "radial-gradient(520px 520px at 105% 25%, rgba(14,165,233,.10), transparent 60%)" };
