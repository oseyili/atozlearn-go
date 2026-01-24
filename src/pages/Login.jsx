import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  return (
    <div style={{ minHeight:"100vh", background:"#070A12", color:"#fff", fontFamily:"ui-sans-serif,system-ui" }}>
      <div style={{ maxWidth:520, margin:"0 auto", padding:"64px 16px" }}>
        <div style={{ border:"1px solid rgba(255,255,255,.08)", background:"rgba(255,255,255,.04)", borderRadius:18, padding:18, boxShadow:"0 20px 60px rgba(0,0,0,.55)" }}>
          <div style={{ fontWeight:950, fontSize:26, letterSpacing:-.6 }}>Sign in</div>
          <div style={{ opacity:.7, marginTop:6 }}>AtoZlearn-go</div>

          <div style={{ marginTop:18, display:"grid", gap:10 }}>
            <input style={inp} placeholder="Email" value={email} onChange={(e)=>setEmail(e.target.value)} />
            <input style={inp} placeholder="Password" type="password" value={password} onChange={(e)=>setPassword(e.target.value)} />
            {err ? <div style={errBox}>{err}</div> : null}

            <button
              style={btnPrimary}
              disabled={loading}
              onClick={async ()=>{
                setErr(""); setLoading(true);
                try {
                  const { error } = await supabase.auth.signInWithPassword({ email, password });
                  if (error) throw error;
                  nav("/portal", { replace:true });
                } catch (e) {
                  setErr(e?.message ?? String(e));
                } finally {
                  setLoading(false);
                }
              }}
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>

            <button
              style={btnGhost}
              onClick={() => nav("/portal", { replace:true })}
              title="Portal reads public views; sign-in optional"
            >
              Continue without signing in
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const btnPrimary = { padding:"10px 14px", borderRadius:12, border:"1px solid rgba(99,102,241,.35)", background:"rgba(99,102,241,.92)", color:"#fff", fontWeight:950, cursor:"pointer" };
const btnGhost = { padding:"10px 14px", borderRadius:12, border:"1px solid rgba(255,255,255,.10)", background:"rgba(255,255,255,.05)", color:"#fff", fontWeight:900, cursor:"pointer" };
const inp = { width:"100%", padding:"12px 12px", borderRadius:12, border:"1px solid rgba(255,255,255,.10)", background:"rgba(255,255,255,.05)", color:"#fff", outline:"none" };
const errBox = { marginTop:6, padding:"10px 12px", borderRadius:12, background:"rgba(244,63,94,.12)", border:"1px solid rgba(244,63,94,.25)" };
