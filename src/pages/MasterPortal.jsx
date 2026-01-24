import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function MasterPortal() {
  const nav = useNavigate();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [home, setHome] = useState({ active_courses: 0, subjects: 0, paid_courses: 0, default_route: "/portal" });
  const [subjects, setSubjects] = useState([]);
  const [paid, setPaid] = useState([]);
  const [email, setEmail] = useState("");

  const load = async () => {
    setErr(""); setLoading(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      setEmail(u?.user?.email ?? "");

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
  };

  useEffect(() => { load(); }, []);

  return (
    <div style={{ minHeight:"100vh", background:"#070A12", color:"#fff", fontFamily:"ui-sans-serif,system-ui" }}>
      <div style={{ position:"fixed", inset:0, zIndex:-1, pointerEvents:"none",
        background:"radial-gradient(900px 420px at 50% -10%, rgba(99,102,241,.18), transparent 60%),radial-gradient(520px 520px at 105% 25%, rgba(14,165,233,.10), transparent 60%)" }} />

      <div style={{ position:"sticky", top:0, zIndex:20, backdropFilter:"blur(12px)", background:"rgba(7,10,18,.75)", borderBottom:"1px solid rgba(255,255,255,.08)" }}>
        <div style={{ maxWidth:1100, margin:"0 auto", padding:"14px 16px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div style={{ display:"flex", gap:10, alignItems:"center" }}>
            <div style={{ width:40, height:40, borderRadius:12, display:"grid", placeItems:"center", background:"rgba(99,102,241,.18)", border:"1px solid rgba(255,255,255,.08)", fontWeight:950 }}>A</div>
            <div>
              <div style={{ fontWeight:950, letterSpacing:-.2 }}>AtoZlearn-go</div>
              <div style={{ fontSize:12, opacity:.7 }}>Professional Master Portal</div>
            </div>
          </div>

          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            <div style={{ fontSize:12, opacity:.7 }}>{email ? ("Signed in: " + email) : "Not signed in"}</div>
            <button style={btnGhost} onClick={load} disabled={loading}>Reload</button>
            <button style={btnGhost} onClick={() => nav("/login", { replace:true })}>Sign in</button>
            <button style={btnGhost} onClick={async()=>{ await supabase.auth.signOut(); setEmail(""); }}>Sign out</button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth:1100, margin:"0 auto", padding:"28px 16px" }}>
        <div style={card}>
          <div style={{ display:"flex", justifyContent:"space-between", gap:16, flexWrap:"wrap", alignItems:"center" }}>
            <div>
              <div style={{ fontSize:38, fontWeight:950, letterSpacing:-1 }}>Master Portal</div>
              <div style={{ marginTop:6, opacity:.72 }}>Counts come from DB views only.</div>
              <div style={{ marginTop:6, opacity:.72 }}><b>BUILD:</b> UI_PRO_2026-01-24_20-25-09</div>
            </div>

            <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
              <span style={chip}>Courses {loading ? "…" : home.active_courses}</span>
              <span style={chip}>Subjects {loading ? "…" : home.subjects}</span>
              <span style={chip}>Paid {loading ? "…" : home.paid_courses}</span>
            </div>
          </div>

          {err ? <div style={errBox}>{err}</div> : null}

          <div style={{ marginTop:14, display:"flex", gap:10, flexWrap:"wrap" }}>
            <button style={btnPrimary} onClick={() => document.getElementById("subjects")?.scrollIntoView({ behavior:"smooth" })}>Browse Subjects</button>
            <button style={btnGhost} onClick={() => document.getElementById("paid")?.scrollIntoView({ behavior:"smooth" })}>Paid Courses</button>
          </div>
        </div>

        <div id="subjects" style={{ marginTop:18 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", gap:12, flexWrap:"wrap" }}>
            <div style={{ fontWeight:950, fontSize:20, letterSpacing:-.4 }}>Subjects</div>
            <div style={{ opacity:.65, fontSize:13 }}>Top subjects from v_subjects</div>
          </div>

          <div style={{ marginTop:12, display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))", gap:12 }}>
            {(subjects || []).map((s) => (
              <div key={s.subject} style={tile} onClick={() => nav(/subjects/)}>
                <div style={{ fontWeight:950 }}>{s.subject}</div>
                <div style={{ opacity:.7, fontSize:13 }}>{s.courses} courses</div>
              </div>
            ))}
          </div>
        </div>

        <div id="paid" style={{ marginTop:18 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", gap:12, flexWrap:"wrap" }}>
            <div style={{ fontWeight:950, fontSize:20, letterSpacing:-.4 }}>Paid Courses</div>
            <div style={{ opacity:.65, fontSize:13 }}>Latest from v_paid_courses</div>
          </div>

          <div style={{ marginTop:12, display:"grid", gap:10 }}>
            {(paid || []).map((c) => (
              <div key={c.id} style={row}>
                <div style={{ minWidth:0 }}>
                  <div style={{ fontWeight:950, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                    {c.title || "Untitled course"}
                  </div>
                  <div style={{ opacity:.7, fontSize:13, display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical", overflow:"hidden" }}>
                    {c.description || ""}
                  </div>
                </div>

                <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                  <span style={chip}>{c.subject || "General"}</span>
                  <button style={btnGhost} onClick={() => nav(/courses/)}>Open →</button>
                </div>
              </div>
            ))}

            {!loading && (paid?.length || 0) === 0 ? (
              <div style={{ opacity:.7 }}>No paid courses returned by v_paid_courses.</div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

const card = { border:"1px solid rgba(255,255,255,.08)", background:"rgba(255,255,255,.04)", borderRadius:18, padding:18, boxShadow:"0 20px 60px rgba(0,0,0,.55)" };
const chip = { display:"inline-flex", gap:8, alignItems:"center", padding:"6px 10px", borderRadius:999, border:"1px solid rgba(255,255,255,.10)", background:"rgba(255,255,255,.05)", fontSize:12, opacity:.92 };
const btnPrimary = { padding:"10px 14px", borderRadius:12, border:"1px solid rgba(99,102,241,.35)", background:"rgba(99,102,241,.92)", color:"#fff", fontWeight:950, cursor:"pointer" };
const btnGhost = { padding:"10px 14px", borderRadius:12, border:"1px solid rgba(255,255,255,.10)", background:"rgba(255,255,255,.05)", color:"#fff", fontWeight:900, cursor:"pointer" };
const tile = { cursor:"pointer", padding:14, borderRadius:16, border:"1px solid rgba(255,255,255,.08)", background:"rgba(255,255,255,.03)" };
const row = { display:"flex", justifyContent:"space-between", gap:14, alignItems:"center", padding:14, borderRadius:16, border:"1px solid rgba(255,255,255,.08)", background:"rgba(255,255,255,.03)" };
const errBox = { marginTop:14, padding:"10px 12px", borderRadius:12, background:"rgba(244,63,94,.12)", border:"1px solid rgba(244,63,94,.25)" };
