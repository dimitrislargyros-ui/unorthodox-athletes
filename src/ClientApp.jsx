import { useState, useEffect } from "react";
import ExercisePicker from "./ExercisePicker.jsx";

// ── Premium Design System (injected once) ──
;(()=>{
  if(document.getElementById("ua-premium-styles")) return;
  const link=document.createElement("link");
  link.rel="stylesheet";
  link.href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;600;700&display=swap";
  if(!document.head.querySelector('[href*="Oswald"]')) document.head.appendChild(link);
  const style=document.createElement("style");
  style.id="ua-premium-styles";
  style.textContent=`
    @keyframes ua-spin{to{transform:rotate(360deg)}}
    @keyframes ua-logo-pulse{0%,100%{opacity:1}50%{opacity:.75}}
    .ua-btn-grad{transition:transform .18s cubic-bezier(.22,1,.36,1),box-shadow .18s ease}
    .ua-btn-grad:not(:disabled):hover{transform:translateY(-2px);box-shadow:0 8px 28px rgba(0,201,225,.35)}
    .ua-btn-grad:not(:disabled):active{transform:translateY(0) scale(.97)}
    .ua-btn-ghost{transition:background .18s ease,border-color .18s ease}
    .ua-btn-ghost:not(:disabled):hover{background:rgba(0,201,225,.15)!important}
    .ua-card-glass{backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
    ::-webkit-scrollbar{width:4px;height:4px}
    ::-webkit-scrollbar-track{background:transparent}
    ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.13);border-radius:4px}
    ::-webkit-scrollbar-thumb:hover{background:rgba(0,201,225,0.55)}
    *{scrollbar-width:thin;scrollbar-color:rgba(255,255,255,0.13) transparent}
  `;
  document.head.appendChild(style);
})();

const LOGO_SRC = '/logo.png';

const GYM_CAP = 8;
// ── Themes ──
const THEMES={
  cyber:{bg:"#0A0A0A",surface:"#161616",surface2:"#252525",cyan:"#00C9E1",pink:"#E8197A",white:"#FFFFFF",muted:"#666666",border:"#2A2A2A",green:"#22C55E",amber:"#F59E0B"},
  electric:{bg:"#07071A",surface:"#0E0E2C",surface2:"#181838",cyan:"#4361EE",pink:"#F72585",white:"#FFFFFF",muted:"#5A5A88",border:"#22224A",green:"#22C55E",amber:"#F59E0B"},
  emerald:{bg:"#060F09",surface:"#0E1A12",surface2:"#18281C",cyan:"#10B981",pink:"#F43F5E",white:"#FFFFFF",muted:"#4A6050",border:"#1E301E",green:"#22C55E",amber:"#F59E0B"},
  violet:{bg:"#0C0916",surface:"#150D20",surface2:"#20152E",cyan:"#8B5CF6",pink:"#EC4899",white:"#FFFFFF",muted:"#5A4878",border:"#251D3E",green:"#22C55E",amber:"#F59E0B"},
  gold:{bg:"#100900",surface:"#1C1000",surface2:"#281A00",cyan:"#F59E0B",pink:"#EF4444",white:"#FFFFFF",muted:"#70540A",border:"#302000",green:"#22C55E",amber:"#F59E0B"},
};
const THEME_KEY="ua_theme";
const getTheme=()=>THEMES[localStorage.getItem(THEME_KEY)||"cyber"]||THEMES.cyber;
const C=getTheme();
const SESS_MIN = 90;

// ── Supabase ──
const SB_URL = "https://hxyqvryuniqmvpjljrry.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4eXF2cnl1bmlxbXZwamxqcnJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyOTQ0NTAsImV4cCI6MjA5Nzg3MDQ1MH0.eSoak4YVf7vqFwYlYebayMS3CCiEjLhZ5olEAnkDJlU";

