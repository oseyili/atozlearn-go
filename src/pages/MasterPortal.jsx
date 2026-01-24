import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export default function MasterPortal() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [home, setHome] = useState({ active_courses: 0, subjects: 0, paid_courses: 0, default_route: "/portal" });
  const [subjects, setSubjects] = useState([]);
  const [paid, setPaid] = useState([]);

  useEffect(() => { (async () => {
    setErr(""); setLoading(true);
    try {
      const { data: h, error: he } = await supabase.from("v_portal_home").select("*").single();
      if (he) throw he;
      setHome(h);

      const { data: s, error: se } = await supabase.from("v_subjects").select("subject,courses").order("courses",{ascending:false}).limit(24);
      if (se) throw se;
      setSubjects(s || []);

      const { data: p, error: pe } = await supabase.from("v_paid_courses").select("id,title,description,subject,price,created_at").order("created_at",{ascending:false}).limit(30);
      if (pe) throw pe;
      setPaid(p || []);
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  })(); }, []);

  return (
    <div style={{ minHeight:"100vh", background:"#070A12", color:"#fff", fontFamily:"ui-sans-serif,system-ui" }}>
      <div style={{ maxWidth:1100, margin:"0 auto", padding:"28px 16px" }}>
        <div style={{ border:"1px solid rgba(255,255,255,.08)", background:"rgba(255,255,255,.04)", borderRadius:18, padding:18 }}>
          <div style={{ fontSize:36, fontWeight:950 }}>Master Portal</div>
          <div style={{ opacity:.72, marginTop:6 }}>Source: v_portal_home / v_subjects / v_paid_courses</div>
          <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginTop:12 }}>
            <span style={chip}>Courses: {loading ? "…" : home.active_courses}</span>
            <span style={chip}>Subjects: {loading ? "…" : home.subjects}</span>
            <span style={chip}>Paid: {loading ? "…" : home.paid_courses}</span>
          </div>
          {err ? <div style={{ marginTop:12, padding:"10px 12px", borderRadius:12, background:"rgba(244,63,94,.12)", border:"1px solid rgba(244,63,94,.25)" }}>{err}</div> : null}
        </div>

        <div style={{ marginTop:18, display:"grid", gap:18 }}>
          <div style={{ border:"1px solid rgba(255,255,255,.08)", background:"rgba(255,255,255,.03)", borderRadius:18, padding:18 }}>
            <div style={{ fontWeight:950, fontSize:18, marginBottom:10 }}>Subjects</div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))", gap:12 }}>
              {(subjects||[]).map(s => (
                <div key={s.subject} style={tile}>
                  <div style={{ fontWeight:950 }}>{s.subject}</div>
                  <div style={{ opacity:.7, fontSize:13 }}>{s.courses} courses</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ border:"1px solid rgba(255,255,255,.08)", background:"rgba(255,255,255,.03)", borderRadius:18, padding:18 }}>
            <div style={{ fontWeight:950, fontSize:18, marginBottom:10 }}>Paid Courses</div>
            <div style={{ display:"grid", gap:10 }}>
              {(paid||[]).map(c => (
                <div key={c.id} style={row}>
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontWeight:950, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{c.title || "Untitled course"}</div>
                    <div style={{ opacity:.7, fontSize:13, display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical", overflow:"hidden" }}>{c.description || ""}</div>
                  </div>
                  <span style={chip}>{c.subject || "General"}</span>
                </div>
              ))}
              {!loading && (paid?.length||0)===0 ? <div style={{ opacity:.7 }}>No paid courses returned.</div> : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const chip={display:"inline-flex",padding:"6px 10px",borderRadius:999,border:"1px solid rgba(255,255,255,.10)",background:"rgba(255,255,255,.05)",fontSize:12,opacity:.92};
const tile={padding:14,borderRadius:16,border:"1px solid rgba(255,255,255,.08)",background:"rgba(255,255,255,.03)"};
const row={display:"flex",justifyContent:"space-between",gap:14,alignItems:"center",padding:14,borderRadius:16,border:"1px solid rgba(255,255,255,.08)",background:"rgba(255,255,255,.03)"};
