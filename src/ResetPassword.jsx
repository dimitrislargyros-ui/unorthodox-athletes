import { useState, useEffect } from "react";

const LOGO_SRC = '/logo.png';

const C = {
  bg:"#0A0A0A", surface:"#161616", surface2:"#252525",
  cyan:"#00C9E1", pink:"#E8197A", white:"#FFFFFF",
  muted:"#666666", border:"#2A2A2A", green:"#22C55E", amber:"#F59E0B",
};

const SB_URL = "https://hxyqvryuniqmvpjljrry.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4eXF2cnl1bmlxbXZwamxqcnJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyOTQ0NTAsImV4cCI6MjA5Nzg3MDQ1MH0.eSoak4YVf7vqFwYlYebayMS3CCiEjLhZ5olEAnkDJlU";

const sb = async (path,method="GET",body=null,token=null) => {
  const res = await fetch(`${SB_URL}${path}`,{method,headers:{"apikey":SB_KEY,"Authorization":`Bearer ${token||SB_KEY}`,"Content-Type":"application/json"},body:body?JSON.stringify(body):undefined});
  if(!res.ok){ throw new Error(await res.text()); }
  const t=await res.text(); return t?JSON.parse(t):null;
};

const requestRecovery = (email) => sb(`/auth/v1/recover?redirect_to=${encodeURIComponent(window.location.origin+"/reset-password")}`,"POST",{email});
const setNewPassword  = (accessToken,password) => sb("/auth/v1/user","PUT",{password},accessToken);

const friendlyError=(raw)=>{
  let parsed=null;
  try{ parsed=JSON.parse(raw); }catch{ return "Something went wrong. Please try again."; }
  const msg=(parsed.msg||parsed.error_description||parsed.message||"").toLowerCase();
  if(msg.includes("rate limit")||msg.includes("too many")) return "Too many attempts. Please wait a moment and try again.";
  if(msg.includes("expired")||msg.includes("invalid")) return "This reset link has expired or is invalid. Request a new one below.";
  if(msg.includes("password")&&msg.includes("least")) return "Password is too short.";
  return parsed.msg||parsed.error_description||parsed.error||"Something went wrong. Please try again.";
};

const Logo=({size=48})=>(<img src={LOGO_SRC} alt="UA" style={{width:size,height:size,borderRadius:"50%",objectFit:"contain",background:"#000",flexShrink:0}}/>);
const GBtn=({label,onClick,style={},disabled})=>(
  <button onClick={onClick} disabled={disabled} style={{background:disabled?C.surface2:`linear-gradient(135deg,${C.cyan},${C.pink})`,border:"none",borderRadius:12,padding:"14px",color:C.white,fontSize:15,fontWeight:800,cursor:disabled?"default":"pointer",fontFamily:"inherit",opacity:disabled?0.5:1,...style}}>{label}</button>
);
const inp={background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"14px 16px",color:C.white,fontSize:15,outline:"none",fontFamily:"inherit",width:"100%",boxSizing:"border-box"};

