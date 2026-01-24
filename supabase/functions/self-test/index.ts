import Stripe from "https://esm.sh/stripe@14?target=denonext";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
Deno.serve(async () => {
  const r:any={ok:true,time:new Date().toISOString(),checks:{}};
  try{new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!);r.checks.stripe="ok"}catch(e){r.ok=false;r.checks.stripe=e.message}
  try{
    const s=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_ANON_KEY")!);
    for(const t of ["courses","subjects","enrollments"]){
      const {error}=await s.from(t).select("*").limit(1);
      if(error)throw error;
    }
    r.checks.db="ok"
  }catch(e){r.ok=false;r.checks.db=e.message}
  return new Response(JSON.stringify(r,null,2),{headers:{'content-type':'application/json'}});
});