const sb = async (path, method="GET", body=null, token=null, prefer="return=representation") => {
  const res = await fetch(`${SB_URL}${path}`, {
    method,
    headers: {
      "apikey": SB_KEY,
      "Authorization": `Bearer ${token||SB_KEY}`,
      "Content-Type": "application/json",
      "Prefer": prefer,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if(!res.ok){
    if(res.status===401||res.status===403){ localStorage.removeItem("ua_client_auth"); window.location.reload(); return; }
    throw new Error(await res.text());
  }
  const t = await res.text();
  return t ? JSON.parse(t) : null;
};

const authLogin  = (e,p) => sb("/auth/v1/token?grant_type=password","POST",{email:e,password:p});
const authLogout = (tk)  => sb("/auth/v1/logout","POST",null,tk);
const authSignUp = (e,p) => sb("/auth/v1/signup","POST",{email:e,password:p});
const dbGet      = (tbl,q,tk)   => sb(`/rest/v1/${tbl}?${q}`,"GET",null,tk);
const dbPost     = (tbl,d,tk)   => sb(`/rest/v1/${tbl}`,"POST",d,tk);
const dbPatch    = (tbl,q,d,tk) => sb(`/rest/v1/${tbl}?${q}`,"PATCH",d,tk);
const dbDelete   = (tbl,q,tk)   => sb(`/rest/v1/${tbl}?${q}`,"DELETE",null,tk,"return=minimal");

// ── Data helpers ──
const getProfile  = (uid,tk) => dbGet("profiles",`id=eq.${uid}&select=*`,tk).then(r=>r?.[0]);
const getPackage  = (uid,tk) => dbGet("packages",`client_id=eq.${uid}&is_active=eq.true&order=created_at.desc&limit=1&select=*,workout_templates(id,name,exercises)`,tk).then(r=>r?.[0]);
const getSessions = (uid,tk) => dbGet("sessions",`client_id=eq.${uid}&order=session_date.desc&select=*,session_notes(*),exercises(*)`,tk);
const getPRs      = (uid,tk) => dbGet("personal_records",`client_id=eq.${uid}&order=record_date.desc`,tk);
const getSlots    = (dow,tk) => dbGet("schedule_slots",`day_of_week=eq.${dow}&is_active=eq.true&order=start_time_min.asc`,tk);
const getActivePeriodForToday = (tk) => { const t=todayISO(); return dbGet("schedule_periods",`start_date=lte.${t}&end_date=gte.${t}&order=start_date.desc&limit=1`,tk).then(r=>r?.[0]); };
const getAllSlotsForDay = (dow,tk) => dbGet("schedule_slots",`day_of_week=eq.${dow}&order=start_time_min.asc`,tk);
// Uses the active Schedule Period's slots for today's date if one exists, else falls back to the default is_active slots
const getActiveSlots = async (dow,tk) => {
  const period = await getActivePeriodForToday(tk).catch(()=>null);
  if(!period) return getSlots(dow,tk);
  const [pslots,allSlots] = await Promise.all([
    dbGet("period_slots",`period_id=eq.${period.id}&day_of_week=eq.${dow}`,tk),
    getAllSlotsForDay(dow,tk),
  ]);
  const times = new Set((pslots||[]).map(p=>p.start_time_min));
  return (allSlots||[]).filter(s=>times.has(s.start_time_min));
};
const getDayBooks = (date,tk)=> dbGet("bookings",`book_date=eq.${date}&status=eq.booked&select=slot_id`,tk);
const getMyBooks  = (uid,date,tk) => dbGet("bookings",`client_id=eq.${uid}&book_date=eq.${date}&select=*`,tk);
const bookSlot    = (slotId,uid,date,tk) => dbPost("bookings",{slot_id:slotId,client_id:uid,book_date:date},tk);
const cancelBook  = (id,tk)  => dbPatch("bookings",`id=eq.${id}`,{status:"cancelled"},tk);
const addPR       = (uid,d,tk)=> dbPost("personal_records",{...d,client_id:uid,record_date:todayISO()},tk);
const deletePR    = (id,tk)  => dbDelete("personal_records",`id=eq.${id}`,tk);
const updateProfile=(uid,d,tk)=> dbPatch("profiles",`id=eq.${uid}`,d,tk);
const uploadAvatar=async(uid,file,tk)=>{
  const ext=file.name.split('.').pop()||'jpg';
  const path=`${uid}/avatar.${ext}`;
  const res=await fetch(`${SB_URL}/storage/v1/object/avatars/${path}`,{method:"POST",headers:{"apikey":SB_KEY,"Authorization":`Bearer ${tk}`,"Content-Type":file.type||"image/jpeg","x-upsert":"true"},body:file});
  if(!res.ok) throw new Error(await res.text());
  return `${SB_URL}/storage/v1/object/public/avatars/${path}?t=${Date.now()}`;
};

const saveClientNote = async (sessId, note, tk, rating=null) => {
  const ex = await dbGet("session_notes",`session_id=eq.${sessId}`,tk).catch(()=>[]);
  const body = {client_note:note,updated_at:new Date().toISOString(),...(rating!=null&&{rating})};
  if(ex?.length>0) return dbPatch("session_notes",`session_id=eq.${sessId}`,body,tk);
  return dbPost("session_notes",{session_id:sessId,...body},tk);
};

const getAnnouncements = (tk) => dbGet("announcements","order=created_at.desc&limit=20",tk);
const postSlotRequest  = (d,tk) => dbPost("slot_requests",d,tk);
const getMyWaitlistDay = (uid,date,tk) => dbGet("waitlist",`client_id=eq.${uid}&book_date=eq.${date}`,tk);
const joinWaitlist     = (d,tk) => dbPost("waitlist",d,tk);
const leaveWaitlist    = (id,tk) => dbDelete("waitlist",`id=eq.${id}`,tk);
const getSlotWaitlist  = (slotId,date,tk) => dbGet("waitlist",`slot_id=eq.${slotId}&book_date=eq.${date}&order=position.asc`,tk);
const getMyUpcomingBooks = (uid,date,tk) => dbGet("bookings",`client_id=eq.${uid}&book_date=gte.${date}&status=eq.booked&select=*,schedule_slots(start_time_min)`,tk);
const getMyWeekBooks     = (uid,ws,we,tk) => dbGet("bookings",`client_id=eq.${uid}&book_date=gte.${ws}&book_date=lte.${we}&status=eq.booked&select=book_date`,tk);
const updatePkgUsed      = (pkgId,newUsed,tk) => dbPatch("packages",`id=eq.${pkgId}`,{sessions_used:Math.max(newUsed,0)},tk);
const getMyNotifications = (uid,tk) => dbGet("notifications",`client_id=eq.${uid}&read=eq.false&order=created_at.desc`,tk);
const markNotificationRead=(id,tk)  => dbPatch("notifications",`id=eq.${id}`,{read:true},tk);
const deleteNotification  =(id,tk)  => dbDelete("notifications",`id=eq.${id}`,tk);
const getTrainerProfile   = (tk)    => dbGet("profiles","role=eq.trainer&select=id,name&limit=1",tk).then(r=>r?.[0]);
const postCancelRequest   = (d,tk)  => dbPost("cancel_requests",d,tk);
const VAPID_PUBLIC_KEY   = 'BNKaPdypI6pDPj7QQgVHhAAGxQgyjVpNcFIGu6N58WgZG05y9UTG4pwFIMu_9yDa8hMjhqtyUmJvE_84jASmVu0';
// Use raw fetch for push subscription save — avoids the sb() auto-reload on 4xx errors
const savePushSub = async (client_id, subscription, tk) => {
  // Skip if this exact endpoint was already saved — prevents duplicate rows on every page load
  const cacheKey = `ua_push_ep_${client_id}`;
  if (localStorage.getItem(cacheKey) === subscription.endpoint) {
    console.log('[UA Push] Subscription unchanged, skipping save');
    return;
  }
  const res = await fetch(`${SB_URL}/rest/v1/push_subscriptions`, {
    method: 'POST',
    headers: {
      'apikey': SB_KEY,
      'Authorization': `Bearer ${tk||SB_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({client_id, subscription}),
  });
  if (!res.ok) {
    const err = await res.text().catch(()=>'');
    console.error('[UA Push] Failed to save subscription:', res.status, err);
  } else {
    console.log('[UA Push] Subscription saved to DB ✓');
    localStorage.setItem(cacheKey, subscription.endpoint);
  }
};
const postNotification = async (d,tk) => {
  await dbPost("notifications",d,tk);
  fetch('/api/send-push',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:d.client_id})})
    .then(r=>r.json()).then(j=>console.log('[UA Push] send-push result:',j)).catch(e=>console.error('[UA Push] send-push error:',e));
};

// Converts VAPID public key from base64url to Uint8Array for PushManager
function urlBase64ToUint8Array(b64url){
  const pad=b64url+'='.repeat((4-b64url.length%4)%4);
  const raw=atob(pad.replace(/-/g,'+').replace(/_/g,'/'));
  return Uint8Array.from([...raw].map(c=>c.charCodeAt(0)));
}

// ── Time utils ──
const toTime = (min) => {
  const h=Math.floor(min/60),m=min%60;
  return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}`;
};
const toSlot = (s) => `${toTime(s)} — ${toTime(s+SESS_MIN)}`;
const fmtDate= (iso) => { if(!iso) return ""; return new Date(iso+"T12:00:00").toLocaleDateString("en-GB",{day:"numeric",month:"short"}); };
const fmtMemberSince=(iso)=>{ if(!iso) return ""; return new Date(iso).toLocaleDateString("en-US",{month:"long",year:"numeric"}); };
const friendlyAuthError=(raw)=>{
  let parsed=null;
  try{ parsed=JSON.parse(raw); }catch{ return "Something went wrong. Please try again."; }
  const code=(parsed.error_code||parsed.code||parsed.error||"").toString().toLowerCase();
  const msg=(parsed.msg||parsed.error_description||parsed.message||"").toLowerCase();
  if(code.includes("invalid_credentials")||msg.includes("invalid login credentials")) return "Incorrect email or password.";
  if(msg.includes("email not confirmed")) return "Please confirm your email before logging in — check your inbox.";
  if(code.includes("user_already_exists")||msg.includes("already registered")) return "An account with this email already exists. Try logging in instead.";
  if(msg.includes("rate limit")||msg.includes("too many")) return "Too many attempts. Please wait a moment and try again.";
  if(msg.includes("password")&&msg.includes("short")) return "Password is too short.";
  return parsed.msg||parsed.error_description||parsed.error||"Something went wrong. Please try again.";
};
// Local calendar-date "YYYY-MM-DD" — NOT toISOString(), which converts to UTC
// and silently returns the wrong day for hours near local midnight (e.g. all
// of 00:00-02:59 in UTC+3 timezones like Athens).
const localISO = (d=new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const todayISO = () => localISO();
const todayDow = () => { const d=new Date().getDay(); return d===0?6:d-1; };
const calcDayNum = (sessionsUsedBefore, sessionsPerWeek=3) => (sessionsUsedBefore % sessionsPerWeek) + 1;
const GR_DAYS=["Κυρ","Δευ","Τρί","Τετ","Πέμ","Παρ","Σάβ"];
const weekDayShort=dateStr=>GR_DAYS[new Date(dateStr+"T12:00:00").getDay()];
const sessLabel=tmplName=>tmplName?tmplName+" Training":"Personal Training";

// Returns the ISO date of the Monday of the week containing isoDate
const weekMon=(isoDate)=>{const d=new Date(isoDate+"T12:00:00");const dow=d.getDay()===0?6:d.getDay()-1;const m=new Date(d.getTime()-dow*86400000);return localISO(m);};

// Day numbering is weekly-scoped: Day 1/2/3 resets every Monday
const computeDayNum = (session, allSessions, spw=3) => {
  const wk=weekMon(session.session_date);
  const weekSess=[...allSessions]
    .filter(s=>(s.status==="completed"||s.status==="booked")&&weekMon(s.session_date)===wk)
    .sort((a,b)=>a.session_date.localeCompare(b.session_date)||(a.start_time_min-b.start_time_min));
  const idx=weekSess.findIndex(x=>x.id===session.id);
  return idx>=0?(idx%spw)+1:(session.day_num||null);
};

const WDAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const WDATES_BASE = (() => {
  const d=new Date(), dow=d.getDay()===0?6:d.getDay()-1;
  return Array.from({length:7},(_,i)=>{ const dd=new Date(d); dd.setDate(d.getDate()-dow+i); return {label:dd.getDate(),iso:localISO(dd),dow:i}; });
})();
const addDays = (isoDate, n) => { const d=new Date(isoDate); d.setUTCDate(d.getUTCDate()+n); return d.toISOString().split("T")[0]; };
const HOURS=[5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21];

// ── Shared components ──
const Logo=({size=48})=>(<img src={LOGO_SRC} alt="UA" style={{width:size,height:size,borderRadius:"50%",objectFit:"cover",flexShrink:0,display:"block"}}/>);
const SL=({children,style={}})=>(<div style={{color:C.muted,fontSize:10,fontWeight:700,letterSpacing:1.8,textTransform:"uppercase",marginBottom:10,fontFamily:"'Oswald',sans-serif",...style}}>{children}</div>);
const Card=({children,style={},glow})=>(<div className="ua-card-glass" style={{background:"rgba(22,22,22,0.72)",borderRadius:14,padding:"16px",border:`1px solid ${glow?glow+"55":C.border}`,...style}}>{children}</div>);
const GBtn=({label,onClick,style={},sm,ghost,color,disabled})=>{
  const base={borderRadius:sm?8:12,cursor:disabled?"not-allowed":"pointer",padding:sm?"8px 14px":"15px",fontWeight:800,fontSize:sm?13:15,fontFamily:"inherit",opacity:disabled?.5:1,...style};
  if(ghost) return <button onClick={onClick} disabled={disabled} className="ua-btn-ghost" style={{...base,background:(color||C.cyan)+"20",border:`1px solid ${color||C.cyan}55`,color:color||C.cyan}}>{label}</button>;
  return <button onClick={onClick} disabled={disabled} className="ua-btn-grad" style={{...base,background:`linear-gradient(135deg,${C.cyan},${C.pink})`,border:"none",color:C.white}}>{label}</button>;
};
const Spinner=({size=44,fullscreen=false})=>{
  const ring=size+10;
  const inner=(
    <div style={{position:"relative",width:ring,height:ring,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{position:"absolute",inset:0,borderRadius:"50%",background:`conic-gradient(from 0deg,${C.cyan},${C.pink},transparent 60%,${C.cyan})`,animation:"ua-spin 1.4s linear infinite"}}/>
      <div style={{position:"absolute",inset:3,borderRadius:"50%",background:C.bg}}/>
      <img src={LOGO_SRC} style={{width:size,height:size,borderRadius:"50%",objectFit:"cover",position:"relative",zIndex:1,display:"block",animation:"ua-logo-pulse 2s ease-in-out infinite"}}/>
    </div>
  );
  if(fullscreen) return(<div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100dvh",background:C.bg}}>{inner}</div>);
  return(<div style={{display:"flex",justifyContent:"center",padding:"28px"}}>{inner}</div>);
};
const Empty=({msg})=>(<div style={{textAlign:"center",padding:"28px 16px",color:C.muted,fontSize:14}}>{msg}</div>);
const UaToast=({toast,c})=>toast?(<div style={{position:"fixed",bottom:90,left:"50%",transform:"translateX(-50%)",background:toast.ok?c.green:c.pink,color:"#fff",padding:"10px 22px",borderRadius:12,zIndex:600,fontWeight:700,fontSize:13,whiteSpace:"nowrap",boxShadow:"0 4px 20px rgba(0,0,0,0.4)",pointerEvents:"none"}}>{toast.msg}</div>):null;

const UaConfirm=({dialog,setDialog,c})=>{
  if(!dialog) return null;
  const close=()=>setDialog(null);
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 24px"}}>
      <div style={{background:c.surface,borderRadius:16,padding:24,width:"100%",maxWidth:340,border:`1px solid ${c.border}`}}>
        <div style={{color:c.white,fontSize:15,fontWeight:700,marginBottom:4,lineHeight:1.4}}>{dialog.title||""}</div>
        <div style={{color:c.muted,fontSize:13,marginBottom:20,lineHeight:1.5}}>{dialog.msg}</div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>{close();dialog.onOk?.();}} style={{flex:1,borderRadius:8,cursor:"pointer",padding:"12px",fontWeight:800,fontSize:14,fontFamily:"inherit",background:c.pink+"20",border:`1px solid ${c.pink}55`,color:c.pink}}>{dialog.okLabel||"Confirm"}</button>
          <button onClick={close} style={{flex:1,borderRadius:8,cursor:"pointer",padding:"12px",fontWeight:800,fontSize:14,fontFamily:"inherit",background:`linear-gradient(135deg,${c.cyan},${c.pink})`,border:"none",color:"#fff"}}>{dialog.cancelLabel||"Cancel"}</button>
        </div>
      </div>
    </div>
  );
};

// ── Cancel Request Sheet (within-48h cancellation flow) ──
const CancelRequestSheet=({bookDate,startMin,bookingId,userId,token,onClose})=>{
  const [sending,setSending]=React.useState(false);
  const [sent,setSent]=React.useState(false);
  const [err,setErr]=React.useState(null);
  const sendRequest=async()=>{
    setSending(true); setErr(null);
    try{
      const trainer=await getTrainerProfile(token);
      if(!trainer) throw new Error("Trainer not found");
      const myProfile=await getProfile(userId,token).catch(()=>null);
      const label=`${fmtDate(bookDate)} στις ${toTime(startMin)}`;
      // Save cancel request row (requires cancel_requests table)
      await postCancelRequest({client_id:userId,trainer_id:trainer.id,booking_id:bookingId||null,book_date:bookDate,start_time_min:startMin,status:"pending"},token).catch(()=>{});
      // Push notification to trainer
      await fetch("/api/send-push",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({client_id:trainer.id,title:"🔔 Αίτηση ακύρωσης",body:`${myProfile?.name||"Client"} ζητά ακύρωση: ${label}`})}).catch(()=>{});
      // Notify trainer in-app
      await postNotification({client_id:trainer.id,type:"cancel_request",message:`${myProfile?.name||"Client"} ζητά ακύρωση της συνεδρίας ${label}.`},token).catch(()=>{});
      setSent(true);
    }catch(e){ setErr("Σφάλμα αποστολής. Δοκίμασε ξανά."); }
    setSending(false);
  };
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.78)",zIndex:500,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={sent?onClose:undefined}>
      <div style={{background:C.surface,borderRadius:"20px 20px 0 0",width:"100%",maxWidth:430,padding:"24px 24px 40px",boxSizing:"border-box"}} onClick={e=>e.stopPropagation()}>
        <div style={{width:36,height:4,background:C.border,borderRadius:2,margin:"0 auto 20px",opacity:.6}}/>
        {sent?(
          <div style={{textAlign:"center",padding:"12px 0 8px"}}>
            <div style={{fontSize:48,marginBottom:12}}>✅</div>
            <div style={{color:C.white,fontSize:17,fontWeight:800,marginBottom:8}}>Η αίτηση εστάλη!</div>
            <div style={{color:C.muted,fontSize:14,lineHeight:1.6,marginBottom:24}}>Ο trainer σου θα δει την αίτησή σου και θα σε ενημερώσει για την απόφαση.</div>
            <button onClick={onClose} style={{width:"100%",background:`linear-gradient(135deg,${C.cyan},${C.pink})`,border:"none",borderRadius:12,padding:"14px",color:"#fff",fontSize:15,fontWeight:800,cursor:"pointer",fontFamily:"inherit"}}>OK</button>
          </div>
        ):(
          <>
            <div style={{color:C.pink,fontSize:13,fontWeight:800,letterSpacing:.5,marginBottom:8,textTransform:"uppercase"}}>Αίτηση ακύρωσης</div>
            <div style={{color:C.white,fontSize:16,fontWeight:700,marginBottom:6}}>Συνεδρία εντός 48 ωρών</div>
            <div style={{background:C.surface2,border:`1px solid ${C.border}`,borderRadius:10,padding:"11px 14px",marginBottom:14}}>
              <div style={{color:C.cyan,fontSize:14,fontWeight:700}}>{fmtDate(bookDate)}</div>
              <div style={{color:C.muted,fontSize:13,marginTop:2}}>{toTime(startMin)}</div>
            </div>
            <div style={{color:C.muted,fontSize:13,lineHeight:1.6,marginBottom:20}}>Δεν μπορείς να ακυρώσεις άμεσα συνεδρία εντός 48 ωρών. Θέλεις να στείλεις αίτηση ακύρωσης στον trainer σου;</div>
            {err&&<div style={{color:C.pink,fontSize:12,fontWeight:700,marginBottom:10}}>{err}</div>}
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              <button onClick={sendRequest} disabled={sending} style={{width:"100%",background:sending?"rgba(255,255,255,0.05)":`linear-gradient(135deg,${C.cyan},${C.pink})`,border:"none",borderRadius:12,padding:"14px",color:sending?C.muted:"#fff",fontSize:15,fontWeight:800,cursor:sending?"not-allowed":"pointer",fontFamily:"inherit"}}>{sending?"Αποστολή...":"Ναι, στείλε αίτηση"}</button>
              <button onClick={onClose} style={{width:"100%",background:"none",border:`1px solid ${C.border}`,borderRadius:12,padding:"13px",color:C.muted,fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Όχι, ακύρωσε</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const UaPrompt=({prompt,setPrompt,c})=>{
  const [val,setVal]=useState(prompt?.defaultVal||"");
  if(!prompt) return null;
  const close=()=>setPrompt(null);
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 24px"}}>
      <div style={{background:c.surface,borderRadius:16,padding:24,width:"100%",maxWidth:340,border:`1px solid ${c.border}`}}>
        <div style={{color:c.white,fontSize:15,fontWeight:700,marginBottom:12}}>{prompt.msg}</div>
        <input autoFocus value={val} onChange={e=>setVal(e.target.value)} onKeyDown={e=>e.key==="Enter"&&val.trim()&&(close(),prompt.onOk(val.trim()))}
          placeholder={prompt.placeholder||""}
          style={{width:"100%",background:c.surface2,border:`1px solid ${c.cyan}55`,borderRadius:8,padding:"11px 12px",color:"#fff",fontSize:14,outline:"none",fontFamily:"inherit",boxSizing:"border-box",marginBottom:14}}/>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>val.trim()&&(close(),prompt.onOk(val.trim()))} style={{flex:1,borderRadius:8,cursor:"pointer",padding:"12px",fontWeight:800,fontSize:14,fontFamily:"inherit",background:`linear-gradient(135deg,${c.cyan},${c.pink})`,border:"none",color:"#fff"}}>OK</button>
          <button onClick={close} style={{flex:1,borderRadius:8,cursor:"pointer",padding:"12px",fontWeight:800,fontSize:14,fontFamily:"inherit",background:c.muted+"20",border:`1px solid ${c.muted}55`,color:c.muted}}>Cancel</button>
        </div>
      </div>
    </div>
  );
};

const sessionDT=(s)=>{ const [yr,mo,dy]=s.session_date.split('-').map(Number); return new Date(yr,mo-1,dy,Math.floor(s.start_time_min/60),s.start_time_min%60,0).getTime(); };
const STATUS_CFG={upcoming:{c:C.cyan,l:"Upcoming"},booked:{c:C.amber,l:"Booked"},completed:{c:C.green,l:"Completed"},cancelled:{c:C.muted,l:"Cancelled"},missed:{c:C.muted,l:"Not logged"}};
const StatusBadge=({status})=>{
  const cfg=STATUS_CFG[status];
  if(!cfg) return null;
  return <span style={{background:cfg.c+"22",color:cfg.c,fontSize:10,fontWeight:800,padding:"2px 8px",borderRadius:20,border:`1px solid ${cfg.c}44`}}>{cfg.l}</span>;
};
// items: [{_key,session_date,start_time_min,status}] — the single soonest future item = upcoming, rest future = booked, everything else = completed
const computeStatusMap=(items,now)=>{
  const nowMs=now.getTime();
  const withDt=items.map(it=>({...it,_dt:sessionDT(it)}));
  const future=withDt.filter(it=>it.status!=="completed"&&it.status!=="cancelled"&&it._dt>nowMs).sort((a,b)=>a._dt-b._dt);
  const map={};
  withDt.forEach(it=>{
    if(it.status==="cancelled") map[it._key]="cancelled";
    else if(it._fromBooking&&it._dt<=nowMs) map[it._key]="missed";
    else if(it.status==="completed"||it._dt<=nowMs) map[it._key]="completed";
  });
  future.forEach((it,i)=>{ map[it._key]=i===0?"upcoming":"booked"; });
  return map;
};
// ── SVG icon helpers for BottomNav ──
const IcoHome=({c})=>(<svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H14v-5h-4v5H4a1 1 0 01-1-1V9.5z"/></svg>);
const IcoCalendar=({c})=>(<svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></svg>);
const IcoMega=({c})=>(<svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 010 8"/><path d="M4.5 9H4a2 2 0 000 6h.5"/><path d="M4.5 9l9-5v14l-9-5V9z"/><path d="M7.5 9.5v5"/></svg>);
const IcoPerson=({c,sz=22})=>(<svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>);

const BottomNav=({active,onNav,avatarUrl,initials,annBadge})=>{
  const tabs=[
    {id:"home",     label:"Home",          Icon:IcoHome},
    {id:"schedule", label:"Schedule",      Icon:IcoCalendar},
    {id:"announcements",label:"News",      Icon:IcoMega},
    {id:"profile",  label:"Profile",       Icon:null},
  ];
  return(
    <div className="ua-app" style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:480,background:"rgba(8,8,8,0.92)",backdropFilter:"blur(24px) saturate(200%)",WebkitBackdropFilter:"blur(24px) saturate(200%)",borderTop:"1px solid rgba(255,255,255,0.06)",display:"flex",justifyContent:"space-around",alignItems:"flex-end",padding:"8px 0 max(env(safe-area-inset-bottom),20px)",zIndex:100}}>
      {tabs.map(t=>{
        const isActive=active===t.id;
        const col=isActive?C.cyan:C.muted;
        return(
          <button key={t.id} onClick={()=>onNav(t.id)} style={{background:"none",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:4,padding:"2px 14px",position:"relative",transition:"transform .15s"}}>
            <div style={{position:"relative",display:"flex",alignItems:"center",justifyContent:"center",width:40,height:32,borderRadius:12,background:isActive?C.cyan+"18":"transparent",transition:"background .2s"}}>
              {t.id==="profile"
                ?(avatarUrl
                    ?<img src={avatarUrl} style={{width:26,height:26,borderRadius:"50%",objectFit:"cover",border:`2px solid ${isActive?C.cyan:"transparent"}`,transition:"border-color .2s"}} alt="av"/>
                    :<IcoPerson c={col} sz={24}/>
                  )
                :<t.Icon c={col}/>
              }
              {t.id==="announcements"&&annBadge&&(
                <span style={{position:"absolute",top:2,right:4,background:C.pink,borderRadius:"50%",width:7,height:7,display:"block",boxShadow:`0 0 0 2px ${C.bg}`}}/>
              )}
            </div>
            <span style={{fontSize:9,fontWeight:isActive?800:600,color:col,letterSpacing:.4,textTransform:"uppercase",transition:"color .2s"}}>{t.label}</span>
            {isActive&&<span style={{position:"absolute",bottom:-2,left:"50%",transform:"translateX(-50%)",width:20,height:2,background:C.cyan,borderRadius:2}}/>}
          </button>
        );
      })}
    </div>
  );
};

// ── Session Sheet ──
const SessionSheet=({session,token,onClose})=>{
  const rawNotes = session.session_notes;
  const noteObj = Array.isArray(rawNotes) ? (rawNotes[0]||null) : (rawNotes||null);
  const exercises = session.exercises || [];
  const spw = session._pkg_spw || 3;
  const dayNum = session.sessions_used_before!=null ? calcDayNum(session.sessions_used_before, spw) : session.day_num;
  const [clientNote, setClientNote] = useState(noteObj?.client_note||"");
  const [rating, setRating] = useState(noteObj?.rating||0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [ssToast,setSsToast]=useState(null);
  const showSsToast=(msg,ok=false)=>{setSsToast({msg,ok});setTimeout(()=>setSsToast(null),3500);};
  const isCompleted = session.status==="completed";

  const save = async () => {
    if(saving||saved) return;
    setSaving(true);
    try {
      await saveClientNote(session.id, clientNote, token, isCompleted?(rating||null):null);
      setSaved(true);
      setTimeout(()=>{ setSaved(false); onClose(); }, 1200);
    } catch(e) { showSsToast("Error saving: "+e.message); }
    setSaving(false);
  };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:200,display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
      <div style={{background:C.surface,borderRadius:"20px 20px 0 0",padding:"20px 20px 40px",maxHeight:"90vh",overflowY:"auto"}}>
        <div style={{width:40,height:4,background:C.border,borderRadius:2,margin:"0 auto 20px"}}/>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}>
          <div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{color:C.white,fontSize:18,fontWeight:800}}>Session Log</div>
              {dayNum&&<span style={{background:`linear-gradient(135deg,${C.cyan},${C.pink})`,color:C.white,fontSize:10,fontWeight:800,padding:"3px 9px",borderRadius:20}}>Day {dayNum}</span>}
            </div>
            <div style={{color:C.muted,fontSize:13,marginTop:2}}>{fmtDate(session.session_date)} · {toTime(session.start_time_min)}</div>
          </div>
          <button onClick={onClose} style={{background:C.surface2,border:`1px solid ${C.border}`,borderRadius:8,padding:"6px 12px",color:C.muted,cursor:"pointer",fontFamily:"inherit"}}>✕</button>
        </div>

        <SL>Exercises</SL>
        {exercises.length===0
          ? <Empty msg="No exercises logged yet"/>
          : <div style={{display:"flex",flexDirection:"column",gap:7,marginBottom:20}}>
              {exercises.map((ex,i)=>(
                <div key={i} style={{background:C.surface2,borderRadius:10,padding:"11px 14px",display:"flex",justifyContent:"space-between"}}>
                  <div style={{color:C.white,fontSize:14,fontWeight:600}}>{ex.name}</div>
                  <div style={{color:C.cyan,fontSize:13,fontWeight:700}}>{ex.sets}×{ex.reps} · {ex.weight}</div>
                </div>
              ))}
            </div>
        }

        <SL>Your Notes</SL>
        <textarea value={clientNote} onChange={e=>setClientNote(e.target.value)}
          placeholder="How did it go? Anything to remember..."
          style={{width:"100%",background:C.surface2,border:`1px solid ${C.border}`,borderRadius:10,padding:"12px 14px",color:C.white,fontSize:14,fontFamily:"inherit",resize:"none",height:90,outline:"none",boxSizing:"border-box",lineHeight:1.5,marginBottom:12}}/>

        {isCompleted&&(
          <>
            <SL>Rate This Session</SL>
            <div style={{display:"flex",gap:8,marginBottom:16}}>
              {[1,2,3,4,5].map(n=>(
                <button key={n} onClick={()=>setRating(n)} style={{background:"none",border:"none",cursor:"pointer",padding:0,fontSize:30,lineHeight:1,color:n<=rating?C.amber:C.border,fontFamily:"inherit"}}>★</button>
              ))}
            </div>
          </>
        )}

        <GBtn label={saving?"Saving...":saved?"✓ Saved!":"Save Notes"} onClick={save} disabled={saving} style={{width:"100%"}}/>
      </div>
      <UaToast toast={ssToast} c={C}/>
    </div>
  );
};

// ── Notification Modal ──
const HistorySheet=({sessions,spw,onClose,label="Personal Training"})=>{
  const completed=sessions.filter(s=>s.status==="completed");
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:200,display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
      <div style={{background:C.surface,borderRadius:"20px 20px 0 0",padding:"20px 20px 40px",maxHeight:"85vh",overflowY:"auto",boxSizing:"border-box"}}>
        <div style={{width:40,height:4,background:C.border,borderRadius:2,margin:"0 auto 16px"}}/>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div style={{color:C.white,fontSize:17,fontWeight:800}}>Session History</div>
          <button onClick={onClose} style={{background:C.surface2,border:`1px solid ${C.border}`,borderRadius:8,padding:"6px 12px",color:C.muted,cursor:"pointer",fontFamily:"inherit"}}>✕</button>
        </div>
        {completed.length===0?<Empty msg="No completed sessions yet"/>:
          completed.map((s,i)=>{
            const dn=computeDayNum(s,sessions,spw);
            return(
              <div key={i} style={{padding:"12px 0",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <div style={{color:C.white,fontSize:14,fontWeight:600}}>{label}</div>
                  {dn&&<span style={{background:`linear-gradient(135deg,${C.cyan},${C.pink})`,color:C.white,fontSize:10,fontWeight:800,padding:"2px 6px",borderRadius:20}}>Day {dn}</span>}
                </div>
                <div style={{textAlign:"right"}}><div style={{color:C.muted,fontSize:12,marginBottom:3}}>{weekDayShort(s.session_date)} · {fmtDate(s.session_date)}</div><StatusBadge status="completed"/></div>
              </div>
            );
          })
        }
      </div>
    </div>
  );
};

const NotifPanel=({notifications,onDismiss,onDelete,onClose})=>{
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.72)",zIndex:400,display:"flex",flexDirection:"column",justifyContent:"flex-end"}} onClick={onClose}>
      <div style={{background:C.surface,borderRadius:"20px 20px 0 0",maxHeight:"80vh",overflowY:"auto",boxSizing:"border-box"}} onClick={e=>e.stopPropagation()}>
        <div style={{padding:"16px 20px 0"}}>
          <div style={{width:40,height:4,background:C.border,borderRadius:2,margin:"0 auto 14px"}}/>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div style={{color:C.white,fontSize:16,fontWeight:800}}>🔔 Notifications</div>
            <button onClick={onClose} style={{background:C.surface2,border:`1px solid ${C.border}`,borderRadius:8,padding:"5px 10px",color:C.muted,cursor:"pointer",fontFamily:"inherit",fontSize:12}}>Close</button>
          </div>
        </div>
        {notifications.length===0
          ?<div style={{padding:"20px 20px 40px",color:C.muted,fontSize:13,textAlign:"center"}}>All caught up! No new notifications.</div>
          :<div style={{padding:"0 20px 40px"}}>
            {notifications.map(n=>(
              <div key={n.id} style={{background:C.surface2,border:`1px solid ${C.border}`,borderRadius:12,padding:"13px 14px",marginBottom:8,display:"flex",gap:10,alignItems:"flex-start"}}>
                <div style={{fontSize:18,flexShrink:0,marginTop:1}}>
                  {n.type==="session_scheduled"?"📅":n.type==="session_cancelled"?"🚫":n.type==="payment_confirmed"?"✅":n.type==="payment_reminder"?"💳":n.type==="low_sessions"?"⚠️":n.type==="waitlist_promoted"?"🎉":"🔔"}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{color:C.white,fontSize:13,lineHeight:1.5}}>{n.message}</div>
                  {n.created_at&&<div style={{color:C.muted,fontSize:11,marginTop:4}}>{fmtDate(n.created_at?.split("T")[0])}</div>}
                </div>
                <div style={{display:"flex",gap:4,flexShrink:0}}>
                  <button onClick={()=>onDismiss(n.id)} title="Mark as read" style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:7,padding:"5px 8px",color:C.muted,cursor:"pointer",fontFamily:"inherit",fontSize:11,fontWeight:700}}>Hide</button>
                  <button onClick={()=>onDelete(n.id)} title="Delete" style={{background:"none",border:`1px solid ${C.pink}44`,borderRadius:7,padding:"5px 8px",color:C.pink,cursor:"pointer",fontFamily:"inherit",fontSize:13,lineHeight:1}}>🗑</button>
                </div>
              </div>
            ))}
            <button onClick={()=>notifications.forEach(n=>onDismiss(n.id))} style={{width:"100%",background:C.surface2,border:`1px solid ${C.border}`,borderRadius:10,padding:"10px",color:C.muted,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",marginTop:4}}>Hide All</button>
          </div>
        }
      </div>
    </div>
  );
};

// ── Program day helpers ──
// Normalise workout_templates.exercises into [{day,exercises:[]},...] format.
// Old flat format [{name,sets,...}] is treated as Day 1.
const toDayPlan=(raw=[],numDays=3)=>{
  if(!raw||raw.length===0) return Array.from({length:numDays},(_,i)=>({day:i+1,exercises:[]}));
  if(raw[0]?.day!==undefined)
    return Array.from({length:numDays},(_,i)=>raw.find(d=>d.day===i+1)||{day:i+1,exercises:[]});
  return [{day:1,exercises:raw},...Array.from({length:numDays-1},(_,i)=>({day:i+2,exercises:[]}))];
};
const getDayExercises=(templateExercises,dayNum,numDays=3)=>{
  const plan=toDayPlan(templateExercises,numDays);
  return plan.find(d=>d.day===dayNum)?.exercises||[];
};

// ── WOD Sheet (client: view program for their day) ──
const WODSheet=({programName,dayNum,exercises,onClose})=>(
  <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.82)",zIndex:200,display:"flex",flexDirection:"column",justifyContent:"flex-end"}} onClick={onClose}>
    <div onClick={e=>e.stopPropagation()} style={{background:C.surface,borderRadius:"20px 20px 0 0",padding:"20px 20px 40px",maxHeight:"78vh",overflowY:"auto",boxSizing:"border-box"}}>
      <div style={{width:40,height:4,background:C.border,borderRadius:2,margin:"0 auto 16px"}}/>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
        <div>
          <div style={{color:C.cyan,fontSize:10,fontWeight:700,letterSpacing:1.5,textTransform:"uppercase",marginBottom:4}}>Day {dayNum} · WOD</div>
          <div style={{color:C.white,fontSize:19,fontWeight:900,fontFamily:"'Oswald',sans-serif",letterSpacing:0.5}}>{sessLabel(programName)}</div>
        </div>
        <button onClick={onClose} style={{background:C.surface2,border:`1px solid ${C.border}`,borderRadius:8,padding:"6px 12px",color:C.muted,cursor:"pointer",fontFamily:"inherit"}}>✕</button>
      </div>
      {exercises.length===0
        ? <div style={{textAlign:"center",padding:"28px 0",color:C.muted,fontSize:14}}>No program set for Day {dayNum} yet</div>
        : <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {exercises.map((ex,i)=>(
              <div key={i} style={{background:C.surface2,borderRadius:12,padding:"13px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",border:`1px solid ${C.border}`}}>
                <div>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{color:C.muted,fontSize:12,fontWeight:800,minWidth:18}}>{i+1}.</span>
                    <div style={{color:C.white,fontSize:14,fontWeight:700}}>{ex.name}</div>
                  </div>
                  {(ex.sets||ex.reps)&&<div style={{color:C.muted,fontSize:12,marginTop:3,paddingLeft:26}}>{[ex.sets&&`${ex.sets} sets`,ex.reps&&`${ex.reps} reps`].filter(Boolean).join(" × ")}</div>}
                </div>
                {ex.weight&&<div style={{color:C.cyan,fontSize:14,fontWeight:800,flexShrink:0}}>{ex.weight}</div>}
              </div>
            ))}
          </div>
      }
    </div>
  </div>
);

// ── Eye icon for password toggle ──
const EyeIcon=({open})=>(
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {open
      ?<><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>
      :<><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></>
    }
  </svg>
);
const PwField=({value,onChange,placeholder,style,onKeyDown})=>{
  const [show,setShow]=useState(false);
  return(
    <div style={{position:"relative",width:"100%"}}>
      <input style={{...style,paddingRight:48}} type={show?"text":"password"} placeholder={placeholder} value={value} onChange={onChange} onKeyDown={onKeyDown}/>
      <button type="button" onClick={()=>setShow(s=>!s)} style={{position:"absolute",right:14,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:C.muted,cursor:"pointer",padding:4,display:"flex",alignItems:"center",fontFamily:"inherit"}}>
        <EyeIcon open={show}/>
      </button>
    </div>
  );
};

// ── Login ──
const LoginScreen=({onLogin,onSignUp})=>{
  const [email,setE]=useState(""); const [pw,setPw]=useState("");
  const [loading,setL]=useState(false); const [err,setErr]=useState("");
  const handle=async()=>{
    if(!email||!pw) return; setL(true); setErr("");
    try{ await onLogin(email,pw); }
    catch(e){ setErr(friendlyAuthError(e.message)); }
    setL(false);
  };
  const inp={background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"14px 16px",color:C.white,fontSize:15,outline:"none",fontFamily:"inherit",width:"100%",boxSizing:"border-box"};
  return(
    <div style={{height:"100dvh",maxHeight:"100dvh",background:C.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"24px 28px",overflow:"hidden",boxSizing:"border-box"}}>
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:12,marginBottom:28}}>
        <Logo size={96}/>
        <div style={{textAlign:"center"}}>
          <div style={{color:C.white,fontSize:24,fontWeight:900,letterSpacing:3,textTransform:"uppercase",lineHeight:1,fontFamily:"'Oswald',sans-serif"}}>UNORTHODOX</div>
          <div style={{fontSize:24,fontWeight:900,letterSpacing:3,textTransform:"uppercase",lineHeight:1,background:`linear-gradient(90deg,${C.cyan},${C.pink})`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",fontFamily:"'Oswald',sans-serif"}}>ATHLETES</div>
          <div style={{color:C.muted,fontSize:10,letterSpacing:3,marginTop:6,textTransform:"uppercase",fontFamily:"'Oswald',sans-serif"}}>Think · Perform · Develop</div>
        </div>
      </div>
      <div style={{width:"100%",maxWidth:320,display:"flex",flexDirection:"column",gap:10}}>
        <input style={inp} placeholder="Email address" value={email} onChange={e=>setE(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handle()}/>
        <PwField style={inp} placeholder="Password" value={pw} onChange={e=>setPw(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handle()}/>
        {err&&<div style={{color:C.pink,fontSize:13,textAlign:"center"}}>{err}</div>}
        <GBtn label={loading?"Logging in...":"Let's Go →"} onClick={handle} disabled={loading} style={{marginTop:2,width:"100%"}}/>
        <a href="/reset-password" style={{background:"none",border:"none",color:C.muted,fontSize:13,fontFamily:"inherit",textAlign:"center",width:"100%",textDecoration:"none"}}>Forgot password?</a>
        <button onClick={onSignUp} style={{background:"none",border:"none",color:C.cyan,fontSize:13,cursor:"pointer",padding:"6px",fontFamily:"inherit",textAlign:"center",width:"100%"}}>Don't have an account? Sign up →</button>
      </div>
    </div>
  );
};

// ── Sign Up ──
const EMAIL_RE=/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PwReq=({ok,label})=>(<div style={{display:"flex",alignItems:"center",gap:7,fontSize:12,color:ok?C.green:C.muted}}><span>{ok?"✓":"○"}</span>{label}</div>);
const SignUpScreen=({onSignUp,onBack})=>{
  const [firstName,setFirstName]=useState("");
  const [lastName,setLastName]=useState("");
  const [email,setE]=useState(""); const [pw,setPw]=useState(""); const [confirmPw,setConfirmPw]=useState(""); const [phone,setPhone]=useState("");
  const [loading,setL]=useState(false); const [err,setErr]=useState(""); const [done,setDone]=useState(false);

  const latinize=s=>{const G={'α':'a','β':'v','γ':'g','δ':'d','ε':'e','ζ':'z','η':'i','θ':'th','ι':'i','κ':'k','λ':'l','μ':'m','ν':'n','ξ':'x','ο':'o','π':'p','ρ':'r','σ':'s','ς':'s','τ':'t','υ':'y','φ':'f','χ':'ch','ψ':'ps','ω':'o','ά':'a','έ':'e','ή':'i','ί':'i','ό':'o','ύ':'y','ώ':'o','ϊ':'i','ΐ':'i','ϋ':'y','ΰ':'y'};let r='';for(const c of s.toLowerCase()){r+=G[c]||(c.normalize('NFD').replace(/[̀-ͯ]/g,'')||c);}return r.replace(/[^a-z]/g,'');};
  const previewUsername=firstName.trim()&&lastName.trim()?`${latinize(firstName.trim())}.${latinize(lastName.trim())}`:"";

  const pwChecks={
    len: pw.length>=8,
    upper: /[A-Z]/.test(pw),
    num: /[0-9]/.test(pw),
    special: /[^A-Za-z0-9]/.test(pw),
  };
  const pwValid=Object.values(pwChecks).every(Boolean);
  const emailValid=EMAIL_RE.test(email.trim());
  const pwMatch=pw.length>0&&pw===confirmPw;
  const canSubmit=firstName.trim()&&lastName.trim()&&emailValid&&pwValid&&pwMatch&&!loading;

  const handle=async()=>{
    if(!canSubmit) return; setL(true); setErr("");
    try{ const ok=await onSignUp(firstName.trim(),lastName.trim(),email.trim(),pw,phone.trim()||null); if(!ok) setDone(true); }
    catch(e){ setErr(friendlyAuthError(e.message)); }
    setL(false);
  };
  const inp={background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"14px 16px",color:C.white,fontSize:15,outline:"none",fontFamily:"inherit",width:"100%",boxSizing:"border-box"};
  if(done) return(
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"40px 28px",textAlign:"center"}}>
      <div style={{fontSize:52,marginBottom:16}}>✓</div>
      <div style={{color:C.white,fontSize:20,fontWeight:800,marginBottom:8}}>Account Created!</div>
      <div style={{color:C.muted,fontSize:14,marginBottom:28,lineHeight:1.6}}>Check your email to confirm your account,<br/>then log in below.</div>
      <GBtn label="Back to Login" onClick={onBack} style={{width:"100%",maxWidth:320}}/>
    </div>
  );
  return(
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"40px 28px"}}>
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:16,marginBottom:32}}>
        <Logo size={100}/>
        <div style={{textAlign:"center"}}>
          <div style={{color:C.white,fontSize:22,fontWeight:900,letterSpacing:2,textTransform:"uppercase",fontFamily:"'Oswald',sans-serif"}}>Create Account</div>
          <div style={{color:C.muted,fontSize:13,marginTop:6}}>Join Unorthodox Athletes</div>
        </div>
      </div>
      <div style={{width:"100%",maxWidth:320,display:"flex",flexDirection:"column",gap:12}}>
        <div style={{display:"flex",gap:8}}>
          <input style={{...inp,flex:1}} placeholder="First name" value={firstName} onChange={e=>setFirstName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handle()}/>
          <input style={{...inp,flex:1}} placeholder="Last name" value={lastName} onChange={e=>setLastName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handle()}/>
        </div>
        {previewUsername&&(
          <div style={{background:C.surface,border:`1px solid ${C.cyan}33`,borderRadius:10,padding:"10px 14px",display:"flex",alignItems:"center",gap:8}}>
            <span style={{color:C.muted,fontSize:12}}>Username:</span>
            <span style={{color:C.cyan,fontSize:13,fontWeight:700,fontFamily:"'Oswald',sans-serif"}}>{previewUsername}</span>
          </div>
        )}
        <div>
          <input style={inp} placeholder="Email address" value={email} onChange={e=>setE(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handle()}/>
          {email.length>0&&!emailValid&&<div style={{color:C.pink,fontSize:12,marginTop:5}}>Enter a valid email address.</div>}
        </div>
        <PwField style={inp} placeholder="Password" value={pw} onChange={e=>setPw(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handle()}/>
        {pw.length>0&&(
          <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"10px 14px",display:"flex",flexDirection:"column",gap:5}}>
            <PwReq ok={pwChecks.len} label="At least 8 characters"/>
            <PwReq ok={pwChecks.upper} label="1 uppercase letter"/>
            <PwReq ok={pwChecks.num} label="1 number"/>
            <PwReq ok={pwChecks.special} label="1 special character"/>
          </div>
        )}
        <div>
          <PwField style={inp} placeholder="Confirm password" value={confirmPw} onChange={e=>setConfirmPw(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handle()}/>
          {confirmPw.length>0&&!pwMatch&&<div style={{color:C.pink,fontSize:12,marginTop:5}}>Passwords don't match.</div>}
        </div>
        <input style={{...inp,opacity:0.7}} placeholder="Phone number (optional)" value={phone} onChange={e=>setPhone(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handle()}/>
        {err&&<div style={{color:C.pink,fontSize:13,textAlign:"center"}}>{err}</div>}
        <GBtn label={loading?"Creating account...":"Create Account →"} onClick={handle} disabled={!canSubmit} style={{marginTop:4,width:"100%"}}/>
        <button onClick={onBack} style={{background:"none",border:"none",color:C.muted,fontSize:13,cursor:"pointer",padding:"8px",fontFamily:"inherit",textAlign:"center"}}>← Back to login</button>
      </div>
    </div>
  );
};

// ── Home ──
const HomeScreen=({profile,pkg,sessions,onNav,onOpenSession,token,userId,onPkgUpdate,onOpenNotif,notifCount})=>{
  const [now,setNow]=useState(new Date());
  const [todaySlots,setTodaySlots]=useState([]);
  const [myTodayBook,setMyBook]=useState(null);
  const [myUpcomingBooks,setMyUpcomingBooks]=useState([]);
  const [myWeekBooks,setMyWeekBooks]=useState([]);
  const [todaySlotCount,setTodaySlotCount]=useState(null);
  const [wodDay,setWodDay]=useState(null); // day number to show WOD for, or null
  const [cancelReDlg,setCancelReDlg]=useState(null);
  const [cancelReqSess,setCancelReqSess]=useState(null); // 48h cancel request session
  const [homeToast,setHomeToast]=useState(null);
  const showHomeToast=(msg,ok=false)=>{setHomeToast({msg,ok});setTimeout(()=>setHomeToast(null),3500);};

  useEffect(()=>{
    const dow=todayDow(); const today=todayISO();
    const ws=WDATES_BASE[0].iso; const we=WDATES_BASE[5].iso;
    Promise.all([
      getActiveSlots(dow,token),
      getMyBooks(userId,today,token),
      getMyUpcomingBooks(userId,today,token),
      getMyWeekBooks(userId,ws,we,token),
      getDayBooks(today,token),
    ]).then(([slots,myBooks,upBooks,wkBooks,dayBooks])=>{
      setTodaySlots(slots||[]);
      const booked=(myBooks||[]).find(b=>b.status==="booked")||null;
      setMyBook(booked);
      setMyUpcomingBooks(upBooks||[]);
      setMyWeekBooks(wkBooks||[]);
      if(booked) setTodaySlotCount((dayBooks||[]).filter(b=>b.slot_id===booked.slot_id).length);
    }).catch(()=>{});
  },[token,userId]);

  const today=todayISO();
  const left=pkg?pkg.sessions_total-pkg.sessions_used:0;
  const pct =pkg?(pkg.sessions_used/pkg.sessions_total)*100:0;
  const spw =pkg?.sessions_per_week||3;

  const upcoming=sessions
    .filter(s=>{
      if(s.status!=="booked") return false;
      const [yr,mo,dy]=s.session_date.split('-').map(Number);
      const dt=new Date(yr,mo-1,dy,Math.floor(s.start_time_min/60),s.start_time_min%60,0);
      return dt>now;
    })
    .sort((a,b)=>{
      const ta=new Date(a.session_date+"T00:00:00").getTime()+a.start_time_min*60000;
      const tb=new Date(b.session_date+"T00:00:00").getTime()+b.start_time_min*60000;
      return ta-tb;
    });

  const bookingItems=(()=>{
    const all=myUpcomingBooks
      .filter(b=>b.schedule_slots)
      .map(b=>({id:`bk_${b.id}`,_bookingId:b.id,session_date:b.book_date,start_time_min:b.schedule_slots.start_time_min,status:"booked",_fromBooking:true}))
      .filter(b=>{const [yr,mo,dy]=b.session_date.split('-').map(Number);return new Date(yr,mo-1,dy,Math.floor(b.start_time_min/60),b.start_time_min%60,0)>now;});
    // Deduplicate by date — custom-time sessions create one booking per overlapping slot;
    // keep only the earliest start time per date so the client sees one entry
    const byDate=new Map();
    all.forEach(b=>{if(!byDate.has(b.session_date)||b.start_time_min<byDate.get(b.session_date).start_time_min) byDate.set(b.session_date,b);});
    return [...byDate.values()];
  })();
  const usedDates=new Set(upcoming.map(s=>s.session_date));
  const allUpcoming=[...upcoming,...bookingItems.filter(b=>!usedDates.has(b.session_date))].sort((a,b)=>{
    const ta=new Date(a.session_date+"T00:00:00").getTime()+a.start_time_min*60000;
    const tb=new Date(b.session_date+"T00:00:00").getTime()+b.start_time_min*60000;
    return ta-tb;
  });
  const recent=sessions.filter(s=>s.status==="completed").slice(0,3);

  const weekStart=WDATES_BASE[0].iso;
  const weekEnd=WDATES_BASE[5].iso;
  const thisWeekSessions=sessions.filter(s=>
    (s.status==="booked"||s.status==="completed")&&
    s.session_date>=weekStart&&s.session_date<=weekEnd
  ).sort((a,b)=>a.session_date.localeCompare(b.session_date));
  const weekBookedDates=new Set([
    ...thisWeekSessions.map(s=>s.session_date),
    ...(myWeekBooks||[]).map(b=>b.book_date),
  ]);
  const weekCount=weekBookedDates.size;
  const weekFull=!!pkg&&weekCount>=spw;

  const myBookedSlot=myTodayBook?todaySlots.find(s=>s.id===myTodayBook.slot_id):null;

  const cdShort=(s)=>{
    const [yr,mo,dy]=s.session_date.split('-').map(Number);
    const dt=new Date(yr,mo-1,dy,Math.floor(s.start_time_min/60),s.start_time_min%60,0);
    const m=Math.round((dt-now)/60000);
    if(m<=0) return "now";
    const d=Math.floor(m/1440),h=Math.floor((m%1440)/60),mn=m%60;
    if(d>=1) return `${d}d ${h}h`;
    if(h>0) return `${h}h ${mn}m`;
    return `${mn}m`;
  };
  const countdownHMS=(startMin,dateStr)=>{
    const totalSec=Math.floor((sessionDT({session_date:dateStr,start_time_min:startMin})-now.getTime())/1000);
    if(totalSec<=0) return null;
    return {h:Math.floor(totalSec/3600),m:Math.floor((totalSec%3600)/60),s:totalSec%60};
  };

  const cancelAndReschedule=(s)=>{
    // Check if session is within 48 hours
    const msToSession=sessionDT({session_date:s.session_date,start_time_min:s.start_time_min})-Date.now();
    if(msToSession<48*3600000&&msToSession>0){
      // Within 48h — show cancel request dialog instead
      setCancelReqSess({bookingId:s._bookingId||null,date:s.session_date,startMin:s.start_time_min});
      return;
    }
    setCancelReDlg({
      msg:"Cancel this booking and go to schedule to rebook?",
      okLabel:"Cancel & Rebook",
      onOk:async()=>{
        try{
          if(s._fromBooking&&s._bookingId){
            await dbPatch("bookings",`id=eq.${s._bookingId}`,{status:"cancelled"},token);
          } else {
            await dbPatch("sessions",`id=eq.${s.id}`,{status:"cancelled"},token);
          }
          if(pkg){
            const newUsed=Math.max((pkg.sessions_used||0)-1,0);
            await dbPatch("packages",`id=eq.${pkg.id}`,{sessions_used:newUsed},token);
            onPkgUpdate?.({...pkg,sessions_used:newUsed});
          }
          onNav("schedule");
        }catch(e){ showHomeToast("Error: "+e.message); }
      }
    });
  };

  const heroItem=allUpcoming[0]||null;
  const heroIsToday=heroItem?.session_date===today;
  const heroDT=heroItem?sessionDT({session_date:heroItem.session_date,start_time_min:heroItem.start_time_min}):null;
  const inTraining=heroDT!=null&&now.getTime()>=heroDT&&now.getTime()<heroDT+SESS_MIN*60000;

  // Self-adjusting ticker: 1s resolution whenever today's session countdown is on screen, 60s otherwise
  useEffect(()=>{
    let timer;
    const tick=()=>{
      setNow(new Date());
      const interval=heroIsToday?1000:60000;
      timer=setTimeout(tick,interval);
    };
    tick();
    return ()=>clearTimeout(timer);
  },[heroIsToday,heroItem?.start_time_min]);

  const heroCd=heroItem&&!inTraining?countdownHMS(heroItem.start_time_min,heroItem.session_date):null;
  // Day numbering: weekly-scoped — Day 1/2/3 resets every Monday
  const donePerWk={};sessions.filter(s=>s.status==="completed").forEach(s=>{const wk=weekMon(s.session_date);donePerWk[wk]=(donePerWk[wk]||0)+1;});
  const dayNumForIndex=(i)=>{
    if(!pkg) return null;
    const sess=allUpcoming[i];
    if(!sess) return (weekCount%spw)+1; // "next booking" CTA: next available slot this week
    const wk=weekMon(sess.session_date);
    const done=donePerWk[wk]||0;
    const before=allUpcoming.slice(0,i).filter(u=>weekMon(u.session_date)===wk).length;
    return (done+before)%spw+1;
  };
  const heroDayNum=heroItem?dayNumForIndex(0):null;
  const nextBookDayNum=dayNumForIndex(allUpcoming.length);

  const statusPool=[
    ...sessions.filter(s=>s.status==="booked"||s.status==="completed"),
    ...allUpcoming.filter(s=>s._fromBooking),
  ].map(s=>({...s,_key:s.id}));
  const statusMap=computeStatusMap(statusPool,now);
  const middleUpcoming=allUpcoming.slice(1,4);

  const hour=now.getHours();
  const greeting=hour<12?"morning":hour<17?"afternoon":"evening";
  const dateStr=now.toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"});

  const [notifDismissed,setNotifDismissed]=useState(false);
  const notifState=typeof Notification!=="undefined"?Notification.permission:"denied";
  const showNotifBanner=!notifDismissed&&notifState==="default"&&typeof PushManager!=="undefined";
  const enableNotifs=async()=>{
    if(!('serviceWorker' in navigator)) return;
    try{
      const reg=await navigator.serviceWorker.register('/sw.js',{scope:'/'});
      const perm=await Notification.requestPermission();
      console.log('[UA Push] Permission after request:',perm);
      if(perm==='granted'){
        const existing=await reg.pushManager.getSubscription();
        const sub=existing||await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlBase64ToUint8Array(VAPID_PUBLIC_KEY)});
        if(sub){
          console.log('[UA Push] Subscription:',sub.endpoint.slice(0,60)+'...');
          await savePushSub(userId,sub.toJSON(),token);
        }
      }
    }catch(e){ console.error('[UA Push] enableNotifs error:',e); }
    setNotifDismissed(true);
  };

  return(
    <div style={{paddingBottom:80}}>
      {/* Notification enable banner */}
      {showNotifBanner&&(
        <div style={{margin:"12px 16px 0",background:C.cyan+"18",border:`1px solid ${C.cyan}44`,borderRadius:12,padding:"12px 14px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:20}}>🔔</span>
            <div>
              <div style={{color:C.white,fontSize:13,fontWeight:700}}>Enable Notifications</div>
              <div style={{color:C.muted,fontSize:11,marginTop:1}}>Get alerts when your trainer books a session</div>
            </div>
          </div>
          <div style={{display:"flex",gap:6,flexShrink:0}}>
            <button onClick={enableNotifs} style={{background:C.cyan,border:"none",borderRadius:8,padding:"6px 12px",color:C.bg,fontSize:12,fontWeight:800,cursor:"pointer",fontFamily:"inherit"}}>Enable</button>
            <button onClick={()=>setNotifDismissed(true)} style={{background:"none",border:"none",color:C.muted,fontSize:16,cursor:"pointer",padding:"4px 6px",fontFamily:"inherit"}}>✕</button>
          </div>
        </div>
      )}
      {/* WOD Sheet */}
      {wodDay&&pkg?.workout_templates&&(
        <WODSheet
          programName={pkg.workout_templates.name}
          dayNum={wodDay}
          exercises={getDayExercises(pkg.workout_templates.exercises,wodDay,spw)}
          onClose={()=>setWodDay(null)}
        />
      )}
      {/* Date + greeting header */}
      <div style={{padding:"22px 20px 0",display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <div>
          <div style={{color:C.muted,fontSize:13}}>Good {greeting},</div>
          <div style={{color:C.white,fontSize:20,fontWeight:800,fontFamily:"'Oswald',sans-serif",letterSpacing:0.5}}>{(()=>{const lz=s=>{const G={'α':'a','β':'v','γ':'g','δ':'d','ε':'e','ζ':'z','η':'i','θ':'th','ι':'i','κ':'k','λ':'l','μ':'m','ν':'n','ξ':'x','ο':'o','π':'p','ρ':'r','σ':'s','ς':'s','τ':'t','υ':'y','φ':'f','χ':'ch','ψ':'ps','ω':'o','ά':'a','έ':'e','ή':'i','ί':'i','ό':'o','ύ':'y','ώ':'o','ϊ':'i','ΐ':'i','ϋ':'y','ΰ':'y'};let r='';for(const c of s.toLowerCase()){r+=G[c]||(c.normalize('NFD').replace(/[̀-ͯ]/g,'')||c);}return r.replace(/[^a-z]/g,'');};const u=profile?.username||"";if(u&&u.includes("."))return u;const n=(profile?.name||"").trim();if(!n)return u||"athlete";const parts=n.split(" ").filter(Boolean);if(parts.length>=2)return`${lz(parts[0])}.${lz(parts.slice(1).join(""))}`;return u||lz(parts[0])||"athlete";})()}</div>
          <div style={{color:C.cyan,fontSize:14,fontWeight:700,marginTop:4}}>{dateStr}</div>
        </div>
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
          <Logo size={52}/>
          <button onClick={onOpenNotif} style={{display:"flex",alignItems:"center",gap:4,background:notifCount>0?C.pink+"22":"rgba(255,255,255,0.05)",border:`1px solid ${notifCount>0?C.pink+"55":"rgba(255,255,255,0.08)"}`,borderRadius:20,padding:"4px 10px",cursor:"pointer",transition:"all .2s",position:"relative"}}>
            <svg width={12} height={12} viewBox="0 0 24 24" fill={notifCount>0?C.pink:C.muted}><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/></svg>
            {notifCount>0
              ?<span style={{background:C.pink,color:"#fff",fontSize:9,fontWeight:900,padding:"1px 5px",borderRadius:10,lineHeight:1.4}}>{notifCount>9?"9+":notifCount}</span>
              :<span style={{color:C.muted,fontSize:9,fontWeight:700,letterSpacing:.5}}>notif</span>
            }
          </button>
        </div>
      </div>

      {/* No-package warning */}
      {!pkg&&(
        <div style={{padding:"14px 20px 0"}}>
          <div style={{background:C.amber+"22",border:`1px solid ${C.amber}55`,borderRadius:12,padding:"13px 16px",display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:20}}>⚠️</span>
            <div>
              <div style={{color:C.amber,fontSize:14,fontWeight:700}}>No Active Package</div>
              <div style={{color:C.muted,fontSize:12,marginTop:2}}>Contact your trainer to get started.</div>
            </div>
          </div>
        </div>
      )}

      {/* TOP: next upcoming session, or Book CTA */}
      {heroItem?(
        <div style={{padding:"14px 20px 0"}}>
          <div style={{background:`linear-gradient(135deg,${C.cyan},${C.pink})`,borderRadius:20,padding:"18px 20px",boxSizing:"border-box"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <span style={{background:"rgba(0,0,0,0.25)",borderRadius:20,padding:"4px 11px",color:C.white,fontSize:11,fontWeight:800}}>{heroIsToday?"Today":new Date(heroItem.session_date+"T12:00:00").toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"short"})}</span>
              {pkg?.workout_templates?.name&&<span style={{color:"rgba(255,255,255,0.85)",fontSize:11,fontWeight:700,fontFamily:"'Oswald',sans-serif",letterSpacing:1,textTransform:"uppercase"}}>{sessLabel(pkg.workout_templates.name)}</span>}
              {heroDayNum&&<span style={{background:"rgba(0,0,0,0.25)",borderRadius:20,padding:"4px 11px",color:C.white,fontSize:11,fontWeight:800}}>Day {heroDayNum}</span>}
            </div>

            {inTraining?(
              <div style={{textAlign:"center",padding:"6px 0"}}>
                <div style={{color:C.bg,fontSize:22,fontWeight:900}}>🏋️ Training in progress</div>
                <div style={{color:C.bg,fontSize:13,fontWeight:700,marginTop:4,opacity:0.85}}>{toTime(heroItem.start_time_min)} – {toTime(heroItem.start_time_min+SESS_MIN)}</div>
              </div>
            ):(
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end"}}>
                <div>
                  <div style={{color:C.bg,fontSize:32,fontWeight:900,lineHeight:1}}>{toTime(heroItem.start_time_min)}</div>
                  <div style={{color:C.bg,fontSize:12,fontWeight:700,marginTop:6,opacity:0.85}}>⏱ 90 min{heroIsToday&&todaySlotCount!=null?` · 👥 ${todaySlotCount}/${GYM_CAP} spots`:""}</div>
                </div>
                {heroCd?(
                  <div style={{textAlign:"right"}}>
                    <div style={{color:C.bg,fontSize:10,fontWeight:800,letterSpacing:1,opacity:0.75,marginBottom:2}}>{heroIsToday?"STARTS IN":`in ${cdShort(heroItem)}`}</div>
                    {heroIsToday&&(
                      <div style={{display:"flex",alignItems:"baseline",gap:1}}>
                        {heroCd.h>0&&<span style={{color:C.bg,fontSize:24,fontWeight:900,fontVariantNumeric:"tabular-nums"}}>{String(heroCd.h).padStart(2,"0")}:</span>}
                        <span style={{color:C.bg,fontSize:24,fontWeight:900,fontVariantNumeric:"tabular-nums"}}>{String(heroCd.m).padStart(2,"0")}:{String(heroCd.s).padStart(2,"0")}</span>
                      </div>
                    )}
                  </div>
                ):<div style={{color:C.bg,fontSize:16,fontWeight:900}}>🔥 Now</div>}
              </div>
            )}
            {/* Check WOD button — shown when program has day plans */}
            {heroDayNum&&pkg?.workout_templates&&(
              <button onClick={()=>setWodDay(heroDayNum)} style={{marginTop:12,width:"100%",background:"rgba(0,0,0,0.25)",border:"1px solid rgba(255,255,255,0.25)",borderRadius:10,padding:"9px 14px",color:C.white,fontSize:13,fontWeight:800,cursor:"pointer",fontFamily:"inherit",letterSpacing:0.5,display:"flex",alignItems:"center",justifyContent:"center",gap:7}}>
                <span>📋</span> Check WOD — Day {heroDayNum}
              </button>
            )}
          </div>
        </div>
      ):pkg&&weekFull?(
        <div style={{padding:"14px 20px 0"}}>
          <div style={{background:C.green+"18",border:`1px solid ${C.green}44`,borderRadius:14,padding:"16px 18px"}}>
            <div style={{color:C.green,fontSize:15,fontWeight:800,marginBottom:6}}>Week Complete 💪</div>
            <div style={{color:C.muted,fontSize:13,lineHeight:1.5}}>{weekCount} of {spw} sessions done this week. Time to rest — for an extra session, message your trainer.</div>
          </div>
        </div>
      ):pkg&&left>0?(
        <div style={{padding:"14px 20px 0"}}>
          <button onClick={()=>onNav("schedule")} style={{width:"100%",background:`linear-gradient(135deg,${C.cyan},${C.pink})`,border:"none",borderRadius:18,padding:"22px 20px",color:C.white,fontSize:18,fontWeight:900,cursor:"pointer",fontFamily:"inherit"}}>Book Day {nextBookDayNum} →</button>
        </div>
      ):pkg&&left<=0?(
        <div style={{padding:"14px 20px 0"}}>
          <div style={{background:C.pink+"18",border:`1px solid ${C.pink}44`,borderRadius:14,padding:"16px 18px"}}>
            <div style={{color:C.pink,fontSize:15,fontWeight:800,marginBottom:6}}>Package Complete</div>
            <div style={{color:C.muted,fontSize:13,lineHeight:1.5}}>You've used all {pkg.sessions_total} sessions. Contact your trainer to renew.</div>
          </div>
        </div>
      ):null}

      {/* MIDDLE: Your Next Sessions */}
      {middleUpcoming.length>0&&(
        <div style={{padding:"14px 20px 0"}}>
          <SL>Your Next Sessions</SL>
          {middleUpcoming.map((s,i)=>{
            const dn=dayNumForIndex(i+1);
            return(
              <div key={s.id||i} style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:14,padding:"13px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,boxSizing:"border-box"}}>
                <div style={{flex:1,cursor:s._fromBooking?undefined:"pointer"}} onClick={s._fromBooking?undefined:()=>onOpenSession(s)}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                    {dn&&<span style={{background:`linear-gradient(135deg,${C.cyan},${C.pink})`,color:C.white,fontSize:11,fontWeight:800,padding:"3px 9px",borderRadius:20,flexShrink:0}}>Day {dn}</span>}
                    <StatusBadge status={statusMap[s.id]}/>
                  </div>
                  <div style={{color:C.white,fontSize:14,fontWeight:700}}>{weekDayShort(s.session_date)} · {fmtDate(s.session_date)} · {toTime(s.start_time_min)}</div>
                  <div style={{color:C.muted,fontSize:12,marginTop:2}}>in {cdShort(s)}</div>
                </div>
                <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6,flexShrink:0,marginLeft:10}}>
                  {dn&&pkg?.workout_templates&&(
                    <button onClick={()=>setWodDay(dn)} style={{background:`${C.cyan}18`,border:`1px solid ${C.cyan}55`,borderRadius:8,padding:"4px 10px",color:C.cyan,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>📋 WOD</button>
                  )}
                  <button onClick={()=>cancelAndReschedule(s)} style={{background:"none",border:`1px solid ${C.pink}55`,borderRadius:8,padding:"4px 10px",color:C.pink,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Change</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Secondary Book CTA — shown when hero exists and still have days to book */}
      {heroItem&&pkg&&left>0&&!weekFull&&(
        <div style={{padding:"14px 20px 0"}}>
          <button onClick={()=>onNav("schedule")} style={{width:"100%",background:"none",border:`2px solid ${C.cyan}`,borderRadius:14,padding:"14px 18px",color:C.cyan,fontSize:15,fontWeight:800,cursor:"pointer",fontFamily:"'Oswald',sans-serif",letterSpacing:1.5,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
            <span>📅</span> Book Day {nextBookDayNum} →
          </button>
        </div>
      )}

      {/* Package */}
      {pkg&&(
        <div style={{padding:"14px 20px 0"}}>
          <Card>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
              <div>
                {pkg.workout_templates?.name&&<div style={{color:C.cyan,fontSize:13,fontWeight:800,letterSpacing:1,fontFamily:"'Oswald',sans-serif",textTransform:"uppercase",marginBottom:2}}>{pkg.workout_templates.name}</div>}
                <div style={{color:C.white,fontSize:14,fontWeight:700}}>{pkg.sessions_total}-Session Pack · {spw}x/week</div>
                <div style={{color:C.muted,fontSize:12,marginTop:3}}>Expires {fmtDate(pkg.end_date)}</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{color:left<=2?C.pink:C.cyan,fontSize:26,fontWeight:900,lineHeight:1}}>{left}</div>
                <div style={{color:C.muted,fontSize:10,fontWeight:700}}>LEFT</div>
              </div>
            </div>
            <div style={{height:6,background:C.surface2,borderRadius:3}}>
              <div style={{width:`${pct}%`,height:"100%",borderRadius:3,background:`linear-gradient(90deg,${C.cyan},${C.pink})`}}/>
            </div>
          </Card>
        </div>
      )}

      {/* View Schedule link */}
      {pkg&&(
        <div style={{padding:"14px 20px 0",display:"flex",flexDirection:"column",gap:8}}>
          <button onClick={()=>onNav("schedule")} style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"14px 18px",display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer",fontFamily:"inherit"}}>
            <div style={{color:C.white,fontSize:14,fontWeight:700}}>📅 View Full Schedule</div>
            <span style={{color:C.cyan,fontSize:14,fontWeight:700}}>›</span>
          </button>
        </div>
      )}

      {/* Recent sessions */}
      <div style={{padding:"14px 20px 0"}}>
        <SL>Recent Sessions</SL>
        {recent.length===0?<Empty msg="No completed sessions yet"/>:
          recent.map((s,i)=>{
            const dn=computeDayNum(s,sessions,spw);
            return(
              <button key={i} onClick={()=>onOpenSession(s)} style={{width:"100%",textAlign:"left",cursor:"pointer",fontFamily:"inherit",padding:0,border:"none",display:"block",marginBottom:8}}>
                <Card>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div style={{display:"flex",alignItems:"center",gap:12}}>
                      <div style={{width:36,height:36,borderRadius:10,background:C.cyan+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>💪</div>
                      <div>
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          <div style={{color:C.white,fontSize:14,fontWeight:600}}>{sessLabel(pkg?.workout_templates?.name)}</div>
                          {dn&&<span style={{background:`linear-gradient(135deg,${C.cyan},${C.pink})`,color:C.white,fontSize:10,fontWeight:800,padding:"2px 6px",borderRadius:20}}>Day {dn}</span>}
                        </div>
                        <div style={{color:C.muted,fontSize:12}}>{weekDayShort(s.session_date)} · {fmtDate(s.session_date)} · {toTime(s.start_time_min)}</div>
                      </div>
                    </div>
                    <StatusBadge status="completed"/>
                  </div>
                </Card>
              </button>
            );
          })
        }
      </div>
      <UaToast toast={homeToast} c={C}/>
      <UaConfirm dialog={cancelReDlg} setDialog={setCancelReDlg} c={C}/>
      {cancelReqSess&&(
        <CancelRequestSheet
          bookDate={cancelReqSess.date}
          startMin={cancelReqSess.startMin}
          bookingId={cancelReqSess.bookingId}
          userId={userId}
          token={token}
          onClose={()=>setCancelReqSess(null)}
        />
      )}
    </div>
  );
};

// ── Schedule ──
const ScheduleScreen=({userId,token,sessions,pkg,onPkgUpdate})=>{
  const [weekOffset,setWeekOffset]=useState(0);
  const [dayIdx,setDay]=useState(todayDow());
  const [slots,setSlots]=useState([]);
  const [counts,setCounts]=useState({});
  const [myBooks,setMyB]=useState([]);
  const [myWaitlist,setMyWaitlist]=useState([]);
  const [myWeekBookDates,setMyWeekBookDates]=useState(new Set());
  const [loading,setLoad]=useState(false);
  const [toast,setToast]=useState(null);
  const [schedErrToast,setSchedErrToast]=useState(null);
  const showSchedErr=(msg,ok=false)=>{setSchedErrToast({msg,ok});setTimeout(()=>setSchedErrToast(null),3500);};
  const [weekMsgVisible,setWeekMsgVisible]=useState(false);
  const [activeSession,setAS]=useState(null);
  const [showCustom,setShowC]=useState(false);
  const [pickH,setPickH]=useState(null);
  const [pickM,setPickM]=useState(0);
  const [reqSent,setReqSent]=useState(false);
  const [reqSending,setReqSending]=useState(false);
  const [cancelReqSlot,setCancelReqSlot]=useState(null); // {bookingId,date,startMin}
  const [activePeriod,setActivePeriod]=useState(null);
  const spw=pkg?.sessions_per_week||3;

  const weekDates=Array.from({length:7},(_,i)=>{
    const iso=addDays(WDATES_BASE[0].iso,weekOffset*7+i);
    const d=new Date(iso+"T12:00:00");
    return {label:d.getDate(),iso,dow:i};
  });
  const selDay=weekDates[dayIdx];
  const todayStr=todayISO();
  const isSun=dayIdx===6;
  const isPastDay=selDay.iso<todayStr;
  const isCurrentWeek=weekOffset===0;

  const thisWeekSessionDates=new Set(sessions.filter(s=>
    (s.status==="booked"||s.status==="completed")&&
    s.session_date>=WDATES_BASE[0].iso&&s.session_date<=WDATES_BASE[5].iso
  ).map(s=>s.session_date));
  const combinedWeekDates=new Set([...thisWeekSessionDates,...myWeekBookDates]);
  const currentWeekFull=isCurrentWeek&&!!pkg&&combinedWeekDates.size>=spw;

  const [weekBookDates,setWeekBookDates]=useState(new Set());
  const sessionDaySet=new Set([
    ...sessions.filter(s=>s.status==="completed"||s.status==="booked").map(s=>s.session_date),
    ...weekBookDates,
  ]);

  useEffect(()=>{
    const ws=WDATES_BASE[0].iso,we=WDATES_BASE[5].iso;
    dbGet("bookings",`client_id=eq.${userId}&book_date=gte.${ws}&book_date=lte.${we}&status=eq.booked&select=book_date`,token)
      .then(r=>setMyWeekBookDates(new Set((r||[]).map(b=>b.book_date)))).catch(()=>{});
    getActivePeriodForToday(token).then(p=>setActivePeriod(p||null)).catch(()=>{});
  },[]);

  useEffect(()=>{
    const ws=weekDates[0].iso,we=weekDates[6].iso;
    dbGet("bookings",`client_id=eq.${userId}&book_date=gte.${ws}&book_date=lte.${we}&status=eq.booked&select=book_date`,token)
      .then(r=>setWeekBookDates(new Set((r||[]).map(b=>b.book_date))))
      .catch(()=>{});
  },[weekOffset]);

  useEffect(()=>{
    if(isSun||isPastDay){ setSlots([]); setCounts({}); setMyB([]); setMyWaitlist([]); setLoad(false); return; }
    setLoad(true); setReqSent(false);
    Promise.all([
      getActiveSlots(selDay.dow,token),
      getDayBooks(selDay.iso,token),
      getMyBooks(userId,selDay.iso,token),
      getMyWaitlistDay(userId,selDay.iso,token),
    ]).then(([sl,bks,mb,wl])=>{
      setSlots(sl||[]);
      const c={}; (bks||[]).forEach(b=>{c[b.slot_id]=(c[b.slot_id]||0)+1;}); setCounts(c);
      setMyB(mb||[]);
      setMyWaitlist(wl||[]);
    }).catch(()=>{}).finally(()=>setLoad(false));
  },[dayIdx,weekOffset]);

  const adjustPkgUsed=async(delta)=>{
    if(!pkg) return;
    const newUsed=Math.max((pkg.sessions_used||0)+delta,0);
    try{
      await updatePkgUsed(pkg.id,newUsed,token);
      onPkgUpdate?.({...pkg,sessions_used:newUsed});
      const newLeft=pkg.sessions_total-newUsed;
      if(delta>0&&(newLeft===2||newLeft===1)){
        await postNotification({client_id:userId,type:"low_sessions",message:`You have ${newLeft} session${newLeft>1?"s":""} left in your package. Talk to your trainer about renewing.`},token).catch(()=>{});
      }
    }catch(e){}
  };

  const handleBook=async(slot)=>{
    const already=myBooks.find(b=>b.slot_id===slot.id&&b.status==="booked");
    if(already){
      const msToSession=sessionDT({session_date:selDay.iso,start_time_min:slot.start_time_min})-Date.now();
      if(msToSession<48*3600000){
        setCancelReqSlot({bookingId:already.id,date:selDay.iso,startMin:slot.start_time_min});
        return;
      }
      await cancelBook(already.id,token).catch(()=>{});
      setMyB(p=>p.filter(b=>b.id!==already.id));
      setCounts(p=>({...p,[slot.id]:Math.max((p[slot.id]||1)-1,0)}));
      if(isCurrentWeek) setMyWeekBookDates(p=>{ const n=new Set(p); n.delete(selDay.iso); return n; });
      setWeekBookDates(p=>{ const n=new Set(p); n.delete(selDay.iso); return n; });
      adjustPkgUsed(-1);
      const waitlist=await getSlotWaitlist(slot.id,selDay.iso,token).catch(()=>[]);
      if(waitlist?.length>0){
        const first=waitlist[0];
        try{
          await bookSlot(slot.id,first.client_id,selDay.iso,token);
          await leaveWaitlist(first.id,token);
          setCounts(p=>({...p,[slot.id]:(p[slot.id]||0)+1}));
          const promotedPkg=await getPackage(first.client_id,token).catch(()=>null);
          if(promotedPkg) await updatePkgUsed(promotedPkg.id,(promotedPkg.sessions_used||0)+1,token).catch(()=>{});
          await postNotification({client_id:first.client_id,type:"waitlist_promoted",message:`A spot opened up — you've been booked for ${fmtDate(selDay.iso)} at ${toTime(slot.start_time_min)}!`},token).catch(()=>{});
        }catch(e){}
      }
      return;
    }
    // "Change" case: already have a booking on a different slot today — net zero on package credits
    const existingDayBook=myBooks.find(b=>b.status==="booked");
    if(existingDayBook){
      const cnt=counts[slot.id]||0;
      if(cnt>=GYM_CAP){ setToast({slot,next:null}); return; }
      await cancelBook(existingDayBook.id,token).catch(()=>{});
      setMyB(p=>p.filter(b=>b.id!==existingDayBook.id));
      setCounts(p=>({...p,[existingDayBook.slot_id]:Math.max((p[existingDayBook.slot_id]||1)-1,0)}));
      try{ const bk=await bookSlot(slot.id,userId,selDay.iso,token); const created=Array.isArray(bk)?bk[0]:bk; if(created){setMyB(p=>[...p,created]);setCounts(p=>({...p,[slot.id]:(p[slot.id]||0)+1}));setWeekBookDates(p=>new Set(p).add(selDay.iso));} }
      catch(e){ showSchedErr("Error: "+e.message); }
      return;
    }
    if(pkg&&(pkg.sessions_total-pkg.sessions_used)<=0){
      showSchedErr("You've used all sessions in your package. Contact your trainer to renew.");
      return;
    }
    // Week-full check (applies to ALL viewed weeks)
    if(!!pkg&&weekBookDates.size>=spw){
      setWeekMsgVisible(true); setTimeout(()=>setWeekMsgVisible(false),3000); return;
    }
    const cnt=counts[slot.id]||0;
    if(cnt>=GYM_CAP){ const next=slots.find(s=>s.id!==slot.id&&(counts[s.id]||0)<GYM_CAP); setToast({slot,next}); return; }
    try{
      const bk=await bookSlot(slot.id,userId,selDay.iso,token); const created=Array.isArray(bk)?bk[0]:bk;
      if(created){ setMyB(p=>[...p,created]); setCounts(p=>({...p,[slot.id]:(p[slot.id]||0)+1})); if(isCurrentWeek) setMyWeekBookDates(p=>new Set(p).add(selDay.iso)); setWeekBookDates(p=>new Set(p).add(selDay.iso)); adjustPkgUsed(1); }
    }catch(e){ showSchedErr("Error: "+e.message); }
  };

  const handleWaitlist=async(slot)=>{
    const entry=myWaitlist.find(w=>w.slot_id===slot.id);
    if(entry){
      await leaveWaitlist(entry.id,token).catch(()=>{});
      setMyWaitlist(p=>p.filter(w=>w.id!==entry.id));
      return;
    }
    const wl=await getSlotWaitlist(slot.id,selDay.iso,token).catch(()=>[]);
    const position=(wl?.length||0)+1;
    try{
      const r=await joinWaitlist({slot_id:slot.id,client_id:userId,book_date:selDay.iso,position},token);
      const created=Array.isArray(r)?r[0]:r;
      if(created) setMyWaitlist(p=>[...p,created]);
    }catch(e){ showSchedErr("Error joining waitlist: "+e.message); }
  };

  const confirmNext=async()=>{ if(toast?.next) await handleBook(toast.next); setToast(null); };
  const customStart=pickH!=null?pickH*60+pickM:null;
  const customConflict=customStart!=null&&slots.find(s=>s.start_time_min===customStart);

  const handleSlotRequest=async()=>{
    if(!customStart||customConflict||reqSending) return;
    setReqSending(true);
    try{
      await postSlotRequest({client_id:userId,requested_date:selDay.iso,requested_time_min:customStart,status:"pending"},token);
      setReqSent(true);
    }catch(e){ showSchedErr("Error: "+e.message); }
    setReqSending(false);
  };

  const SlotCard=({slot})=>{
    const booked=myBooks.find(b=>b.slot_id===slot.id&&b.status==="booked");
    const myDayBook=myBooks.find(b=>b.status==="booked");
    const hasOtherBook=myDayBook&&!booked;
    const onWaitlist=myWaitlist.find(w=>w.slot_id===slot.id);
    const cnt=(counts[slot.id]||0);
    const full=!booked&&cnt>=GYM_CAP;
    const [waitlistRank,setWaitlistRank]=useState(null);
    useEffect(()=>{
      if(!onWaitlist){ setWaitlistRank(null); return; }
      getSlotWaitlist(slot.id,selDay.iso,token).then(wl=>{
        const idx=(wl||[]).findIndex(w=>w.client_id===userId);
        setWaitlistRank(idx>=0?idx+1:null);
      }).catch(()=>{});
    },[onWaitlist?.id]);
    // Count booked/completed days in the viewed week up to and including selDay
    // sessionDaySet already combines sessions prop + weekBookDates (updated on booking)
    const bookedDayNum=booked?(([...sessionDaySet].filter(d=>d>=weekDates[0].iso&&d<=selDay.iso).length)||null):null;
    return(
      <Card glow={booked?C.cyan:null} style={{marginBottom:10}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
          <div>
            <div style={{color:C.white,fontSize:15,fontWeight:800}}>{sessLabel(pkg?.workout_templates?.name)}</div>
            <div style={{color:C.muted,fontSize:13,marginTop:2}}>{toSlot(slot.start_time_min)}</div>
          </div>
          {booked
            ?<GBtn label="✕ Cancel" onClick={()=>handleBook(slot)} sm ghost color={C.muted}/>
            :full
              ?<button onClick={()=>handleWaitlist(slot)} style={{background:onWaitlist?C.amber+"33":C.pink+"20",border:`1px solid ${onWaitlist?C.amber+"55":C.pink+"44"}`,borderRadius:8,padding:"8px 14px",color:onWaitlist?C.amber:C.pink,fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>
                {onWaitlist?(waitlistRank?`#${waitlistRank} on waitlist`:"On Waitlist ✓"):"Join Waitlist"}
              </button>
              :hasOtherBook
                ?<GBtn label="Change →" onClick={()=>handleBook(slot)} sm/>
                :<GBtn label="Book" onClick={()=>handleBook(slot)} sm/>
          }
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{color:booked?C.cyan:full?C.pink:C.green,fontSize:12,fontWeight:700}}>
            {booked?"Booked ✓":full?"Full":onWaitlist&&waitlistRank?`You are #${waitlistRank} on the waitlist`:"Available"}
          </div>
          {booked&&bookedDayNum&&<span style={{background:`linear-gradient(135deg,${C.cyan},${C.pink})`,color:"#fff",fontSize:10,fontWeight:800,padding:"2px 8px",borderRadius:20}}>Day {bookedDayNum}</span>}
        </div>
      </Card>
    );
  };

  const pastDaySessions=sessions.filter(s=>s.session_date===selDay.iso&&(s.status==="completed"||s.status==="booked"));
  const weekLabel=weekOffset===0?"This week":`Week of ${fmtDate(weekDates[0].iso)}`;
  const nowMin=(()=>{const d=new Date();return d.getHours()*60+d.getMinutes();})();
  const visibleSlots=selDay.iso===todayStr?slots.filter(s=>s.start_time_min>=nowMin||myBooks.some(b=>b.slot_id===s.id&&b.status==="booked")):slots;

  return(
    <div style={{paddingBottom:80}}>
      {weekMsgVisible&&(
        <div style={{position:"fixed",top:20,left:"50%",transform:"translateX(-50%)",width:"calc(100% - 40px)",maxWidth:390,background:C.surface2,border:`1px solid ${C.amber}66`,borderRadius:14,padding:"14px 16px",zIndex:200,textAlign:"center"}}>
          <div style={{color:C.amber,fontWeight:700,fontSize:14}}>Week quota reached — rest up! Contact trainer for extras.</div>
        </div>
      )}
      {cancelReqSlot&&(
        <CancelRequestSheet
          bookDate={cancelReqSlot.date}
          startMin={cancelReqSlot.startMin}
          bookingId={cancelReqSlot.bookingId}
          userId={userId}
          token={token}
          onClose={()=>setCancelReqSlot(null)}
        />
      )}
      {toast&&(
        <div style={{position:"fixed",bottom:90,left:"50%",transform:"translateX(-50%)",width:"calc(100% - 40px)",maxWidth:390,background:C.surface2,border:`1px solid ${C.pink}66`,borderRadius:14,padding:"16px",zIndex:200}}>
          <div style={{color:C.white,fontWeight:700,fontSize:14,marginBottom:6}}>⚠️ That slot is full ({GYM_CAP}/{GYM_CAP})</div>
          {toast.next?<><div style={{color:C.muted,fontSize:13,marginBottom:12}}>Next available: <span style={{color:C.cyan,fontWeight:700}}>{toSlot(toast.next.start_time_min)}</span></div><div style={{display:"flex",gap:8}}><GBtn label="Book that instead" onClick={confirmNext} sm style={{flex:1}}/><GBtn label="Cancel" onClick={()=>setToast(null)} sm ghost color={C.muted} style={{flex:1}}/></div></>
            :<><div style={{color:C.muted,fontSize:13,marginBottom:10}}>No other slots available.</div><GBtn label="Close" onClick={()=>setToast(null)} sm ghost color={C.muted}/></>}
        </div>
      )}
      {activeSession&&<SessionSheet session={{...activeSession,_pkg_spw:spw}} token={token} onClose={()=>setAS(null)}/>}

      <div style={{padding:"22px 20px 12px"}}>
        <div style={{color:C.white,fontSize:22,fontWeight:800,fontFamily:"'Oswald',sans-serif"}}>Book a Session</div>
        <div style={{color:C.muted,fontSize:13,marginTop:2}}>Personal training · 90 min · Max {GYM_CAP} in gym</div>
        {pkg?.workout_templates?.name&&<div style={{color:C.cyan,fontSize:13,fontWeight:700,marginTop:6}}>🏋️ Program: {pkg.workout_templates.name}</div>}
      </div>
      {activePeriod&&(
        <div style={{padding:"0 20px 10px"}}>
          <div style={{background:C.cyan+"18",border:`1px solid ${C.cyan}44`,borderRadius:10,padding:"9px 14px",display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:14}}>📅</span>
            <div>
              <div style={{color:C.cyan,fontSize:12,fontWeight:800}}>Current Period: {activePeriod.name}</div>
              <div style={{color:C.muted,fontSize:11,marginTop:1}}>{fmtDate(activePeriod.start_date)} – {fmtDate(activePeriod.end_date)}</div>
            </div>
          </div>
        </div>
      )}

      {!pkg
        ?<div style={{padding:"0 20px"}}>
            <Card style={{textAlign:"center",padding:"32px 20px"}}>
              <div style={{fontSize:32,marginBottom:12}}>🔒</div>
              <div style={{color:C.white,fontSize:16,fontWeight:800}}>No Active Package</div>
              <div style={{color:C.muted,fontSize:14,marginTop:8,lineHeight:1.5}}>You need an active package to book sessions. Contact your trainer.</div>
            </Card>
          </div>
        :<>
      {/* Week navigation */}
      <div style={{padding:"0 20px 8px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <button onClick={()=>setWeekOffset(p=>p-1)} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"6px 14px",color:C.muted,cursor:"pointer",fontSize:13,fontWeight:700,fontFamily:"inherit"}}>‹</button>
        <span style={{color:weekOffset===0?C.cyan:C.muted,fontSize:13,fontWeight:700}}>{weekLabel}</span>
        <button onClick={()=>setWeekOffset(p=>p+1)} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"6px 14px",color:C.muted,cursor:"pointer",fontSize:13,fontWeight:700,fontFamily:"inherit"}}>›</button>
      </div>

      <div style={{padding:"0 20px 16px",display:"flex",gap:5}}>
        {weekDates.map((d,i)=>{
          const isToday=d.iso===todayStr;
          const hasSess=sessionDaySet.has(d.iso);
          return(
            <button key={i} onClick={()=>setDay(i)} style={{flex:1,padding:"9px 2px",borderRadius:11,border:`1px solid ${isToday&&dayIdx!==i?C.cyan+"55":"transparent"}`,cursor:"pointer",background:dayIdx===i?C.cyan:C.surface,display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
              <span style={{color:dayIdx===i?C.bg:C.muted,fontSize:9,fontWeight:700}}>{WDAYS[i]}</span>
              <span style={{color:dayIdx===i?C.bg:i===6?C.muted:C.white,fontSize:14,fontWeight:900}}>{d.label}</span>
              {hasSess&&<span style={{width:4,height:4,borderRadius:"50%",background:dayIdx===i?C.bg:C.cyan,display:"block"}}/>}
            </button>
          );
        })}
      </div>

      <div style={{padding:"0 20px"}}>
        {isSun
          ?<Card style={{textAlign:"center",padding:"32px 20px"}}><div style={{fontSize:32,marginBottom:12}}>😴</div><div style={{color:C.white,fontSize:18,fontWeight:800}}>Rest Day</div><div style={{color:C.muted,fontSize:14,marginTop:6}}>Gym closed Sundays. See you Monday!</div></Card>
          :isPastDay
            ?pastDaySessions.length===0
              ?<Empty msg="No session on this day"/>
              :pastDaySessions.map((s,i)=>{
                const dn=computeDayNum(s,sessions,spw);
                return(
                  <button key={i} onClick={()=>setAS(s)} style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"14px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",marginBottom:8,fontFamily:"inherit"}}>
                    <div style={{display:"flex",alignItems:"center",gap:12,textAlign:"left"}}>
                      <div style={{width:36,height:36,borderRadius:10,background:C.cyan+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>💪</div>
                      <div>
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          <div style={{color:C.white,fontSize:14,fontWeight:600}}>{sessLabel(pkg?.workout_templates?.name)}</div>
                          {dn&&<span style={{background:`linear-gradient(135deg,${C.cyan},${C.pink})`,color:C.white,fontSize:10,fontWeight:800,padding:"2px 6px",borderRadius:20}}>Day {dn}</span>}
                          <StatusBadge status="completed"/>
                        </div>
                        <div style={{color:C.muted,fontSize:12}}>{weekDayShort(s.session_date)} · {toTime(s.start_time_min)}</div>
                      </div>
                    </div>
                    <span style={{color:C.cyan,fontSize:12,fontWeight:700}}>Notes →</span>
                  </button>
                );
              })
            :loading?<Spinner/>
            :(()=>{
              // Trainer-scheduled sessions for this day (logged directly, not via bookings)
              const trainerSched=sessions.filter(s=>
                s.session_date===selDay.iso&&
                (s.status==="booked"||s.status==="completed")&&
                !myBooks.some(b=>b.slot_id===s.slot_id)
              );
              const dn=trainerSched.length>0?computeDayNum(trainerSched[0],sessions,spw):null;
              return(<>
                {trainerSched.map((s,i)=>(
                  <div key={i} style={{background:C.pink+"18",border:`1px solid ${C.pink}44`,borderRadius:12,padding:"14px 16px",marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div style={{display:"flex",alignItems:"center",gap:12}}>
                      <div style={{width:36,height:36,borderRadius:10,background:C.pink+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>🏋️</div>
                      <div>
                        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
                          <span style={{color:C.white,fontSize:14,fontWeight:700}}>{sessLabel(pkg?.workout_templates?.name)}</span>
                          {dn&&<span style={{background:`linear-gradient(135deg,${C.cyan},${C.pink})`,color:C.white,fontSize:10,fontWeight:800,padding:"2px 6px",borderRadius:20}}>Day {dn}</span>}
                        </div>
                        <div style={{color:C.muted,fontSize:12}}>{toTime(s.start_time_min)} · Scheduled by trainer</div>
                      </div>
                    </div>
                    <span style={{color:C.pink,fontSize:11,fontWeight:800}}>Booked ✓</span>
                  </div>
                ))}
                {visibleSlots.length===0&&trainerSched.length===0&&<Empty msg="No slots available for this day. Contact your trainer."/>}
                {visibleSlots.map(s=><SlotCard key={s.id} slot={s}/>)}
              </>);
            })()
        }

        {!isSun&&!isPastDay&&(
          <>
            <button onClick={()=>setShowC(p=>!p)} style={{width:"100%",background:"transparent",border:`1px dashed ${C.border}`,borderRadius:12,padding:"12px",color:C.muted,fontWeight:700,fontSize:13,cursor:"pointer",marginBottom:10,fontFamily:"inherit"}}>
              {showCustom?"▲ Hide":"+ Request custom time"}
            </button>
            {showCustom&&(
              <div style={{background:C.surface2,borderRadius:12,padding:"14px",marginBottom:10}}>
                <div style={{color:C.muted,fontSize:11,fontWeight:600,marginBottom:8}}>Hour</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:12}}>
                  {HOURS.map(h=><button key={h} onClick={()=>setPickH(pickH===h?null:h)} style={{background:pickH===h?C.pink+"33":C.surface,border:`1px solid ${pickH===h?C.pink:C.border}`,borderRadius:7,padding:"6px 10px",color:pickH===h?C.pink:C.muted,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",minWidth:42,textAlign:"center"}}>{h.toString().padStart(2,'0')}:00</button>)}
                </div>
                <div style={{color:C.muted,fontSize:11,fontWeight:600,marginBottom:8}}>Minutes</div>
                <div style={{display:"flex",gap:8,marginBottom:12}}>
                  {[0,30].map(m=><button key={m} onClick={()=>setPickM(m)} style={{flex:1,background:pickM===m?C.cyan+"33":C.surface,border:`1px solid ${pickM===m?C.cyan:C.border}`,borderRadius:7,padding:"8px",color:pickM===m?C.cyan:C.muted,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>:{m===0?"00":"30"}</button>)}
                </div>
                {customStart!=null&&<div style={{background:C.surface,borderRadius:8,padding:"10px",textAlign:"center",marginBottom:10}}><div style={{color:customConflict?C.amber:C.white,fontSize:14,fontWeight:700}}>{customConflict?"⚠️ Slot already exists":`📅 ${toSlot(customStart)}`}</div></div>}
                {customStart!=null&&!customConflict&&(
                  reqSent
                    ?<div style={{textAlign:"center",padding:"10px",color:C.green,fontWeight:700,fontSize:13}}>✓ Request sent to your trainer!</div>
                    :<GBtn label={reqSending?"Sending...":"Request This Time"} onClick={handleSlotRequest} disabled={reqSending} style={{width:"100%"}}/>
                )}
                {(!customStart||customConflict)&&<div style={{color:C.muted,fontSize:12,lineHeight:1.5,textAlign:"center",marginTop:4}}>Select a time above to request it</div>}
              </div>
            )}
          </>
        )}
      </div>
        </>
      }
      <UaToast toast={schedErrToast} c={C}/>
    </div>
  );
};

// ── Announcements ──
const AnnouncementsScreen=({token,priorSeenAt})=>{
  const [announcements,setAnn]=useState([]);
  const [loading,setLoad]=useState(true);
  const [readIds,setReadIds]=useState(new Set());
  useEffect(()=>{
    getAnnouncements(token).then(a=>setAnn(a||[])).finally(()=>setLoad(false));
  },[]);
  const isNew=(a)=>!!priorSeenAt&&a.created_at>priorSeenAt&&!readIds.has(a.id);
  return(
    <div style={{paddingBottom:80}}>
      <div style={{padding:"22px 20px 12px"}}>
        <div style={{color:C.white,fontSize:22,fontWeight:800,fontFamily:"'Oswald',sans-serif"}}>Announcements</div>
        <div style={{color:C.muted,fontSize:13,marginTop:2}}>Updates from your trainer</div>
      </div>
      <div style={{padding:"0 20px"}}>
        {loading?<Spinner/>:announcements.length===0?<Empty msg="No announcements yet"/>:
          announcements.map((a,i)=>{
            const unread=isNew(a);
            return(
              <button key={i} onClick={()=>unread&&setReadIds(p=>new Set(p).add(a.id))} style={{display:"block",width:"100%",textAlign:"left",padding:0,border:"none",background:"none",fontFamily:"inherit",cursor:unread?"pointer":"default"}}>
                <Card glow={unread?C.pink:C.cyan} style={{marginBottom:10,border:unread?`2px solid ${C.pink}`:undefined,boxShadow:unread?`0 0 0 1px ${C.pink}33`:undefined}}>
                  <div style={{display:"flex",gap:12,alignItems:"flex-start"}}>
                    <div style={{width:34,height:34,borderRadius:10,background:`linear-gradient(135deg,${C.cyan}33,${C.pink}33)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,flexShrink:0}}>📣</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          <div style={{color:C.white,fontSize:15,fontWeight:700}}>{a.title}</div>
                          {unread&&<span style={{background:C.pink,color:C.white,fontSize:9,fontWeight:800,padding:"2px 7px",borderRadius:20}}>NEW</span>}
                        </div>
                        <span style={{color:C.cyan,fontSize:11,fontWeight:700,flexShrink:0,whiteSpace:"nowrap"}}>{fmtDate(a.created_at?.split("T")[0])}</span>
                      </div>
                      <div style={{color:C.muted,fontSize:13,lineHeight:1.6,marginTop:4,whiteSpace:"pre-wrap"}}>{a.body}</div>
                    </div>
                  </div>
                </Card>
              </button>
            );
          })
        }
      </div>
    </div>
  );
};

// ── Stats Panel ──
const StatsPanel=({sessions,prs,pkg})=>{
  const nowD=new Date();
  const [selYear,setSelYear]=useState(nowD.getFullYear());
  const [selMonth,setSelMonth]=useState(nowD.getMonth());
  const completed=sessions.filter(s=>s.status==="completed");
  const left=pkg?(pkg.sessions_total-pkg.sessions_used):0;

  // Summary
  const thisMonthStr=`${nowD.getFullYear()}-${String(nowD.getMonth()+1).padStart(2,'0')}`;
  const lastMonthD=new Date(nowD.getFullYear(),nowD.getMonth()-1,1);
  const lastMonthStr=`${lastMonthD.getFullYear()}-${String(lastMonthD.getMonth()+1).padStart(2,'0')}`;
  const mondayOfWeek=(()=>{const d=new Date(nowD);const day=d.getDay();const diff=day===0?-6:1-day;d.setDate(d.getDate()+diff);return d.toISOString().slice(0,10);})();
  const sundayOfWeek=(()=>{const d=new Date(mondayOfWeek);d.setDate(d.getDate()+6);return d.toISOString().slice(0,10);})();
  const thisWeekCount=completed.filter(s=>s.session_date>=mondayOfWeek&&s.session_date<=sundayOfWeek).length;
  const summaryStats=[
    {l:"Σύνολο",v:completed.length,color:C.cyan},
    {l:"Αυτό τον μήνα",v:completed.filter(s=>s.session_date?.slice(0,7)===thisMonthStr).length,color:C.cyan},
    {l:"Περ. μήνα",v:completed.filter(s=>s.session_date?.slice(0,7)===lastMonthStr).length,color:C.cyan},
    {l:"PRs",v:prs.length,color:C.pink},
    {l:"Αυτή τη βδομάδα",v:thisWeekCount,color:C.cyan},
    {l:"Απομένουν",v:left,color:left<=2?C.pink:C.green},
  ];

  // Weekly streak
  const getWeekStart=dateStr=>{const d=new Date(dateStr);const day=d.getDay();const diff=day===0?-6:1-day;d.setDate(d.getDate()+diff);return d.toISOString().slice(0,10);};
  const weeksWithSession=new Set(completed.map(s=>getWeekStart(s.session_date)));
  let streak=0;
  const wkCur=new Date(nowD);
  for(let i=0;i<104;i++){const wk=getWeekStart(wkCur.toISOString().slice(0,10));if(weeksWithSession.has(wk)){streak++;wkCur.setDate(wkCur.getDate()-7);}else break;}
  const sortedWeeks=[...weeksWithSession].sort();
  let bestStreak=0,curStreak=0,prevWk=null;
  for(const wk of sortedWeeks){if(!prevWk){curStreak=1;}else{const p=new Date(prevWk);p.setDate(p.getDate()+7);curStreak=p.toISOString().slice(0,10)===wk?curStreak+1:1;}if(curStreak>bestStreak)bestStreak=curStreak;prevWk=wk;}

  // Yearly bar chart
  const MSHORT=["Ιαν","Φεβ","Μαρ","Απρ","Μάι","Ιουν","Ιουλ","Αυγ","Σεπ","Οκτ","Νοε","Δεκ"];
  const MFULL=["Ιανουάριος","Φεβρουάριος","Μάρτιος","Απρίλιος","Μάιος","Ιούνιος","Ιούλιος","Αύγουστος","Σεπτέμβριος","Οκτώβριος","Νοέμβριος","Δεκέμβριος"];
  const monthCounts=MSHORT.map((_,i)=>{const m=`${selYear}-${String(i+1).padStart(2,'0')}`;return completed.filter(s=>s.session_date?.slice(0,7)===m).length;});
  const maxCount=Math.max(...monthCounts,1);
  const yearTotal=monthCounts.reduce((a,b)=>a+b,0);
  const canNextYear=selYear<nowD.getFullYear();
  const canNextMonth=selYear<nowD.getFullYear()||(selYear===nowD.getFullYear()&&selMonth<nowD.getMonth());

  // Month detail
  const selMonthStr=`${selYear}-${String(selMonth+1).padStart(2,'0')}`;
  const selMonthSess=completed.filter(s=>s.session_date?.slice(0,7)===selMonthStr).sort((a,b)=>a.session_date.localeCompare(b.session_date));

  const navPrevMonth=()=>{let m=selMonth-1,y=selYear;if(m<0){m=11;y--;}setSelMonth(m);setSelYear(y);};
  const navNextMonth=()=>{if(!canNextMonth)return;let m=selMonth+1,y=selYear;if(m>11){m=0;y++;}setSelMonth(m);setSelYear(y);};

  return(
    <div style={{padding:"0 20px 16px"}}>
      <SL>Στατιστικά</SL>

      {/* 6 summary tiles */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:14}}>
        {summaryStats.map(s=>(
          <div key={s.l} style={{background:C.surface,borderRadius:12,padding:"13px 6px",textAlign:"center",border:`1px solid ${C.border}`}}>
            <div style={{color:s.color,fontSize:22,fontWeight:900}}>{s.v}</div>
            <div style={{color:C.muted,fontSize:9,fontWeight:700,letterSpacing:0.3,marginTop:3,textTransform:"uppercase",lineHeight:1.2}}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* Streak badges */}
      <div style={{display:"flex",gap:8,marginBottom:14}}>
        <div style={{flex:1,background:C.surface,borderRadius:12,padding:"12px 14px",border:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:10}}>
          <div style={{fontSize:24}}>🔥</div>
          <div>
            <div style={{color:C.white,fontSize:20,fontWeight:900,lineHeight:1}}>{streak}<span style={{fontSize:12,fontWeight:600,color:C.muted,marginLeft:3}}>εβδ.</span></div>
            <div style={{color:C.muted,fontSize:10,fontWeight:600,marginTop:2}}>Τρέχον σερί</div>
          </div>
        </div>
        <div style={{flex:1,background:C.surface,borderRadius:12,padding:"12px 14px",border:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:10}}>
          <div style={{fontSize:24}}>🏆</div>
          <div>
            <div style={{color:C.white,fontSize:20,fontWeight:900,lineHeight:1}}>{bestStreak}<span style={{fontSize:12,fontWeight:600,color:C.muted,marginLeft:3}}>εβδ.</span></div>
            <div style={{color:C.muted,fontSize:10,fontWeight:600,marginTop:2}}>Καλύτερο σερί</div>
          </div>
        </div>
      </div>

      {/* Yearly bar chart */}
      <div style={{background:C.surface,borderRadius:14,padding:"16px",border:`1px solid ${C.border}`,marginBottom:10}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div>
            <div style={{color:C.white,fontSize:15,fontWeight:800}}>{selYear}</div>
            <div style={{color:C.muted,fontSize:11}}>{yearTotal} συνεδρίες</div>
          </div>
          <div style={{display:"flex",gap:6}}>
            <button onClick={()=>setSelYear(y=>y-1)} style={{background:C.surface2,border:`1px solid ${C.border}`,borderRadius:8,width:32,height:32,color:C.muted,cursor:"pointer",fontFamily:"inherit",fontSize:15,display:"flex",alignItems:"center",justifyContent:"center"}}>‹</button>
            <button onClick={()=>{if(canNextYear)setSelYear(y=>y+1);}} style={{background:C.surface2,border:`1px solid ${C.border}`,borderRadius:8,width:32,height:32,color:canNextYear?C.muted:"#333",cursor:canNextYear?"pointer":"default",fontFamily:"inherit",fontSize:15,display:"flex",alignItems:"center",justifyContent:"center"}}>›</button>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"flex-end",gap:3,height:72}}>
          {monthCounts.map((cnt,i)=>{
            const barH=cnt===0?3:Math.max(8,Math.round((cnt/maxCount)*66));
            const isSel=i===selMonth&&selYear===selYear;
            return(
              <div key={i} onClick={()=>setSelMonth(i)} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4,cursor:"pointer"}}>
                {cnt>0&&<div style={{color:isSel?C.cyan:C.muted,fontSize:7,fontWeight:800,transition:"color 0.2s"}}>{cnt}</div>}
                <div style={{width:"100%",height:barH,borderRadius:4,background:isSel?`linear-gradient(180deg,${C.cyan},${C.pink})`:(cnt>0?C.cyan+"40":C.surface2),transition:"all 0.25s",marginTop:"auto"}}/>
                <div style={{color:isSel?C.cyan:C.muted,fontSize:6.5,fontWeight:700,letterSpacing:0.2,transition:"color 0.2s"}}>{MSHORT[i]}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Month drill-down */}
      <div style={{background:C.surface,borderRadius:14,padding:"16px",border:`1px solid ${C.cyan}33`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div>
            <div style={{color:C.white,fontSize:15,fontWeight:800}}>{MFULL[selMonth]} {selYear}</div>
            <div style={{color:C.cyan,fontSize:12,fontWeight:700}}>{selMonthSess.length} συνεδρί{selMonthSess.length===1?"α":"ες"}</div>
          </div>
          <div style={{display:"flex",gap:6}}>
            <button onClick={navPrevMonth} style={{background:C.surface2,border:`1px solid ${C.border}`,borderRadius:8,width:32,height:32,color:C.muted,cursor:"pointer",fontFamily:"inherit",fontSize:15,display:"flex",alignItems:"center",justifyContent:"center"}}>‹</button>
            <button onClick={navNextMonth} style={{background:C.surface2,border:`1px solid ${C.border}`,borderRadius:8,width:32,height:32,color:canNextMonth?C.muted:"#333",cursor:canNextMonth?"pointer":"default",fontFamily:"inherit",fontSize:15,display:"flex",alignItems:"center",justifyContent:"center"}}>›</button>
          </div>
        </div>
        {selMonthSess.length===0
          ? <div style={{color:C.muted,fontSize:13,textAlign:"center",padding:"16px 0"}}>Καμία συνεδρία αυτόν τον μήνα</div>
          : <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
              {selMonthSess.map((s,i)=>(
                <div key={i} style={{background:C.cyan+"14",border:`1px solid ${C.cyan}30`,borderRadius:10,padding:"8px 12px",minWidth:80}}>
                  <div style={{color:C.white,fontSize:12,fontWeight:700}}>{fmtDate(s.session_date)}</div>
                  <div style={{color:C.muted,fontSize:10,marginTop:2}}>{toTime(s.start_time_min)}</div>
                </div>
              ))}
            </div>
        }
      </div>
    </div>
  );
};

// ── Profile ──
const ProfileScreen=({profile,pkg,sessions,prs:initPRs,userId,token,onLogout,onAvatarChange})=>{
  const [prs,setPRs]=useState(initPRs||[]);
  const [showAddPR,setShowAddPR]=useState(false);
  const [newPR,setNew]=useState({exercise:"",weight:"",unit:"kg",reps:"1"});
  const [editing,setEditing]=useState(false);
  const [newName,setNewName]=useState(profile?.name||"");
  const [savingName,setSavingN]=useState(false);
  const [phone,setPhone]=useState(profile?.phone||"");
  const [avatarUrl,setAvatarUrl]=useState(profile?.avatar_url||null);
  const [uploading,setUploading]=useState(false);
  const [showHistorySheet,setShowHistorySheet]=useState(false);
  const [profToast,setProfToast]=useState(null);
  const showProfToast=(msg,ok=false)=>{setProfToast({msg,ok});setTimeout(()=>setProfToast(null),3500);};
  const handleAvatarChange=async(e)=>{
    const file=e.target.files?.[0]; if(!file) return;
    setUploading(true);
    try{
      const url=await uploadAvatar(userId,file,token);
      await updateProfile(userId,{avatar_url:url},token);
      setAvatarUrl(url); onAvatarChange?.(url);
    }catch(e){ showProfToast("Upload failed: "+e.message); }
    setUploading(false);
    e.target.value="";
  };
  const spw=pkg?.sessions_per_week||3;
  const left=pkg?pkg.sessions_total-pkg.sessions_used:0;

  const savePR=async()=>{
    if(!newPR.exercise||!newPR.weight) return;
    try{ const r=await addPR(userId,newPR,token); const c=Array.isArray(r)?r[0]:r; if(c)setPRs(p=>[c,...p]); setNew({exercise:"",weight:"",unit:"kg",reps:"1"}); setShowAddPR(false); }
    catch(e){ showProfToast("Error: "+e.message); }
  };
  const removePR=async(id)=>{ try{ await deletePR(id,token); setPRs(p=>p.filter(x=>x.id!==id)); }catch(e){} };
  const savePhone=async()=>{
    if(savingName) return; setSavingN(true);
    try{ await updateProfile(userId,{phone:phone.trim()||null},token); setEditing(false); }catch(e){ showProfToast("Error: "+e.message); }
    setSavingN(false);
  };
  const inp=(val,set,ph)=>(<input value={val} onChange={e=>set(e.target.value)} placeholder={ph} style={{background:C.surface2,border:`1px solid ${C.border}`,borderRadius:8,padding:"9px 10px",color:C.white,fontSize:13,outline:"none",fontFamily:"inherit",flex:1}}/>);

  return(
    <div style={{paddingBottom:80}}>
      <div style={{padding:"22px 20px 0"}}><div style={{color:C.white,fontSize:22,fontWeight:800,fontFamily:"'Oswald',sans-serif"}}>My Profile</div></div>

      {/* Avatar + name */}
      <div style={{padding:"20px",display:"flex",flexDirection:"column",alignItems:"center",gap:12}}>
        <div style={{position:"relative",cursor:"pointer"}} onClick={()=>document.getElementById("ua-avatar-upload").click()}>
          {avatarUrl
            ? <img src={avatarUrl} alt="avatar" style={{width:80,height:80,borderRadius:"50%",objectFit:"cover",display:"block"}}/>
            : <div style={{width:80,height:80,borderRadius:"50%",background:`linear-gradient(135deg,${C.cyan},${C.pink})`,display:"flex",alignItems:"center",justifyContent:"center",color:C.white,fontWeight:900,fontSize:26}}>
                {(newName||profile?.name||"?").trim().split(" ").map(w=>w[0]).join("").toUpperCase().slice(0,2)}
              </div>
          }
          <div style={{position:"absolute",bottom:0,right:0,background:C.surface2,border:`1px solid ${C.border}`,borderRadius:"50%",width:26,height:26,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13}}>
            {uploading?"⏳":"📷"}
          </div>
        </div>
        <input id="ua-avatar-upload" type="file" accept="image/*" style={{display:"none"}} onChange={handleAvatarChange}/>
        {editing?(
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:8,width:"100%",maxWidth:260}}>
            <div style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,textTransform:"uppercase"}}>Phone Number</div>
            <input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="Phone (optional)" autoFocus style={{background:C.surface2,border:`1px solid ${C.cyan}66`,borderRadius:10,padding:"10px 14px",color:C.white,fontSize:14,outline:"none",fontFamily:"inherit",width:"100%",boxSizing:"border-box",textAlign:"center"}}/>
            <div style={{display:"flex",gap:8,width:"100%"}}>
              <GBtn label={savingName?"Saving...":"Save"} onClick={savePhone} disabled={savingName} sm style={{flex:1}}/>
              <GBtn label="Cancel" onClick={()=>{setEditing(false);setPhone(profile?.phone||"");}} sm ghost color={C.muted} style={{flex:1}}/>
            </div>
          </div>
        ):(
          <div style={{textAlign:"center"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,justifyContent:"center"}}>
              <div style={{color:C.white,fontSize:20,fontWeight:800}}>{newName||profile?.name||"Athlete"}</div>
              <button onClick={()=>setEditing(true)} style={{background:C.surface2,border:`1px solid ${C.border}`,borderRadius:6,padding:"3px 8px",color:C.muted,fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>Edit</button>
            </div>
            <div style={{color:C.muted,fontSize:13,marginTop:4}}>{profile?.email}</div>
            {phone&&<div style={{color:C.muted,fontSize:13,marginTop:2}}>📞 {phone}</div>}
            {(()=>{const latinize=s=>{const G={'α':'a','β':'v','γ':'g','δ':'d','ε':'e','ζ':'z','η':'i','θ':'th','ι':'i','κ':'k','λ':'l','μ':'m','ν':'n','ξ':'x','ο':'o','π':'p','ρ':'r','σ':'s','ς':'s','τ':'t','υ':'y','φ':'f','χ':'ch','ψ':'ps','ω':'o','ά':'a','έ':'e','ή':'i','ί':'i','ό':'o','ύ':'y','ώ':'o','ϊ':'i','ΐ':'i','ϋ':'y','ΰ':'y'};let r='';for(const c of s.toLowerCase()){r+=G[c]||(c.normalize('NFD').replace(/[̀-ͯ]/g,'')||c);}return r.replace(/[^a-z]/g,'');};const parts=(profile?.name||"").trim().split(" ");const un=parts.length>=2?`${latinize(parts[0])}.${latinize(parts.slice(1).join(" "))}`:latinize(parts[0]||"");return un?<div style={{color:C.cyan,fontSize:12,fontWeight:700,marginTop:3,fontFamily:"'Oswald',sans-serif"}}>@{un}</div>:null;})()}
            {profile?.created_at&&<div style={{color:C.muted,fontSize:12,marginTop:4}}>Member since {fmtMemberSince(profile.created_at)}</div>}
          </div>
        )}
      </div>

      {/* Package */}
      {pkg&&(
        <div style={{padding:"0 20px 16px"}}>
          <SL>My Package</SL>
          <div style={{background:left<=2?C.pink:C.cyan,borderRadius:16,padding:"20px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
              <div>
                {pkg.workout_templates?.name&&<div style={{color:C.bg,fontSize:20,fontWeight:900,fontFamily:"'Oswald',sans-serif",letterSpacing:1}}>{pkg.workout_templates.name}</div>}
                <div style={{color:C.bg,fontSize:11,fontWeight:700,letterSpacing:1.5,textTransform:"uppercase",opacity:0.8,marginTop:pkg.workout_templates?.name?4:0}}>{pkg.sessions_total}-Session Pack</div>
                <div style={{color:C.bg,fontSize:14,fontWeight:700,marginTop:3}}>{spw}x per week · {pkg.weeks} weeks</div>
                <div style={{color:C.bg,fontSize:12,opacity:0.8,marginTop:4}}>{fmtDate(pkg.start_date)} → {fmtDate(pkg.end_date)}</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{color:C.bg,fontSize:11,opacity:0.8}}>Remaining</div>
                <div style={{color:C.bg,fontSize:32,fontWeight:900,lineHeight:1}}>{left}</div>
                <div style={{color:C.bg,fontSize:11,opacity:0.8}}>of {pkg.sessions_total}</div>
              </div>
            </div>
            <div style={{height:5,background:"rgba(0,0,0,0.25)",borderRadius:3,marginTop:12}}>
              <div style={{width:`${(pkg.sessions_used/pkg.sessions_total)*100}%`,height:"100%",borderRadius:3,background:"white"}}/>
            </div>
          </div>
        </div>
      )}

      <StatsPanel sessions={sessions} prs={prs} pkg={pkg}/>

      {/* PRs */}
      <div style={{padding:"0 20px 16px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <SL style={{marginBottom:0}}>Personal Records</SL>
          <button onClick={()=>setShowAddPR(p=>!p)} style={{background:`linear-gradient(135deg,${C.cyan},${C.pink})`,border:"none",borderRadius:8,padding:"6px 12px",color:C.white,fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>{showAddPR?"▲ Cancel":"+ Add PR"}</button>
        </div>
        {showAddPR&&(
          <Card style={{marginBottom:12}}>
            <div style={{display:"flex",gap:8,marginBottom:8}}><ExercisePicker value={newPR.exercise} onChange={v=>setNew(p=>({...p,exercise:v}))} placeholder="Exercise name"/></div>
            <div style={{display:"flex",gap:8,marginBottom:8}}>
              {inp(newPR.weight,v=>setNew(p=>({...p,weight:v})),"Weight")}
              {inp(newPR.reps,v=>setNew(p=>({...p,reps:v})),"Reps")}
              <select value={newPR.unit} onChange={e=>setNew(p=>({...p,unit:e.target.value}))} style={{background:C.surface2,border:`1px solid ${C.border}`,borderRadius:8,padding:"9px 8px",color:C.white,fontFamily:"inherit",outline:"none"}}>
                <option>kg</option><option>lbs</option><option>BW</option>
              </select>
            </div>
            <GBtn label="Save PR" onClick={savePR} style={{width:"100%"}}/>
          </Card>
        )}
        {prs.length===0?<Empty msg="No PRs yet. Add your first!"/>:
          prs.map((pr,i)=>(
            <div key={i} style={{padding:"12px 0",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div><div style={{color:C.white,fontSize:14,fontWeight:600}}>{pr.exercise}</div><div style={{color:C.muted,fontSize:12}}>{fmtDate(pr.record_date)}</div></div>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <div style={{textAlign:"right"}}><div style={{color:C.pink,fontSize:16,fontWeight:900}}>{pr.weight}{pr.unit}</div><div style={{color:C.muted,fontSize:11}}>{pr.reps} rep{pr.reps!=="1"?"s":""}</div></div>
                <button onClick={()=>removePR(pr.id)} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:16,padding:"4px"}}>✕</button>
              </div>
            </div>
          ))
        }
      </div>

      {/* History */}
      <div style={{padding:"0 20px 16px"}}>
        <SL>Session History</SL>
        {(()=>{
          const completed=sessions.filter(s=>s.status==="completed");
          if(completed.length===0) return <Empty msg="No completed sessions yet"/>;
          const visible=completed.slice(0,3);
          return(<>
            {visible.map((s,i)=>{
              const dn=computeDayNum(s,sessions,spw);
              return(
                <div key={i} style={{padding:"12px 0",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <div style={{color:C.white,fontSize:14,fontWeight:600}}>{sessLabel(pkg?.workout_templates?.name)}</div>
                    {dn&&<span style={{background:`linear-gradient(135deg,${C.cyan},${C.pink})`,color:C.white,fontSize:10,fontWeight:800,padding:"2px 6px",borderRadius:20}}>Day {dn}</span>}
                  </div>
                  <div style={{textAlign:"right"}}><div style={{color:C.muted,fontSize:12,marginBottom:3}}>{weekDayShort(s.session_date)} · {fmtDate(s.session_date)}</div><StatusBadge status="completed"/></div>
                </div>
              );
            })}
            {completed.length>3&&
              <button onClick={()=>setShowHistorySheet(true)} style={{width:"100%",background:"none",border:"none",color:C.cyan,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit",padding:"12px 0",textAlign:"center"}}>Δες παλαιότερες ({completed.length-3} more) ›</button>
            }
          </>);
        })()}
      </div>
      {showHistorySheet&&<HistorySheet sessions={sessions} spw={spw} label={sessLabel(pkg?.workout_templates?.name)} onClose={()=>setShowHistorySheet(false)}/>}

      <div style={{padding:"0 20px 16px"}}>
        <SL>App Theme</SL>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {[
            {key:"cyber",label:"Cyber",a:"#00C9E1",b:"#E8197A"},
            {key:"electric",label:"Electric",a:"#4361EE",b:"#F72585"},
            {key:"emerald",label:"Emerald",a:"#10B981",b:"#F43F5E"},
            {key:"violet",label:"Violet",a:"#8B5CF6",b:"#EC4899"},
            {key:"gold",label:"Gold",a:"#F59E0B",b:"#EF4444"},
          ].map(t=>{
            const active=(localStorage.getItem(THEME_KEY)||"cyber")===t.key;
            return(
              <button key={t.key} onClick={()=>{localStorage.setItem(THEME_KEY,t.key);window.location.reload();}}
                style={{background:active?`linear-gradient(135deg,${t.a}33,${t.b}33)`:"rgba(255,255,255,0.04)",border:`2px solid ${active?t.a:C.border}`,borderRadius:12,padding:"10px 14px",cursor:"pointer",fontFamily:"inherit",display:"flex",flexDirection:"column",alignItems:"center",gap:5,minWidth:60}}>
                <div style={{width:28,height:14,borderRadius:7,background:`linear-gradient(90deg,${t.a},${t.b})`}}/>
                <div style={{color:active?t.a:C.muted,fontSize:10,fontWeight:700}}>{t.label}</div>
              </button>
            );
          })}
        </div>
      </div>
      <div style={{padding:"0 20px 8px"}}>
        <button onClick={onLogout} style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"14px",color:C.pink,fontWeight:700,fontSize:15,cursor:"pointer",fontFamily:"inherit"}}>Log Out</button>
      </div>
      <UaToast toast={profToast} c={C}/>
    </div>
  );
};

// ── App Root ──
export default function App(){
  const [auth,setAuth]=useState({loading:true,token:null,userId:null,profile:null,pkg:null,sessions:[],prs:[]});
  const [screen,setScreen]=useState("home");
  const [openSess,setOpenSess]=useState(null);
  const [showSignUp,setShowSignUp]=useState(false);
  const [notifications,setNotifications]=useState([]);
  const [showNotifPanel,setShowNotifPanel]=useState(false);
  const [hasNewAnn,setHasNewAnn]=useState(false);
  const [latestAnnAt,setLatestAnnAt]=useState(null);
  const [priorAnnSeenAt,setPriorAnnSeenAt]=useState(null);

  useEffect(()=>{
    const init=async()=>{
      try{
        const saved=localStorage.getItem("ua_client_auth");
        if(saved){
          const {token,userId,expiresAt}=JSON.parse(saved);
          if(Date.now()<expiresAt*1000){ await loadData(token,userId); return; }
        }
      }catch(e){}
      setAuth(p=>({...p,loading:false}));
    };
    init();
  },[]);

  const loadData=async(token,userId)=>{
    try{
      const profile=await getProfile(userId,token).catch(()=>null);
      const pkg=await getPackage(userId,token).catch(()=>null);
      const sessions=await getSessions(userId,token).catch(()=>[]);
      const prs=await getPRs(userId,token).catch(()=>[]);
      const notifs=await getMyNotifications(userId,token).catch(()=>[]);
      const anns=await getAnnouncements(token).catch(()=>[]);
      setAuth({loading:false,token,userId,profile,pkg:pkg||null,sessions:sessions||[],prs:prs||[]});
      setNotifications(notifs||[]);
      const latest=(anns||[])[0]?.created_at||null;
      setLatestAnnAt(latest);
      const seenKey=`ua_ann_seen_${userId}`;
      const seen=localStorage.getItem(seenKey);
      if(!seen){ if(latest) localStorage.setItem(seenKey,latest); setHasNewAnn(false); }
      else setHasNewAnn(!!latest&&latest>seen);
      // Register service worker + subscribe to push notifications
      registerPush(userId,token).catch(()=>{});
    }catch(e){
      setAuth(prev=>({...prev,loading:false}));
    }
  };

  const registerPush=async(userId,token)=>{
    if(!('serviceWorker' in navigator)||!('PushManager' in window)){
      console.log('[UA Push] SW or PushManager not supported');
      return;
    }
    try{
      const reg=await navigator.serviceWorker.register('/sw.js',{scope:'/'});
      console.log('[UA Push] SW registered');
      const perm=Notification.permission;
      console.log('[UA Push] Permission state:',perm);
      if(perm!=='granted') return; // banner handles the actual request
      const existing=await reg.pushManager.getSubscription();
      const sub=existing||await reg.pushManager.subscribe({
        userVisibleOnly:true,
        applicationServerKey:urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
      if(sub){
        console.log('[UA Push] Subscription obtained, saving...');
        await savePushSub(userId,sub.toJSON(),token);
      }
    }catch(e){ console.error('[UA Push] registerPush error:',e); }
  };

  const markAnnouncementsSeen=()=>{
    if(!auth.userId) return;
    const seenKey=`ua_ann_seen_${auth.userId}`;
    setPriorAnnSeenAt(localStorage.getItem(seenKey));
    if(latestAnnAt) localStorage.setItem(seenKey,latestAnnAt);
    setHasNewAnn(false);
  };

  const dismissNotification=async(id)=>{
    setNotifications(p=>p.filter(n=>n.id!==id));
    try{ await markNotificationRead(id,auth.token); }catch(e){}
  };

  const deleteNotif=async(id)=>{
    setNotifications(p=>p.filter(n=>n.id!==id));
    try{ await deleteNotification(id,auth.token); }catch(e){}
  };

  // Refetch notifications when app comes back to foreground (user returns after receiving a push)
  useEffect(()=>{
    const refetch=async()=>{
      if(!auth.userId||!auth.token) return;
      const notifs=await getMyNotifications(auth.userId,auth.token).catch(()=>null);
      if(notifs) setNotifications(notifs);
    };
    const onVisible=()=>{ if(document.visibilityState==="visible") refetch(); };
    document.addEventListener("visibilitychange",onVisible);
    return ()=>document.removeEventListener("visibilitychange",onVisible);
  },[auth.userId,auth.token]);

  // Listen for real-time push data from service worker (app open when push arrives)
  useEffect(()=>{
    if(!('serviceWorker' in navigator)) return;
    const handler=(e)=>{
      if(e.data?.type==='UA_PUSH'&&e.data?.body&&auth.userId){
        // Add a synthetic notification entry so the badge lights up immediately
        const synthetic={id:`sw_${Date.now()}`,message:e.data.body,type:e.data.tag||'push',created_at:new Date().toISOString(),_synthetic:true};
        setNotifications(p=>{
          // Avoid duplicates if DB also returned the same message
          if(p.some(n=>n.message===synthetic.message)) return p;
          return [synthetic,...p];
        });
      }
    };
    navigator.serviceWorker.addEventListener('message',handler);
    return ()=>navigator.serviceWorker.removeEventListener('message',handler);
  },[auth.userId]);

  const handleSignUp=async(firstName,lastName,email,pw,phone=null)=>{
    const latinize=s=>{const G={'α':'a','β':'v','γ':'g','δ':'d','ε':'e','ζ':'z','η':'i','θ':'th','ι':'i','κ':'k','λ':'l','μ':'m','ν':'n','ξ':'x','ο':'o','π':'p','ρ':'r','σ':'s','ς':'s','τ':'t','υ':'y','φ':'f','χ':'ch','ψ':'ps','ω':'o','ά':'a','έ':'e','ή':'i','ί':'i','ό':'o','ύ':'y','ώ':'o','ϊ':'i','ΐ':'i','ϋ':'y','ΰ':'y'};let r='';for(const c of s.toLowerCase()){r+=G[c]||(c.normalize('NFD').replace(/[̀-ͯ]/g,'')||c);}return r.replace(/[^a-z]/g,'');};
    const data=await authSignUp(email,pw);
    if(data?.error) throw new Error(data.error_description||data.error);
    const {access_token,expires_at,user}=data||{};
    if(!access_token) return false;
    const fullName=`${firstName.trim()} ${lastName.trim()}`;
    const initials=`${latinize(firstName.trim())[0]||''}${latinize(lastName.trim())[0]||''}`.toUpperCase();
    const username=`${latinize(firstName.trim())}.${latinize(lastName.trim())}`;
    // A DB trigger auto-creates the profiles row (with a placeholder name) when the
    // auth.users row is created, so this must PATCH the existing row, not INSERT —
    // clients have no INSERT policy on profiles, only UPDATE-own-row.
    await updateProfile(user.id,{name:fullName,initials,username,...(phone&&{phone})},access_token).catch(()=>{});
    localStorage.setItem("ua_client_auth",JSON.stringify({token:access_token,userId:user.id,expiresAt:expires_at}));
    await loadData(access_token,user.id);
    return true;
  };

  const handleLogin=async(email,pw)=>{
    const data=await authLogin(email,pw);
    if(data.error) throw new Error(data.error_description||data.error);
    const {access_token,expires_at,user}=data;
    localStorage.setItem("ua_client_auth",JSON.stringify({token:access_token,userId:user.id,expiresAt:expires_at}));
    setAuth({loading:false,token:access_token,userId:user.id,profile:null,pkg:null,sessions:[],prs:[]});
    loadData(access_token,user.id);
  };

  const handleLogout=async()=>{
    try{ await authLogout(auth.token); }catch(e){}
    localStorage.removeItem("ua_client_auth");
    setAuth({loading:false,token:null,userId:null,profile:null,pkg:null,sessions:[],prs:[]});
    setScreen("home");
  };

  if(auth.loading) return(<div className="ua-app" style={{fontFamily:"'Inter',-apple-system,sans-serif"}}><Spinner size={88} fullscreen/></div>);
  if(!auth.token) return(
    <div className="ua-app" style={{fontFamily:"'Inter',-apple-system,sans-serif",background:C.bg,minHeight:"100vh"}}>
      {showSignUp
        ? <SignUpScreen onSignUp={handleSignUp} onBack={()=>setShowSignUp(false)}/>
        : <LoginScreen onLogin={handleLogin} onSignUp={()=>setShowSignUp(true)}/>
      }
    </div>
  );

  const handleNav=(s)=>{ if(s==="announcements") markAnnouncementsSeen(); setScreen(s); };

  const renderScreen=()=>{
    switch(screen){
      case "home": return <HomeScreen profile={auth.profile} pkg={auth.pkg} sessions={auth.sessions} onNav={handleNav} onOpenSession={setOpenSess} token={auth.token} userId={auth.userId} onPkgUpdate={updPkg=>setAuth(p=>({...p,pkg:updPkg}))} onOpenNotif={()=>setShowNotifPanel(true)} notifCount={notifications.length}/>;
      case "schedule": return <ScheduleScreen userId={auth.userId} token={auth.token} sessions={auth.sessions} pkg={auth.pkg} onPkgUpdate={updPkg=>setAuth(p=>({...p,pkg:updPkg}))}/>;
      case "announcements": return <AnnouncementsScreen token={auth.token} priorSeenAt={priorAnnSeenAt}/>;
      case "profile": return <ProfileScreen profile={auth.profile} pkg={auth.pkg} sessions={auth.sessions} prs={auth.prs} userId={auth.userId} token={auth.token} onLogout={handleLogout} onAvatarChange={url=>setAuth(p=>({...p,profile:{...p.profile,avatar_url:url}}))}/>;
      default: return null;
    }
  };

  return(
    <div className="ua-app" style={{fontFamily:"'Inter',-apple-system,sans-serif",background:C.bg,minHeight:"100vh"}}>
      {openSess&&<SessionSheet session={{...openSess,_pkg_spw:auth.pkg?.sessions_per_week||3}} token={auth.token} onClose={()=>setOpenSess(null)}/>}
      {/* Notification panel */}
      {showNotifPanel&&<NotifPanel notifications={notifications} onDismiss={async(id)=>{await dismissNotification(id);}} onDelete={async(id)=>{await deleteNotif(id);}} onClose={()=>setShowNotifPanel(false)}/>}
      {renderScreen()}
      <BottomNav active={screen} onNav={handleNav} avatarUrl={auth.profile?.avatar_url} initials={auth.profile?.initials} annBadge={hasNewAnn}/>
    </div>
  );
}