const Shell=({children})=>(
  <div style={{minHeight:"100vh",background:C.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"40px 28px",fontFamily:"'Inter',-apple-system,sans-serif"}}>
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:16,marginBottom:36}}>
      <Logo size={100}/>
      <div style={{textAlign:"center"}}>
        <div style={{color:C.white,fontSize:24,fontWeight:900,letterSpacing:3,textTransform:"uppercase",lineHeight:1}}>UNORTHODOX</div>
        <div style={{fontSize:24,fontWeight:900,letterSpacing:3,textTransform:"uppercase",lineHeight:1,background:`linear-gradient(90deg,${C.cyan},${C.pink})`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>ATHLETES</div>
      </div>
    </div>
    <div style={{width:"100%",maxWidth:320,display:"flex",flexDirection:"column",gap:12}}>{children}</div>
  </div>
);

export default function ResetPassword(){
  const [accessToken,setAccessToken]=useState(null);
  const [step,setStep]=useState("checking"); // checking | request | sent | reset | done
  const [email,setEmail]=useState("");
  const [pw,setPw]=useState(""); const [confirmPw,setConfirmPw]=useState("");
  const [loading,setLoading]=useState(false);
  const [err,setErr]=useState("");

  useEffect(()=>{
    const hash=window.location.hash.startsWith("#")?window.location.hash.slice(1):window.location.hash;
    const params=new URLSearchParams(hash);
    const token=params.get("access_token");
    const type=params.get("type");
    if(token&&type==="recovery"){ setAccessToken(token); setStep("reset"); }
    else setStep("request");
  },[]);

  const handleRequest=async()=>{
    if(!email.trim()) return;
    setLoading(true); setErr("");
    try{ await requestRecovery(email.trim()); setStep("sent"); }
    catch(e){ setErr(friendlyError(e.message)); }
    setLoading(false);
  };

  const pwValid=pw.length>=8;
  const pwMatch=pw.length>0&&pw===confirmPw;

  const handleReset=async()=>{
    if(!pwValid||!pwMatch) return;
    setLoading(true); setErr("");
    try{ await setNewPassword(accessToken,pw); setStep("done"); }
    catch(e){ setErr(friendlyError(e.message)); }
    setLoading(false);
  };

  if(step==="checking") return <Shell><div style={{color:C.muted,fontSize:14,textAlign:"center"}}>Loading...</div></Shell>;

  if(step==="request") return(
    <Shell>
      <div style={{color:C.white,fontSize:18,fontWeight:800,textAlign:"center",marginBottom:4}}>Reset your password</div>
      <div style={{color:C.muted,fontSize:13,textAlign:"center",marginBottom:8,lineHeight:1.5}}>Enter your account email and we'll send you a reset link.</div>
      <input style={inp} placeholder="Email address" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleRequest()}/>
      {err&&<div style={{color:C.pink,fontSize:13,textAlign:"center"}}>{err}</div>}
      <GBtn label={loading?"Sending...":"Send Reset Link"} onClick={handleRequest} disabled={loading||!email.trim()}/>
      <a href="/" style={{color:C.cyan,fontSize:13,textAlign:"center",textDecoration:"none",padding:"8px"}}>← Back to login</a>
    </Shell>
  );

  if(step==="sent") return(
    <Shell>
      <div style={{fontSize:44,textAlign:"center",marginBottom:4}}>✓</div>
      <div style={{color:C.white,fontSize:18,fontWeight:800,textAlign:"center"}}>Check your email</div>
      <div style={{color:C.muted,fontSize:14,textAlign:"center",lineHeight:1.6}}>We sent a password reset link to<br/><strong style={{color:C.white}}>{email.trim()}</strong></div>
      <a href="/" style={{color:C.cyan,fontSize:13,textAlign:"center",textDecoration:"none",padding:"8px",marginTop:8}}>← Back to login</a>
    </Shell>
  );

  if(step==="reset") return(
    <Shell>
      <div style={{color:C.white,fontSize:18,fontWeight:800,textAlign:"center",marginBottom:4}}>Choose a new password</div>
      <input style={inp} type="password" placeholder="New password" value={pw} onChange={e=>setPw(e.target.value)}/>
      <input style={inp} type="password" placeholder="Confirm new password" value={confirmPw} onChange={e=>setConfirmPw(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleReset()}/>
      {pw.length>0&&!pwValid&&<div style={{color:C.amber,fontSize:12,textAlign:"center"}}>Password must be at least 8 characters.</div>}
      {confirmPw.length>0&&!pwMatch&&<div style={{color:C.amber,fontSize:12,textAlign:"center"}}>Passwords don't match.</div>}
      {err&&<div style={{color:C.pink,fontSize:13,textAlign:"center"}}>{err}</div>}
      <GBtn label={loading?"Saving...":"Set New Password"} onClick={handleReset} disabled={loading||!pwValid||!pwMatch}/>
    </Shell>
  );

  return(
    <Shell>
      <div style={{fontSize:44,textAlign:"center",marginBottom:4}}>✓</div>
      <div style={{color:C.white,fontSize:18,fontWeight:800,textAlign:"center"}}>Password updated!</div>
      <div style={{color:C.muted,fontSize:14,textAlign:"center",marginBottom:8}}>You can now log in with your new password.</div>
      <a href="/" style={{background:`linear-gradient(135deg,${C.cyan},${C.pink})`,border:"none",borderRadius:12,padding:"14px",color:C.white,fontSize:15,fontWeight:800,fontFamily:"inherit",textAlign:"center",textDecoration:"none"}}>Go to Client Login</a>
      <a href="/trainer" style={{color:C.cyan,fontSize:13,textAlign:"center",textDecoration:"none",padding:"8px"}}>Trainer? Log in here →</a>
    </Shell>
  );
}
