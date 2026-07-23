import { useState, useEffect, useMemo, useRef } from "react";
import ExercisePicker from "./ExercisePicker.jsx";
import { EXERCISE_LIST } from "./exerciseList.js";

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

const C = {
  bg:"#0A0A0A", surface:"#161616", surface2:"#252525",
  cyan:"#00C9E1", pink:"#E8197A", white:"#FFFFFF",
  muted:"#666666", border:"#2A2A2A", green:"#22C55E", amber:"#F59E0B",
};
const GYM_CAP = 8;
const SESS_MIN = 90;

// ── Supabase ──
const SB_URL = "https://hxyqvryuniqmvpjljrry.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4eXF2cnl1bmlxbXZwamxqcnJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyOTQ0NTAsImV4cCI6MjA5Nzg3MDQ1MH0.eSoak4YVf7vqFwYlYebayMS3CCiEjLhZ5olEAnkDJlU";

const UA_TRAINER_AUTH_KEY = "ua_trainer_auth";

// ── Supabase Realtime — minimal Phoenix WebSocket client ──
function makeRealtime(supabaseUrl, anonKey) {
  let ws = null, _ref = 0, heartbeatTimer = null, reconnTimer = null, _jwt = null;
  const _subs = [];
  const _nextRef = () => String(++_ref);
  const _send = (msg) => { if (ws?.readyState === 1) ws.send(JSON.stringify(msg)); };
  const _joinAll = () => {
    _subs.forEach((s, i) => {
      const r = _nextRef();
      _send({
        topic: `realtime:ua_tr_${i}`,
        event: 'phx_join',
        payload: {
          config: {
            broadcast: { self: false },
            presence: { key: '' },
            postgres_changes: [{
              event: s.event || '*',
              schema: 'public',
              table: s.table,
              ...(s.filter ? { filter: s.filter } : {}),
            }],
          },
          access_token: _jwt || anonKey,
        },
        ref: r, join_ref: r,
      });
    });
  };
  const rt = {};
  rt.subscribe = (table, event, filter, callback) => { _subs.push({ table, event, filter, callback }); };
  rt.connect = (userJwt) => {
    _jwt = userJwt;
    if (ws) { ws.onclose = null; ws.close(); }
    clearInterval(heartbeatTimer); clearTimeout(reconnTimer);
    const url = `${supabaseUrl.replace('https://', 'wss://')}/realtime/v1/websocket?vsn=1.0.0&apikey=${anonKey}`;
    ws = new WebSocket(url);
    ws.onopen = () => {
      heartbeatTimer = setInterval(() => _send({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: _nextRef() }), 25000);
      _joinAll();
    };
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.event !== 'postgres_changes') return;
        const data = msg.payload?.data;
        if (!data) return;
        _subs.forEach(s => {
          if (s.table === data.table && (s.event === '*' || s.event === data.type))
            s.callback(data.new, data.old, data.type);
        });
      } catch {}
    };
    ws.onclose = () => { clearInterval(heartbeatTimer); reconnTimer = setTimeout(() => rt.connect(_jwt), 5000); };
    ws.onerror = () => {};
  };
  rt.disconnect = () => {
    clearInterval(heartbeatTimer); clearTimeout(reconnTimer);
    if (ws) { ws.onclose = null; ws.close(); ws = null; }
  };
  return rt;
}
const VAPID_PUBLIC_KEY = 'BNKaPdypI6pDPj7QQgVHhAAGxQgyjVpNcFIGu6N58WgZG05y9UTG4pwFIMu_9yDa8hMjhqtyUmJvE_84jASmVu0';
function urlBase64ToUint8Array(b64url){const pad=b64url.length%4;const b64=(pad?b64url+'='.repeat(4-pad):b64url).replace(/-/g,'+').replace(/_/g,'/');const raw=atob(b64);return Uint8Array.from([...raw],c=>c.charCodeAt(0));}

const rawRefresh = async (refreshToken) => {
  try {
    const r = await fetch(`${SB_URL}/auth/v1/token?grant_type=refresh_token`,{method:"POST",headers:{"apikey":SB_KEY,"Content-Type":"application/json"},body:JSON.stringify({refresh_token:refreshToken})});
    if(!r.ok) return null;
    return await r.json();
  } catch(e){ return null; }
};

const tryRefreshAuth = async () => {
  try {
    const saved = JSON.parse(localStorage.getItem(UA_TRAINER_AUTH_KEY)||"{}");
    if(!saved.refreshToken) return null;
    const data = await rawRefresh(saved.refreshToken);
    if(!data?.access_token) return null;
    localStorage.setItem(UA_TRAINER_AUTH_KEY,JSON.stringify({token:data.access_token,userId:saved.userId,expiresAt:data.expires_at,refreshToken:data.refresh_token||saved.refreshToken}));
    return data;
  } catch(e){ return null; }
};

const sb = async (path,method="GET",body=null,token=null,prefer="return=representation") => {
  const res = await fetch(`${SB_URL}${path}`,{method,headers:{"apikey":SB_KEY,"Authorization":`Bearer ${token||SB_KEY}`,"Content-Type":"application/json","Prefer":prefer},body:body?JSON.stringify(body):undefined});
  if(!res.ok){
    if(res.status===401||res.status===403){
      const refreshed = await tryRefreshAuth();
      if(refreshed){ window.location.reload(); return; }
      localStorage.removeItem(UA_TRAINER_AUTH_KEY); window.location.reload(); return;
    }
    throw new Error(await res.text());
  }
  const t=await res.text(); return t?JSON.parse(t):null;
};

const authLogin  = (e,p)    => sb("/auth/v1/token?grant_type=password","POST",{email:e,password:p});
const authLogout = (tk)     => sb("/auth/v1/logout","POST",null,tk);
const dbGet      = (tbl,q,tk)   => sb(`/rest/v1/${tbl}?${q}`,"GET",null,tk);
const dbPost     = (tbl,d,tk)   => sb(`/rest/v1/${tbl}`,"POST",d,tk);
const dbPatch    = (tbl,q,d,tk) => sb(`/rest/v1/${tbl}?${q}`,"PATCH",d,tk);
const dbDelete   = (tbl,q,tk)   => sb(`/rest/v1/${tbl}?${q}`,"DELETE",null,tk,"return=minimal");

// ── Data helpers ──
const getProfile     = (uid,tk)  => dbGet("profiles",`id=eq.${uid}&select=*`,tk).then(r=>r?.[0]);
const getClients     = (tk)      => dbGet("profiles","role=eq.client&order=name.asc",tk);
const getAllPkgs      = (tk)      => dbGet("packages","is_active=eq.true&select=*,workout_templates(id,name)",tk);
const getTodayBooks  = (date,tk) => dbGet("bookings",`book_date=eq.${date}&status=eq.booked&select=*,schedule_slots(start_time_min),profiles(id,name,initials)`,tk);
const getClientSess  = (uid,tk)  => dbGet("sessions",`client_id=eq.${uid}&order=session_date.desc&select=*,session_notes(*),exercises(*)`,tk);
const getSlots       = (dow,tk)  => dbGet("schedule_slots",`day_of_week=eq.${dow}&is_active=eq.true&order=start_time_min.asc`,tk);
const getDayBookCnt  = (date,tk) => dbGet("bookings",`book_date=eq.${date}&status=eq.booked&select=slot_id`,tk);
const getDayBookings = (date,tk) => dbGet("bookings",`book_date=eq.${date}&status=eq.booked&select=*,profiles(id,name,initials,avatar_url)`,tk);
const createSession  = (d,tk)    => dbPost("sessions",d,tk);
const createPkg      = (d,tk)    => dbPost("packages",d,tk);
const deactivatePkgs = (uid,tk)  => dbPatch("packages",`client_id=eq.${uid}&is_active=eq.true`,{is_active:false},tk);
const addSlot        = (d,tk)    => dbPost("schedule_slots",d,tk);
const removeSlot     = (id,tk)   => dbPatch("schedule_slots",`id=eq.${id}`,{is_active:false},tk);

const saveTrainerNote = async (sessId,note,tk) => {
  const ex=await dbGet("session_notes",`session_id=eq.${sessId}`,tk).catch(()=>[]);
  if(ex?.length>0) return dbPatch("session_notes",`session_id=eq.${sessId}`,{trainer_note:note,updated_at:new Date().toISOString()},tk);
  return dbPost("session_notes",{session_id:sessId,trainer_note:note,updated_at:new Date().toISOString()},tk);
};

const saveExercises = async (sessId,exs,tk) => {
  await dbDelete("exercises",`session_id=eq.${sessId}`,tk).catch(()=>{});
  if(exs.length>0) await dbPost("exercises",exs.map((e,i)=>({...e,session_id:sessId,order_index:i})),tk);
};

const getTodaySessions    = (trainerId,date,tk) => dbGet("sessions",`trainer_id=eq.${trainerId}&session_date=eq.${date}&select=*,profiles!sessions_client_id_fkey(id,name,initials,avatar_url)&order=start_time_min.asc`,tk);
const getTodayBookings    = (date,tk)           => dbGet("bookings",`book_date=eq.${date}&status=eq.booked&select=*,schedule_slots(start_time_min),profiles(id,name,initials,avatar_url)`,tk);
const getClientBooks      = (uid,tk)            => dbGet("bookings",`client_id=eq.${uid}&status=eq.booked&select=*,schedule_slots(start_time_min)&order=book_date.asc`,tk);
const getAnnouncements    = (tk)                => dbGet("announcements","order=created_at.desc&limit=20",tk);
const postAnnouncement    = (d,tk)              => dbPost("announcements",d,tk);
const deleteAnnouncement  = (id,tk)             => dbDelete("announcements",`id=eq.${id}`,tk);
const getPendingRequests  = (tk)                => dbGet("slot_requests","status=eq.pending&select=*,profiles(name,initials)&order=created_at.asc",tk);
const resolveRequest      = (id,status,tk)      => dbPatch("slot_requests",`id=eq.${id}`,{status},tk);
const getCancelRequests   = (trainerId,tk)       => dbGet("cancel_requests",`trainer_id=eq.${trainerId}&status=eq.pending&select=*,profiles!cancel_requests_client_id_fkey(id,name,initials)&order=created_at.asc`,tk);
const resolveCancelReq    = (id,status,tk)       => dbPatch("cancel_requests",`id=eq.${id}`,{status},tk);
const findActiveSlot      = (trainerId,dow,startMin,tk) => dbGet("schedule_slots",`trainer_id=eq.${trainerId}&day_of_week=eq.${dow}&start_time_min=eq.${startMin}&is_active=eq.true`,tk).then(r=>r?.[0]||null);
const getSlotBookCount    = (slotId,date,tk)    => dbGet("bookings",`slot_id=eq.${slotId}&book_date=eq.${date}&status=eq.booked&select=id`,tk).then(r=>r?.length||0);
const createBooking       = (d,tk)              => dbPost("bookings",d,tk);
const cancelBookingRow    = (id,tk)              => dbPatch("bookings",`id=eq.${id}`,{status:"cancelled"},tk);
const cancelSessionRow    = (id,tk)              => dbPatch("sessions",`id=eq.${id}`,{status:"cancelled"},tk);
const decrementPkgUsed    = (pkgId,currentUsed,tk)=> dbPatch("packages",`id=eq.${pkgId}`,{sessions_used:Math.max((currentUsed||0)-1,0)},tk);
const postNotification = async (d,tk) => {
  // Save in-app notification + send push in one server call.
  // Server uses SUPABASE_SERVICE_KEY to bypass RLS for cross-user inserts.
  fetch('/api/send-push',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({client_id:d.client_id,title:'Unorthodox Athletes',body:d.message,notification:d})
  }).catch(()=>{});
};
const getTrainerNotifications=(uid,tk)=>dbGet("notifications",`client_id=eq.${uid}&order=created_at.desc&limit=60`,tk);
const deleteNotification=(id,tk)=>dbDelete("notifications",`id=eq.${id}`,tk,"return=minimal");
const savePushSub=(uid,sub,tk)=>fetch(`${SB_URL}/rest/v1/push_subscriptions`,{method:'POST',headers:{apikey:SB_KEY,Authorization:`Bearer ${tk}`,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify({client_id:uid,subscription:sub})}).then(r=>r.ok?console.log('[Trainer Push] sub saved'):r.text().then(t=>console.warn('[Trainer Push] save failed',r.status,t))).catch(()=>{});

// ── Schedule periods ──
const getAllPeriods      = (tk)             => dbGet("schedule_periods","order=start_date.desc",tk);
const createPeriod       = (d,tk)           => dbPost("schedule_periods",d,tk);
const deletePeriodRow    = (id,tk)          => dbDelete("schedule_periods",`id=eq.${id}`,tk);
const getPeriodSlots     = (periodId,tk)    => dbGet("period_slots",`period_id=eq.${periodId}`,tk);
const getAllSlotsForDay  = (dow,tk)         => dbGet("schedule_slots",`day_of_week=eq.${dow}&order=start_time_min.asc`,tk);
const addPeriodSlot      = (d,tk)           => dbPost("period_slots",d,tk);
const removePeriodSlotRow= (id,tk)          => dbDelete("period_slots",`id=eq.${id}`,tk);
const getActivePeriodForToday=(tk)=>{ const t=todayISO(); return dbGet("schedule_periods",`start_date=lte.${t}&end_date=gte.${t}&order=start_date.desc&limit=1`,tk).then(r=>r?.[0]||null); };
const activatePeriodNow=(id,start,end,tk)=>{ const t=todayISO(); return dbPatch("schedule_periods",`id=eq.${id}`,{start_date:start>t?t:start,end_date:end<t?new Date(new Date().getTime()+30*864e5).toISOString().split("T")[0]:end},tk); };

// ── Workout templates (Programs) ──
const getTemplates   = (trainerId,tk)    => dbGet("workout_templates",`trainer_id=eq.${trainerId}&order=name.asc`,tk);
const createTemplate = (d,tk)            => dbPost("workout_templates",d,tk);
const updateTemplate = (id,d,tk)         => dbPatch("workout_templates",`id=eq.${id}`,d,tk);
const deleteTemplate = (id,tk)           => dbDelete("workout_templates",`id=eq.${id}`,tk);

// ── Personal records (for monthly report) ──
const getClientPRs  = (uid,tk) => dbGet("personal_records",`client_id=eq.${uid}&order=record_date.desc`,tk);

// ── Time utils ──
const toTime  = (min) => { const h=Math.floor(min/60),m=min%60; return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}`; };
const toSlot  = (s)   => `${toTime(s)} — ${toTime(s+SESS_MIN)}`;
const fmtDate = (iso) => { if(!iso) return ""; return new Date(iso+"T12:00:00").toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"2-digit"}); };
const fmtMemberSince=(iso)=>{ if(!iso) return ""; return new Date(iso).toLocaleDateString("en-US",{month:"long",year:"numeric"}); };
// PostgREST returns embedded session_notes as an object (unique FK) or an array depending on schema-cache detection — normalize both
const firstNote=(sn)=>Array.isArray(sn)?(sn[0]||null):(sn||null);
const friendlyAuthError=(raw)=>{
  let parsed=null;
  try{ parsed=JSON.parse(raw); }catch{ return "Something went wrong. Please try again."; }
  const code=(parsed.error_code||parsed.code||parsed.error||"").toString().toLowerCase();
  const msg=(parsed.msg||parsed.error_description||parsed.message||"").toLowerCase();
  if(code.includes("invalid_credentials")||msg.includes("invalid login credentials")) return "Incorrect email or password.";
  if(msg.includes("email not confirmed")) return "Please confirm your email before logging in — check your inbox.";
  if(msg.includes("rate limit")||msg.includes("too many")) return "Too many attempts. Please wait a moment and try again.";
  return parsed.msg||parsed.error_description||parsed.error||"Something went wrong. Please try again.";
};
// Local calendar-date "YYYY-MM-DD" — NOT toISOString(), which converts to UTC
// and silently returns the wrong day for hours near local midnight (e.g. all
// of 00:00-02:59 in UTC+3 timezones like Athens).
const localISO = (d=new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const todayISO= ()    => localISO();
const todayDow= ()    => { const d=new Date().getDay(); return d===0?6:d-1; };

// Day num: (count of all client sessions up to date) % spw + 1
const calcDayNum = async (clientId, date, tk, spw=3) => {
  // Only count non-cancelled sessions so cancelled sessions don't skew the day rotation
  const all = await dbGet("sessions", `client_id=eq.${clientId}&session_date=lte.${date}&status=neq.cancelled`, tk).catch(()=>[]);
  return ((all?.length||0) % spw) + 1;
};

const WDAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const WDATES_BASE = (() => {
  const d=new Date(),dow=d.getDay()===0?6:d.getDay()-1;
  return Array.from({length:7},(_,i)=>{ const dd=new Date(d); dd.setDate(d.getDate()-dow+i); return {label:dd.getDate(),iso:localISO(dd),dow:i}; });
})();
const addDays=(isoDate,n)=>{ const d=new Date(isoDate); d.setUTCDate(d.getUTCDate()+n); return d.toISOString().split("T")[0]; };
const dowOf=(iso)=>{ const d=new Date(iso+"T12:00:00"); return d.getDay()===0?6:d.getDay()-1; };
const HOURS=[5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23];
const SLOT_TIMES=[300,390,480,840,900,1020];

// ── Shared Components ──
const Logo=({size=48})=>(<img src={LOGO_SRC} alt="UA" style={{width:size,height:size,borderRadius:"50%",objectFit:"cover",flexShrink:0,display:"block"}}/>);
const SL=({children,style={}})=>(<div style={{color:C.muted,fontSize:10,fontWeight:700,letterSpacing:1.8,textTransform:"uppercase",marginBottom:10,fontFamily:"'Oswald',sans-serif",...style}}>{children}</div>);
const Card=({children,style={},glow})=>(<div className="ua-card-glass" style={{background:"rgba(22,22,22,0.72)",borderRadius:14,padding:"16px",border:`1px solid ${glow?glow+"55":C.border}`,...style}}>{children}</div>);
const GBtn=({label,onClick,style={},sm,ghost,color,disabled})=>{
  const base={borderRadius:sm?8:12,cursor:disabled?"not-allowed":"pointer",padding:sm?"8px 14px":"15px",fontWeight:800,fontSize:sm?13:15,fontFamily:"inherit",opacity:disabled?.5:1,...style};
  if(ghost) return <button onClick={onClick} disabled={disabled} className="ua-btn-ghost" style={{...base,background:(color||C.cyan)+"20",border:`1px solid ${color||C.cyan}55`,color:color||C.cyan}}>{label}</button>;
  return <button onClick={onClick} disabled={disabled} className="ua-btn-grad" style={{...base,background:`linear-gradient(135deg,${C.cyan},${C.pink})`,border:"none",color:C.white}}>{label}</button>;
};
const Avatar=({initials,size=44,avatarUrl})=>(avatarUrl?<img src={avatarUrl} style={{width:size,height:size,borderRadius:"50%",objectFit:"cover",flexShrink:0}} alt="av"/>:<div style={{width:size,height:size,borderRadius:"50%",background:`linear-gradient(135deg,${C.cyan}55,${C.pink}55)`,display:"flex",alignItems:"center",justifyContent:"center",color:C.white,fontWeight:800,fontSize:size*0.3,flexShrink:0}}>{initials||"?"}</div>);
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

const UaToast=({toast})=>toast?(<div style={{position:"fixed",bottom:90,left:"50%",transform:"translateX(-50%)",background:toast.ok?C.green:C.pink,color:"#fff",padding:"10px 22px",borderRadius:12,zIndex:600,fontWeight:700,fontSize:13,whiteSpace:"nowrap",boxShadow:"0 4px 20px rgba(0,0,0,0.4)",pointerEvents:"none"}}>{toast.msg}</div>):null;

const UaConfirm=({dialog,setDialog})=>{
  if(!dialog) return null;
  const close=()=>setDialog(null);
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 24px"}}>
      <div style={{background:C.surface,borderRadius:16,padding:24,width:"100%",maxWidth:340,border:`1px solid ${C.border}`}}>
        <div style={{color:C.white,fontSize:15,fontWeight:700,marginBottom:4,lineHeight:1.4}}>{dialog.title||""}</div>
        <div style={{color:C.muted,fontSize:13,marginBottom:20,lineHeight:1.5}}>{dialog.msg}</div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>{close();dialog.onOk?.();}} style={{flex:1,borderRadius:8,cursor:"pointer",padding:"12px",fontWeight:800,fontSize:14,fontFamily:"inherit",background:C.pink+"20",border:`1px solid ${C.pink}55`,color:C.pink}}>{dialog.okLabel||"Confirm"}</button>
          <button onClick={close} style={{flex:1,borderRadius:8,cursor:"pointer",padding:"12px",fontWeight:800,fontSize:14,fontFamily:"inherit",background:`linear-gradient(135deg,${C.cyan},${C.pink})`,border:"none",color:"#fff"}}>{dialog.cancelLabel||"Cancel"}</button>
        </div>
      </div>
    </div>
  );
};

const UaPrompt=({prompt,setPrompt})=>{
  const [val,setVal]=useState(prompt?.defaultVal||"");
  if(!prompt) return null;
  const close=()=>setPrompt(null);
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 24px"}}>
      <div style={{background:C.surface,borderRadius:16,padding:24,width:"100%",maxWidth:340,border:`1px solid ${C.border}`}}>
        <div style={{color:C.white,fontSize:15,fontWeight:700,marginBottom:12}}>{prompt.msg}</div>
        <input autoFocus value={val} onChange={e=>setVal(e.target.value)} onKeyDown={e=>e.key==="Enter"&&val.trim()&&(close(),prompt.onOk(val.trim()))}
          placeholder={prompt.placeholder||""}
          style={{width:"100%",background:C.surface2,border:`1px solid ${C.cyan}55`,borderRadius:8,padding:"11px 12px",color:"#fff",fontSize:14,outline:"none",fontFamily:"inherit",boxSizing:"border-box",marginBottom:14}}/>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>val.trim()&&(close(),prompt.onOk(val.trim()))} style={{flex:1,borderRadius:8,cursor:"pointer",padding:"12px",fontWeight:800,fontSize:14,fontFamily:"inherit",background:`linear-gradient(135deg,${C.cyan},${C.pink})`,border:"none",color:"#fff"}}>OK</button>
          <button onClick={close} style={{flex:1,borderRadius:8,cursor:"pointer",padding:"12px",fontWeight:800,fontSize:14,fontFamily:"inherit",background:C.muted+"20",border:`1px solid ${C.muted}55`,color:C.muted}}>Cancel</button>
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
    else if(it._type==="booking"&&it._dt<=nowMs) map[it._key]="missed";
    else if(it.status==="completed"||it._dt<=nowMs) map[it._key]="completed";
  });
  future.forEach((it,i)=>{ map[it._key]=i===0?"upcoming":"booked"; });
  return map;
};
// ── Trainer Notification Panel ──
const typeIcon=(type)=>{
  const m={booking_made:"🗓",cancel_request:"🙏",cancel_accepted:"✅",cancel_declined:"🚫",slot_request:"🕐",new_client:"🆕",low_sessions_trainer:"⚠️",session_scheduled:"📋",payment_confirmed:"✅",payment_reminder:"💳"};
  return m[type]||"🔔";
};
const TrainerNotifPanel=({userId,token,count,onClose,onDecideCancelReq})=>{
  const [notifs,setNotifs]=useState([]);
  const [loading,setLoading]=useState(true);
  useEffect(()=>{
    getTrainerNotifications(userId,token).then(r=>setNotifs(r||[])).catch(()=>{}).finally(()=>setLoading(false));
  },[]);
  const handleDelete=async(id)=>{
    setNotifs(p=>p.filter(n=>n.id!==id));
    deleteNotification(id,token).catch(()=>{});
  };
  const handleClearAll=async()=>{
    const ids=notifs.map(n=>n.id);
    setNotifs([]);
    ids.forEach(id=>deleteNotification(id,token).catch(()=>{}));
  };
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:300,display:"flex",flexDirection:"column",justifyContent:"flex-end"}} onClick={onClose}>
      <div style={{background:C.surface,borderRadius:"20px 20px 0 0",padding:"20px 20px 40px",maxHeight:"85vh",overflowY:"auto",boxSizing:"border-box"}} onClick={e=>e.stopPropagation()}>
        <div style={{width:40,height:4,background:C.border,borderRadius:2,margin:"0 auto 16px"}}/>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div style={{color:C.white,fontSize:17,fontWeight:800}}>Ειδοποιήσεις</div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            {notifs.length>0&&<button onClick={handleClearAll} style={{background:"none",border:`1px solid ${C.border}`,borderRadius:8,padding:"4px 10px",color:C.muted,cursor:"pointer",fontFamily:"inherit",fontSize:11}}>Διαγραφή όλων</button>}
            <button onClick={onClose} style={{background:C.surface2,border:`1px solid ${C.border}`,borderRadius:8,padding:"6px 12px",color:C.muted,cursor:"pointer",fontFamily:"inherit"}}>✕</button>
          </div>
        </div>
        {loading?<div style={{textAlign:"center",padding:24,color:C.muted}}>Loading…</div>:
         notifs.length===0?<div style={{textAlign:"center",padding:24,color:C.muted,fontSize:14}}>Καμία ειδοποίηση</div>:
         notifs.map(n=>(
           <div key={n.id} style={{padding:"12px 0",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10}}>
             <div style={{display:"flex",gap:10,flex:1,minWidth:0}}>
               <span style={{fontSize:18,flexShrink:0}}>{typeIcon(n.type)}</span>
               <div style={{minWidth:0}}>
                 <div style={{color:C.white,fontSize:13,lineHeight:1.4}}>{n.message}</div>
                 {n.created_at&&<div style={{color:C.muted,fontSize:11,marginTop:4}}>{new Date(n.created_at).toLocaleDateString("el-GR",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</div>}
                 {n.type==="cancel_request"&&onDecideCancelReq&&(
                   <button onClick={()=>{onDecideCancelReq();onClose();}} style={{marginTop:6,background:`${C.pink}18`,border:`1px solid ${C.pink}44`,borderRadius:8,padding:"4px 10px",color:C.pink,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Decide →</button>
                 )}
               </div>
             </div>
             <button onClick={()=>handleDelete(n.id)} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:14,padding:"2px 4px",flexShrink:0,lineHeight:1}}>✕</button>
           </div>
         ))
        }
      </div>
    </div>
  );
};

// ── SVG icons for Trainer BottomNav ──
const IcoToday=({c})=>(<svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><circle cx="12" cy="16" r="1.5" fill={c} stroke="none"/><path d="M12 13v1"/></svg>);
const IcoClients=({c})=>(<svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="7" r="3.5"/><path d="M2 20c0-3.5 3.1-6 7-6"/><circle cx="17" cy="8" r="2.5"/><path d="M22 20c0-2.8-2.3-5-5-5a5 5 0 00-2 .4"/></svg>);
const IcoCalTr=({c})=>(<svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></svg>);
const IcoDumbbell=({c})=>(<svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M8 12h8"/><rect x="5.5" y="8" width="2.5" height="8" rx="1"/><rect x="16" y="8" width="2.5" height="8" rx="1"/><rect x="2.5" y="10" width="3" height="4" rx="1"/><rect x="18.5" y="10" width="3" height="4" rx="1"/></svg>);

const BottomNav=({active,onNav,scheduleBadge=0})=>{
  const tabs=[
    {id:"today",    label:"Today",    Icon:IcoToday},
    {id:"clients",  label:"Clients",  Icon:IcoClients},
    {id:"schedule", label:"Schedule", Icon:IcoCalTr},
    {id:"programs", label:"Programs", Icon:IcoDumbbell},
  ];
  return(
    <div style={{position:"fixed",bottom:0,left:0,right:0,background:"rgba(8,8,8,0.92)",backdropFilter:"blur(24px) saturate(200%)",WebkitBackdropFilter:"blur(24px) saturate(200%)",borderTop:"1px solid rgba(255,255,255,0.06)",display:"flex",justifyContent:"space-around",alignItems:"flex-end",padding:"8px 0 max(env(safe-area-inset-bottom),20px)",zIndex:100}}>
      {tabs.map(t=>{
        const isActive=active===t.id;
        const col=isActive?C.pink:C.muted;
        return(
          <button key={t.id} onClick={()=>onNav(t.id)} style={{background:"none",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:4,padding:"2px 14px",position:"relative",transition:"transform .15s"}}>
            <div style={{position:"relative",display:"flex",alignItems:"center",justifyContent:"center",width:40,height:32,borderRadius:12,background:isActive?C.pink+"18":"transparent",transition:"background .2s"}}>
              <t.Icon c={col}/>
              {t.id==="schedule"&&scheduleBadge>0&&(
                <span style={{position:"absolute",top:2,right:4,background:C.pink,borderRadius:"50%",width:7,height:7,display:"block",boxShadow:`0 0 0 2px ${C.bg}`}}/>
              )}
            </div>
            <span style={{fontSize:9,fontWeight:isActive?800:600,color:col,letterSpacing:.4,textTransform:"uppercase",transition:"color .2s"}}>{t.label}</span>
            {isActive&&<span style={{position:"absolute",bottom:-2,left:"50%",transform:"translateX(-50%)",width:20,height:2,background:C.pink,borderRadius:2}}/>}
          </button>
        );
      })}
    </div>
  );
};

// ── Session Editor ──
const SessionEditor=({session,spw,token,trainerId,onClose,onSaved})=>{
  const note=firstNote(session.session_notes);
  const [tNote,setTNote]=useState(note?.trainer_note||"");
  const [exs,setExs]=useState(session.exercises||[]);
  const [newEx,setNewEx]=useState({name:"",sets:"",reps:"",weight:""});
  const [showAdd,setShowAdd]=useState(false);
  const [saving,setSaving]=useState(false);
  const [saved,setSaved]=useState(false);
  const [templates,setTemplates]=useState([]);
  const [showTemplates,setShowTemplates]=useState(false);
  const [savingTemplate,setSavingTemplate]=useState(false);
  const [tplPrompt,setTplPrompt]=useState(null);
  const [tplConfirm,setTplConfirm]=useState(null);
  const [localToast,setLocalToast]=useState(null);
  const showLocalToast=(msg,ok=false)=>{setLocalToast({msg,ok});setTimeout(()=>setLocalToast(null),3500);};
  const dn=session.day_num;

  useEffect(()=>{ getTemplates(trainerId,token).then(r=>setTemplates(r||[])).catch(()=>{}); },[]);

  const addEx=()=>{ if(!newEx.name) return; setExs(p=>[...p,{...newEx}]); setNewEx({name:"",sets:"",reps:"",weight:""}); setShowAdd(false); };

  const handleSaveTemplate=()=>{
    if(exs.length===0) return;
    setTplPrompt({msg:"Template name:",placeholder:"e.g. Push Day",onOk:async(name)=>{
      setSavingTemplate(true);
      try{
        const res=await createTemplate({trainer_id:trainerId,name:name.trim(),exercises:exs},token);
        const created=Array.isArray(res)?res[0]:res;
        if(created) setTemplates(p=>[...p,created].sort((a,b)=>a.name.localeCompare(b.name)));
      }catch(e){ showLocalToast("Error: "+e.message); }
      setSavingTemplate(false);
    }});
  };

  const handleLoadTemplate=(tpl)=>{
    if(exs.length>0){
      setTplConfirm({msg:`Replace current exercise list with "${tpl.name}"?`,okLabel:"Replace",onOk:()=>{setExs(tpl.exercises||[]);setShowTemplates(false);}});
    }else{
      setExs(tpl.exercises||[]);setShowTemplates(false);
    }
  };
  const save=async()=>{
    if(saving||saved) return;
    setSaving(true);
    try{
      await saveTrainerNote(session.id,tNote,token);
      await saveExercises(session.id,exs,token);
      setSaved(true);
      onSaved({...session,session_notes:[{trainer_note:tNote,client_note:note?.client_note||""}],exercises:exs});
      setTimeout(()=>{ setSaved(false); onClose(); },1200);
    }catch(e){ showLocalToast("Error: "+e.message); }
    setSaving(false);
  };
  const inp=(val,set,ph)=>(<input value={val} onChange={e=>set(e.target.value)} placeholder={ph} style={{background:C.surface2,border:`1px solid ${C.border}`,borderRadius:8,padding:"9px 10px",color:C.white,fontSize:13,outline:"none",fontFamily:"inherit",flex:1}}/>);

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:200,display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
      <div style={{background:C.surface,borderRadius:"20px 20px 0 0",padding:"20px 20px 40px",maxHeight:"92vh",overflowY:"auto"}}>
        <div style={{width:40,height:4,background:C.border,borderRadius:2,margin:"0 auto 20px"}}/>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}>
          <div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{color:C.white,fontSize:18,fontWeight:800}}>Session Log</div>
              {dn&&<span style={{background:`linear-gradient(135deg,${C.cyan},${C.pink})`,color:C.white,fontSize:10,fontWeight:800,padding:"3px 9px",borderRadius:20}}>Day {dn}</span>}
            </div>
            <div style={{color:C.muted,fontSize:13,marginTop:2}}>{fmtDate(session.session_date)} · {toTime(session.start_time_min)}</div>
          </div>
          <button onClick={onClose} style={{background:C.surface2,border:`1px solid ${C.border}`,borderRadius:8,padding:"6px 12px",color:C.muted,cursor:"pointer",fontFamily:"inherit"}}>✕</button>
        </div>

        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <SL style={{marginBottom:0}}>Exercises</SL>
          <div style={{display:"flex",gap:6}}>
            <button onClick={()=>setShowTemplates(p=>!p)} style={{background:"transparent",border:`1px solid ${C.border}`,borderRadius:6,padding:"4px 10px",color:C.cyan,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>{showTemplates?"▲ Hide":"Templates"}</button>
            <button onClick={()=>setShowAdd(p=>!p)} style={{background:"transparent",border:`1px solid ${C.border}`,borderRadius:6,padding:"4px 10px",color:C.muted,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>{showAdd?"▲ Cancel":"+ Add"}</button>
          </div>
        </div>
        {showTemplates&&(
          <div style={{background:C.surface2,borderRadius:10,padding:"12px",marginBottom:10}}>
            {templates.length===0
              ? <div style={{color:C.muted,fontSize:12,marginBottom:8}}>No saved templates yet.</div>
              : <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:10}}>
                  {templates.map(tpl=>(
                    <button key={tpl.id} onClick={()=>handleLoadTemplate(tpl)} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"9px 12px",color:C.white,fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit",textAlign:"left"}}>{tpl.name} <span style={{color:C.muted,fontSize:11}}>({(tpl.exercises||[]).length} exercises)</span></button>
                  ))}
                </div>
            }
            <GBtn label={savingTemplate?"Saving...":"Save current list as template"} onClick={handleSaveTemplate} disabled={savingTemplate||exs.length===0} sm ghost style={{width:"100%"}}/>
          </div>
        )}
        {showAdd&&(
          <div style={{background:C.surface2,borderRadius:10,padding:"12px",marginBottom:10}}>
            <div style={{display:"flex",gap:6,marginBottom:8}}><ExercisePicker value={newEx.name} onChange={v=>setNewEx(p=>({...p,name:v}))} placeholder="Exercise name"/></div>
            <div style={{display:"flex",gap:6,marginBottom:8}}>
              {inp(newEx.sets,v=>setNewEx(p=>({...p,sets:v})),"Sets")}
              {inp(newEx.reps,v=>setNewEx(p=>({...p,reps:v})),"Reps")}
              {inp(newEx.weight,v=>setNewEx(p=>({...p,weight:v})),"Weight")}
            </div>
            <GBtn label="Add Exercise" onClick={addEx} sm style={{width:"100%"}}/>
          </div>
        )}
        <div style={{display:"flex",flexDirection:"column",gap:7,marginBottom:20}}>
          {exs.length===0?<Empty msg="No exercises yet"/>:exs.map((ex,i)=>(
            <div key={i} style={{background:C.surface2,borderRadius:10,padding:"11px 14px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div><div style={{color:C.white,fontSize:14,fontWeight:600}}>{ex.name}</div><div style={{color:C.cyan,fontSize:12,fontWeight:700,marginTop:2}}>{ex.sets}×{ex.reps} · {ex.weight}</div></div>
              <button onClick={()=>setExs(p=>p.filter((_,j)=>j!==i))} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:16,padding:"4px"}}>✕</button>
            </div>
          ))}
        </div>

        <SL>Trainer Notes</SL>
        <textarea value={tNote} onChange={e=>setTNote(e.target.value)} placeholder="Add training notes..."
          style={{width:"100%",background:C.surface2,border:`1px solid ${C.pink}33`,borderRadius:10,padding:"12px 14px",color:C.white,fontSize:14,fontFamily:"inherit",resize:"none",height:85,outline:"none",boxSizing:"border-box",lineHeight:1.5,marginBottom:16}}/>

        <SL>Client Notes (read-only)</SL>
        <div style={{background:C.surface2,borderRadius:10,padding:"12px 14px",color:note?.client_note?C.white:C.muted,fontSize:14,lineHeight:1.5,marginBottom:20,border:`1px solid ${C.cyan}22`}}>
          {note?.client_note||"Client hasn't added notes yet."}
        </div>
        <GBtn label={saving?"Saving...":saved?"✓ Saved!":"Save Session"} onClick={save} disabled={saving} style={{width:"100%"}}/>
      </div>
      <UaToast toast={localToast}/>
      <UaPrompt prompt={tplPrompt} setPrompt={setTplPrompt}/>
      <UaConfirm dialog={tplConfirm} setDialog={setTplConfirm}/>
    </div>
  );
};

// ── Eye icon + password field ──
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
const LoginScreen=({onLogin})=>{
  const [email,setE]=useState(""); const [pw,setPw]=useState("");
  const [loading,setL]=useState(false); const [err,setErr]=useState("");
  const handle=async()=>{
    if(!email||!pw) return; setL(true); setErr("");
    try{ await onLogin(email,pw); }
    catch(e){ setErr(e.message==="NOT_TRAINER"?"Access denied. Trainer accounts only.":friendlyAuthError(e.message)); }
    setL(false);
  };
  const inp={background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"14px 16px",color:C.white,fontSize:15,outline:"none",fontFamily:"inherit",width:"100%",boxSizing:"border-box"};
  return(
    <div style={{height:"100dvh",maxHeight:"100dvh",background:C.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"24px 28px",overflow:"hidden",boxSizing:"border-box"}}>
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:12,marginBottom:24}}>
        <Logo size={96}/>
        <div style={{textAlign:"center"}}>
          <div style={{color:C.white,fontSize:24,fontWeight:900,letterSpacing:3,textTransform:"uppercase",lineHeight:1,fontFamily:"'Oswald',sans-serif"}}>UNORTHODOX</div>
          <div style={{fontSize:24,fontWeight:900,letterSpacing:3,textTransform:"uppercase",lineHeight:1,background:`linear-gradient(90deg,${C.cyan},${C.pink})`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",fontFamily:"'Oswald',sans-serif"}}>ATHLETES</div>
          <div style={{color:C.muted,fontSize:10,letterSpacing:3,marginTop:6,textTransform:"uppercase",fontFamily:"'Oswald',sans-serif"}}>Think · Perform · Develop</div>
        </div>
        <div style={{background:C.pink+"22",border:`1px solid ${C.pink}55`,borderRadius:20,padding:"4px 14px",color:C.pink,fontSize:11,fontWeight:700,letterSpacing:1}}>TRAINER PORTAL</div>
      </div>
      <div style={{width:"100%",maxWidth:320,display:"flex",flexDirection:"column",gap:10}}>
        <input style={inp} placeholder="Trainer email" value={email} onChange={e=>setE(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handle()}/>
        <PwField style={inp} placeholder="Password" value={pw} onChange={e=>setPw(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handle()}/>
        {err&&<div style={{color:C.pink,fontSize:13,textAlign:"center"}}>{err}</div>}
        <GBtn label={loading?"Entering...":"Enter →"} onClick={handle} disabled={loading} style={{marginTop:2,width:"100%"}}/>
        <a href="/reset-password" style={{background:"none",border:"none",color:C.muted,fontSize:13,fontFamily:"inherit",textAlign:"center",width:"100%",textDecoration:"none"}}>Forgot password?</a>
      </div>
    </div>
  );
};

// ── Today ──
const TodayScreen=({trainerName,trainerId,token,clients,onViewClient,onTrainerNameUpdated,notifCount,onOpenNotif})=>{
  const [sessions,setSessions]=useState([]);
  const [loading,setLoad]=useState(true);
  const [announcements,setAnn]=useState([]);
  const [showAnnForm,setShowAnnForm]=useState(false);
  const [annTitle,setAnnTitle]=useState("");
  const [annBody,setAnnBody]=useState("");
  const [annPosting,setAnnPosting]=useState(false);
  const [annConfirm,setAnnConfirm]=useState(null);
  const [annToast,setAnnToast]=useState(null);
  const showAnnToast=(msg,ok=false)=>{setAnnToast({msg,ok});setTimeout(()=>setAnnToast(null),3500);};
  const [dismissedSetup,setDismissedSetup]=useState(()=>new Set(JSON.parse(localStorage.getItem("ua_dismissed_setup")||"[]")));
  const [editingTName,setEditingTName]=useState(false);
  const [tNameVal,setTNameVal]=useState(trainerName||"");
  const [savingTName,setSavingTName]=useState(false);

  useEffect(()=>{
    const today=todayISO();
    Promise.all([
      getTodaySessions(trainerId,today,token),
      getAnnouncements(token),
      getTodayBookings(today,token),
    ]).then(([sess,anns,bks])=>{
      const sessArr=sess||[];
      const bkItems=(bks||[])
        .filter(b=>b.schedule_slots)
        .map(b=>({id:`bk_${b.id}`,_type:"booking",session_date:today,start_time_min:b.schedule_slots.start_time_min,client_id:b.client_id,status:"booked",profiles:b.profiles}))
        .filter(b=>!sessArr.some(s=>s.client_id===b.client_id));
      setSessions([...sessArr,...bkItems]);
      setAnn(anns||[]);
    }).finally(()=>setLoad(false));
  },[]);

  // New clients still without a package — derived from data the trainer
  // already has full read access to, no extra table/RLS needed.
  const TWO_WEEKS_MS=14*24*60*60*1000;
  const needsSetup=clients.filter(c=>!c._pkg&&c.created_at&&(Date.now()-new Date(c.created_at).getTime())<TWO_WEEKS_MS&&!dismissedSetup.has(c.id));

  const dismissSetup=(id)=>{
    setDismissedSetup(p=>{ const n=new Set(p); n.add(id); localStorage.setItem("ua_dismissed_setup",JSON.stringify([...n])); return n; });
  };

  const getDayNumForItem=(item,clients)=>{
    if(item.day_num) return item.day_num;
    const cl=clients.find(c=>c.id===item.client_id||c.id===item.profiles?.id);
    if(!cl?._pkg) return null;
    const spw=cl._pkg.sessions_per_week||3;
    return ((cl._pkg.sessions_used||0)%spw)+1;
  };

  const bySlot={};
  (sessions||[]).forEach(s=>{ const st=s.start_time_min; if(st!=null){if(!bySlot[st])bySlot[st]=[];bySlot[st].push(s);} });
  const slots=Object.keys(bySlot).sort((a,b)=>Number(a)-Number(b));
  const statusMap=computeStatusMap(sessions.filter(s=>s.session_date).map(s=>({...s,_key:s.id})),new Date());
  const alerts=clients.filter(c=>{const pkg=c._pkg;return pkg&&(pkg.sessions_total-pkg.sessions_used)<=2;});
  const todayStr=new Date().toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"});

  const handlePostAnn=async()=>{
    if(!annTitle.trim()||!annBody.trim()||annPosting) return;
    setAnnPosting(true);
    try{
      const r=await postAnnouncement({title:annTitle.trim(),body:annBody.trim()},token);
      const created=Array.isArray(r)?r[0]:r;
      if(created) setAnn(p=>[created,...p]);
      // Broadcast push to all clients
      fetch('/api/send-push',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({broadcast:true,title:'📣 '+annTitle.trim(),body:annBody.trim()})}).catch(()=>{});
      setAnnTitle(""); setAnnBody(""); setShowAnnForm(false);
    }catch(e){ showAnnToast("Error: "+e.message); }
    setAnnPosting(false);
  };

  const handleSaveTName=async()=>{
    const trimmed=tNameVal.trim();
    if(!trimmed||trimmed===(trainerName||"")){setEditingTName(false);return;}
    setSavingTName(true);
    try{
      await dbPatch("profiles",`id=eq.${trainerId}`,{name:trimmed},token);
      onTrainerNameUpdated&&onTrainerNameUpdated(trimmed);
      setEditingTName(false);
    }catch(e){showAnnToast("Error: "+e.message);}
    setSavingTName(false);
  };

  const handleDeleteAnn=(a)=>{
    setAnnConfirm({msg:"Delete this announcement?",okLabel:"Delete",onOk:async()=>{
      try{ await deleteAnnouncement(a.id,token); setAnn(p=>p.filter(x=>x.id!==a.id)); }
      catch(e){ showAnnToast("Error: "+e.message); }
    }});
  };

  return(
    <div style={{paddingBottom:80}}>
      <div style={{padding:"22px 20px 0",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div>
          <div style={{color:C.muted,fontSize:13}}>{todayStr}</div>
          {editingTName?(
            <div style={{display:"flex",alignItems:"center",gap:6,marginTop:2}}>
              <input
                value={tNameVal}
                onChange={e=>setTNameVal(e.target.value)}
                onKeyDown={e=>{if(e.key==="Enter")handleSaveTName();if(e.key==="Escape"){setEditingTName(false);setTNameVal(trainerName||"");}}}
                autoFocus
                style={{background:C.surface2,border:`1px solid ${C.cyan}`,borderRadius:8,padding:"5px 10px",color:C.white,fontSize:18,fontWeight:800,outline:"none",fontFamily:"'Oswald',sans-serif",width:160}}
              />
              <button onClick={handleSaveTName} disabled={savingTName} style={{background:C.cyan,border:"none",borderRadius:8,padding:"5px 11px",color:C.bg,fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>{savingTName?"…":"✓"}</button>
              <button onClick={()=>{setEditingTName(false);setTNameVal(trainerName||"");}} style={{background:"none",border:"none",color:C.muted,fontSize:15,cursor:"pointer",fontFamily:"inherit"}}>✕</button>
            </div>
          ):(
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <div style={{color:C.white,fontSize:22,fontWeight:800,fontFamily:"'Oswald',sans-serif"}}>{trainerName||"Coach"}</div>
              <button onClick={()=>setEditingTName(true)} style={{background:"none",border:"none",color:C.border,fontSize:13,cursor:"pointer",padding:"0 2px",lineHeight:1,marginTop:2}}>✏️</button>
            </div>
          )}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <button onClick={onOpenNotif} style={{background:"none",border:"none",cursor:"pointer",position:"relative",padding:4}}>
            <svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
            {notifCount>0&&<span style={{position:"absolute",top:0,right:0,background:C.pink,borderRadius:"50%",minWidth:16,height:16,fontSize:9,fontWeight:800,color:C.white,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:`0 0 0 2px ${C.bg}`,padding:"0 3px"}}>{notifCount>9?"9+":notifCount}</span>}
          </button>
          <Logo size={44}/>
        </div>
      </div>

      {/* Summary */}
      <div style={{padding:"14px 20px 0"}}>
        <div style={{background:C.surface,border:`1px solid ${C.pink}33`,borderRadius:12,padding:"13px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div><div style={{color:C.white,fontSize:14,fontWeight:700}}>Today's Overview</div><div style={{color:C.muted,fontSize:12,marginTop:2}}>{sessions.length} sessions · {clients.length} active clients</div></div>
          <div style={{display:"flex",gap:10}}>
            {[{v:sessions.length,l:"Today",c:C.cyan},{v:clients.length,l:"Clients",c:C.pink}].map(s=>(
              <div key={s.l} style={{background:C.surface2,borderRadius:8,padding:"8px 12px",textAlign:"center"}}>
                <div style={{color:s.c,fontSize:20,fontWeight:900}}>{s.v}</div>
                <div style={{color:C.muted,fontSize:9,fontWeight:700}}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* New sign-ups without a package yet */}
      {needsSetup.length>0&&(
        <div style={{padding:"12px 20px 0"}}>
          <div style={{background:C.surface,border:`1px solid ${C.cyan}44`,borderRadius:12,padding:"13px 16px"}}>
            <div style={{color:C.cyan,fontSize:12,fontWeight:700,marginBottom:8}}>🆕 New Sign-ups ({needsSetup.length})</div>
            {needsSetup.map(c=>(
              <div key={c.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:`1px solid ${C.border}`}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}><Avatar initials={c.initials} size={28} avatarUrl={c.avatar_url}/><div style={{color:C.white,fontSize:13,fontWeight:600}}>{c.name}</div></div>
                <div style={{display:"flex",gap:6,flexShrink:0}}>
                  <button onClick={()=>onViewClient(c)} style={{background:C.surface2,border:`1px solid ${C.border}`,borderRadius:6,padding:"4px 10px",color:C.cyan,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Set up →</button>
                  <button onClick={()=>dismissSetup(c.id)} style={{background:"none",border:"none",color:C.muted,fontSize:14,cursor:"pointer",fontFamily:"inherit",padding:"0 2px"}}>✕</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Alerts */}
      {alerts.length>0&&(
        <div style={{padding:"12px 20px 0"}}>
          <div style={{background:C.surface,border:`1px solid ${C.amber}44`,borderRadius:12,padding:"13px 16px"}}>
            <div style={{color:C.amber,fontSize:12,fontWeight:700,marginBottom:8}}>⚠️ Expiring Packages</div>
            {alerts.map(c=>{
              const left=c._pkg.sessions_total-c._pkg.sessions_used;
              return(<div key={c.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:`1px solid ${C.border}`}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}><Avatar initials={c.initials} size={28} avatarUrl={c.avatar_url}/><div style={{color:C.white,fontSize:13,fontWeight:600}}>{c.name}</div></div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{color:left===1?C.pink:C.amber,fontSize:12,fontWeight:700}}>{left} left</span>
                  <button onClick={()=>onViewClient(c)} style={{background:C.surface2,border:`1px solid ${C.border}`,borderRadius:6,padding:"4px 10px",color:C.muted,fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>Renew →</button>
                </div>
              </div>);
            })}
          </div>
        </div>
      )}

      {/* Today's Sessions (all logged) */}
      <div style={{padding:"14px 20px 0"}}>
        <SL>Today's Sessions</SL>
        {loading?<Spinner/>:slots.length===0?<Card style={{textAlign:"center",padding:"28px"}}><Empty msg="No sessions today"/></Card>:
          slots.map(st=>{
            const slotSessions=bySlot[st];
            return(<Card key={st} style={{marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <div><div style={{color:C.white,fontSize:15,fontWeight:800}}>{toSlot(parseInt(st))}</div><div style={{color:C.muted,fontSize:12,marginTop:2}}>{slotSessions.length} session{slotSessions.length!==1?"s":""}</div></div>
                <div style={{background:`linear-gradient(135deg,${C.cyan},${C.pink})`,borderRadius:20,padding:"5px 14px",color:C.white,fontSize:14,fontWeight:900}}>{slotSessions.length}</div>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {slotSessions.map((s,j)=>{
                  const cp=s.profiles; const full=clients.find(c=>c.id===cp?.id);
                  const dn=getDayNumForItem(s,clients);
                  return(<div key={j} style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:C.surface2,borderRadius:8,padding:"8px 12px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <Avatar initials={cp?.initials} size={28} avatarUrl={cp?.avatar_url}/>
                      <div>
                        <div style={{color:C.white,fontSize:13,fontWeight:600}}>{cp?.name||"Unknown"}</div>
                        {dn&&<span style={{background:`linear-gradient(135deg,${C.cyan},${C.pink})`,color:C.white,fontSize:9,fontWeight:800,padding:"1px 6px",borderRadius:10}}>Day {dn}</span>}
                      </div>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <StatusBadge status={statusMap[s.id]}/>
                      {full&&<button onClick={()=>onViewClient(full)} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:6,padding:"3px 8px",color:C.muted,fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>View →</button>}
                    </div>
                  </div>);
                })}
              </div>
            </Card>);
          })
        }
      </div>

      {/* Announcements */}
      <div style={{padding:"14px 20px 0"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <SL style={{marginBottom:0}}>Announcements</SL>
          <button onClick={()=>setShowAnnForm(p=>!p)} style={{background:`linear-gradient(135deg,${C.cyan},${C.pink})`,border:"none",borderRadius:8,padding:"6px 14px",color:C.white,fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>{showAnnForm?"▲ Cancel":"+ Post"}</button>
        </div>
        {showAnnForm&&(
          <Card style={{marginBottom:10}}>
            <input value={annTitle} onChange={e=>setAnnTitle(e.target.value)} placeholder="Title" style={{width:"100%",background:C.surface2,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 12px",color:C.white,fontSize:14,outline:"none",fontFamily:"inherit",boxSizing:"border-box",marginBottom:8}}/>
            <textarea value={annBody} onChange={e=>setAnnBody(e.target.value)} placeholder="Message..." style={{width:"100%",background:C.surface2,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 12px",color:C.white,fontSize:14,fontFamily:"inherit",resize:"none",height:80,outline:"none",boxSizing:"border-box",lineHeight:1.5,marginBottom:10}}/>
            <GBtn label={annPosting?"Posting...":"Post Announcement"} onClick={handlePostAnn} disabled={annPosting} style={{width:"100%"}}/>
          </Card>
        )}
        {announcements.length===0?<Empty msg="No announcements yet"/>:
          announcements.map((a,i)=>(
            <Card key={i} glow={C.cyan} style={{marginBottom:8}}>
              <div style={{display:"flex",gap:12,alignItems:"flex-start"}}>
                <div style={{width:32,height:32,borderRadius:9,background:`linear-gradient(135deg,${C.cyan}33,${C.pink}33)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,flexShrink:0}}>📣</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
                    <div style={{color:C.white,fontSize:14,fontWeight:700}}>{a.title}</div>
                    <span style={{color:C.cyan,fontSize:11,fontWeight:700,flexShrink:0,whiteSpace:"nowrap"}}>{fmtDate(a.created_at?.split("T")[0])}</span>
                  </div>
                  <div style={{color:C.muted,fontSize:13,lineHeight:1.5,marginTop:4}}>{a.body}</div>
                  <button onClick={()=>handleDeleteAnn(a)} style={{background:"none",border:"none",color:C.pink,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",padding:0,marginTop:8}}>Delete</button>
                </div>
              </div>
            </Card>
          ))
        }
      </div>
      <UaToast toast={annToast}/>
      <UaConfirm dialog={annConfirm} setDialog={setAnnConfirm}/>
    </div>
  );
};

// ── Clients List ──
const ClientsScreen=({clients,onViewClient})=>{
  const [search,setSearch]=useState("");
  const filtered=clients.filter(c=>c.name?.toLowerCase().includes(search.toLowerCase()));
  return(
    <div style={{paddingBottom:80}}>
      <div style={{padding:"22px 20px 12px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div><div style={{color:C.white,fontSize:22,fontWeight:800,fontFamily:"'Oswald',sans-serif"}}>Clients</div><div style={{color:C.muted,fontSize:13}}>{clients.length} active members</div></div>
      </div>
      <div style={{padding:"0 20px 14px"}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search client..." style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"12px 16px",color:C.white,fontSize:14,outline:"none",fontFamily:"inherit",boxSizing:"border-box"}}/>
      </div>
      <div style={{padding:"0 20px",display:"flex",flexDirection:"column",gap:10}}>
        {filtered.length===0?<Empty msg="No clients found"/>:filtered.map(c=>{
          const pkg=c._pkg; const left=pkg?(pkg.sessions_total-pkg.sessions_used):null;
          const pct=pkg?(pkg.sessions_used/pkg.sessions_total)*100:0; const isLow=left!=null&&left<=2;
          const spw=pkg?.sessions_per_week||3; const currentDay=pkg?((pkg.sessions_used||0)%spw)+1:null;
          return(<button key={c.id} onClick={()=>onViewClient(c)} style={{background:C.surface,border:`1px solid ${isLow?C.pink+"44":C.border}`,borderRadius:14,padding:"16px",cursor:"pointer",textAlign:"left",width:"100%"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:pkg?12:0}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <Avatar initials={c.initials} avatarUrl={c.avatar_url}/>
                <div>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <div style={{color:C.white,fontSize:15,fontWeight:700}}>{c.name}</div>
                    {currentDay&&<span style={{background:`linear-gradient(135deg,${C.cyan},${C.pink})`,color:C.white,fontSize:10,fontWeight:800,padding:"2px 7px",borderRadius:20}}>Day {currentDay}</span>}
                  </div>
                  <div style={{color:C.muted,fontSize:12,marginTop:2}}>{pkg?`${pkg.sessions_total}-Session · ${pkg.sessions_per_week||3}x/week · ends ${fmtDate(pkg.end_date)}`:"No active package"}</div>
                  {pkg?.has_injury&&<div style={{color:C.amber,fontSize:11,marginTop:2}}>⚠️ {pkg.injury_notes}</div>}
                  {pkg?.package_notes&&<div style={{color:C.cyan,fontSize:11,marginTop:2}}>📋 {pkg.package_notes}</div>}
                </div>
              </div>
              {isLow&&<span style={{background:C.pink+"22",color:C.pink,fontSize:11,fontWeight:700,padding:"3px 8px",borderRadius:6,border:`1px solid ${C.pink}44`,flexShrink:0}}>{left} left!</span>}
            </div>
            {pkg&&<div style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{flex:1,height:5,background:C.surface2,borderRadius:3}}><div style={{width:`${pct}%`,height:"100%",borderRadius:3,background:isLow?C.pink:`linear-gradient(90deg,${C.cyan},${C.pink})`}}/></div>
              <span style={{color:isLow?C.pink:C.muted,fontSize:11,fontWeight:700,minWidth:50,textAlign:"right"}}>{pkg.sessions_used}/{pkg.sessions_total}</span>
            </div>}
          </button>);
        })}
      </div>
    </div>
  );
};

// ── Monthly Report ──
const MonthlyReportModal=({client,timeline,statusMap,pkg,allPkgs,prs,spw,onClose})=>{
  const now=new Date();
  const [offset,setOffset]=useState(0); // 0 = current month, -1 = last month, etc.
  const target=new Date(now.getFullYear(),now.getMonth()+offset,1);
  const monthStr=`${target.getFullYear()}-${String(target.getMonth()+1).padStart(2,"0")}`;
  const monthLabel=target.toLocaleDateString("en-US",{month:"long",year:"numeric"});
  const isCurrentMonth=offset===0;
  const monthItems=timeline.filter(t=>t._type!=="booking"&&statusMap[t.id]==="completed"&&t.session_date?.slice(0,7)===monthStr);
  const weeksElapsed=isCurrentMonth?Math.max(1,Math.ceil(now.getDate()/7)):4;
  const perWeekAvg=(monthItems.length/weeksElapsed).toFixed(1);
  const dayBreakdown={};
  monthItems.forEach(t=>{ dayBreakdown[t._dayNum]=(dayBreakdown[t._dayNum]||0)+1; });
  const monthPRs=(prs||[]).filter(p=>p.record_date?.slice(0,7)===monthStr);
  // Cumulative sessions completed up to end of viewed month (not live pkg counter)
  const monthEndStr=new Date(target.getFullYear(),target.getMonth()+1,0).toISOString().split("T")[0];
  const cumCompleted=(timeline||[]).filter(t=>t._type!=="booking"&&statusMap[t.id]==="completed"&&t.session_date<=monthEndStr).length;
  // Find the package that was active during the viewed month (supports historical months)
  const monthStartStr=monthStr+"-01";
  const reportPkg=(allPkgs||[]).find(p=>p.start_date<=monthEndStr&&p.end_date>=monthStartStr)||pkg;
  const Row=({label,value})=>(
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:`1px solid ${C.border}`}}>
      <span style={{color:C.muted,fontSize:13}}>{label}</span>
      <span style={{color:C.white,fontSize:14,fontWeight:700}}>{value}</span>
    </div>
  );

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:200,display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
      <div style={{background:C.surface,borderRadius:"20px 20px 0 0",padding:"20px 20px 40px",maxHeight:"90vh",overflowY:"auto"}}>
        <div style={{width:40,height:4,background:C.border,borderRadius:2,margin:"0 auto 20px"}}/>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
          <div>
            <div style={{color:C.white,fontSize:18,fontWeight:800}}>Monthly Report</div>
            <div style={{color:C.muted,fontSize:13,marginTop:2}}>{client.name}</div>
          </div>
          <button onClick={onClose} style={{background:C.surface2,border:`1px solid ${C.border}`,borderRadius:8,padding:"6px 12px",color:C.muted,cursor:"pointer",fontFamily:"inherit"}}>✕</button>
        </div>
        {/* Month navigation */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:C.surface2,borderRadius:12,padding:"10px 14px",marginBottom:16}}>
          <button onClick={()=>setOffset(o=>o-1)} style={{background:"none",border:"none",color:C.cyan,fontSize:20,cursor:"pointer",padding:"0 6px",lineHeight:1}}>‹</button>
          <div style={{textAlign:"center"}}>
            <div style={{color:C.white,fontSize:14,fontWeight:700}}>{monthLabel}</div>
            {isCurrentMonth&&<div style={{color:C.cyan,fontSize:10,fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginTop:2}}>Current Month</div>}
          </div>
          <button onClick={()=>setOffset(o=>Math.min(o+1,0))} style={{background:"none",border:"none",color:offset===0?C.muted:C.cyan,fontSize:20,cursor:offset===0?"default":"pointer",padding:"0 6px",lineHeight:1}}>›</button>
        </div>
        <Row label="Sessions completed this month" value={monthItems.length}/>
        <Row label="Sessions per week (avg)" value={perWeekAvg}/>
        <Row label="Package usage" value={reportPkg?`${cumCompleted} of ${reportPkg.sessions_total} (total to date)`:`${cumCompleted} completed`}/>
        <Row label="PRs set this month" value={monthPRs.length}/>
        {reportPkg&&(
          <div style={{marginTop:16,background:C.surface2,borderRadius:14,padding:"14px 16px",border:`1px solid ${C.border}`}}>
            <div style={{color:C.muted,fontSize:10,fontWeight:800,letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>{reportPkg.is_active===false?"Past Package":"Current Package"}</div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
              <div>
                <div style={{color:C.white,fontSize:14,fontWeight:800}}>{reportPkg.sessions_total}-Session Pack · {reportPkg.sessions_per_week||3}×/week · {reportPkg.weeks||"?"} weeks</div>
                {reportPkg.workout_templates?.name&&<div style={{color:C.cyan,fontSize:12,marginTop:3}}>🏋️ {reportPkg.workout_templates.name}</div>}
                <div style={{color:C.muted,fontSize:12,marginTop:4}}>{fmtDate(reportPkg.start_date)} → {fmtDate(reportPkg.end_date)}</div>
              </div>
              <span style={{background:reportPkg.paid?C.cyan+"22":C.pink+"22",color:reportPkg.paid?C.cyan:C.pink,border:`1px solid ${reportPkg.paid?C.cyan+"55":C.pink+"55"}`,borderRadius:8,padding:"4px 12px",fontSize:13,fontWeight:800,flexShrink:0,marginLeft:12}}>{reportPkg.paid?"✓ Paid":"⚠ Unpaid"}</span>
            </div>
            <div style={{height:4,background:C.border,borderRadius:2,marginTop:10}}>
              <div style={{width:`${Math.min(100,(cumCompleted/reportPkg.sessions_total)*100)}%`,height:"100%",borderRadius:2,background:`linear-gradient(90deg,${C.cyan},${C.pink})`}}/>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",marginTop:5}}>
              <span style={{color:C.muted,fontSize:11}}>{cumCompleted} used to date</span>
              <span style={{color:C.muted,fontSize:11}}>{reportPkg.sessions_total - cumCompleted} remaining</span>
            </div>
          </div>
        )}
        <div style={{marginTop:16}}>
          <SL>Day Breakdown</SL>
          {Array.from({length:spw},(_,i)=>i+1).map(d=>(
            <div key={d} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0"}}>
              <span style={{background:`linear-gradient(135deg,${C.cyan},${C.pink})`,color:C.white,fontSize:11,fontWeight:800,padding:"2px 8px",borderRadius:20}}>Day {d}</span>
              <span style={{color:C.white,fontSize:13,fontWeight:700}}>{dayBreakdown[d]||0} session{(dayBreakdown[d]||0)!==1?"s":""}</span>
            </div>
          ))}
        </div>
        {monthPRs.length>0&&(
          <div style={{marginTop:16}}>
            <SL>PRs This Month</SL>
            {monthPRs.map((p,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"6px 0"}}>
                <span style={{color:C.white,fontSize:13}}>{p.exercise}</span>
                <span style={{color:C.pink,fontSize:13,fontWeight:700}}>{p.weight}{p.unit}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ── Client Detail ──
const ClientDetail=({client,trainerId,token,onBack,onClientUpdated})=>{
  const [sessions,setSessions]=useState([]);
  const [clientBooks,setClientBooks]=useState([]);
  const [pkg,setPkg]=useState(client._pkg||null);
  const [allPkgs,setAllPkgs]=useState(client._pkg?[client._pkg]:[]);
  const [loading,setLoad]=useState(true);
  const [activeSession,setAS]=useState(null);
  const [showReport,setShowReport]=useState(false);
  const [prs,setPrs]=useState(null);
  const [showPkg,setShowPkg]=useState(false);
  const [showLog,setShowLog]=useState(false);
  const [newPkgTotal,setNPT]=useState("10");
  const [newSpw,setNSpw]=useState("3");
  const [customTotal,setCustomTotal]=useState("");
  const [customSpw,setCustomSpw]=useState("");
  const [editingName,setEditingName]=useState(false);
  const [nameVal,setNameVal]=useState(client.name||"");
  const [savingName,setSavingName]=useState(false);
  const [hasInjury,setHasInj]=useState(false);
  const [injuryNotes,setInjNotes]=useState("");
  const [pkgNotes,setPkgNotes]=useState("");
  const [showEditNotes,setShowEditNotes]=useState(false);
  const [editHasInjury,setEditHasInj]=useState(false);
  const [editInjuryNotes,setEditInjNotes]=useState("");
  const [editPkgNotes,setEditPkgNotes]=useState("");
  const [savingNotes,setSavingNotes]=useState(false);
  const [programs,setPrograms]=useState([]);
  const [newPkgProgramId,setNewPkgProgramId]=useState(null);
  const [editProgramId,setEditProgramId]=useState(null);
  const [logDate,setLogDate]=useState(todayISO());
  const [logTime,setLogTime]=useState(300);
  const [logging,setLogging]=useState(false);
  const [logSlots,setLogSlots]=useState([]);
  const [logDayNum,setLogDayNum]=useState(null);
  const [cancelDlg,setCancelDlg]=useState(null);
  const [uaToast,setUaToast]=useState(null);
  const [renewDlg,setRenewDlg]=useState(null);
  const [progPrompt,setProgPrompt]=useState(null);
  const showUaToast=(msg,ok=false)=>{setUaToast({msg,ok});setTimeout(()=>setUaToast(null),3500);};
  const hiddenKey=`ua_hidden_sess_${client.id}`;
  const [hiddenSessIds,setHiddenSessIds]=useState(()=>{try{return new Set(JSON.parse(localStorage.getItem(hiddenKey)||"[]"));}catch{return new Set();}});
  const [showHidden,setShowHidden]=useState(false);
  const [pkgHistLimit,setPkgHistLimit]=useState(3);
  const [sessHistLimit,setSessHistLimit]=useState(5);
  const [selectedPastPkg,setSelectedPastPkg]=useState(null);
  const [pastPkgPaid,setPastPkgPaid]=useState(false);
  const [pastPkgNotes,setPastPkgNotes]=useState("");
  const [savingPastPkg,setSavingPastPkg]=useState(false);
  const hideSession=(id)=>{ const n=new Set(hiddenSessIds); n.add(id); setHiddenSessIds(n); localStorage.setItem(hiddenKey,JSON.stringify([...n])); };
  const unhideSession=(id)=>{ const n=new Set(hiddenSessIds); n.delete(id); setHiddenSessIds(n); localStorage.setItem(hiddenKey,JSON.stringify([...n])); };
  const spw=pkg?.sessions_per_week||3;
  const left=pkg?(pkg.sessions_total-pkg.sessions_used):null;
  useEffect(()=>{
    Promise.all([
      getClientSess(client.id,token),
      getClientBooks(client.id,token),
      dbGet("packages",`client_id=eq.${client.id}&order=created_at.desc&select=*,workout_templates(id,name)`,token)
    ])
      .then(([s,b,pkgs])=>{ setSessions(s||[]); setClientBooks(b||[]); setAllPkgs(pkgs||[]); })
      .finally(()=>setLoad(false));
    getTemplates(trainerId,token).then(r=>setPrograms(r||[])).catch(()=>{});
  },[client.id]);

  const programPicker=(selectedId,onSelect)=>(
    <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:12}}>
      <button onClick={()=>onSelect(null)} style={{background:!selectedId?C.cyan+"33":C.surface2,border:`1px solid ${!selectedId?C.cyan:C.border}`,borderRadius:8,padding:"8px 12px",color:!selectedId?C.cyan:C.muted,fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>No program</button>
      {programs.map(p=>(
        <button key={p.id} onClick={()=>onSelect(p.id)} style={{background:selectedId===p.id?C.pink+"33":C.surface2,border:`1px solid ${selectedId===p.id?C.pink:C.border}`,borderRadius:8,padding:"8px 12px",color:selectedId===p.id?C.pink:C.muted,fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>{p.name}</button>
      ))}
      <button onClick={()=>handleCreateProgramInline(onSelect)} style={{background:"transparent",border:`1px dashed ${C.border}`,borderRadius:8,padding:"8px 12px",color:C.cyan,fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>+ New</button>
    </div>
  );

  const handleCreateProgramInline=(setter)=>{
    setProgPrompt({msg:"New program name:",placeholder:"e.g. Strength A",onOk:async(name)=>{
      try{
        const res=await createTemplate({trainer_id:trainerId,name:name.trim(),exercises:[]},token);
        const created=Array.isArray(res)?res[0]:res;
        if(created){ setPrograms(p=>[...p,created].sort((a,b)=>a.name.localeCompare(b.name))); setter(created.id); }
      }catch(e){ showUaToast("Error: "+e.message); }
    }});
  };

  useEffect(()=>{
    if(!showLog) return;
    const d=new Date(logDate+"T12:00:00"); const dow=d.getDay()===0?6:d.getDay()-1;
    getSlots(dow,token).then(r=>{ const sl=r||[]; setLogSlots(sl); if(sl.length>0) setLogTime(sl[0].start_time_min); }).catch(()=>setLogSlots([]));
    if(pkg) calcDayNum(client.id,logDate,token,spw).then(dn=>setLogDayNum(dn)).catch(()=>{});
  },[logDate,showLog]);

  const handleRenew=async()=>{
    const doRenew=async()=>{
      try{
        // Snapshot current active package before deactivating (package history tracking)
        if(pkg){
          await dbPatch("packages",`id=eq.${pkg.id}`,{
            deactivated_at: new Date().toISOString(),
            deactivation_reason: "renewed",
            is_active: false,
          },token).catch(()=>{});
        } else {
          await deactivatePkgs(client.id,token);
        }
        const total=parseInt(newPkgTotal),spwNum=parseInt(newSpw)||3;
        const weeks=Math.ceil(total/spwNum);
        const end=new Date(); end.setDate(end.getDate()+weeks*7);
        const res=await createPkg({client_id:client.id,sessions_total:total,sessions_used:0,sessions_per_week:spwNum,weeks,start_date:todayISO(),end_date:localISO(end),has_injury:hasInjury,injury_notes:injuryNotes,package_notes:pkgNotes,program_id:newPkgProgramId||null},token);
        const created=Array.isArray(res)?res[0]:res;
        created.workout_templates=programs.find(p=>p.id===newPkgProgramId)||null;
        setPkg(created); setShowPkg(false); setCustomTotal(""); setCustomSpw("");
        // Update local allPkgs: mark old as inactive (with snapshot), prepend new
        setAllPkgs(prev=>{
          const deactivatedAt=new Date().toISOString();
          return [created,...prev.map(p=>p.is_active?{...p,is_active:false,deactivated_at:deactivatedAt,deactivation_reason:"renewed"}:p)];
        });
        onClientUpdated({...client,_pkg:created});
        const progName=programs.find(p=>p.id===newPkgProgramId)?.name;
        await postNotification({client_id:client.id,type:"package_renewed",message:`🎯 ${progName?progName+" p":"P"}ackage assigned: ${newPkgTotal} sessions · ${newSpw}x/week. Let's get to work!`},token).catch(()=>{});
      }catch(e){ showUaToast("Error: "+e.message); }
    };
    try{
      const pendingBooks=await getClientBooks(client.id,token).catch(()=>[]);
      const futureBooks=(pendingBooks||[]).filter(b=>b.book_date>=todayISO());
      if(futureBooks.length>0){
        setRenewDlg({msg:`⚠️ This client has ${futureBooks.length} upcoming booking${futureBooks.length>1?"s":""} from the current package. These bookings will remain — the old package will be deactivated and sessions_used will reset to 0 for the new package. Continue?`,okLabel:"Continue",onOk:doRenew});
      }else{
        await doRenew();
      }
    }catch(e){ showUaToast("Error: "+e.message); }
  };

  const handleLog=async()=>{
    if(!pkg){ showUaToast("This client has no active package. Assign one first."); return; }
    setLogging(true);
    try{
      const h=Math.floor(logTime/60),m=logTime%60;
      const sessDateTime=new Date(`${logDate}T${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:00`);
      const status=sessDateTime>new Date()?"booked":"completed";
      const dayNum=await calcDayNum(client.id,logDate,token,spw);
      const res=await createSession({client_id:client.id,trainer_id:trainerId,session_date:logDate,start_time_min:logTime,day_num:dayNum,status},token);
      const created=Array.isArray(res)?res[0]:res;
      if(pkg){
        const newUsed=(pkg.sessions_used||0)+1;
        await dbPatch("packages",`id=eq.${pkg.id}`,{sessions_used:newUsed},token);
        const updPkg={...pkg,sessions_used:newUsed};
        setPkg(updPkg);
        onClientUpdated({...client,_pkg:updPkg});
        const newLeft=pkg.sessions_total-newUsed;
        if(newLeft===2||newLeft===1){
          await postNotification({client_id:client.id,type:"low_sessions",message:`You have ${newLeft} session${newLeft>1?"s":""} left in your package. Talk to your trainer about renewing.`},token).catch(()=>{});
          // Trainer also gets reminded in their notification panel
          await postNotification({client_id:trainerId,type:"low_sessions_trainer",message:`⚠️ ${client.name||"Client"} έχει απομείνει μόνο ${newLeft} session${newLeft>1?"s":""} στο πακέτο. Σκέψου ανανέωση.`},token).catch(()=>{});
        }
      }
      const full={...created,session_notes:[],exercises:[]};
      setSessions(p=>[full,...p]);
      if(status==="completed") setAS(full);
      setShowLog(false);
    }catch(e){ showUaToast("Error: "+e.message); }
    setLogging(false);
  };

  const handleOpenReport=async()=>{
    if(prs===null){ const r=await getClientPRs(client.id,token).catch(()=>[]); setPrs(r||[]); }
    setShowReport(true);
  };

  const handleSaveName=async()=>{
    const trimmed=nameVal.trim();
    if(!trimmed||trimmed===client.name){setEditingName(false);return;}
    setSavingName(true);
    try{
      const initials=trimmed.split(" ").filter(Boolean).map(w=>w[0].toUpperCase()).slice(0,2).join("");
      await dbPatch("profiles",`id=eq.${client.id}`,{name:trimmed,initials},token);
      onClientUpdated({...client,name:trimmed,initials});
      setEditingName(false);
    }catch(e){showUaToast("Error: "+e.message);}
    setSavingName(false);
  };

  const handleTogglePaid=async()=>{
    if(!pkg) return;
    const newPaid=!pkg.paid;
    try{
      await dbPatch("packages",`id=eq.${pkg.id}`,{paid:newPaid},token);
      const updPkg={...pkg,paid:newPaid};
      setPkg(updPkg);
      onClientUpdated({...client,_pkg:updPkg});
      if(newPaid){
        await postNotification({client_id:client.id,type:"payment_confirmed",message:`✅ Payment confirmed for your ${pkg.sessions_total}-session package. You're all set!`},token).catch(()=>{});
      } else {
        await postNotification({client_id:client.id,type:"payment_reminder",message:`⚠️ Your package payment has been marked as unpaid. Please contact your trainer.`},token).catch(()=>{});
      }
    }catch(e){ showUaToast("Error: "+e.message); }
  };

  const handleSendPaymentReminder=async()=>{
    if(!pkg) return;
    try{
      await postNotification({client_id:client.id,type:"payment_reminder",message:`💳 Payment reminder from your trainer: Please confirm payment for your ${pkg.workout_templates?.name||""}${pkg.workout_templates?.name?" ":""}${pkg.sessions_total}-session package.`},token);
      showUaToast("Payment reminder sent!",true);
    }catch(e){ showUaToast("Error: "+e.message); }
  };

  const handleOpenEditNotes=()=>{
    setEditHasInj(pkg?.has_injury||false);
    setEditInjNotes(pkg?.injury_notes||"");
    setEditPkgNotes(pkg?.package_notes||"");
    setEditProgramId(pkg?.program_id||null);
    setShowEditNotes(true);
  };

  const handleSaveNotes=async()=>{
    if(!pkg||savingNotes) return;
    setSavingNotes(true);
    try{
      const body={has_injury:editHasInjury,injury_notes:editHasInjury?editInjuryNotes:"",package_notes:editPkgNotes,program_id:editProgramId||null};
      await dbPatch("packages",`id=eq.${pkg.id}`,body,token);
      const updPkg={...pkg,...body,workout_templates:programs.find(p=>p.id===editProgramId)||null};
      setPkg(updPkg);
      onClientUpdated({...client,_pkg:updPkg});
      setShowEditNotes(false);
    }catch(e){ showUaToast("Error: "+e.message); }
    setSavingNotes(false);
  };

  const sessDateSet=new Set(sessions.map(s=>s.session_date));
  const bookOnlyItems=(clientBooks||[])
    .filter(b=>!sessDateSet.has(b.book_date))
    .map(b=>({id:`bk_${b.id}`,_bookingId:b.id,_type:"booking",session_date:b.book_date,start_time_min:b.schedule_slots?.start_time_min||0,status:"booked"}));
  const timeline=[
    ...sessions.map(s=>({...s,_type:s.status})),
    ...bookOnlyItems,
  ].sort((a,b)=>a.session_date.localeCompare(b.session_date)||(a.start_time_min-b.start_time_min));
  // Day number cycles only through non-cancelled items so cancellations don't shift the rotation
  let _dayCount=0;
  timeline.forEach((item)=>{
    if(item.status!=="cancelled"){
      item._dayNum=(_dayCount%spw)+1;
      item._sessionNum=_dayCount+1;
      _dayCount++;
    } else {
      item._dayNum=null;
      item._sessionNum=null;
    }
  });
  const statusMap=computeStatusMap(timeline.filter(s=>s.session_date).map(s=>({...s,_key:s.id})),new Date());

  const handleCancelSession=(item)=>{
    setCancelDlg({
      title:"Cancel Session",
      msg:`Cancel the session on ${fmtDate(item.session_date)} at ${toTime(item.start_time_min)}? This cannot be undone.`,
      okLabel:"Cancel Session",
      onOk:async()=>{
        try{
          if(item._type==="booking"){
            await cancelBookingRow(item._bookingId,token);
            setClientBooks(p=>p.filter(b=>b.id!==item._bookingId));
          }else{
            await cancelSessionRow(item.id,token);
            setSessions(p=>p.map(s=>s.id===item.id?{...s,status:"cancelled"}:s));
            if(pkg){
              const newUsed=Math.max((pkg.sessions_used||0)-1,0);
              await decrementPkgUsed(pkg.id,pkg.sessions_used,token);
              const updPkg={...pkg,sessions_used:newUsed};
              setPkg(updPkg);
              onClientUpdated({...client,_pkg:updPkg});
            }
          }
          await postNotification({client_id:client.id,type:"session_cancelled",message:`Your session on ${fmtDate(item.session_date)} at ${toTime(item.start_time_min)} was cancelled by your trainer.`},token).catch(()=>{});
        }catch(e){ showUaToast("Error: "+e.message); }
      }
    });
  };

  return(
    <div style={{paddingBottom:80}}>
      {activeSession&&<SessionEditor session={activeSession} spw={spw} token={token} trainerId={trainerId} onClose={()=>setAS(null)} onSaved={updated=>setSessions(p=>p.map(s=>s.id===updated.id?updated:s))}/>}
      {showReport&&<MonthlyReportModal client={client} timeline={timeline} statusMap={statusMap} pkg={pkg} allPkgs={allPkgs} prs={prs} spw={spw} onClose={()=>setShowReport(false)}/>}

      <div style={{padding:"22px 20px 0",display:"flex",alignItems:"center",gap:12}}>
        <button onClick={onBack} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"8px 12px",color:C.muted,cursor:"pointer",fontSize:13,fontFamily:"inherit"}}>← Back</button>
        <div style={{flex:1}}/><Logo size={48}/>
      </div>

      {/* Client info */}
      <div style={{padding:"16px 20px 0",display:"flex",flexDirection:"column",alignItems:"center",gap:10}}>
        <Avatar initials={client.initials} size={72} avatarUrl={client.avatar_url}/>
        <div style={{textAlign:"center"}}>
          {editingName?(
            <div style={{display:"flex",alignItems:"center",gap:6,justifyContent:"center"}}>
              <input
                value={nameVal}
                onChange={e=>setNameVal(e.target.value)}
                onKeyDown={e=>{if(e.key==="Enter")handleSaveName();if(e.key==="Escape"){setEditingName(false);setNameVal(client.name||"");}}}
                autoFocus
                style={{background:C.surface2,border:`1px solid ${C.cyan}`,borderRadius:8,padding:"6px 10px",color:C.white,fontSize:17,fontWeight:800,outline:"none",fontFamily:"inherit",textAlign:"center",width:180}}
              />
              <button onClick={handleSaveName} disabled={savingName} style={{background:C.cyan,border:"none",borderRadius:8,padding:"6px 12px",color:C.bg,fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>{savingName?"…":"✓"}</button>
              <button onClick={()=>{setEditingName(false);setNameVal(client.name||"");}} style={{background:"none",border:"none",color:C.muted,fontSize:16,cursor:"pointer",fontFamily:"inherit"}}>✕</button>
            </div>
          ):(
            <div style={{display:"flex",alignItems:"center",gap:6,justifyContent:"center"}}>
              <div style={{color:C.white,fontSize:20,fontWeight:800}}>{client.name}</div>
              <button onClick={()=>setEditingName(true)} style={{background:"none",border:"none",color:C.muted,fontSize:14,cursor:"pointer",padding:"0 2px",lineHeight:1}}>✏️</button>
            </div>
          )}
          <div style={{color:C.muted,fontSize:13,marginTop:3}}>{client.email}</div>
          {client.created_at&&<div style={{color:C.muted,fontSize:12,marginTop:3}}>Member since {fmtMemberSince(client.created_at)}</div>}
        </div>
        <div style={{display:"flex",gap:10}}>
          {[{v:timeline.length,l:"Sessions"},{v:pkg?`${spw}x`:"-",l:"Per Week"},{v:left??"-",l:"Pkg Left",warn:left!=null&&left<=2}].map(s=>(
            <div key={s.l} style={{background:C.surface,border:`1px solid ${s.warn?C.pink+"44":C.border}`,borderRadius:10,padding:"10px 14px",textAlign:"center",minWidth:60}}>
              <div style={{color:s.warn?C.pink:C.cyan,fontSize:20,fontWeight:900}}>{s.v}</div>
              <div style={{color:C.muted,fontSize:10,fontWeight:600,marginTop:2}}>{s.l}</div>
            </div>
          ))}
        </div>
        <button onClick={handleOpenReport} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"9px 16px",color:C.cyan,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>📊 Monthly Report</button>
      </div>

      {/* Client Stats */}
      {!loading&&sessions.length>0&&(()=>{
        const completed=sessions.filter(s=>s.status==="completed");
        const nowDate=new Date();
        const thisMonthKey=`${nowDate.getFullYear()}-${String(nowDate.getMonth()+1).padStart(2,"0")}`;
        const thisMonthCount=completed.filter(s=>s.session_date.startsWith(thisMonthKey)).length;
        // Streak: consecutive weeks backwards that have ≥1 completed session
        const wkStart=(iso)=>{const d=new Date(iso+"T12:00:00");const dow=d.getDay()===0?6:d.getDay()-1;return new Date(d.getTime()-dow*86400000).toISOString().slice(0,10);};
        let streak=0;
        for(let w=0;w<52;w++){
          const ref=new Date(nowDate.getTime()-w*7*86400000);
          const ws=wkStart(ref.toISOString().slice(0,10));
          const we=new Date(new Date(ws+"T12:00:00").getTime()+6*86400000).toISOString().slice(0,10);
          if(!completed.some(s=>s.session_date>=ws&&s.session_date<=we)) break;
          streak++;
        }
        // 6-month bar chart data
        const months=Array.from({length:6},(_,i)=>{
          const d=new Date(nowDate.getFullYear(),nowDate.getMonth()-5+i,1);
          const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
          return{key,label:d.toLocaleString("default",{month:"short"}),count:completed.filter(s=>s.session_date.startsWith(key)).length};
        });
        const maxBar=Math.max(...months.map(m=>m.count),1);
        return(
          <div style={{padding:"14px 20px 0"}}>
            <div style={{color:C.muted,fontSize:10,fontWeight:700,letterSpacing:1.5,textTransform:"uppercase",marginBottom:10}}>Client Stats</div>
            <div style={{display:"flex",gap:8,marginBottom:12}}>
              {[{v:completed.length,l:"Total Done",c:C.cyan},{v:thisMonthCount,l:"This Month",c:C.pink},{v:streak>0?`${streak}w`:"—",l:"Streak",c:C.green}].map(s=>(
                <div key={s.l} style={{flex:1,background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"12px 8px",textAlign:"center"}}>
                  <div style={{color:s.c,fontSize:22,fontWeight:900}}>{s.v}</div>
                  <div style={{color:C.muted,fontSize:10,fontWeight:600,marginTop:3}}>{s.l}</div>
                </div>
              ))}
            </div>
            <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"14px 16px"}}>
              <div style={{color:C.muted,fontSize:10,fontWeight:700,letterSpacing:1.2,textTransform:"uppercase",marginBottom:12}}>Sessions / Month</div>
              <div style={{display:"flex",alignItems:"flex-end",gap:6,height:70}}>
                {months.map(m=>(
                  <div key={m.key} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
                    <div style={{color:C.muted,fontSize:9,fontWeight:600,minHeight:12}}>{m.count||""}</div>
                    <div style={{width:"100%",borderRadius:"4px 4px 0 0",background:m.key===thisMonthKey?`linear-gradient(135deg,${C.cyan},${C.pink})`:`${C.cyan}44`,height:`${Math.max((m.count/maxBar)*46,4)}px`,transition:"height 0.3s"}}/>
                    <div style={{color:C.muted,fontSize:9}}>{m.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Package */}
      <div style={{padding:"14px 20px 0"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <SL style={{marginBottom:0}}>Package</SL>
          <div style={{display:"flex",gap:8}}>
            {pkg&&<button onClick={()=>showEditNotes?setShowEditNotes(false):handleOpenEditNotes()} style={{background:C.surface2,border:`1px solid ${C.border}`,borderRadius:8,padding:"6px 14px",color:C.cyan,fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>{showEditNotes?"▲ Cancel":"✎ Notes"}</button>}
            <button onClick={()=>{setShowPkg(p=>{if(p){setCustomTotal("");setCustomSpw("");}return !p;});}} style={{background:`linear-gradient(135deg,${C.cyan},${C.pink})`,border:"none",borderRadius:8,padding:"6px 14px",color:C.white,fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>{showPkg?"▲ Cancel":"↻ Renew"}</button>
          </div>
        </div>
        {showEditNotes&&(
          <Card style={{marginBottom:12}}>
            <SL>Edit Injury / Notes</SL>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderTop:`1px solid ${C.border}`,marginBottom:8}}>
              <span style={{color:C.white,fontSize:14,fontWeight:600}}>⚠️ Injury / Limitation</span>
              <button onClick={()=>setEditHasInj(p=>!p)} style={{background:editHasInjury?C.amber+"33":C.surface2,border:`1px solid ${editHasInjury?C.amber:C.border}`,borderRadius:20,padding:"6px 16px",color:editHasInjury?C.amber:C.muted,fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>{editHasInjury?"Yes ✓":"No"}</button>
            </div>
            {editHasInjury&&<input value={editInjuryNotes} onChange={e=>setEditInjNotes(e.target.value)} placeholder="Describe the injury..." style={{width:"100%",background:C.surface2,border:`1px solid ${C.amber}55`,borderRadius:8,padding:"10px 12px",color:C.white,fontSize:13,outline:"none",fontFamily:"inherit",boxSizing:"border-box",marginBottom:8}}/>}
            <div style={{color:C.muted,fontSize:11,fontWeight:600,marginBottom:6,marginTop:4}}>Program</div>
            {programPicker(editProgramId,setEditProgramId)}
            <div style={{color:C.muted,fontSize:11,fontWeight:600,marginBottom:6,marginTop:4}}>Training Notes</div>
            <textarea value={editPkgNotes} onChange={e=>setEditPkgNotes(e.target.value)} placeholder="Focus areas, goals..." style={{width:"100%",background:C.surface2,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 12px",color:C.white,fontSize:13,fontFamily:"inherit",resize:"none",height:70,outline:"none",boxSizing:"border-box",lineHeight:1.5,marginBottom:12}}/>
            <GBtn label={savingNotes?"Saving...":"Save"} onClick={handleSaveNotes} disabled={savingNotes} style={{width:"100%"}}/>
          </Card>
        )}
        {showPkg&&(
          <Card style={{marginBottom:12}}>
            <SL>Assign New Package</SL>
            {/* --- Standard presets (unchanged) --- */}
            {!customTotal&&!customSpw&&(<>
              <div style={{color:C.muted,fontSize:11,fontWeight:600,marginBottom:6}}>Total Sessions</div>
              <div style={{display:"flex",gap:8,marginBottom:12}}>
                {[8,10,12].map(n=><button key={n} onClick={()=>setNPT(String(n))} style={{flex:1,background:newPkgTotal===String(n)?C.pink+"33":C.surface2,border:`1px solid ${newPkgTotal===String(n)?C.pink:C.border}`,borderRadius:8,padding:"10px",color:newPkgTotal===String(n)?C.pink:C.muted,fontWeight:700,fontSize:14,cursor:"pointer",fontFamily:"inherit"}}>{n}<br/><span style={{fontSize:10}}>sessions</span></button>)}
              </div>
              <div style={{color:C.muted,fontSize:11,fontWeight:600,marginBottom:6}}>Sessions per Week</div>
              <div style={{display:"flex",gap:8,marginBottom:12}}>
                {[1,2,3,4].map(n=><button key={n} onClick={()=>setNSpw(String(n))} style={{flex:1,background:newSpw===String(n)?C.cyan+"33":C.surface2,border:`1px solid ${newSpw===String(n)?C.cyan:C.border}`,borderRadius:8,padding:"10px",color:newSpw===String(n)?C.cyan:C.muted,fontWeight:700,fontSize:14,cursor:"pointer",fontFamily:"inherit"}}>{n}x</button>)}
              </div>
            </>)}
            {/* --- Custom package section --- */}
            {(customTotal||customSpw)?(
              <div style={{background:C.surface2,borderRadius:10,border:"1px solid #C89AFF55",padding:"12px",marginBottom:12}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                  <span style={{color:"#C89AFF",fontSize:12,fontWeight:700,letterSpacing:1,textTransform:"uppercase"}}>✏️ Custom Package</span>
                  <button onClick={()=>{setCustomTotal("");setCustomSpw("");setNPT("10");setNSpw("3");}} style={{background:"none",border:"none",color:C.muted,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>← Back to presets</button>
                </div>
                <div style={{display:"flex",gap:10,alignItems:"flex-end"}}>
                  {/* Total Sessions stepper */}
                  <div style={{flex:1}}>
                    <div style={{color:C.muted,fontSize:11,fontWeight:600,marginBottom:5}}>Total Sessions <span style={{color:C.muted,fontWeight:400}}>(1–500)</span></div>
                    <div style={{display:"flex",alignItems:"center",background:C.bg,border:"1px solid #C89AFF",borderRadius:8,overflow:"hidden"}}>
                      <button onClick={()=>{const v=Math.max(1,(parseInt(customTotal)||1)-1);setCustomTotal(String(v));setNPT(String(v));}} style={{background:"none",border:"none",borderRight:`1px solid #C89AFF44`,color:"#C89AFF",fontSize:22,fontWeight:700,cursor:"pointer",padding:"8px 14px",fontFamily:"inherit",lineHeight:1,flexShrink:0}}>−</button>
                      <input type="number" min="1" max="500" value={customTotal} onChange={e=>{const v=Math.max(1,Math.min(500,parseInt(e.target.value)||1));setCustomTotal(String(v));setNPT(String(v));}} style={{flex:1,background:"none",border:"none",color:"#C89AFF",fontSize:18,fontWeight:700,outline:"none",fontFamily:"inherit",textAlign:"center",padding:"10px 0",minWidth:0,MozAppearance:"textfield",WebkitAppearance:"none"}} autoFocus/>
                      <button onClick={()=>{const v=Math.min(500,(parseInt(customTotal)||1)+1);setCustomTotal(String(v));setNPT(String(v));}} style={{background:"none",border:"none",borderLeft:`1px solid #C89AFF44`,color:"#C89AFF",fontSize:22,fontWeight:700,cursor:"pointer",padding:"8px 14px",fontFamily:"inherit",lineHeight:1,flexShrink:0}}>+</button>
                    </div>
                  </div>
                  {/* Sessions/Week stepper */}
                  <div style={{flex:1}}>
                    <div style={{color:C.muted,fontSize:11,fontWeight:600,marginBottom:5}}>Sessions / Week <span style={{color:C.muted,fontWeight:400}}>(1–7)</span></div>
                    <div style={{display:"flex",alignItems:"center",background:C.bg,border:"1px solid #C89AFF",borderRadius:8,overflow:"hidden"}}>
                      <button onClick={()=>{const v=Math.max(1,(parseInt(customSpw)||1)-1);setCustomSpw(String(v));setNSpw(String(v));}} style={{background:"none",border:"none",borderRight:`1px solid #C89AFF44`,color:"#C89AFF",fontSize:22,fontWeight:700,cursor:"pointer",padding:"8px 14px",fontFamily:"inherit",lineHeight:1,flexShrink:0}}>−</button>
                      <input type="number" min="1" max="7" value={customSpw} onChange={e=>{const v=Math.max(1,Math.min(7,parseInt(e.target.value)||1));setCustomSpw(String(v));setNSpw(String(v));}} style={{flex:1,background:"none",border:"none",color:"#C89AFF",fontSize:18,fontWeight:700,outline:"none",fontFamily:"inherit",textAlign:"center",padding:"10px 0",minWidth:0,MozAppearance:"textfield",WebkitAppearance:"none"}}/>
                      <button onClick={()=>{const v=Math.min(7,(parseInt(customSpw)||1)+1);setCustomSpw(String(v));setNSpw(String(v));}} style={{background:"none",border:"none",borderLeft:`1px solid #C89AFF44`,color:"#C89AFF",fontSize:22,fontWeight:700,cursor:"pointer",padding:"8px 14px",fontFamily:"inherit",lineHeight:1,flexShrink:0}}>+</button>
                    </div>
                  </div>
                </div>
              </div>
            ):(
              <button onClick={()=>{setCustomTotal(newPkgTotal);setCustomSpw(newSpw);}} style={{width:"100%",background:"none",border:`1px dashed ${C.border}`,borderRadius:8,padding:"8px",color:C.muted,fontSize:12,cursor:"pointer",fontFamily:"inherit",marginBottom:12}}>✏️ Custom package (μονή / οποιοδήποτε αριθμό)</button>
            )}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderTop:`1px solid ${C.border}`,marginBottom:8}}>
              <span style={{color:C.white,fontSize:14,fontWeight:600}}>⚠️ Injury / Limitation</span>
              <button onClick={()=>setHasInj(p=>!p)} style={{background:hasInjury?C.amber+"33":C.surface2,border:`1px solid ${hasInjury?C.amber:C.border}`,borderRadius:20,padding:"6px 16px",color:hasInjury?C.amber:C.muted,fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>{hasInjury?"Yes ✓":"No"}</button>
            </div>
            {hasInjury&&<input value={injuryNotes} onChange={e=>setInjNotes(e.target.value)} placeholder="Describe the injury..." style={{width:"100%",background:C.surface2,border:`1px solid ${C.amber}55`,borderRadius:8,padding:"10px 12px",color:C.white,fontSize:13,outline:"none",fontFamily:"inherit",boxSizing:"border-box",marginBottom:8}}/>}
            <div style={{color:C.muted,fontSize:11,fontWeight:600,marginBottom:6,marginTop:4}}>Program</div>
            {programPicker(newPkgProgramId,setNewPkgProgramId)}
            <div style={{color:C.muted,fontSize:11,fontWeight:600,marginBottom:6,marginTop:4}}>Training Notes</div>
            <textarea value={pkgNotes} onChange={e=>setPkgNotes(e.target.value)} placeholder="Focus areas, goals..." style={{width:"100%",background:C.surface2,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 12px",color:C.white,fontSize:13,fontFamily:"inherit",resize:"none",height:70,outline:"none",boxSizing:"border-box",lineHeight:1.5,marginBottom:12}}/>
            <GBtn label={`Assign ${newPkgTotal} Session${parseInt(newPkgTotal)===1?"":"s"} · ${newSpw}x/week`} onClick={handleRenew} style={{width:"100%"}}/>
          </Card>
        )}
        {pkg?(
          <div style={{background:left!=null&&left<=2?C.pink:C.cyan,borderRadius:14,padding:"18px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
              <div>
                <div style={{color:C.bg,fontSize:11,fontWeight:700,letterSpacing:1.5,textTransform:"uppercase",opacity:0.8}}>{pkg.sessions_total}-Session Pack</div>
                <div style={{color:C.bg,fontSize:20,fontWeight:900,marginTop:3}}>{pkg.sessions_per_week||3}x per week · {pkg.weeks} weeks</div>
                <div style={{color:C.bg,fontSize:12,opacity:0.8,marginTop:4}}>{fmtDate(pkg.start_date)} → {fmtDate(pkg.end_date)}</div>
                {pkg.workout_templates?.name&&<div style={{color:C.bg,fontSize:11,fontWeight:700,marginTop:4}}>🏋️ {pkg.workout_templates.name}</div>}
                {pkg.package_notes&&<div style={{color:C.bg,fontSize:11,opacity:0.8,marginTop:4}}>📋 {pkg.package_notes}</div>}
                {pkg.has_injury&&<div style={{color:"rgba(0,0,0,0.7)",fontSize:11,marginTop:4}}>⚠️ {pkg.injury_notes}</div>}
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
            <div style={{display:"flex",gap:8,marginTop:12}}>
              <button onClick={handleTogglePaid} style={{flex:1,background:pkg.paid?"rgba(0,0,0,0.25)":"rgba(0,0,0,0.4)",border:"none",borderRadius:8,padding:"8px 14px",color:C.bg,fontWeight:800,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>{pkg.paid?"✓ Paid":"⚠ Unpaid"}</button>
              <button onClick={handleSendPaymentReminder} style={{background:"rgba(0,0,0,0.3)",border:"none",borderRadius:8,padding:"8px 14px",color:C.bg,fontWeight:800,fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>💳 Payment Reminder</button>
            </div>
          </div>
        ):<Card><Empty msg="No active package"/></Card>}
      </div>

      {/* Package History */}
      {(()=>{
        const pastPkgs=(allPkgs||[]).filter(p=>!p.is_active);
        if(pastPkgs.length===0) return null;
        const shown=pastPkgs.slice(0,pkgHistLimit);
        const hasMore=pastPkgs.length>pkgHistLimit;
        return(
          <div style={{padding:"14px 20px 0"}}>
            <SL>Package History</SL>
            {shown.map((p,i)=>{
              const reasonLabel=p.deactivation_reason==="renewed"?"Renewed":p.deactivation_reason==="cancelled"?"Cancelled":p.deactivation_reason||"Ended";
              const usedAt=p.sessions_used??"-";
              return(
                <div key={p.id||i} onClick={()=>{setSelectedPastPkg(p);setPastPkgPaid(!!p.paid);setPastPkgNotes(p.package_notes||"");}} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"12px 14px",marginBottom:8,cursor:"pointer"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                    <div>
                      <div style={{color:C.white,fontSize:13,fontWeight:700}}>{p.sessions_total}-Session Pack · {p.sessions_per_week||3}x/week</div>
                      {p.workout_templates?.name&&<div style={{color:C.cyan,fontSize:11,fontWeight:700,marginTop:2}}>🏋️ {p.workout_templates.name}</div>}
                      <div style={{color:C.muted,fontSize:11,marginTop:3}}>{fmtDate(p.start_date)} → {fmtDate(p.end_date)}</div>
                      {p.deactivated_at&&<div style={{color:C.muted,fontSize:10,marginTop:2}}>Closed: {fmtDate(p.deactivated_at.split("T")[0])}</div>}
                      {p.package_notes&&<div style={{color:C.cyan,fontSize:11,marginTop:3}}>📋 {p.package_notes}</div>}
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{display:"flex",alignItems:"center",gap:4,justifyContent:"flex-end"}}>
                        <span style={{background:C.muted+"22",border:`1px solid ${C.muted}44`,borderRadius:20,padding:"1px 8px",color:C.muted,fontSize:10,fontWeight:800}}>{reasonLabel}</span>
                      </div>
                      <div style={{color:C.muted,fontSize:11,marginTop:4}}>{usedAt}/{p.sessions_total} used</div>
                      {p.paid!=null&&<div style={{color:p.paid?C.green:C.amber,fontSize:10,fontWeight:700,marginTop:3}}>{p.paid?"✓ Paid":"⚠ Unpaid"}</div>}
                    </div>
                  </div>
                </div>
              );
            })}
            {hasMore&&<button onClick={()=>setPkgHistLimit(l=>l+10)} style={{background:C.surface2,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 16px",color:C.muted,fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit",width:"100%",marginBottom:4}}>Load More ({pastPkgs.length-pkgHistLimit} more)</button>}
          </div>
        );
      })()}

      {/* Sessions */}
      <div style={{padding:"14px 20px 0"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <SL style={{marginBottom:0}}>Session History</SL>
          <button onClick={()=>setShowLog(p=>!p)} style={{background:`linear-gradient(135deg,${C.cyan},${C.pink})`,border:"none",borderRadius:8,padding:"6px 14px",color:C.white,fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>{showLog?"▲ Cancel":"+ Log Session"}</button>
        </div>
        {showLog&&(
          <Card style={{marginBottom:12}}>
            <SL>Log New Session</SL>
            <div style={{marginBottom:10}}>
              <div style={{color:C.muted,fontSize:11,fontWeight:600,marginBottom:6}}>Date</div>
              <input type="date" value={logDate} onChange={e=>setLogDate(e.target.value)} style={{background:C.surface2,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 12px",color:C.white,fontSize:14,outline:"none",fontFamily:"inherit",width:"100%",boxSizing:"border-box"}}/>
            </div>
            <div style={{marginBottom:14}}>
              <div style={{color:C.muted,fontSize:11,fontWeight:600,marginBottom:6}}>Start Time</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {(logSlots.length>0?logSlots.map(s=>s.start_time_min):SLOT_TIMES).map(t=><button key={t} onClick={()=>setLogTime(t)} style={{background:logTime===t?C.cyan+"33":C.surface2,border:`1px solid ${logTime===t?C.cyan:C.border}`,borderRadius:7,padding:"7px 10px",color:logTime===t?C.cyan:C.muted,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>{toTime(t)}</button>)}
              </div>
            </div>
            {logDayNum&&<div style={{color:C.muted,fontSize:12,marginBottom:10}}>Will be logged as <span style={{background:`linear-gradient(135deg,${C.cyan},${C.pink})`,color:C.white,fontSize:11,fontWeight:800,padding:"2px 8px",borderRadius:20}}>Day {logDayNum}</span></div>}
            <GBtn label={logging?"Logging...":"Log Session & Add Notes"} onClick={handleLog} disabled={logging} style={{width:"100%"}}/>
          </Card>
        )}
        {loading?<Spinner/>:timeline.length===0?<Empty msg="No sessions yet"/>:(()=>{
          const reversed=[...timeline].reverse();
          const visible=reversed.filter(s=>showHidden||!hiddenSessIds.has(s.id));
          const hiddenCount=reversed.filter(s=>hiddenSessIds.has(s.id)).length;
          const shownSess=visible.slice(0,sessHistLimit);
          const hasMoreSess=visible.length>sessHistLimit;
          return(<>
            {hiddenCount>0&&(
              <button onClick={()=>setShowHidden(p=>!p)} style={{background:C.surface2,border:`1px solid ${C.border}`,borderRadius:8,padding:"5px 12px",color:C.muted,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",marginBottom:8}}>
                {showHidden?`▲ Hide hidden (${hiddenCount})`:`▼ Show hidden (${hiddenCount})`}
              </button>
            )}
            {shownSess.map((s,i)=>{
              const isBooking=s._type==="booking";
              const isHidden=hiddenSessIds.has(s.id);
              const badgeStatus=statusMap[s.id];
              const isCancellable=badgeStatus==="upcoming"||badgeStatus==="booked";
              const icon=isBooking?"🗓":s._type==="cancelled"?"🚫":s._type==="completed"?"💪":"⏳";
              const iconBg=isBooking?C.amber+"22":s._type==="cancelled"?C.muted+"22":s._type==="completed"?C.cyan+"22":C.pink+"22";
              return(
              <div key={s.id||i} style={{opacity:isHidden?0.45:1,marginBottom:8}}>
                <div onClick={isBooking?undefined:()=>setAS(s)} style={{width:"100%",background:C.surface,border:`1px solid ${badgeStatus!=="completed"?(isBooking?C.amber+"44":C.cyan+"33"):C.border}`,borderRadius:12,padding:"14px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:isBooking?"default":"pointer",textAlign:"left",boxSizing:"border-box"}}>
                  <div style={{display:"flex",alignItems:"center",gap:12}}>
                    <div style={{width:36,height:36,borderRadius:10,background:iconBg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>{icon}</div>
                    <div>
                      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
                        <span style={{background:`linear-gradient(135deg,${C.cyan},${C.pink})`,color:C.white,fontSize:10,fontWeight:800,padding:"2px 6px",borderRadius:20}}>Day {s._dayNum}</span>
                        <span style={{color:C.muted,fontSize:10,fontWeight:700}}>{s._sessionNum}/{timeline.length}</span>
                        <StatusBadge status={badgeStatus}/>
                      </div>
                      <div style={{color:C.muted,fontSize:12}}>{fmtDate(s.session_date)} · {toTime(s.start_time_min)}{!isBooking&&s.exercises?.length>0?` · ${s.exercises.length} exercises`:""}</div>
                    </div>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6,flexShrink:0}}>
                    {!isBooking&&<span style={{color:s._type==="completed"?C.pink:C.cyan,fontSize:12,fontWeight:700}}>Edit →</span>}
                    <div style={{display:"flex",gap:6,alignItems:"center"}}>
                      {isCancellable&&<button onClick={e=>{e.stopPropagation();handleCancelSession(s);}} style={{background:"none",border:"none",color:C.pink,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",padding:0}}>Cancel</button>}
                      <button onClick={e=>{e.stopPropagation();isHidden?unhideSession(s.id):hideSession(s.id);}} title={isHidden?"Show":"Hide"} style={{background:"none",border:`1px solid ${C.border}`,borderRadius:6,padding:"2px 6px",color:C.muted,fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>{isHidden?"Show":"Hide"}</button>
                    </div>
                  </div>
                </div>
              </div>
            );})}
            {hasMoreSess&&<button onClick={()=>setSessHistLimit(l=>l+10)} style={{background:C.surface2,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 16px",color:C.muted,fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit",width:"100%",marginBottom:8}}>Load More ({visible.length-sessHistLimit} more)</button>}
          </>);
        })()}
      </div>
      <UaToast toast={uaToast}/>
      <UaConfirm dialog={cancelDlg} setDialog={setCancelDlg}/>
      <UaConfirm dialog={renewDlg} setDialog={setRenewDlg}/>
      <UaPrompt prompt={progPrompt} setPrompt={setProgPrompt}/>

      {/* Past Package Action Sheet */}
      {selectedPastPkg&&(
        <div onClick={()=>setSelectedPastPkg(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:200,display:"flex",alignItems:"flex-end"}}>
          <div onClick={e=>e.stopPropagation()} style={{width:"100%",background:C.surface,borderRadius:"20px 20px 0 0",padding:"20px 20px 36px",boxSizing:"border-box",maxHeight:"85vh",overflowY:"auto"}}>
            {/* Handle */}
            <div style={{width:40,height:4,borderRadius:2,background:C.muted+"44",margin:"0 auto 16px"}}/>
            {/* Header */}
            <div style={{marginBottom:16}}>
              <div style={{color:C.white,fontSize:15,fontWeight:800}}>{selectedPastPkg.sessions_total}-Session Pack · {selectedPastPkg.sessions_per_week||3}x/week</div>
              {selectedPastPkg.workout_templates?.name&&<div style={{color:C.cyan,fontSize:12,fontWeight:700,marginTop:3}}>🏋️ {selectedPastPkg.workout_templates.name}</div>}
              <div style={{color:C.muted,fontSize:12,marginTop:3}}>{fmtDate(selectedPastPkg.start_date)} → {fmtDate(selectedPastPkg.end_date)}</div>
              <div style={{color:C.muted,fontSize:11,marginTop:2}}>{selectedPastPkg.sessions_used??"-"}/{selectedPastPkg.sessions_total} sessions used</div>
            </div>

            {/* Paid toggle */}
            <div style={{background:C.surface2,border:`1px solid ${C.border}`,borderRadius:12,padding:"14px 16px",marginBottom:12,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div>
                <div style={{color:C.white,fontSize:14,fontWeight:700}}>Payment Status</div>
                <div style={{color:pastPkgPaid?C.green:C.amber,fontSize:12,marginTop:2,fontWeight:700}}>{pastPkgPaid?"✓ Paid":"⚠ Unpaid"}</div>
              </div>
              <button onClick={()=>setPastPkgPaid(p=>!p)} style={{background:pastPkgPaid?C.green+"22":C.amber+"22",border:`1.5px solid ${pastPkgPaid?C.green:C.amber}`,borderRadius:20,padding:"7px 18px",color:pastPkgPaid?C.green:C.amber,fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>
                {pastPkgPaid?"Mark Unpaid":"Mark Paid"}
              </button>
            </div>

            {/* Notes */}
            <div style={{marginBottom:14}}>
              <div style={{color:C.muted,fontSize:11,fontWeight:700,marginBottom:6}}>NOTES</div>
              <textarea value={pastPkgNotes} onChange={e=>setPastPkgNotes(e.target.value)} placeholder="Add notes about this package..." rows={3} style={{width:"100%",background:C.surface2,border:`1px solid ${C.border}`,borderRadius:10,padding:"10px 12px",color:C.white,fontSize:13,fontFamily:"inherit",resize:"none",outline:"none",boxSizing:"border-box",lineHeight:1.5}}/>
            </div>

            {/* Save */}
            <button disabled={savingPastPkg} onClick={async()=>{
              setSavingPastPkg(true);
              try{
                await dbPatch("packages",`id=eq.${selectedPastPkg.id}`,{paid:pastPkgPaid,package_notes:pastPkgNotes},token);
                setAllPkgs(prev=>prev.map(p=>p.id===selectedPastPkg.id?{...p,paid:pastPkgPaid,package_notes:pastPkgNotes}:p));
                showUaToast("Saved",true);
                setSelectedPastPkg(null);
              }catch(e){showUaToast("Error: "+e.message);}
              setSavingPastPkg(false);
            }} style={{width:"100%",background:`linear-gradient(135deg,${C.cyan},${C.pink})`,border:"none",borderRadius:12,padding:"14px",color:C.white,fontWeight:800,fontSize:15,cursor:"pointer",fontFamily:"inherit",marginBottom:10,opacity:savingPastPkg?0.6:1}}>
              {savingPastPkg?"Saving...":"Save Changes"}
            </button>

            {/* Delete */}
            <button onClick={()=>{
              const pkgId=selectedPastPkg.id;
              const pkgTotal=selectedPastPkg.sessions_total;
              setCancelDlg({msg:`Delete this ${pkgTotal}-session package? This cannot be undone.`,onOk:()=>{
                setSelectedPastPkg(null);
                // Use server-side endpoint to bypass RLS on packages table
                fetch('/api/delete-package',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({package_id:pkgId})})
                  .then(r=>r.ok?r.json():r.json().then(e=>{throw new Error(e.error||r.status);}))
                  .then(()=>{
                    setAllPkgs(prev=>prev.filter(p=>p.id!==pkgId));
                    showUaToast("Package deleted",true);
                  })
                  .catch(e=>showUaToast("Error: "+e.message));
              }});
            }} style={{width:"100%",background:"none",border:`1.5px solid ${C.pink}44`,borderRadius:12,padding:"12px",color:C.pink,fontWeight:700,fontSize:14,cursor:"pointer",fontFamily:"inherit"}}>
              🗑 Delete Package
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Schedule ──
const ScheduleScreen=({trainerId,token,onPendingChange,clients=[],onViewClient})=>{
  const [dayIdx,setDay]=useState(todayDow());
  const [weekOffset,setWeekOffset]=useState(0);
  const [slots,setSlots]=useState([]);
  const [bookingsMap,setBookingsMap]=useState({});
  const [loading,setLoad]=useState(false);
  const [confirm,setConf]=useState(null);
  const [pickH,setPickH]=useState(null);
  const [pickM,setPickM]=useState(0);
  const [pendingReqs,setPendingReqs]=useState([]);
  const [reqsLoaded,setReqsLoaded]=useState(false);
  const [reqWarn,setReqWarn]=useState({}); // reqId → warning message for overlap
  const [cancelReqs,setCancelReqs]=useState([]);
  const [cancelReqsLoaded,setCancelReqsLoaded]=useState(false);
  const [toast,setToast]=useState(null);  // {msg,ok} for inline feedback
  const showToast=(msg,ok=false)=>{setToast({msg,ok});setTimeout(()=>setToast(null),3500);};
  const weekDates=Array.from({length:7},(_,i)=>{
    const iso=addDays(WDATES_BASE[0].iso,weekOffset*7+i);
    const d=new Date(iso+"T12:00:00");
    return {label:d.getDate(),iso,dow:i};
  });
  const selDay=weekDates[dayIdx]; const isSun=dayIdx===6;
  const isCurrentWeek=weekOffset===0;
  const weekLabel=weekOffset===0?"This week":`Week of ${fmtDate(weekDates[0].iso)}`;

  const [periods,setPeriods]=useState([]);
  const [periodsLoaded,setPeriodsLoaded]=useState(false);
  const [activePeriod,setActivePeriod]=useState(null);
  const [showNewPeriod,setShowNewPeriod]=useState(false);
  const [periodName,setPeriodName]=useState("");
  const [periodStart,setPeriodStart]=useState(todayISO());
  const [periodEnd,setPeriodEnd]=useState(todayISO());
  const [expandedPeriod,setExpandedPeriod]=useState(null);
  const [periodSlotsMap,setPeriodSlotsMap]=useState({});
  const [periodDayIdx,setPeriodDayIdx]=useState(todayDow());
  const [periodDaySlots,setPeriodDaySlots]=useState([]);
  const [periodPickH,setPeriodPickH]=useState(null);
  const [periodPickM,setPeriodPickM]=useState(0);
  const [stdExpanded,setStdExpanded]=useState(false);
  const [stdDayIdx,setStdDayIdx]=useState(todayDow());
  const [stdDaySlots,setStdDaySlots]=useState([]);
  const [stdPickH,setStdPickH]=useState(null);
  const [stdPickM,setStdPickM]=useState(0);
  const todayStr=todayISO();

  useEffect(()=>{
    getPendingRequests(token).then(r=>{ const reqs=r||[]; setPendingReqs(reqs); setReqsLoaded(true); onPendingChange?.(reqs.length); }).catch(()=>setReqsLoaded(true));
    getAllPeriods(token).then(r=>{ const all=r||[]; setPeriods(all); const today=todayISO(); const active=all.find(p=>today>=p.start_date&&today<=p.end_date)||null; setActivePeriod(active); }).catch(()=>{}).finally(()=>setPeriodsLoaded(true));
    getCancelRequests(trainerId,token).then(r=>{ setCancelReqs(r||[]); setCancelReqsLoaded(true); }).catch(()=>setCancelReqsLoaded(true));
  },[]);

  useEffect(()=>{
    if(!expandedPeriod) return;
    getAllSlotsForDay(periodDayIdx,token).then(r=>setPeriodDaySlots(r||[])).catch(()=>setPeriodDaySlots([]));
  },[expandedPeriod,periodDayIdx]);

  useEffect(()=>{
    if(!stdExpanded) return;
    getAllSlotsForDay(stdDayIdx,token).then(r=>setStdDaySlots(r||[])).catch(()=>setStdDaySlots([]));
  },[stdExpanded,stdDayIdx]);

  const reloadDay=()=>{
    if(isSun) return; setLoad(true);
    const getSlotsForDay=async()=>{
      const ap=await getActivePeriodForToday(token).catch(()=>null);
      setActivePeriod(ap||null);
      if(!ap) return getSlots(selDay.dow,token);
      const [pslots,allS]=await Promise.all([
        dbGet("period_slots",`period_id=eq.${ap.id}&day_of_week=eq.${selDay.dow}`,token),
        getAllSlotsForDay(selDay.dow,token),
      ]);
      const times=new Set((pslots||[]).map(p=>p.start_time_min));
      if(times.size===0) return getSlots(selDay.dow,token);
      return (allS||[]).filter(s=>times.has(s.start_time_min)).sort((a,b)=>a.start_time_min-b.start_time_min);
    };
    return Promise.all([getSlotsForDay(),getDayBookings(selDay.iso,token)])
      .then(([sl,bks])=>{
        setSlots(sl||[]);
        const m={};
        (bks||[]).forEach(b=>{ if(!m[b.slot_id]) m[b.slot_id]=[]; m[b.slot_id].push(b); });
        setBookingsMap(m);
      })
      .finally(()=>setLoad(false));
  };
  useEffect(()=>{ reloadDay(); },[dayIdx,weekOffset]);

  const selectedStart=pickH!=null?pickH*60+pickM:null;
  const conflict=selectedStart!=null&&slots.find(s=>s.start_time_min===selectedStart);

  // Force-log: trainer can add a client to any slot regardless of capacity
  const [forceLogSlot,setForceLogSlot]=useState(null);
  const [forceLogClientId,setForceLogClientId]=useState("");
  const [forceLogSearch,setForceLogSearch]=useState("");
  const [forceLogging,setForceLogging]=useState(false);
  const handleForceLog=async()=>{
    if(!forceLogSlot||!forceLogClientId||forceLogging) return;
    const cl=clients.find(c=>c.id===forceLogClientId);
    if(!cl) return;
    setForceLogging(true);
    try{
      const dayNum=await calcDayNum(cl.id,selDay.iso,token,cl._pkg?.sessions_per_week||3).catch(()=>null);
      const sessStatus=selDay.iso>todayISO()?"booked":"completed";
      await createSession({client_id:cl.id,trainer_id:trainerId,session_date:selDay.iso,start_time_min:forceLogSlot.start_time_min,day_num:dayNum,status:sessStatus},token);
      if(cl._pkg){
        const newUsed=(cl._pkg.sessions_used||0)+1;
        await dbPatch("packages",`id=eq.${cl._pkg.id}`,{sessions_used:newUsed},token).catch(()=>{});
      }
      const notifMsg=`🗓 Your trainer scheduled a session for you on ${fmtDate(selDay.iso)} at ${toTime(forceLogSlot.start_time_min)}.`;
      await postNotification({client_id:cl.id,type:"session_scheduled",message:notifMsg},token).catch(()=>{});
      showToast(`✓ Session logged for ${cl.name||"client"}`,true);
      setForceLogSlot(null); setForceLogClientId(""); setForceLogSearch("");
    }catch(e){ showToast("Error: "+e.message); }
    setForceLogging(false);
  };

  const handleAdd=async()=>{
    if(!selectedStart||conflict) return;
    try{
      const res=await addSlot({trainer_id:trainerId,day_of_week:selDay.dow,start_time_min:selectedStart},token);
      const c=Array.isArray(res)?res[0]:res;
      if(c){ setSlots(p=>[...p,c].sort((a,b)=>a.start_time_min-b.start_time_min)); }
      setPickH(null); setPickM(0);
    }catch(e){ showToast("Error: "+e.message); }
  };

  const handleRemove=async(slot)=>{
    try{
      await removeSlot(slot.id,token);
      setSlots(p=>p.filter(s=>s.id!==slot.id));
      setConf(null);
      showToast("Slot removed.",true);
    }catch(e){ showToast("Error: "+e.message); }
  };

  const handleApproveRequest=async(r)=>{
    try{
      const dow=dowOf(r.requested_date);
      const reqStart=r.requested_time_min;
      const reqEnd=reqStart+SESS_MIN;

      // Load all active slots for this DOW
      const daySlots=await getSlots(dow,token).catch(()=>[]);

      // Standard slots that overlap with the custom session window
      // (custom time people physically occupy those slots too)
      const overlapSlots=(daySlots||[]).filter(s=>
        s.start_time_min!==reqStart && // not the exact custom slot itself
        reqStart<s.start_time_min+SESS_MIN &&
        s.start_time_min<reqEnd
      );

      // Capacity check: none of the overlapping standard slots can be full
      if(overlapSlots.length>0){
        const counts=await Promise.all(overlapSlots.map(s=>getSlotBookCount(s.id,r.requested_date,token)));
        const fullSlot=overlapSlots.find((_,i)=>counts[i]>=GYM_CAP);
        if(fullSlot){ showToast(`Can't approve — ${toTime(fullSlot.start_time_min)} slot is already full (${GYM_CAP}/${GYM_CAP}).`); return; }
      }

      // Find or create the custom slot at the requested time
      let slot=daySlots.find(s=>s.start_time_min===reqStart)||null;
      if(!slot){
        const created=await addSlot({trainer_id:trainerId,day_of_week:dow,start_time_min:reqStart},token);
        slot=Array.isArray(created)?created[0]:created;
      } else {
        const cnt=await getSlotBookCount(slot.id,r.requested_date,token);
        if(cnt>=GYM_CAP){ showToast(`Slot full (${GYM_CAP}/${GYM_CAP}) — free up a spot first.`); return; }
      }

      setReqWarn(p=>{const n={...p};delete n[r.id];return n;});
      // One booking at the custom time — the effective count in overlapping slots
      // is computed dynamically in the UI from all bookings in overlapping slots
      await createBooking({slot_id:slot.id,client_id:r.client_id,book_date:r.requested_date,status:"booked"},token);
      await resolveRequest(r.id,"approved",token).catch(()=>{});
      await postNotification({client_id:r.client_id,type:"slot_request_approved",message:`Your custom time request for ${fmtDate(r.requested_date)} at ${toTime(r.requested_time_min)} was approved — it's on your schedule!`},token).catch(()=>{});
      const upd=pendingReqs.filter(x=>x.id!==r.id); setPendingReqs(upd); onPendingChange?.(upd.length);
      showToast("✓ Request approved!",true);
      if(r.requested_date===selDay.iso&&dow===selDay.dow) reloadDay();
    }catch(e){ showToast("Error: "+e.message); }
  };

  const handleRejectRequest=async(r)=>{
    try{
      setReqWarn(p=>{const n={...p};delete n[r.id];return n;});
      await resolveRequest(r.id,"rejected",token).catch(()=>{});
      await postNotification({client_id:r.client_id,type:"slot_request_rejected",message:`Your custom time request for ${fmtDate(r.requested_date)} at ${toTime(r.requested_time_min)} was declined. Talk to your trainer for alternatives.`},token).catch(()=>{});
      const upd=pendingReqs.filter(x=>x.id!==r.id); setPendingReqs(upd); onPendingChange?.(upd.length);
    }catch(e){ showToast("Error: "+e.message); }
  };

  const handleAcceptCancelReq=async(r)=>{
    try{
      const label=`${fmtDate(r.book_date)} at ${toTime(r.start_time_min)}`;
      // Cancel the booking if booking_id exists
      if(r.booking_id){
        await cancelBookingRow(r.booking_id,token).catch(()=>{});
      }
      await resolveCancelReq(r.id,"accepted",token).catch(()=>{});
      await postNotification({client_id:r.client_id,type:"cancel_accepted",message:`Your cancellation request for ${label} was approved. You can rebook anytime.`,cancel_req_id:r.id,booking_id:r.booking_id||null,booking_client_id:r.client_id,booking_date:r.book_date},token).catch(()=>{});
      setCancelReqs(p=>p.filter(x=>x.id!==r.id));
      showToast("✓ Cancellation approved",true);
    }catch(e){ showToast("Error: "+e.message); }
  };

  const handleDeclineCancelReq=async(r)=>{
    try{
      const label=`${fmtDate(r.book_date)} at ${toTime(r.start_time_min)}`;
      await resolveCancelReq(r.id,"declined",token).catch(()=>{});
      await postNotification({client_id:r.client_id,type:"cancel_declined",message:`Your cancellation request for ${label} was declined. Please contact your trainer.`,cancel_req_id:r.id},token).catch(()=>{});
      setCancelReqs(p=>p.filter(x=>x.id!==r.id));
      showToast("Request declined");
    }catch(e){ showToast("Error: "+e.message); }
  };

  const handleCancelBooking=async(b,slot)=>{
    setConf({msg:`Cancel ${b.profiles?.name||"this client"}'s booking on ${fmtDate(b.book_date)}?`,onOk:async()=>{
      try{
        await cancelBookingRow(b.id,token);
        setBookingsMap(p=>({...p,[slot.id]:(p[slot.id]||[]).filter(x=>x.id!==b.id)}));
        await postNotification({client_id:b.client_id,type:"session_cancelled",message:`Your session on ${fmtDate(b.book_date)} at ${toTime(slot.start_time_min)} was cancelled by your trainer.`},token).catch(()=>{});
        showToast("Booking cancelled.",true);
      }catch(e){ showToast("Error: "+e.message); }
    }});
  };

  const handleCreatePeriod=()=>{
    if(!periodName.trim()||!periodStart||!periodEnd) return;
    setConf({msg:`Create period "${periodName.trim()}" (${fmtDate(periodStart)} – ${fmtDate(periodEnd)})?`,okLabel:"Create",onOk:async()=>{
      try{
        const res=await createPeriod({trainer_id:trainerId,name:periodName.trim(),start_date:periodStart,end_date:periodEnd},token);
        const created=Array.isArray(res)?res[0]:res;
        if(created){
          setPeriods(p=>[created,...p]);
          setPeriodName(""); setShowNewPeriod(false);
          const today=todayISO();
          if(today>=created.start_date&&today<=created.end_date) setActivePeriod(created);
          showToast("Period created!",true);
        }
      }catch(e){ showToast("Error: "+e.message); }
    }});
  };

  const handleActivatePeriod=async(period)=>{
    try{
      const today=todayISO();
      const newStart=period.start_date>today?today:period.start_date;
      const newEnd=period.end_date<today?new Date(Date.now()+30*86400000).toISOString().split("T")[0]:period.end_date;
      await dbPatch("schedule_periods",`id=eq.${period.id}`,{start_date:newStart,end_date:newEnd},token);
      const updated={...period,start_date:newStart,end_date:newEnd};
      setPeriods(p=>p.map(x=>x.id===period.id?updated:x));
      setActivePeriod(updated);
      showToast("Period activated!",true);
      reloadDay();
    }catch(e){ showToast("Error: "+e.message); }
  };

  const handleDeletePeriod=(id)=>{
    setConf({msg:"Delete this schedule period? Existing bookings are not affected.",okLabel:"Delete",onOk:async()=>{
      try{
        await dbDelete("period_slots",`period_id=eq.${id}`,token);
        await deletePeriodRow(id,token);
        setPeriods(p=>p.filter(x=>x.id!==id));
        setPeriodSlotsMap(p=>{ const n={...p}; delete n[id]; return n; });
        if(expandedPeriod===id) setExpandedPeriod(null);
      }catch(e){ showToast("Error: "+e.message); }
    }});
  };

  const toggleExpandPeriod=(period)=>{
    if(expandedPeriod===period.id){ setExpandedPeriod(null); return; }
    setExpandedPeriod(period.id);
    if(!periodSlotsMap[period.id]){
      getPeriodSlots(period.id,token).then(r=>setPeriodSlotsMap(p=>({...p,[period.id]:r||[]}))).catch(()=>{});
    }
  };

  const togglePeriodSlot=async(period,slot)=>{
    const existing=(periodSlotsMap[period.id]||[]).find(ps=>ps.day_of_week===periodDayIdx&&ps.start_time_min===slot.start_time_min);
    if(existing){
      try{ await removePeriodSlotRow(existing.id,token); setPeriodSlotsMap(p=>({...p,[period.id]:p[period.id].filter(x=>x.id!==existing.id)})); }
      catch(e){ showToast("Error: "+e.message); }
    }else{
      try{
        const res=await addPeriodSlot({period_id:period.id,day_of_week:periodDayIdx,start_time_min:slot.start_time_min},token);
        const created=Array.isArray(res)?res[0]:res;
        if(created) setPeriodSlotsMap(p=>({...p,[period.id]:[...(p[period.id]||[]),created]}));
      }catch(e){ showToast("Error: "+e.message); }
    }
  };

  const periodPickStart=periodPickH!=null?periodPickH*60+periodPickM:null;
  const handleAddCustomPeriodTime=async(period)=>{
    if(periodPickStart==null) return;
    const existing=(periodSlotsMap[period.id]||[]).some(ps=>ps.day_of_week===periodDayIdx&&ps.start_time_min===periodPickStart);
    if(existing){ setPeriodPickH(null); setPeriodPickM(0); return; }
    try{
      const res=await addPeriodSlot({period_id:period.id,day_of_week:periodDayIdx,start_time_min:periodPickStart},token);
      const created=Array.isArray(res)?res[0]:res;
      if(created) setPeriodSlotsMap(p=>({...p,[period.id]:[...(p[period.id]||[]),created]}));
      setPeriodPickH(null); setPeriodPickM(0);
    }catch(e){ showToast("Error: "+e.message); }
  };

  return(
    <div style={{paddingBottom:80}}>
      {confirm&&confirm.msg?<UaConfirm dialog={confirm} setDialog={setConf}/>:(confirm&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 20px"}}>
          <div style={{background:C.surface,borderRadius:16,padding:"24px",width:"100%",maxWidth:340}}>
            <div style={{color:C.white,fontSize:16,fontWeight:700,marginBottom:8}}>Remove Slot?</div>
            <div style={{color:C.muted,fontSize:13,marginBottom:20}}>Remove {toSlot(confirm.start_time_min)}? Existing bookings will not be deleted.</div>
            <div style={{display:"flex",gap:8}}>
              <GBtn label="Remove" onClick={()=>handleRemove(confirm)} ghost color={C.pink} style={{flex:1}}/>
              <GBtn label="Keep" onClick={()=>setConf(null)} sm style={{flex:1}}/>
            </div>
          </div>
        </div>
      ))}
      <div style={{padding:"22px 20px 12px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div><div style={{color:C.white,fontSize:22,fontWeight:800,fontFamily:"'Oswald',sans-serif"}}>Schedule</div><div style={{color:C.muted,fontSize:13,marginTop:2}}>Manage slots · Max {GYM_CAP} per slot</div></div>
        <Logo size={48}/>
      </div>
      <div style={{padding:"0 20px 10px"}}>
        <div style={{background:activePeriod?C.cyan+"18":C.surface2,border:`1px solid ${activePeriod?C.cyan+"44":C.border}`,borderRadius:10,padding:"10px 14px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:15}}>🗓</span>
            <div>
              <div style={{color:activePeriod?C.cyan:C.muted,fontSize:12,fontWeight:800}}>{activePeriod?`Current Period: ${activePeriod.name}`:"Standard Schedule — no active period"}</div>
              {activePeriod&&<div style={{color:C.muted,fontSize:11,marginTop:1}}>{fmtDate(activePeriod.start_date)} – {fmtDate(activePeriod.end_date)}</div>}
            </div>
          </div>
          {activePeriod&&<button onClick={()=>{ setActivePeriod(null); reloadDay(); }} style={{background:"none",border:"none",color:C.muted,fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"inherit",padding:"2px 6px",borderRadius:4,whiteSpace:"nowrap"}}>← Standard</button>}
        </div>
      </div>

      {/* Pending custom time requests */}
      {reqsLoaded&&pendingReqs.length>0&&(
        <div style={{padding:"0 20px 4px"}}>
          <div style={{background:C.surface,border:`1px solid ${C.pink}44`,borderRadius:12,padding:"13px 16px"}}>
            <div style={{color:C.pink,fontSize:12,fontWeight:700,marginBottom:8}}>📬 Custom Time Requests ({pendingReqs.length})</div>
            {pendingReqs.map((r,i)=>(
              <div key={i} style={{padding:"8px 0",borderBottom:i<pendingReqs.length-1?`1px solid ${C.border}`:"none"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <div style={{color:C.white,fontSize:13,fontWeight:600}}>{r.profiles?.name||"Unknown"}</div>
                    <div style={{color:C.muted,fontSize:12,marginTop:2}}>{r.requested_date} · {toTime(r.requested_time_min)}</div>
                  </div>
                  <div style={{display:"flex",gap:6}}>
                    <button onClick={()=>handleApproveRequest(r)} style={{background:C.green+"22",border:`1px solid ${C.green}44`,borderRadius:6,padding:"5px 10px",color:C.green,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>✓</button>
                    <button onClick={()=>handleRejectRequest(r)} style={{background:C.pink+"22",border:`1px solid ${C.pink}44`,borderRadius:6,padding:"5px 10px",color:C.pink,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>✕</button>
                  </div>
                </div>
                {reqWarn[r.id]&&(
                  <div style={{marginTop:6,background:C.amber+"22",border:`1px solid ${C.amber}55`,borderRadius:8,padding:"8px 10px"}}>
                    <div style={{color:C.amber,fontSize:11,fontWeight:600,marginBottom:6}}>{reqWarn[r.id]}</div>
                    <div style={{display:"flex",gap:6}}>
                      <button onClick={()=>handleApproveRequest(r)} style={{background:C.amber+"33",border:`1px solid ${C.amber}66`,borderRadius:6,padding:"4px 10px",color:C.amber,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Approve anyway</button>
                      <button onClick={()=>setReqWarn(p=>{const n={...p};delete n[r.id];return n;})} style={{background:C.surface2,border:`1px solid ${C.border}`,borderRadius:6,padding:"4px 10px",color:C.muted,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {/* Cancellation Requests */}
      {cancelReqsLoaded&&cancelReqs.length>0&&(
        <div style={{padding:"0 20px 4px"}}>
          <div style={{background:C.surface,border:`1px solid ${C.amber}44`,borderRadius:12,padding:"13px 16px"}}>
            <div style={{color:C.amber,fontSize:12,fontWeight:700,marginBottom:8}}>⚠️ Cancellation Requests ({cancelReqs.length})</div>
            {cancelReqs.map((r,i)=>(
              <div key={r.id} style={{padding:"9px 0",borderBottom:i<cancelReqs.length-1?`1px solid ${C.border}`:"none"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <div style={{color:C.white,fontSize:13,fontWeight:600}}>{r.profiles?.name||"Unknown"}</div>
                    <div style={{color:C.muted,fontSize:12,marginTop:2}}>{fmtDate(r.book_date)} · {toTime(r.start_time_min)}</div>
                    <div style={{color:C.amber,fontSize:11,marginTop:1}}>Within 48 hours</div>
                  </div>
                  <div style={{display:"flex",gap:6}}>
                    <button onClick={()=>handleAcceptCancelReq(r)} style={{background:C.green+"22",border:`1px solid ${C.green}44`,borderRadius:6,padding:"5px 11px",color:C.green,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>✓ Approve</button>
                    <button onClick={()=>handleDeclineCancelReq(r)} style={{background:C.pink+"22",border:`1px solid ${C.pink}44`,borderRadius:6,padding:"5px 11px",color:C.pink,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>✕ Decline</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{padding:"0 20px 8px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <button onClick={()=>{setWeekOffset(p=>p-1);setDay(0);}} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"6px 10px",color:C.muted,cursor:"pointer",fontFamily:"inherit"}}>‹</button>
<span style={{color:isCurrentWeek?C.pink:C.muted,fontSize:13,fontWeight:700}}>{weekLabel}</span>
        <button onClick={()=>{setWeekOffset(p=>p+1);setDay(0);}} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"6px 10px",color:C.muted,cursor:"pointer",fontFamily:"inherit"}}>›</button>
      </div>
      {!isCurrentWeek&&(
        <div style={{padding:"0 20px 6px",display:"flex",justifyContent:"center"}}>
          <button onClick={()=>{setWeekOffset(0);setDay(todayDow());}} style={{background:C.amber+"18",border:`1px solid ${C.amber}55`,borderRadius:20,padding:"4px 14px",color:C.amber,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>↩ Back to Today</button>
        </div>
      )}
      <div style={{padding:"0 20px 16px",display:"flex",gap:5}}>
        {weekDates.map((d,i)=>{
          const isToday=d.iso===todayStr;
          const isActive=dayIdx===i;
          return(
            <button key={i} onClick={()=>setDay(i)} style={{flex:1,padding:"9px 2px",borderRadius:10,cursor:"pointer",border:`1px solid ${isActive?"transparent":isToday?C.amber+"77":"transparent"}`,background:isActive?C.pink:isToday?C.amber+"18":C.surface,display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
              <span style={{color:isActive?C.white:isToday?C.amber:C.muted,fontSize:9,fontWeight:700}}>{WDAYS[i]}</span>
              <span style={{color:isActive?C.white:isToday?C.amber:i===6?C.muted:C.white,fontSize:14,fontWeight:900}}>{d.label}</span>
              {isToday&&!isActive&&<span style={{width:4,height:4,borderRadius:"50%",background:C.amber,display:"block"}}/>}
            </button>
          );
        })}
      </div>
      {isSun?<div style={{padding:"0 20px"}}><Card style={{textAlign:"center",padding:"32px 20px"}}><div style={{fontSize:32,marginBottom:12}}>😴</div><div style={{color:C.white,fontSize:18,fontWeight:800}}>Rest Day</div><div style={{color:C.muted,fontSize:14,marginTop:6}}>Gym closed Sundays.</div></Card></div>:(
        <div style={{padding:"0 20px"}}>
          {loading?<Spinner/>:slots.length===0?<div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:14,padding:"24px",textAlign:"center",marginBottom:10,color:C.muted,fontSize:14}}>No slots for this day</div>:
            slots.map((slot,i)=>{
              const slotStart=slot.start_time_min;
              const slotEnd=slotStart+SESS_MIN;
              const slotBks=bookingsMap[slot.id]||[];
              // Include clients from OTHER slots whose custom session overlaps this slot's window
              const seenIds=new Set(slotBks.map(b=>b.client_id));
              const overlapBks=slots
                .filter(s=>s.id!==slot.id&&s.start_time_min<slotEnd&&s.start_time_min+SESS_MIN>slotStart)
                .flatMap(s=>(bookingsMap[s.id]||[]).map(b=>({...b,_customTime:s.start_time_min,_customSlotId:s.id})))
                .filter(b=>!seenIds.has(b.client_id)); // dedup — don't count same person twice
              const cnt=slotBks.length+overlapBks.length;
              const pct=Math.min((cnt/GYM_CAP)*100,100);
              const barCol=pct>=100?C.pink:pct>=75?C.amber:C.cyan;
              const isForceOpen=forceLogSlot?.id===slot.id;
              return(<Card key={i} style={{marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                  <div><div style={{color:C.white,fontSize:15,fontWeight:800}}>{toSlot(slot.start_time_min)}</div><div style={{color:C.muted,fontSize:12,marginTop:2}}>{cnt}/{GYM_CAP} booked{overlapBks.length>0&&<span style={{color:C.amber,fontSize:10,marginLeft:5}}>+{overlapBks.length} custom</span>}</div></div>
                  <div style={{display:"flex",gap:6,flexShrink:0}}>
                    <button onClick={()=>{ setForceLogSlot(isForceOpen?null:slot); setForceLogClientId(""); setForceLogSearch(""); }} style={{background:isForceOpen?C.amber+"33":C.surface2,border:`1px solid ${isForceOpen?C.amber+"66":C.border}`,borderRadius:8,padding:"6px 10px",color:isForceOpen?C.amber:C.muted,fontSize:11,cursor:"pointer",fontFamily:"inherit",fontWeight:700}} title="Force-log extra client (trainer only, not visible to clients)">+ Log</button>
                    <button onClick={()=>setConf(slot)} style={{background:C.surface2,border:`1px solid ${C.border}`,borderRadius:8,padding:"6px 10px",color:C.pink,fontSize:12,cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>Remove</button>
                  </div>
                </div>
                {(slotBks.length>0||overlapBks.length>0)&&(
                  <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:10}}>
                    {slotBks.map((b,j)=>{
                      const cp=b.profiles;
                      const full=clients.find(c=>c.id===cp?.id);
                      return(<div key={j} style={{background:full?C.pink+"22":C.surface2,border:`1px solid ${full?C.pink+"55":C.border}`,borderRadius:20,padding:"5px 6px 5px 12px",display:"flex",alignItems:"center",gap:6}}>
                        <div onClick={()=>full&&onViewClient?.(full)} style={{display:"flex",alignItems:"center",gap:6,cursor:full?"pointer":"default"}}>
                          <Avatar initials={cp?.initials} size={20} avatarUrl={cp?.avatar_url}/>
                          <span style={{color:full?C.white:C.muted,fontSize:12,fontWeight:600}}>{cp?.name||"Unknown"}</span>
                        </div>
                        <button onClick={()=>handleCancelBooking(b,slot)} style={{background:"none",border:"none",color:C.pink,fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit",padding:"0 2px",lineHeight:1}}>✕</button>
                      </div>);
                    })}
                    {overlapBks.map((b,j)=>{
                      const cp=b.profiles;
                      const full=clients.find(c=>c.id===cp?.id);
                      return(<div key={`ov_${j}`} style={{background:C.amber+"18",border:`1px solid ${C.amber}44`,borderRadius:20,padding:"5px 6px 5px 12px",display:"flex",alignItems:"center",gap:6}}>
                        <div onClick={()=>full&&onViewClient?.(full)} style={{display:"flex",alignItems:"center",gap:6,cursor:full?"pointer":"default"}}>
                          <Avatar initials={cp?.initials} size={20} avatarUrl={cp?.avatar_url}/>
                          <span style={{color:C.amber,fontSize:12,fontWeight:600}}>{cp?.name||"Unknown"}</span>
                          <span style={{color:C.amber,fontSize:10,opacity:.8}}>{toTime(b._customTime)}→</span>
                        </div>
                      </div>);
                    })}
                  </div>
                )}
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <div style={{flex:1,height:6,background:C.surface2,borderRadius:3}}><div style={{width:`${pct}%`,height:"100%",borderRadius:3,background:barCol}}/></div>
                  <span style={{color:C.muted,fontSize:11,fontWeight:700,minWidth:50,textAlign:"right"}}>{cnt>=GYM_CAP?"Full":GYM_CAP-cnt+" free"}</span>
                </div>
                {isForceOpen&&(()=>{
                  const q=forceLogSearch.toLowerCase();
                  const filtered=clients.filter(c=>!q||c.name?.toLowerCase().includes(q)||(c.initials||"").toLowerCase().includes(q));
                  const selClient=clients.find(c=>c.id===forceLogClientId);
                  return(
                  <div style={{marginTop:10,paddingTop:10,borderTop:`1px solid ${C.border}`}}>
                    <div style={{color:C.amber,fontSize:11,fontWeight:700,marginBottom:8}}>🔒 Trainer-only log — clients won't see this</div>
                    <input
                      value={forceLogSearch}
                      onChange={e=>{setForceLogSearch(e.target.value);setForceLogClientId("");}}
                      placeholder="🔍 Search client…"
                      style={{width:"100%",background:C.surface2,border:`1px solid ${C.border}`,borderRadius:8,padding:"9px 12px",color:C.white,fontSize:13,outline:"none",fontFamily:"inherit",boxSizing:"border-box",marginBottom:6}}
                    />
                    {forceLogClientId&&selClient
                      ?<div style={{background:C.amber+"22",border:`1px solid ${C.amber}55`,borderRadius:8,padding:"8px 12px",display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                          <div style={{display:"flex",alignItems:"center",gap:8}}>
                            <Avatar initials={selClient.initials} size={24} avatarUrl={selClient.avatar_url}/>
                            <span style={{color:C.amber,fontSize:13,fontWeight:700}}>{selClient.name}</span>
                          </div>
                          <button onClick={()=>{setForceLogClientId("");setForceLogSearch("");}} style={{background:"none",border:"none",color:C.muted,fontSize:14,cursor:"pointer",fontFamily:"inherit",padding:"0 4px"}}>✕</button>
                        </div>
                      :<div style={{maxHeight:160,overflowY:"auto",borderRadius:8,border:`1px solid ${C.border}`,marginBottom:8,background:C.surface2}}>
                        {filtered.length===0
                          ?<div style={{padding:"12px",color:C.muted,fontSize:12,textAlign:"center"}}>No clients found</div>
                          :filtered.map(c=>(
                            <button key={c.id} onClick={()=>{setForceLogClientId(c.id);setForceLogSearch(c.name||"");}} style={{width:"100%",background:"none",border:"none",borderBottom:`1px solid ${C.border}`,padding:"9px 12px",display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontFamily:"inherit",textAlign:"left"}}>
                              <Avatar initials={c.initials} size={22} avatarUrl={c.avatar_url}/>
                              <div>
                                <div style={{color:C.white,fontSize:13,fontWeight:600}}>{c.name}</div>
                                {c._pkg&&<div style={{color:C.muted,fontSize:10,marginTop:1}}>{c._pkg.sessions_used||0}/{c._pkg.sessions_total} sessions used</div>}
                              </div>
                            </button>
                          ))
                        }
                      </div>
                    }
                    <GBtn sm label={forceLogging?"Logging…":"Log Session"} onClick={handleForceLog} disabled={!forceLogClientId||forceLogging} style={{width:"100%",background:forceLogClientId?C.amber:"",border:forceLogClientId?`1px solid ${C.amber}`:"",color:forceLogClientId?C.bg:""}}/>
                  </div>
                  );
                })()}
              </Card>);
            })
          }
          <div style={{color:C.muted,fontSize:10,fontWeight:700,letterSpacing:1.8,textTransform:"uppercase",marginBottom:10,marginTop:6}}>Add New Slot</div>
          <div style={{background:C.surface2,borderRadius:12,padding:"14px",marginBottom:10}}>
            <div style={{color:C.muted,fontSize:11,fontWeight:600,marginBottom:8}}>Hour</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:12}}>
              {HOURS.map(h=><button key={h} onClick={()=>setPickH(pickH===h?null:h)} style={{background:pickH===h?C.pink+"33":C.surface,border:`1px solid ${pickH===h?C.pink:C.border}`,borderRadius:7,padding:"6px 10px",color:pickH===h?C.pink:C.muted,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",minWidth:42,textAlign:"center"}}>{h<12?`${h}am`:h===12?"12pm":`${h-12}pm`}</button>)}
            </div>
            <div style={{color:C.muted,fontSize:11,fontWeight:600,marginBottom:8}}>Minutes</div>
            <div style={{display:"flex",gap:8,marginBottom:12}}>
              {[0,30].map(m=><button key={m} onClick={()=>setPickM(m)} style={{flex:1,background:pickM===m?C.cyan+"33":C.surface,border:`1px solid ${pickM===m?C.cyan:C.border}`,borderRadius:7,padding:"8px",color:pickM===m?C.cyan:C.muted,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>:{m===0?"00":"30"}</button>)}
            </div>
            {selectedStart!=null&&<div style={{background:C.surface,borderRadius:8,padding:"10px",textAlign:"center",marginBottom:12}}><div style={{color:conflict?C.amber:C.white,fontSize:14,fontWeight:700}}>{conflict?"⚠️ Slot already exists":`🗓 ${toSlot(selectedStart)}`}</div></div>}
            <GBtn label={selectedStart&&!conflict?`+ Add ${toSlot(selectedStart)}`:"Select a time above"} onClick={handleAdd} disabled={!selectedStart||!!conflict} style={{width:"100%"}}/>
          </div>
        </div>
      )}

      {/* Schedule Periods */}
      <div style={{padding:"20px 20px 0"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <SL style={{marginBottom:0}}>Schedule Periods</SL>
          <button onClick={()=>setShowNewPeriod(p=>!p)} style={{background:`linear-gradient(135deg,${C.cyan},${C.pink})`,border:"none",borderRadius:8,padding:"6px 14px",color:C.white,fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>{showNewPeriod?"▲ Cancel":"+ New Period"}</button>
        </div>
        <div style={{color:C.muted,fontSize:12,marginBottom:10,lineHeight:1.5}}>Define which slots are active during a specific date range (e.g. summer hours). When no period covers today, the default slots above apply.</div>
        {showNewPeriod&&(
          <Card style={{marginBottom:10}}>
            <input value={periodName} onChange={e=>setPeriodName(e.target.value)} placeholder="Period name (e.g. Summer 2026)" style={{width:"100%",background:C.surface2,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 12px",color:C.white,fontSize:14,outline:"none",fontFamily:"inherit",boxSizing:"border-box",marginBottom:8}}/>
            <div style={{display:"flex",gap:8,marginBottom:12}}>
              <input type="date" value={periodStart} onChange={e=>setPeriodStart(e.target.value)} style={{flex:1,background:C.surface2,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 12px",color:C.white,fontSize:13,outline:"none",fontFamily:"inherit"}}/>
              <input type="date" value={periodEnd} onChange={e=>setPeriodEnd(e.target.value)} style={{flex:1,background:C.surface2,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 12px",color:C.white,fontSize:13,outline:"none",fontFamily:"inherit"}}/>
            </div>
            <GBtn label="Create Period" onClick={handleCreatePeriod} style={{width:"100%"}}/>
          </Card>
        )}
        {/* Standard period card */}
        {(()=>{
          const stdPickStart=stdPickH!=null?stdPickH*60+stdPickM:null;
          const stdConflict=stdPickStart!=null&&stdDaySlots.find(s=>s.start_time_min===stdPickStart&&s.is_active);
          const handleStdRemove=async(slot)=>{
            try{
              await removeSlot(slot.id,token);
              setStdDaySlots(p=>p.filter(s=>s.id!==slot.id));
              if(!activePeriod) reloadDay();
              showToast("Slot removed.",true);
            }catch(e){ showToast("Error: "+e.message); }
          };
          const handleStdAdd=async()=>{
            if(!stdPickStart||stdConflict) return;
            try{
              const res=await addSlot({trainer_id:trainerId,day_of_week:stdDayIdx,start_time_min:stdPickStart},token);
              const c=Array.isArray(res)?res[0]:res;
              if(c){
                setStdDaySlots(p=>[...p,c].sort((a,b)=>a.start_time_min-b.start_time_min));
                if(!activePeriod) reloadDay();
              }
              setStdPickH(null); setStdPickM(0);
            }catch(e){ showToast("Error: "+e.message); }
          };
          return(
          <Card glow={!activePeriod?C.cyan:null} style={{marginBottom:10}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{color:C.white,fontSize:14,fontWeight:700}}>Standard Schedule {!activePeriod&&<span style={{color:C.cyan,fontSize:11,fontWeight:800}}>· Current</span>}</div>
                <div style={{color:C.muted,fontSize:12,marginTop:2}}>Default base time slots</div>
              </div>
              <div style={{display:"flex",gap:6,flexShrink:0}}>
                {activePeriod&&<button onClick={()=>{ setActivePeriod(null); reloadDay(); }} style={{background:C.surface2,border:`1px solid ${C.border}`,borderRadius:6,padding:"5px 10px",color:C.cyan,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Set as Current</button>}
                <button onClick={()=>setStdExpanded(p=>!p)} style={{background:C.surface2,border:`1px solid ${C.border}`,borderRadius:6,padding:"5px 10px",color:C.cyan,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>{stdExpanded?"▲ Hide":"Manage slots"}</button>
              </div>
            </div>
            {stdExpanded&&(
              <div style={{marginTop:14}}>
                <div style={{display:"flex",gap:4,marginBottom:10}}>
                  {WDAYS.slice(0,6).map((d,i)=>(
                    <button key={i} onClick={()=>setStdDayIdx(i)} style={{flex:1,padding:"7px 2px",borderRadius:8,border:"none",cursor:"pointer",background:stdDayIdx===i?C.cyan:C.surface2,color:stdDayIdx===i?C.bg:C.muted,fontSize:11,fontWeight:800}}>{d}</button>
                  ))}
                </div>
                {stdDaySlots.filter(s=>s.is_active).length===0
                  ?<Empty msg="No active slots for this day"/>
                  :<div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:12}}>
                    {stdDaySlots.filter(s=>s.is_active).map(s=>(
                      <div key={s.id} style={{display:"flex",alignItems:"center",gap:4,background:C.surface2,border:`1px solid ${C.border}`,borderRadius:7,padding:"6px 10px"}}>
                        <span style={{color:C.white,fontSize:12,fontWeight:700}}>{toTime(s.start_time_min)}</span>
                        <button onClick={()=>setConf({msg:`Remove ${toSlot(s.start_time_min)} from Standard Schedule? Existing bookings are not deleted.`,okLabel:"Remove",onOk:()=>handleStdRemove(s)})} style={{background:"none",border:"none",color:C.pink,fontSize:13,cursor:"pointer",padding:"0 2px",lineHeight:1,fontFamily:"inherit"}}>✕</button>
                      </div>
                    ))}
                  </div>
                }
                <div style={{color:C.muted,fontSize:11,fontWeight:600,marginBottom:8}}>Add a slot for this day</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:10}}>
                  {HOURS.map(h=><button key={h} onClick={()=>setStdPickH(stdPickH===h?null:h)} style={{background:stdPickH===h?C.pink+"33":C.surface2,border:`1px solid ${stdPickH===h?C.pink:C.border}`,borderRadius:7,padding:"6px 9px",color:stdPickH===h?C.pink:C.muted,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",minWidth:38,textAlign:"center"}}>{h<12?`${h}am`:h===12?"12pm":`${h-12}pm`}</button>)}
                </div>
                <div style={{display:"flex",gap:8,marginBottom:10}}>
                  {[0,30].map(m=><button key={m} onClick={()=>setStdPickM(m)} style={{flex:1,background:stdPickM===m?C.cyan+"33":C.surface2,border:`1px solid ${stdPickM===m?C.cyan:C.border}`,borderRadius:7,padding:"7px",color:stdPickM===m?C.cyan:C.muted,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>:{m===0?"00":"30"}</button>)}
                </div>
                {stdPickStart!=null&&<div style={{background:C.surface,borderRadius:8,padding:"8px",textAlign:"center",marginBottom:8}}><div style={{color:stdConflict?C.amber:C.white,fontSize:13,fontWeight:700}}>{stdConflict?"⚠️ Slot already exists":`🗓 ${toSlot(stdPickStart)}`}</div></div>}
                <GBtn sm label={stdPickStart&&!stdConflict?`+ Add ${toSlot(stdPickStart)}`:"Pick a time above"} onClick={handleStdAdd} disabled={!stdPickStart||!!stdConflict} style={{width:"100%"}}/>
              </div>
            )}
          </Card>
          );
        })()}
        {periodsLoaded&&periods.length===0&&<Empty msg="No custom periods yet"/>}
        {periods.map(period=>{
          const isExpanded=expandedPeriod===period.id;
          const isActiveNow=activePeriod?.id===period.id;
          const isCurrent=activePeriod?.id===period.id;
          const daySlotIds=new Set((periodSlotsMap[period.id]||[]).filter(ps=>ps.day_of_week===periodDayIdx).map(ps=>ps.start_time_min));
          return(
            <Card key={period.id} glow={isCurrent?C.cyan:null} style={{marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{color:C.white,fontSize:14,fontWeight:700}}>{period.name} {isCurrent&&<span style={{color:C.cyan,fontSize:11,fontWeight:800}}>· Current</span>}</div>
                  <div style={{color:C.muted,fontSize:12,marginTop:2}}>{fmtDate(period.start_date)} → {fmtDate(period.end_date)}</div>
                </div>
                <div style={{display:"flex",gap:6,flexShrink:0}}>
                  {!isCurrent&&<button onClick={()=>handleActivatePeriod(period)} style={{background:C.cyan+"22",border:`1px solid ${C.cyan}44`,borderRadius:6,padding:"5px 10px",color:C.cyan,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>▶ Activate</button>}
                  <button onClick={()=>toggleExpandPeriod(period)} style={{background:C.surface2,border:`1px solid ${C.border}`,borderRadius:6,padding:"5px 10px",color:C.cyan,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>{isExpanded?"▲ Hide":"Manage slots"}</button>
                  <button onClick={()=>handleDeletePeriod(period.id)} style={{background:C.surface2,border:`1px solid ${C.border}`,borderRadius:6,padding:"5px 10px",color:C.pink,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Delete</button>
                </div>
              </div>
              {isExpanded&&(()=>{
                const baseTimes=periodDaySlots.map(s=>s.start_time_min);
                const customTimes=(periodSlotsMap[period.id]||[]).filter(ps=>ps.day_of_week===periodDayIdx).map(ps=>ps.start_time_min);
                const allTimes=[...new Set([...baseTimes,...customTimes])].sort((a,b)=>a-b);
                return(
                <div style={{marginTop:14}}>
                  <div style={{display:"flex",gap:4,marginBottom:10}}>
                    {WDAYS.map((d,i)=>(
                      <button key={i} onClick={()=>setPeriodDayIdx(i)} style={{flex:1,padding:"7px 2px",borderRadius:8,border:"none",cursor:"pointer",background:periodDayIdx===i?C.cyan:C.surface2,color:periodDayIdx===i?C.bg:C.muted,fontSize:11,fontWeight:800}}>{d}</button>
                    ))}
                  </div>
                  {allTimes.length===0
                    ? <Empty msg="No times added for this day yet"/>
                    : <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:12}}>
                        {allTimes.map(t=>{
                          const checked=daySlotIds.has(t);
                          return(
                            <button key={t} onClick={()=>togglePeriodSlot(period,{start_time_min:t})} style={{background:checked?C.cyan+"33":C.surface2,border:`1px solid ${checked?C.cyan:C.border}`,borderRadius:7,padding:"7px 11px",color:checked?C.cyan:C.muted,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>{checked?"✓ ":""}{toTime(t)}</button>
                          );
                        })}
                      </div>
                  }
                  <div style={{color:C.muted,fontSize:11,fontWeight:600,marginBottom:8}}>Add a time for this day</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:10}}>
                    {HOURS.map(h=><button key={h} onClick={()=>setPeriodPickH(periodPickH===h?null:h)} style={{background:periodPickH===h?C.pink+"33":C.surface2,border:`1px solid ${periodPickH===h?C.pink:C.border}`,borderRadius:7,padding:"6px 9px",color:periodPickH===h?C.pink:C.muted,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",minWidth:38,textAlign:"center"}}>{h<12?`${h}am`:h===12?"12pm":`${h-12}pm`}</button>)}
                  </div>
                  <div style={{display:"flex",gap:8,marginBottom:10}}>
                    {[0,30].map(m=><button key={m} onClick={()=>setPeriodPickM(m)} style={{flex:1,background:periodPickM===m?C.cyan+"33":C.surface2,border:`1px solid ${periodPickM===m?C.cyan:C.border}`,borderRadius:7,padding:"7px",color:periodPickM===m?C.cyan:C.muted,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>:{m===0?"00":"30"}</button>)}
                  </div>
                  <GBtn sm label={periodPickStart!=null?`+ Add ${toTime(periodPickStart)}`:"Pick a time above"} onClick={()=>handleAddCustomPeriodTime(period)} disabled={periodPickStart==null} style={{width:"100%"}}/>
                </div>
                );
              })()}
            </Card>
          );
        })}
      </div>
      {toast&&<div style={{position:"fixed",bottom:90,left:"50%",transform:"translateX(-50%)",background:toast.ok?C.green:C.pink,color:"#fff",padding:"10px 22px",borderRadius:12,zIndex:500,fontWeight:700,fontSize:13,whiteSpace:"nowrap",boxShadow:"0 4px 20px rgba(0,0,0,0.4)"}}>{toast.msg}</div>}
    </div>
  );
};

// ── Exercise Library (localStorage) ──
const LIB_KEY=id=>`ua_ex_lib_${id}`;
const loadLib=id=>{try{return JSON.parse(localStorage.getItem(LIB_KEY(id))||"[]");}catch{return [];}};
const saveLib=(id,list)=>localStorage.setItem(LIB_KEY(id),JSON.stringify(list));
const allExercises=(customLib,hiddenSet=new Set())=>[...new Set([...EXERCISE_LIST,...customLib])].filter(e=>!hiddenSet.has(e)).sort((a,b)=>a.localeCompare(b));
const HIDE_KEY=id=>`ua_ex_hide_${id}`;
const loadHidden=id=>{try{return new Set(JSON.parse(localStorage.getItem(HIDE_KEY(id))||"[]"));}catch{return new Set();}};
const saveHidden=(id,set)=>localStorage.setItem(HIDE_KEY(id),JSON.stringify([...set]));

// ── Library Sheet ──
const LibrarySheet=({trainerId,onClose})=>{
  const [custom,setCustom]=useState(()=>loadLib(trainerId));
  const [hidden,setHidden]=useState(()=>loadHidden(trainerId));
  const [search,setSearch]=useState("");
  const [newName,setNewName]=useState("");
  const save=list=>{saveLib(trainerId,list);setCustom(list);};
  const saveH=h=>{saveHidden(trainerId,h);setHidden(new Set(h));};
  const add=()=>{const n=newName.trim();if(!n||custom.includes(n))return;save([...custom,n].sort((a,b)=>a.localeCompare(b)));setNewName("");};
  const all=allExercises(custom,new Set()); // show all in library manager
  const filtered=search?all.filter(e=>e.toLowerCase().includes(search.toLowerCase())):all;
  const isCustom=n=>custom.includes(n);
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",zIndex:400,display:"flex",flexDirection:"column",justifyContent:"flex-end"}} onClick={onClose}>
      <div style={{background:C.surface,borderRadius:"20px 20px 0 0",padding:"20px",maxHeight:"80vh",display:"flex",flexDirection:"column"}} onClick={e=>e.stopPropagation()}>
        <div style={{width:36,height:4,background:C.border,borderRadius:2,margin:"0 auto 16px"}}/>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div><div style={{color:C.white,fontSize:17,fontWeight:800}}>Exercise Library</div><div style={{color:C.muted,fontSize:12,marginTop:2}}>{all.length} exercises · {custom.length} custom</div></div>
          <button onClick={onClose} style={{background:C.surface2,border:`1px solid ${C.border}`,borderRadius:8,padding:"6px 12px",color:C.muted,cursor:"pointer",fontFamily:"inherit"}}>✕</button>
        </div>
        {/* Add custom */}
        <div style={{display:"flex",gap:8,marginBottom:12}}>
          <input value={newName} onChange={e=>setNewName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&add()} placeholder="Add custom exercise…" style={{flex:1,background:C.surface2,border:`1px solid ${C.border}`,borderRadius:8,padding:"9px 12px",color:C.white,fontSize:13,outline:"none",fontFamily:"inherit"}}/>
          <button onClick={add} style={{background:`linear-gradient(135deg,${C.cyan},${C.pink})`,border:"none",borderRadius:8,padding:"9px 14px",color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>Add</button>
        </div>
        {/* Search */}
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Search exercises…" style={{background:C.surface2,border:`1px solid ${C.border}`,borderRadius:8,padding:"9px 12px",color:C.white,fontSize:13,outline:"none",fontFamily:"inherit",marginBottom:10}}/>
        {/* List */}
        <div style={{overflowY:"auto",flex:1}}>
          {filtered.map(name=>{
            const isHidden=hidden.has(name);
            return(
              <div key={name} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 4px",borderBottom:`1px solid ${C.border}`,opacity:isHidden?0.45:1}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <div style={{color:C.white,fontSize:13,textDecoration:isHidden?"line-through":"none"}}>{name}</div>
                  {isCustom(name)&&<span style={{background:C.pink+"22",border:`1px solid ${C.pink}44`,borderRadius:10,padding:"1px 7px",color:C.pink,fontSize:10,fontWeight:700}}>custom</span>}
                  {isHidden&&!isCustom(name)&&<span style={{background:C.muted+"22",borderRadius:10,padding:"1px 7px",color:C.muted,fontSize:10,fontWeight:700}}>hidden</span>}
                </div>
                <div style={{display:"flex",gap:6}}>
                  {isCustom(name)
                    ?<button onClick={()=>save(custom.filter(e=>e!==name))} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:14,padding:"2px 6px"}}>✕</button>
                    :<button onClick={()=>{const nh=new Set(hidden);isHidden?nh.delete(name):nh.add(name);saveH(nh);}} style={{background:"none",border:`1px solid ${C.border}`,borderRadius:6,padding:"2px 8px",color:isHidden?C.cyan:C.muted,cursor:"pointer",fontFamily:"inherit",fontSize:11,fontWeight:700}}>{isHidden?"Show":"Hide"}</button>
                  }
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ── Program day helpers (also used by clients) ──
const toDayPlan=(raw=[],numDays=3)=>{
  if(!raw||raw.length===0) return Array.from({length:numDays},(_,i)=>({day:i+1,exercises:[]}));
  if(raw[0]?.day!==undefined)
    return Array.from({length:numDays},(_,i)=>raw.find(d=>d.day===i+1)||{day:i+1,exercises:[]});
  return [{day:1,exercises:raw},...Array.from({length:numDays-1},(_,i)=>({day:i+2,exercises:[]}))];
};

// ── Program Editor Modal ──
// exercise types
const EX_TYPES=[
  {id:"weighted",label:"🏋️ Weighted",desc:"kg / lbs"},
  {id:"cardio",label:"🚴 Cardio",desc:"m / km / cal"},
  {id:"reps",label:"💪 Reps Only",desc:"no load"},
  {id:"timed",label:"⏱️ Timed",desc:"min / sec"},
];
const CARDIO_UNITS=["m","km","cal","min","sec"];

// parse stored exercise back to det fields
const exToDet=(ex)=>{
  const w=ex.weight||"";
  // detect type from stored weight string
  if(!w||w==="") return {type:"reps",sets:ex.sets||"3",reps:ex.reps||"10",vol:"",unit:"m"};
  if(w==="BW") return {type:"reps",sets:ex.sets||"3",reps:ex.reps||"10",vol:"",unit:"m"};
  // cardio units
  for(const u of CARDIO_UNITS){
    if(w.endsWith(u)){ return {type:"cardio",sets:ex.sets||"3",reps:"",vol:w.slice(0,w.length-u.length),unit:u}; }
  }
  // timed special (stored as e.g. "20min")
  // weighted
  const numMatch=w.match(/^([\d.]+)(kg|lbs)$/);
  if(numMatch) return {type:"weighted",sets:ex.sets||"3",reps:ex.reps||"10",vol:numMatch[1],unit:numMatch[2]};
  return {type:"weighted",sets:ex.sets||"3",reps:ex.reps||"10",vol:w.replace(/[a-z]+$/i,""),unit:"kg"};
};

const ProgramEditorModal=({prog,trainerId,token,onClose,onUpdate})=>{
  // numDays is dynamic — trainer can add/remove days
  const initNumDays=(()=>{
    const raw=prog.exercises||[];
    if(!raw.length) return 3;
    if(raw[0]?.day!==undefined) return Math.max(1,Math.max(...raw.map(d=>d.day)));
    return 3;
  })();
  const [numDays,setNumDays]=useState(initNumDays);
  const [days,setDays]=useState(()=>toDayPlan(prog.exercises||[],initNumDays));
  const [activeDay,setActiveDay]=useState(1);
  const [saving,setSaving]=useState(false);
  const [step,setStep]=useState("list"); // "list" | "pick" | "detail" | "paste"
  const [pasteText,setPasteText]=useState(()=>prog.exercises?.find?.(d=>d.day===1)?.note||"");
  const [pickSearch,setPickSearch]=useState("");
  const [pickedName,setPickedName]=useState("");
  const [editIdx,setEditIdx]=useState(null); // null=new, number=editing existing
  const [det,setDet]=useState({type:"weighted",sets:"3",reps:"10",vol:"",unit:"kg",supersetGroup:""});
  const [pmToast,setPmToast]=useState(null);
  const showPmToast=(msg,ok=false)=>{setPmToast({msg,ok});setTimeout(()=>setPmToast(null),3500);};
  const [dragIdx,setDragIdx]=useState(null);
  const [dragOverIdx,setDragOverIdx]=useState(null);
  const dragRef=useRef({});
  const [renamingProg,setRenamingProg]=useState(false);
  const [progNameDraft,setProgNameDraft]=useState(prog.name);
  const [progName,setProgName]=useState(prog.name);
  const saveProgName=async()=>{
    const name=progNameDraft.trim();
    if(!name||name===progName){setRenamingProg(false);return;}
    try{
      // We don't have the full programs list here, so we check via API
      const existing=await dbGet("workout_templates",`trainer_id=eq.${trainerId}&name=eq.${encodeURIComponent(name)}`,token).catch(()=>[]);
      if(Array.isArray(existing)&&existing.some(p=>p.id!==prog.id)){showPmToast(`A program named "${name}" already exists.`);setRenamingProg(false);setProgNameDraft(progName);return;}
      await updateTemplate(prog.id,{name},token);
      setProgName(name);
      onUpdate({...prog,name,exercises:days.flatMap?days:prog.exercises});
      showPmToast("Program renamed.",true);
    }catch(e){showPmToast("Error: "+e.message);}
    setRenamingProg(false);
  };
  const lib=useMemo(()=>loadLib(trainerId),[trainerId]);
  const hidden=useMemo(()=>loadHidden(trainerId),[trainerId]);
  const all=useMemo(()=>allExercises(lib,hidden),[lib,hidden]);
  const filtered=pickSearch?all.filter(e=>e.toLowerCase().includes(pickSearch.toLowerCase())):all;

  const exs=days.find(d=>d.day===activeDay)?.exercises||[];
  const dayNote=days.find(d=>d.day===activeDay)?.note||"";
  // Sync pasteText when switching days
  const prevActiveDayRef=useRef(activeDay);
  if(prevActiveDayRef.current!==activeDay){prevActiveDayRef.current=activeDay;setPasteText(dayNote);}

  // Get all superset groups used in the active day
  const ssGroups=useMemo(()=>{
    const g=new Set((exs||[]).map(e=>e.supersetGroup).filter(Boolean));
    return [...g].sort();
  },[exs]);

  const persist=async(newExsForDay)=>{
    const newDays=days.map(d=>d.day===activeDay?{...d,exercises:newExsForDay}:d);
    setSaving(true);
    try{
      await updateTemplate(prog.id,{exercises:newDays},token);
      setDays(newDays);
      onUpdate({...prog,exercises:newDays});
    }catch(e){showPmToast("Error: "+e.message);}
    setSaving(false);
  };

  const persistNote=async(note)=>{
    const newDays=days.map(d=>d.day===activeDay?{...d,note}:d);
    setSaving(true);
    try{
      await updateTemplate(prog.id,{exercises:newDays},token);
      setDays(newDays);
      onUpdate({...prog,exercises:newDays});
    }catch(e){showPmToast("Error: "+e.message);}
    setSaving(false);
  };

  const persistAllDays=async(newDays)=>{
    setSaving(true);
    try{
      await updateTemplate(prog.id,{exercises:newDays},token);
      setDays(newDays);
      onUpdate({...prog,exercises:newDays});
    }catch(e){showPmToast("Error: "+e.message);}
    setSaving(false);
  };

  const addDay=()=>{
    const n=numDays+1;
    const newDays=[...days,{day:n,exercises:[]}];
    setNumDays(n);
    persistAllDays(newDays);
    setActiveDay(n);
    setStep("list");
  };

  const removeLastDay=()=>{
    if(numDays<=1){showPmToast("Need at least 1 day.");return;}
    const n=numDays-1;
    const newDays=days.filter(d=>d.day<=n);
    setNumDays(n);
    if(activeDay>n){setActiveDay(n);}
    persistAllDays(newDays);
    setStep("list");
  };

  const remove=(idx)=>persist(exs.filter((_,i)=>i!==idx));
  const moveUp=(idx)=>{if(idx===0)return;const n=[...exs];[n[idx-1],n[idx]]=[n[idx],n[idx-1]];persist(n);};
  const moveDown=(idx)=>{if(idx===exs.length-1)return;const n=[...exs];[n[idx],n[idx+1]]=[n[idx+1],n[idx]];persist(n);};

  const doReorder=(from,to)=>{if(from===to)return;const n=[...exs];const[r]=n.splice(from,1);n.splice(to,0,r);persist(n);};
  const handleDragStart=(e,i)=>{dragRef.current={from:i,to:i};setDragIdx(i);setDragOverIdx(i);e.dataTransfer.effectAllowed='move';};
  const handleDragOver=(e,i)=>{e.preventDefault();dragRef.current.to=i;setDragOverIdx(i);};
  const handleDragEnd=()=>{const{from,to}=dragRef.current;setDragIdx(null);setDragOverIdx(null);doReorder(from,to);};
  const handleTouchDrag=(startIdx)=>(e)=>{
    e.preventDefault();
    dragRef.current={from:startIdx,to:startIdx};setDragIdx(startIdx);setDragOverIdx(startIdx);
    const onMove=(ev)=>{ev.preventDefault();const t=ev.touches[0];const el=document.elementFromPoint(t.clientX,t.clientY);const row=el?.closest?.('[data-exidx]');if(row){const idx=parseInt(row.getAttribute('data-exidx'));if(!isNaN(idx)){dragRef.current.to=idx;setDragOverIdx(idx);}}};
    const onEnd=()=>{document.removeEventListener('touchmove',onMove,false);document.removeEventListener('touchend',onEnd);const{from,to}=dragRef.current;setDragIdx(null);setDragOverIdx(null);doReorder(from,to);};
    document.addEventListener('touchmove',onMove,{passive:false});
    document.addEventListener('touchend',onEnd);
  };

  const startEdit=(idx)=>{
    const ex=exs[idx];
    if(!ex) return;
    if(!ex.name){setEditIdx(idx);setDet({...exToDet(ex),supersetGroup:ex.supersetGroup||""});setPickedName("");setPickSearch("");setStep("pick");return;}
    setPickedName(ex.name);
    setEditIdx(idx);
    setDet({...exToDet(ex),supersetGroup:ex.supersetGroup||""});
    setStep("detail");
  };
  const BLANK_DET={type:"weighted",sets:"3",reps:"10",vol:"",unit:"kg",supersetGroup:""};
  const startAdd=()=>{
    setPickedName("");setEditIdx(null);setDet(BLANK_DET);setPickSearch("");setStep("pick");
  };
  const resetDetail=()=>{setPickedName("");setEditIdx(null);setDet(BLANK_DET);setPickSearch("");setStep("list");};

  // Next available superset letter: A, B, C…
  const nextSsLetter=()=>{
    const used=new Set((exs||[]).map(e=>e.supersetGroup).filter(Boolean));
    for(let i=0;i<26;i++){const l=String.fromCharCode(65+i);if(!used.has(l))return l;}
    return "A";
  };

  const buildExercise=()=>{
    let weight="";
    if(det.type==="weighted") weight=det.vol?`${det.vol}${det.unit}`:"";
    else if(det.type==="cardio"||det.type==="timed") weight=det.vol?`${det.vol}${det.unit}`:"";
    else weight=""; // reps only
    const ex={name:pickedName,sets:det.sets,reps:det.type==="cardio"||det.type==="timed"?"":det.reps,weight};
    if(det.supersetGroup) ex.supersetGroup=det.supersetGroup;
    return ex;
  };

  const confirmSave=()=>{
    if(!pickedName)return;
    const ex=buildExercise();
    if(editIdx!==null){
      const n=[...exs]; n[editIdx]=ex; persist(n);
    } else {
      persist([...exs,ex]);
    }
    resetDetail();
  };

  const si=(val,set,ph,w="100%")=>(<input value={val} onChange={e=>set(e.target.value)} placeholder={ph} style={{width:w,boxSizing:"border-box",background:"rgba(255,255,255,0.07)",border:`1px solid ${C.border}`,borderRadius:8,padding:"9px 10px",color:C.white,fontSize:13,outline:"none",fontFamily:"inherit"}}/>);

  const exLabel=(ex)=>{
    const parts=[];
    if(ex.sets) parts.push(`${ex.sets} sets`);
    if(ex.reps) parts.push(`${ex.reps} reps`);
    if(ex.weight) parts.push(ex.weight);
    return parts.join(" · ");
  };

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.9)",zIndex:350,display:"flex",flexDirection:"column"}}>
      <div style={{flex:1,display:"flex",flexDirection:"column",background:C.surface,marginTop:44,borderRadius:"20px 20px 0 0",overflow:"hidden"}}>
        {/* Header */}
        <div style={{padding:"14px 20px 12px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
          <button onClick={step!=="list"?resetDetail:onClose} style={{background:C.surface2,border:`1px solid ${C.border}`,borderRadius:10,padding:"7px 13px",color:C.muted,cursor:"pointer",fontFamily:"inherit",fontSize:13}}>
            {step!=="list"?"← Back":"✕ Close"}
          </button>
          <div style={{flex:1,minWidth:0}}>
            {renamingProg
              ?<div style={{display:"flex",gap:6,alignItems:"center"}}>
                  <input autoFocus value={progNameDraft} onChange={e=>setProgNameDraft(e.target.value)}
                    onKeyDown={e=>{if(e.key==="Enter")saveProgName();if(e.key==="Escape"){setRenamingProg(false);setProgNameDraft(progName);}}}
                    style={{flex:1,background:C.surface2,border:`1px solid ${C.cyan}55`,borderRadius:8,padding:"5px 10px",color:"#fff",fontSize:14,outline:"none",fontFamily:"inherit"}}/>
                  <button onClick={saveProgName} style={{background:`linear-gradient(135deg,${C.cyan},${C.pink})`,border:"none",borderRadius:7,padding:"5px 10px",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Save</button>
                  <button onClick={()=>{setRenamingProg(false);setProgNameDraft(progName);}} style={{background:C.surface2,border:`1px solid ${C.border}`,borderRadius:7,padding:"5px 10px",color:C.muted,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>✕</button>
                </div>
              :<div style={{display:"flex",alignItems:"center",gap:6}}>
                  <div style={{color:C.white,fontSize:17,fontWeight:800,fontFamily:"'Oswald',sans-serif",letterSpacing:0.5,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{progName}</div>
                  <button onClick={()=>setRenamingProg(true)} style={{background:"none",border:"none",color:C.muted,fontSize:13,cursor:"pointer",padding:0,lineHeight:1,flexShrink:0}}>✎</button>
                </div>
            }
            <div style={{color:C.muted,fontSize:12,marginTop:1}}>{exs.length} exercise{exs.length!==1?"s":""}{saving?" · saving…":""}</div>
          </div>
        </div>

        {/* ── Day Tabs ── */}
        <div style={{display:"flex",gap:5,padding:"10px 12px",flexShrink:0,borderBottom:`1px solid ${C.border}`,background:C.bg,alignItems:"center"}}>
          <div style={{display:"flex",gap:5,flex:1,overflowX:"auto",minWidth:0}}>
            {days.map(d=>{
              const cnt=d.exercises?.length||0;
              const active=activeDay===d.day;
              return(
                <button key={d.day} onClick={()=>{setActiveDay(d.day);setPasteText(d.note||"");setStep("list");}}
                  style={{flexShrink:0,minWidth:56,padding:"7px 6px",borderRadius:10,border:`1px solid ${active?C.cyan:C.border}`,background:active?`${C.cyan}22`:"transparent",cursor:"pointer",fontFamily:"inherit",transition:"all 0.15s"}}>
                  <div style={{color:active?C.cyan:C.muted,fontSize:12,fontWeight:800}}>Day {d.day}</div>
                  <div style={{color:active?C.cyan+"99":C.border,fontSize:10,fontWeight:600,marginTop:1}}>{cnt} ex</div>
                </button>
              );
            })}
          </div>
          {/* Add / remove day buttons */}
          <button onClick={addDay} disabled={saving} title="Add day"
            style={{flexShrink:0,width:32,height:32,borderRadius:8,border:`1px solid ${C.green}`,background:`${C.green}22`,color:C.green,cursor:"pointer",fontSize:18,lineHeight:1,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",opacity:saving?0.4:1}}>+</button>
          <button onClick={removeLastDay} disabled={saving||numDays<=1} title="Remove last day"
            style={{flexShrink:0,width:32,height:32,borderRadius:8,border:`1px solid ${numDays>1?C.pink:C.border}`,background:numDays>1?`${C.pink}22`:"transparent",color:numDays>1?C.pink:C.border,cursor:numDays>1?"pointer":"default",fontSize:18,lineHeight:1,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",opacity:saving?0.4:1}}>−</button>
        </div>

        {/* ── Step: exercise list ── */}
        {step==="list"&&(<>
          <div style={{flex:1,overflowY:"auto",padding:"14px 20px"}}>
            {exs.length===0
              ? <Empty msg={`No exercises for Day ${activeDay} yet`}/>
              : (()=>{
                  // Group consecutive exercises that share a supersetGroup
                  const SS_COLORS={"A":C.cyan,"B":C.amber,"C":C.pink,"D":C.green,"E":"#9B5DE5","F":"#F15BB5"};
                  const getSsColor=(g)=>SS_COLORS[g]||C.cyan;
                  let lastSsGroup=null;
                  return exs.map((ex,i)=>{
                    const ssGroup=ex.supersetGroup||null;
                    const isFirstOfGroup=ssGroup&&ssGroup!==lastSsGroup;
                    const prevWasSameGroup=i>0&&exs[i-1]?.supersetGroup===ssGroup;
                    lastSsGroup=ssGroup;
                    const ssColor=ssGroup?getSsColor(ssGroup):null;
                    return(
                      <div key={i}>
                        {/* Superset group header — shown before first member */}
                        {isFirstOfGroup&&(
                          <div style={{display:"flex",alignItems:"center",gap:6,margin:"4px 0 2px",padding:"0 2px"}}>
                            <div style={{height:1,flex:1,background:`${ssColor}44`}}/>
                            <div style={{fontSize:10,fontWeight:800,color:ssColor,letterSpacing:1.2,textTransform:"uppercase"}}>⚡ Superset {ssGroup}</div>
                            <div style={{height:1,flex:1,background:`${ssColor}44`}}/>
                          </div>
                        )}
                        <div data-exidx={i}
                          draggable
                          onDragStart={e=>handleDragStart(e,i)}
                          onDragOver={e=>handleDragOver(e,i)}
                          onDrop={handleDragEnd}
                          onDragEnd={()=>{setDragIdx(null);setDragOverIdx(null);}}
                          onClick={()=>!saving&&startEdit(i)}
                          style={{background:dragOverIdx===i&&dragIdx!==i?`${C.cyan}12`:ssGroup?`${ssColor}0D`:"rgba(255,255,255,0.04)",borderRadius:12,padding:"11px 14px",display:"flex",alignItems:"center",gap:10,marginBottom:ssGroup&&exs[i+1]?.supersetGroup===ssGroup?2:8,border:`1px solid ${dragOverIdx===i&&dragIdx!==i?C.cyan:ssGroup?ssColor+"44":C.border}`,cursor:"pointer",opacity:dragIdx===i?0.4:1,transition:"all 0.12s",userSelect:"none"}}>
                          {/* up/down reorder buttons */}
                          <div style={{display:"flex",flexDirection:"column",gap:2,flexShrink:0}} onClick={e=>e.stopPropagation()}>
                            <button onClick={e=>{e.stopPropagation();moveUp(i);}} disabled={saving||i===0} style={{background:"none",border:"none",color:i===0?C.border:C.muted,cursor:i===0?"default":"pointer",fontSize:14,padding:"0 2px",lineHeight:1,fontFamily:"inherit"}}>▲</button>
                            <button onClick={e=>{e.stopPropagation();moveDown(i);}} disabled={saving||i===exs.length-1} style={{background:"none",border:"none",color:i===exs.length-1?C.border:C.muted,cursor:i===exs.length-1?"default":"pointer",fontSize:14,padding:"0 2px",lineHeight:1,fontFamily:"inherit"}}>▼</button>
                          </div>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{display:"flex",alignItems:"center",gap:6}}>
                              <div style={{color:C.white,fontSize:14,fontWeight:700}}>{ex.name}</div>
                              {ssGroup&&<span style={{fontSize:9,fontWeight:800,color:ssColor,background:`${ssColor}22`,padding:"1px 6px",borderRadius:6,letterSpacing:0.8}}>SS {ssGroup}</span>}
                            </div>
                            <div style={{color:C.pink,fontSize:12,fontWeight:700,marginTop:2}}>{exLabel(ex)}</div>
                          </div>
                          <button onClick={e=>{e.stopPropagation();!saving&&startEdit(i);}} title="Edit" style={{background:C.surface2,border:`1px solid ${C.border}`,borderRadius:8,color:C.cyan,cursor:"pointer",fontSize:13,padding:"5px 9px",lineHeight:1,flexShrink:0,opacity:saving?0.4:1}}>✏️</button>
                          <button onClick={e=>{e.stopPropagation();remove(i);}} disabled={saving} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:17,padding:"4px"}}>✕</button>
                        </div>
                      </div>
                    );
                  });
                })()
            }
          </div>
          {dayNote&&(
            <div style={{margin:"0 20px 0",flexShrink:0}}>
              <div style={{background:`${C.amber}11`,border:`1px solid ${C.amber}33`,borderRadius:10,padding:"10px 14px",marginBottom:6}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                  <div style={{color:C.amber,fontSize:10,fontWeight:800,letterSpacing:1.2,textTransform:"uppercase"}}>📝 Text Note</div>
                  <button onClick={()=>{setPasteText(dayNote);setStep("paste");}} style={{background:"none",border:"none",color:C.amber,fontSize:12,cursor:"pointer",padding:0,fontFamily:"inherit",fontWeight:700}}>Edit</button>
                </div>
                <div style={{color:C.muted,fontSize:12,lineHeight:1.55,whiteSpace:"pre-wrap",wordBreak:"break-word",maxHeight:80,overflow:"hidden",WebkitMaskImage:"linear-gradient(to bottom,black 60%,transparent 100%)"}}>{dayNote}</div>
              </div>
            </div>
          )}
          <div style={{flexShrink:0,padding:"12px 20px 28px",borderTop:`1px solid ${C.border}`,display:"flex",gap:8}}>
            <GBtn label={saving?"Saving…":"+ Add Exercise"} onClick={startAdd} style={{flex:1}} disabled={saving}/>
            <button onClick={()=>{setPasteText(dayNote);setStep("paste");}} style={{flexShrink:0,background:`${C.amber}18`,border:`1px solid ${C.amber}44`,borderRadius:10,padding:"10px 14px",color:C.amber,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>📝</button>
          </div>
        </>)}

        {/* ── Step: pick exercise from library ── */}
        {step==="pick"&&(<>
          <div style={{padding:"14px 20px 10px",flexShrink:0}}>
            <input value={pickSearch} onChange={e=>setPickSearch(e.target.value)} placeholder="🔍 Search exercises…" autoFocus style={{width:"100%",background:"rgba(255,255,255,0.07)",border:`1px solid ${C.border}`,borderRadius:10,padding:"10px 14px",color:C.white,fontSize:14,outline:"none",fontFamily:"inherit",boxSizing:"border-box"}}/>
          </div>
          <div style={{flex:1,overflowY:"auto",padding:"0 20px 10px"}}>
            {filtered.map(name=>(
              <button key={name} onClick={()=>{setPickedName(name);setStep("detail");}} style={{width:"100%",background:"none",border:"none",textAlign:"left",padding:"11px 4px",borderBottom:`1px solid ${C.border}`,cursor:"pointer",fontFamily:"inherit"}}>
                <span style={{color:C.white,fontSize:14}}>{name}</span>
                {lib.includes(name)&&<span style={{marginLeft:8,background:C.pink+"22",border:`1px solid ${C.pink}44`,borderRadius:10,padding:"1px 7px",color:C.pink,fontSize:10,fontWeight:700}}>custom</span>}
              </button>
            ))}
          </div>
        </>)}

        {/* ── Step: enter details (add or edit) ── */}
        {step==="detail"&&(
          <div style={{flex:1,overflowY:"auto",padding:"20px",display:"flex",flexDirection:"column",gap:14}}>
            {/* exercise name badge */}
            <div style={{background:editIdx!==null?`${C.amber}15`:`${C.cyan}15`,borderRadius:12,padding:"12px 16px",border:`1px solid ${editIdx!==null?C.amber:C.cyan}44`}}>
              <div style={{color:editIdx!==null?C.amber:C.cyan,fontSize:10,fontWeight:700,letterSpacing:1.5,textTransform:"uppercase",marginBottom:3}}>
                {editIdx!==null?"Editing":"Adding to"} Day {activeDay}
              </div>
              <div style={{color:C.white,fontSize:17,fontWeight:800}}>{pickedName}</div>
            </div>

            {/* ── Exercise Type selector ── */}
            <div>
              <div style={{color:C.muted,fontSize:10,fontWeight:700,letterSpacing:1.2,textTransform:"uppercase",marginBottom:8}}>Exercise Type</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                {EX_TYPES.map(t=>{
                  const active=det.type===t.id;
                  return(
                    <button key={t.id} onClick={()=>setDet(p=>({...p,type:t.id,unit:t.id==="cardio"||t.id==="timed"?"m":"kg"}))}
                      style={{background:active?`${C.cyan}18`:"rgba(255,255,255,0.04)",border:`1px solid ${active?C.cyan:C.border}`,borderRadius:10,padding:"9px 8px",cursor:"pointer",fontFamily:"inherit",textAlign:"left",transition:"all 0.12s"}}>
                      <div style={{color:active?C.white:C.muted,fontSize:12,fontWeight:700}}>{t.label}</div>
                      <div style={{color:active?C.cyan:C.border,fontSize:10,marginTop:2}}>{t.desc}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── Sets ── */}
            <div>
              <div style={{color:C.muted,fontSize:10,fontWeight:700,letterSpacing:1.2,textTransform:"uppercase",marginBottom:6}}>Sets / Rounds</div>
              {si(det.sets,v=>setDet(p=>({...p,sets:v})),"e.g. 3")}
            </div>

            {/* ── Reps (weighted + reps-only) ── */}
            {(det.type==="weighted"||det.type==="reps")&&(
              <div>
                <div style={{color:C.muted,fontSize:10,fontWeight:700,letterSpacing:1.2,textTransform:"uppercase",marginBottom:6}}>Reps</div>
                {si(det.reps,v=>setDet(p=>({...p,reps:v})),"e.g. 10")}
              </div>
            )}

            {/* ── Volume + Unit (weighted / cardio / timed) ── */}
            {det.type!=="reps"&&(
              <div>
                <div style={{color:C.muted,fontSize:10,fontWeight:700,letterSpacing:1.2,textTransform:"uppercase",marginBottom:6}}>
                  {det.type==="weighted"?"Weight (optional)":det.type==="cardio"?"Distance / Calories":"Duration"}
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr auto",gap:8}}>
                  <div>
                    {det.type==="weighted"&&det.unit==="BW"
                      ? <div style={{background:"rgba(255,255,255,0.04)",borderRadius:8,padding:"9px 12px",color:C.muted,fontSize:13}}>Bodyweight</div>
                      : si(det.vol,v=>setDet(p=>({...p,vol:v})),det.type==="weighted"?"e.g. 80":det.type==="cardio"?"e.g. 500":"e.g. 20")
                    }
                  </div>
                  <div>
                    <select value={det.unit} onChange={e=>setDet(p=>({...p,unit:e.target.value}))}
                      style={{background:"rgba(255,255,255,0.07)",border:`1px solid ${C.border}`,borderRadius:8,padding:"9px 10px",color:C.white,fontFamily:"inherit",outline:"none",fontSize:13,height:"100%",minWidth:60}}>
                      {det.type==="weighted"
                        ?<><option value="kg">kg</option><option value="lbs">lbs</option><option value="BW">BW</option></>
                        :det.type==="cardio"
                          ?<><option value="m">m</option><option value="km">km</option><option value="cal">cal</option><option value="min">min</option></>
                          :<><option value="min">min</option><option value="sec">sec</option></>
                      }
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* ── Superset ── */}
            <div>
              <div style={{color:C.muted,fontSize:10,fontWeight:700,letterSpacing:1.2,textTransform:"uppercase",marginBottom:8}}>Superset</div>
              <div style={{background:"rgba(255,255,255,0.04)",borderRadius:12,padding:"12px 14px",border:`1px solid ${C.border}`}}>
                <div style={{color:C.white,fontSize:13,fontWeight:700,marginBottom:10}}>Group with another exercise?</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                  {/* "None" option */}
                  <button onClick={()=>setDet(p=>({...p,supersetGroup:""}))}
                    style={{padding:"6px 14px",borderRadius:8,border:`1px solid ${!det.supersetGroup?C.cyan:C.border}`,background:!det.supersetGroup?`${C.cyan}22`:"transparent",color:!det.supersetGroup?C.cyan:C.muted,cursor:"pointer",fontSize:12,fontWeight:700,fontFamily:"inherit"}}>
                    None
                  </button>
                  {/* Existing groups in this day */}
                  {ssGroups.map(g=>(
                    <button key={g} onClick={()=>setDet(p=>({...p,supersetGroup:g}))}
                      style={{padding:"6px 14px",borderRadius:8,border:`1px solid ${det.supersetGroup===g?"#"+["00C9E1","F59E0B","E8197A","22C55E","9B5DE5","F15BB5"][["A","B","C","D","E","F"].indexOf(g)]||C.cyan:C.border}`,background:det.supersetGroup===g?`${["#00C9E1","#F59E0B","#E8197A","#22C55E","#9B5DE5","#F15BB5"][["A","B","C","D","E","F"].indexOf(g)]||C.cyan}22`:"transparent",color:det.supersetGroup===g?(["#00C9E1","#F59E0B","#E8197A","#22C55E","#9B5DE5","#F15BB5"][["A","B","C","D","E","F"].indexOf(g)]||C.cyan):C.muted,cursor:"pointer",fontSize:12,fontWeight:700,fontFamily:"inherit"}}>
                      ⚡ Superset {g}
                    </button>
                  ))}
                  {/* New group button */}
                  <button onClick={()=>setDet(p=>({...p,supersetGroup:nextSsLetter()}))}
                    style={{padding:"6px 14px",borderRadius:8,border:`1px solid ${C.green}44`,background:`${C.green}11`,color:C.green,cursor:"pointer",fontSize:12,fontWeight:700,fontFamily:"inherit"}}>
                    + New group
                  </button>
                </div>
                {det.supersetGroup&&(
                  <div style={{marginTop:8,color:C.muted,fontSize:11}}>
                    This exercise will be grouped in ⚡ Superset {det.supersetGroup} on Day {activeDay}.
                  </div>
                )}
              </div>
            </div>

            <div style={{marginTop:"auto",paddingBottom:12}}>
              <GBtn label={editIdx!==null?"💾 Save Changes":"Add to Program"} onClick={confirmSave} style={{width:"100%"}}/>
            </div>
          </div>
        )}

        {/* ── Step: paste / type text note ── */}
        {step==="paste"&&(
          <div style={{flex:1,display:"flex",flexDirection:"column",padding:"20px",gap:14}}>
            <div style={{color:C.amber,fontSize:10,fontWeight:800,letterSpacing:1.5,textTransform:"uppercase"}}>📝 Text Note — Day {activeDay}</div>
            <div style={{color:C.muted,fontSize:12,lineHeight:1.5}}>Paste or type program text here. Shown as a note block alongside exercises.</div>
            <textarea
              autoFocus
              value={pasteText}
              onChange={e=>setPasteText(e.target.value)}
              placeholder={"e.g.\nSquat 4x8 @70%\nRDL 3x10\nLeg Press 3x12\n..."}
              style={{flex:1,minHeight:180,background:"rgba(255,255,255,0.06)",border:`1px solid ${C.amber}44`,borderRadius:12,padding:"12px 14px",color:C.white,fontSize:13,lineHeight:1.6,fontFamily:"inherit",outline:"none",resize:"none"}}
            />
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setStep("list")} style={{flex:1,background:C.surface2,border:`1px solid ${C.border}`,borderRadius:10,padding:"11px",color:C.muted,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Cancel</button>
              <button onClick={async()=>{await persistNote(pasteText);setStep("list");}} disabled={saving} style={{flex:2,background:`linear-gradient(135deg,${C.amber},${C.pink})`,border:"none",borderRadius:10,padding:"11px",color:"#fff",fontSize:13,fontWeight:800,cursor:"pointer",fontFamily:"inherit",opacity:saving?0.6:1}}>{saving?"Saving…":"💾 Save Note"}</button>
              {pasteText&&<button onClick={async()=>{setPasteText("");await persistNote("");setStep("list");}} disabled={saving} style={{flexShrink:0,background:`${C.pink}18`,border:`1px solid ${C.pink}44`,borderRadius:10,padding:"11px 14px",color:C.pink,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>🗑</button>}
            </div>
          </div>
        )}
      </div>
      <UaToast toast={pmToast}/>
    </div>
  );
};

// ── Programs (named workout templates) ──
const PROG_PRESETS=["Agility","Conditioning","Strength","Cardio","Mobility","Flexibility","HIIT","Olympic Lifting"];

const ProgramsScreen=({trainerId,token})=>{
  const [programs,setPrograms]=useState([]);
  const [loading,setLoad]=useState(true);
  const [showNew,setShowNew]=useState(false);
  const [newName,setNewName]=useState("");
  const [creating,setCreating]=useState(false);
  const [editProg,setEditProg]=useState(null);   // program open in modal
  const [showLib,setShowLib]=useState(false);     // library sheet
  const [delDlg,setDelDlg]=useState(null);
  const [progToast,setProgToast]=useState(null);
  const showProgToast=(msg,ok=false)=>{setProgToast({msg,ok});setTimeout(()=>setProgToast(null),3500);};

  useEffect(()=>{
    getTemplates(trainerId,token).then(r=>setPrograms(r||[])).catch(()=>{}).finally(()=>setLoad(false));
  },[]);

  const handleCreate=async(nameOverride)=>{
    const name=nameOverride||newName.trim();
    if(!name) return;
    if(programs.some(p=>p.name.toLowerCase()===name.toLowerCase())){
      showProgToast(`A program named "${name}" already exists.`);
      return;
    }
    setCreating(true);
    try{
      const res=await createTemplate({trainer_id:trainerId,name,exercises:[]},token);
      const created=Array.isArray(res)?res[0]:res;
      if(created){
        const updated=[...programs,created].sort((a,b)=>a.name.localeCompare(b.name));
        setPrograms(updated);
        setEditProg(created);   // open the new program immediately
      }
      setNewName(""); setShowNew(false);
    }catch(e){ showProgToast("Error: "+e.message); }
    setCreating(false);
  };

  const handleDelete=(prog,e)=>{
    e.stopPropagation();
    setDelDlg({msg:`Delete "${prog.name}"? This can't be undone.`,okLabel:"Delete",onOk:async()=>{
      try{
        // Unlink from any packages first (FK constraint)
        await dbPatch("packages",`program_id=eq.${prog.id}`,{program_id:null},token).catch(()=>{});
        await deleteTemplate(prog.id,token);
        setPrograms(p=>p.filter(x=>x.id!==prog.id));
      }
      catch(e2){ showProgToast("Error: "+e2.message); }
    }});
  };

  const handleUpdate=(updated)=>{
    setPrograms(p=>p.map(x=>x.id===updated.id?updated:x));
  };

  const existingNames=new Set(programs.map(p=>p.name.toLowerCase()));
  const availablePresets=PROG_PRESETS.filter(n=>!existingNames.has(n.toLowerCase()));

  return(
    <div style={{paddingBottom:80}}>
      {/* Header */}
      <div style={{padding:"22px 20px 12px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div>
          <div style={{color:C.white,fontSize:22,fontWeight:800,fontFamily:"'Oswald',sans-serif"}}>Programs</div>
          <div style={{color:C.muted,fontSize:13,marginTop:2}}>Workout templates</div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <button onClick={()=>setShowLib(true)} style={{background:"rgba(255,255,255,0.06)",border:`1px solid ${C.border}`,borderRadius:10,padding:"7px 14px",color:C.cyan,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",letterSpacing:0.3}}>Library</button>
          <Logo size={48}/>
        </div>
      </div>

      <div style={{padding:"0 20px 16px"}}>
        {/* Quick-create preset chips */}
        {availablePresets.length>0&&(
          <div style={{marginBottom:12}}>
            <div style={{color:C.muted,fontSize:10,fontWeight:700,letterSpacing:1.5,textTransform:"uppercase",marginBottom:8}}>Quick create</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
              {availablePresets.map(n=>(
                <button key={n} onClick={()=>handleCreate(n)} disabled={creating} style={{background:"rgba(255,255,255,0.05)",border:`1px dashed ${C.pink}66`,borderRadius:20,padding:"7px 14px",color:C.pink,fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit",letterSpacing:0.5}}>+ {n}</button>
              ))}
            </div>
          </div>
        )}

        {/* Custom name create */}
        <GBtn label={showNew?"▲ Cancel":"+ Custom Program"} onClick={()=>setShowNew(p=>!p)} ghost={showNew} style={{width:"100%"}}/>
        {showNew&&(
          <Card style={{marginTop:10}}>
            <input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="Program name…" onKeyDown={e=>e.key==="Enter"&&handleCreate()} style={{background:"rgba(255,255,255,0.07)",border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 12px",color:C.white,fontSize:14,outline:"none",fontFamily:"inherit",width:"100%",boxSizing:"border-box",marginBottom:10}}/>
            <GBtn label={creating?"Creating...":"Create"} onClick={()=>handleCreate()} disabled={creating||!newName.trim()} sm style={{width:"100%"}}/>
          </Card>
        )}
      </div>

      {/* Program cards — compact, tap to edit */}
      <div style={{padding:"0 20px"}}>
        {loading?<Spinner/>:programs.length===0?<Empty msg="No programs yet — use Quick Create or Custom above"/>:
          programs.map(prog=>{
            const exs=prog.exercises||[];
            return(
              <Card key={prog.id} style={{marginBottom:10,cursor:"pointer"}} onClick={()=>setEditProg(prog)}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{color:C.white,fontSize:15,fontWeight:700}}>{prog.name}</div>
                    <div style={{color:C.muted,fontSize:12,marginTop:3}}>
                      {exs.length===0?"No exercises yet":`${exs.length} exercise${exs.length!==1?"s":""}`}
                      {exs.length>0&&(
                        <span style={{color:C.border,marginLeft:6,marginRight:6}}>·</span>
                      )}
                      {exs.length>0&&(
                        <span style={{color:C.surface2==="pink"?C.pink:C.muted}}>
                          {exs.slice(0,2).map(e=>e.name).join(", ")}{exs.length>2?` +${exs.length-2} more`:""}
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{display:"flex",gap:6,flexShrink:0,alignItems:"center"}}>
                    <button onClick={(e)=>{e.stopPropagation();setEditProg(prog);}} style={{background:`${C.cyan}22`,border:`1px solid ${C.cyan}55`,borderRadius:6,padding:"5px 10px",color:C.cyan,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Edit</button>
                    <button onClick={(e)=>handleDelete(prog,e)} style={{background:"rgba(255,255,255,0.06)",border:`1px solid ${C.border}`,borderRadius:6,padding:"5px 10px",color:C.pink,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Delete</button>
                  </div>
                </div>
              </Card>
            );
          })
        }
      </div>

      {/* Program editor modal */}
      {editProg&&(
        <ProgramEditorModal
          prog={programs.find(p=>p.id===editProg.id)||editProg}
          trainerId={trainerId}
          token={token}
          onClose={()=>setEditProg(null)}
          onUpdate={handleUpdate}
        />
      )}

      {/* Exercise library sheet */}
      {showLib&&<LibrarySheet trainerId={trainerId} onClose={()=>setShowLib(false)}/>}
      <UaToast toast={progToast}/>
      <UaConfirm dialog={delDlg} setDialog={setDelDlg}/>
    </div>
  );
};

// ── App Root ──
export default function App(){
  const [auth,setAuth]=useState({loading:true,token:null,userId:null,profile:null});
  const [clients,setClients]=useState([]);
  const [screen,setScreen]=useState("today");
  const [selClient,setSel]=useState(null);
  const [scheduleBadge,setScheduleBadge]=useState(0);
  const [trainerNotifs,setTrainerNotifs]=useState([]);
  const [showNotifPanel,setShowNotifPanel]=useState(false);
  // Pull-to-refresh
  const [ptrY,setPtrY]=useState(0);
  const [ptrActive,setPtrActive]=useState(false);
  const [refreshing,setRefreshing]=useState(false);
  const ptrStartY=useRef(null);
  const rtToastTimer=useRef(null);
  const [rtToast,setRtToast]=useState(null);
  const [cancelReqModal,setCancelReqModal]=useState(null); // pending cancel request to show modal for
  const [cancelReqActing,setCancelReqActing]=useState(false);
  const [slotReqBanner,setSlotReqBanner]=useState(null); // slot_request popup banner
  const slotBannerTimer=useRef(null);
  const showRtToast=(msg)=>{
    clearTimeout(rtToastTimer.current);
    setRtToast(msg);
    rtToastTimer.current=setTimeout(()=>setRtToast(null),4000);
  };
  // Remove all cancel_request notifications from panel after resolving
  const cleanCancelReqNotifs=()=>{
    setTrainerNotifs(prev=>prev.filter(n=>n.type!=="cancel_request"));
    dbDelete("notifications",`client_id=eq.${auth.userId}&type=eq.cancel_request`,auth.token).catch(()=>{});
  };
  const handleCancelReqAccept=async(r)=>{
    setCancelReqActing(true);
    try{
      const label=`${fmtDate(r.book_date)} at ${toTime(r.start_time_min)}`;
      await resolveCancelReq(r.id,"accepted",auth.token).catch(()=>{});
      // Pass booking info in the notification payload so the server cancels it
      // using the service key (bypasses all RLS — 100% reliable)
      await postNotification({
        client_id:r.client_id,
        type:"cancel_accepted",
        message:`Your cancellation for ${label} was approved. You can rebook anytime.`,
        booking_id:r.booking_id||null,
        booking_client_id:r.client_id,
        booking_date:r.book_date,
        cancel_req_id:r.id,
      },auth.token).catch(()=>{});
      cleanCancelReqNotifs();
      setCancelReqModal(null);
      showRtToast("✓ Cancellation approved");
    }catch(e){ showRtToast("Error: "+e.message); }
    setCancelReqActing(false);
  };
  const handleCancelReqDecline=async(r)=>{
    setCancelReqActing(true);
    try{
      const label=`${fmtDate(r.book_date)} at ${toTime(r.start_time_min)}`;
      await resolveCancelReq(r.id,"declined",auth.token).catch(()=>{});
      await postNotification({client_id:r.client_id,type:"cancel_declined",message:`Your cancellation request for ${label} was declined. Please contact your trainer.`,cancel_req_id:r.id},auth.token).catch(()=>{});
      cleanCancelReqNotifs();
      setCancelReqModal(null);
      showRtToast("Request declined");
    }catch(e){ showRtToast("Error: "+e.message); }
    setCancelReqActing(false);
  };
  const handleDecideCancelReq=()=>{
    dbGet("cancel_requests",`trainer_id=eq.${auth.userId}&status=eq.pending&order=created_at.asc`,auth.token)
      .then(rows=>{
        if(!rows||!rows.length) return showRtToast("No pending requests");
        const r=rows[0];
        const client=clients.find(c=>c.id===r.client_id);
        setCancelReqModal({...r,_clientName:client?.name||"Client"});
      }).catch(e=>showRtToast("Error: "+e.message));
  };

  // Poll pending custom-time requests at app level every 60s so badge updates
  // regardless of which screen the trainer is on.
  useEffect(()=>{
    if(!auth.token) return;
    const poll=()=>getPendingRequests(auth.token).then(r=>setScheduleBadge(r?.length||0)).catch(()=>{});
    poll();
    const t=setInterval(poll,60000);
    return ()=>clearInterval(t);
  },[auth.token]);

  // Poll trainer's own notifications every 60s for badge count
  useEffect(()=>{
    if(!auth.token||!auth.userId) return;
    const poll=()=>getTrainerNotifications(auth.userId,auth.token).then(r=>setTrainerNotifs(r||[])).catch(()=>{});
    poll();
    const t=setInterval(poll,60000);
    return ()=>clearInterval(t);
  },[auth.token,auth.userId]);

  // ── Supabase Realtime — live updates while trainer app is open ──
  useEffect(()=>{
    if(!auth.token||!auth.userId) return;
    const rt=makeRealtime(SB_URL,SB_KEY);

    // New client profile (INSERT) → refresh clients list
    rt.subscribe('profiles','INSERT',null,(row)=>{
      if(row.role==='client'){
        showRtToast(`🆕 New client registered: ${row.name||row.email||"Unknown"}`);
        loadData(auth.token,auth.userId).catch(()=>{});
      }
    });

    // New notification for trainer → update bell badge
    rt.subscribe('notifications','INSERT',`client_id=eq.${auth.userId}`,(row)=>{
      setTrainerNotifs(prev=>prev.some(n=>n.id===row.id)?prev:[row,...prev]);
      if(row.type==='slot_request'){
        // Show sticky banner with link to Schedule
        clearTimeout(slotBannerTimer.current);
        setSlotReqBanner(row.message);
        slotBannerTimer.current=setTimeout(()=>setSlotReqBanner(null),10000);
      } else if(row.type!=='cancel_request'){
        showRtToast(row.message);
      }
    });

    // Cancel requests → show modal immediately wherever trainer is
    rt.subscribe('cancel_requests','INSERT',`trainer_id=eq.${auth.userId}`,(row)=>{
      // Fetch client name from clients list or profiles
      getClients(auth.token).then(allClients=>{
        const client=allClients?.find(c=>c.id===row.client_id);
        setCancelReqModal({...row,_clientName:client?.name||"Client"});
      }).catch(()=>setCancelReqModal({...row,_clientName:"Client"}));
    });

    // Bookings changes → refresh today's schedule view
    rt.subscribe('bookings','*',null,(row)=>{
      // Trigger a lightweight refresh of client list to keep pkg counts updated
      getClients(auth.token).then(allClients=>{
        setClients(prev=>prev.map(c=>{ const fresh=allClients?.find(a=>a.id===c.id); return fresh?{...fresh,_pkg:c._pkg}:c; }));
      }).catch(()=>{});
    });

    // Package changes → update client's pkg in list
    rt.subscribe('packages','*',null,(row)=>{
      setClients(prev=>prev.map(c=>{
        if(c.id!==row.client_id) return c;
        return {...c,_pkg:row.is_active?row:null};
      }));
    });

    rt.connect(auth.token);
    return ()=>{ rt.disconnect(); clearTimeout(rtToastTimer.current); };
  },[auth.token,auth.userId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(()=>{
    const init=async()=>{
      try{
        const saved=localStorage.getItem(UA_TRAINER_AUTH_KEY);
        if(saved){
          const {token,userId,expiresAt,refreshToken}=JSON.parse(saved);
          if(Date.now()<expiresAt*1000){ await loadData(token,userId); return; }
          // Token expired — try silent refresh
          if(refreshToken){
            const data=await rawRefresh(refreshToken);
            if(data?.access_token){
              localStorage.setItem(UA_TRAINER_AUTH_KEY,JSON.stringify({token:data.access_token,userId,expiresAt:data.expires_at,refreshToken:data.refresh_token||refreshToken}));
              await loadData(data.access_token,userId); return;
            }
          }
        }
      }catch(e){}
      setAuth(p=>({...p,loading:false}));
    };
    init();
  },[]);

  const loadData=async(token,userId)=>{
    try{
      const [profile,allClients,pkgs]=await Promise.all([getProfile(userId,token),getClients(token),getAllPkgs(token)]);
      if(profile?.role!=="trainer"){ localStorage.removeItem(UA_TRAINER_AUTH_KEY); setAuth({loading:false,token:null,userId:null,profile:null}); return; }
      // Auto-deactivate packages whose end_date has passed
      const today=todayISO();
      const expiredPkgs=(pkgs||[]).filter(p=>p.end_date&&p.end_date<today);
      if(expiredPkgs.length>0){
        await Promise.allSettled(expiredPkgs.map(p=>dbPatch("packages",`id=eq.${p.id}`,{is_active:false},token)));
      }
      const activePkgIds=new Set(expiredPkgs.map(p=>p.id));
      const enriched=(allClients||[]).map(c=>({...c,_pkg:(pkgs||[]).find(p=>p.client_id===c.id&&!activePkgIds.has(p.id))||null}));
      setClients(enriched);
      setAuth({loading:false,token,userId,profile});
      // Load trainer's notifications
      getTrainerNotifications(userId,token).then(r=>setTrainerNotifs(r||[])).catch(()=>{});
      // Auto-popup any pending cancel request created in the last 3 days
      const cutoff=new Date(Date.now()-3*24*3600*1000).toISOString();
      dbGet("cancel_requests",`trainer_id=eq.${userId}&status=eq.pending&created_at=gte.${cutoff}&order=created_at.asc`,token)
        .then(rows=>{
          if(!rows||!rows.length) return;
          const r=rows[0];
          const client=(enriched||[]).find(c=>c.id===r.client_id);
          setCancelReqModal({...r,_clientName:client?.name||"Client"});
        }).catch(()=>{});
      // Register push notifications for trainer
      registerTrainerPush(userId,token).catch(()=>{});
    }catch(e){ setAuth(p=>({...p,loading:false})); }
  };

  const registerTrainerPush=async(userId,token)=>{
    if(!('serviceWorker' in navigator)||!('PushManager' in window)) return;
    try{
      const reg=await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      let sub=await reg.pushManager.getSubscription();
      if(!sub){ if(Notification.permission==="default") await Notification.requestPermission(); if(Notification.permission!=="granted") return; }
      sub=sub||await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlBase64ToUint8Array(VAPID_PUBLIC_KEY)});
      await savePushSub(userId,sub.toJSON(),token);
    }catch(e){ console.log('[Trainer Push] registration failed',e); }
  };

  const handleLogin=async(email,pw)=>{
    const data=await authLogin(email,pw);
    if(data.error) throw new Error(data.error_description||data.error);
    const {access_token,expires_at,user}=data;
    const profile=await getProfile(user.id,access_token).catch(()=>null);
    if(profile?.role!=="trainer") throw new Error("NOT_TRAINER");
    localStorage.setItem(UA_TRAINER_AUTH_KEY,JSON.stringify({token:access_token,userId:user.id,expiresAt:expires_at,refreshToken:data.refresh_token}));
    await loadData(access_token,user.id);
  };

  const handleLogout=async()=>{
    try{ await authLogout(auth.token); }catch(e){}
    localStorage.removeItem(UA_TRAINER_AUTH_KEY);
    setAuth({loading:false,token:null,userId:null,profile:null});
    setClients([]); setScreen("today"); setSel(null);
  };

  const handleNav=(s)=>{ setScreen(s); setSel(null); };
  const handleClientUpdated=(updated)=>{ setClients(p=>p.map(c=>c.id===updated.id?updated:c)); setSel(updated); };

  if(auth.loading) return(<div className="ua-app" style={{fontFamily:"'Inter',-apple-system,sans-serif"}}><Spinner size={88} fullscreen/></div>);

  if(!auth.token) return(<div className="ua-app" style={{fontFamily:"'Inter',-apple-system,sans-serif",background:C.bg,minHeight:"100vh"}}><LoginScreen onLogin={handleLogin}/></div>);

  const renderScreen=()=>{
    if(selClient) return <ClientDetail client={selClient} trainerId={auth.userId} token={auth.token} onBack={()=>setSel(null)} onClientUpdated={handleClientUpdated}/>;
    switch(screen){
      case "today":    return <TodayScreen trainerName={auth.profile?.name} trainerId={auth.userId} token={auth.token} clients={clients} onViewClient={c=>{setSel(c);setScreen("clients");}} onTrainerNameUpdated={name=>setAuth(p=>({...p,profile:{...p.profile,name}}))} notifCount={trainerNotifs.length} onOpenNotif={()=>setShowNotifPanel(true)}/>;
      case "clients":  return <ClientsScreen clients={clients} onViewClient={setSel}/>;
      case "schedule": return <ScheduleScreen trainerId={auth.userId} token={auth.token} onPendingChange={setScheduleBadge} clients={clients} onViewClient={c=>{setSel(c);setScreen("clients");}}/>;
      case "programs": return <ProgramsScreen trainerId={auth.userId} token={auth.token}/>;
      default: return null;
    }
  };

  const handlePtrStart=(e)=>{
    if(refreshing) return;
    const el=e.currentTarget;
    if(el.scrollTop>0) return;
    ptrStartY.current=e.touches[0].clientY;
  };
  const handlePtrMove=(e)=>{
    if(ptrStartY.current==null||refreshing) return;
    const dy=e.touches[0].clientY-ptrStartY.current;
    if(dy<0){ ptrStartY.current=null; setPtrY(0); setPtrActive(false); return; }
    const capped=Math.min(dy*0.45,60);
    setPtrY(capped);
    setPtrActive(capped>30);
    if(capped>5) e.preventDefault();
  };
  const handlePtrEnd=async()=>{
    if(ptrActive&&auth.token&&auth.userId){
      setRefreshing(true);
      await loadData(auth.token,auth.userId).catch(()=>{});
      setRefreshing(false);
    }
    ptrStartY.current=null;
    setPtrY(0);
    setPtrActive(false);
  };

  return(
    <>
      <div
        className="ua-app"
        style={{fontFamily:"'Inter',-apple-system,sans-serif",background:C.bg,minHeight:"100vh",overflowY:"auto",position:"relative"}}
        onTouchStart={handlePtrStart}
        onTouchMove={handlePtrMove}
        onTouchEnd={handlePtrEnd}
      >
        {/* Pull-to-refresh indicator */}
        {(ptrY>0||refreshing)&&(
          <div style={{position:"fixed",top:0,left:0,right:0,zIndex:700,display:"flex",justifyContent:"center",transition:"opacity .2s",opacity:ptrY>10||refreshing?1:0}}>
            <div style={{background:C.surface,border:`1px solid ${C.cyan}44`,borderRadius:"0 0 16px 16px",padding:"6px 18px 10px",display:"flex",alignItems:"center",gap:8,boxShadow:"0 4px 18px rgba(0,0,0,0.4)",transform:`translateY(${refreshing?0:ptrY-10}px)`,transition:refreshing?"none":"transform .05s"}}>
              {refreshing
                ?<div style={{width:16,height:16,borderRadius:"50%",border:`2px solid ${C.cyan}`,borderTopColor:"transparent",animation:"ua-spin .8s linear infinite"}}/>
                :<div style={{width:16,height:16,borderRadius:"50%",border:`2px solid ${C.cyan}55`,borderTopColor:C.cyan,transform:`rotate(${ptrY*3}deg)`,transition:"transform .05s"}}/>
              }
              <span style={{color:C.cyan,fontSize:12,fontWeight:700}}>{refreshing?"Refreshing…":ptrActive?"Release to refresh":"Pull to refresh"}</span>
            </div>
          </div>
        )}
        {/* Realtime top toast */}
        {rtToast&&(
          <div style={{position:'fixed',top:18,left:'50%',transform:'translateX(-50%)',background:C.surface,border:`1px solid ${C.cyan}55`,color:C.white,padding:'10px 18px',borderRadius:14,zIndex:650,fontWeight:700,fontSize:13,boxShadow:'0 6px 28px rgba(0,0,0,0.55)',display:'flex',alignItems:'center',gap:8,maxWidth:'calc(100vw - 32px)',pointerEvents:'none'}}>
            <span style={{fontSize:16}}>🔔</span>
            <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{rtToast}</span>
          </div>
        )}
        {renderScreen()}
      </div>
      <BottomNav active={screen} onNav={handleNav} scheduleBadge={scheduleBadge}/>
      {showNotifPanel&&<TrainerNotifPanel userId={auth.userId} token={auth.token} count={trainerNotifs.length} onDecideCancelReq={handleDecideCancelReq} onClose={()=>{setShowNotifPanel(false);getTrainerNotifications(auth.userId,auth.token).then(r=>setTrainerNotifs(r||[])).catch(()=>{});}}/>}
      {/* Cancel Request Modal — pops up wherever trainer is */}
      {cancelReqModal&&(
        <div style={{position:"fixed",inset:0,zIndex:900,display:"flex",alignItems:"flex-end",justifyContent:"center",background:"rgba(0,0,0,0.65)"}} onClick={e=>{if(e.target===e.currentTarget)setCancelReqModal(null);}}>
          <div style={{background:C.surface,borderRadius:"20px 20px 0 0",padding:"24px 20px 40px",width:"100%",maxWidth:480,boxShadow:"0 -8px 40px rgba(0,0,0,0.6)"}}>
            <div style={{width:40,height:4,borderRadius:2,background:C.border,margin:"0 auto 20px"}}/>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
              <div style={{width:44,height:44,borderRadius:12,background:C.amber+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>⚠️</div>
              <div>
                <div style={{color:C.white,fontSize:16,fontWeight:800}}>Cancellation Request</div>
                <div style={{color:C.muted,fontSize:12,marginTop:2}}>Within 48 hours of session</div>
              </div>
            </div>
            <div style={{background:C.surface2,borderRadius:12,padding:"14px 16px",marginBottom:20}}>
              <div style={{color:C.white,fontSize:15,fontWeight:700,marginBottom:4}}>{cancelReqModal._clientName}</div>
              <div style={{color:C.amber,fontSize:13,fontWeight:700}}>{new Date(cancelReqModal.book_date+"T12:00:00").toLocaleDateString("en-GB",{weekday:"short"})}, {fmtDate(cancelReqModal.book_date)} · {toTime(cancelReqModal.start_time_min)}</div>
              {cancelReqModal.message&&<div style={{color:C.muted,fontSize:12,marginTop:8,lineHeight:1.5}}>"{cancelReqModal.message}"</div>}
            </div>
            <div style={{display:"flex",gap:10}}>
              <button
                onClick={()=>handleCancelReqDecline(cancelReqModal)}
                disabled={cancelReqActing}
                style={{flex:1,background:C.pink+"22",border:`1px solid ${C.pink}44`,borderRadius:12,padding:"14px",color:C.pink,fontSize:14,fontWeight:800,cursor:"pointer",fontFamily:"inherit",opacity:cancelReqActing?0.6:1}}
              >✕ Decline</button>
              <button
                onClick={()=>handleCancelReqAccept(cancelReqModal)}
                disabled={cancelReqActing}
                style={{flex:1,background:C.green+"22",border:`1px solid ${C.green}44`,borderRadius:12,padding:"14px",color:C.green,fontSize:14,fontWeight:800,cursor:"pointer",fontFamily:"inherit",opacity:cancelReqActing?0.6:1}}
              >{cancelReqActing?"…":"✓ Approve"}</button>
            </div>
          </div>
        </div>
      )}
      {/* Slot Request Banner — tappable, navigates to Schedule */}
      {slotReqBanner&&(
        <div onClick={()=>{setSlotReqBanner(null);handleNav("schedule");}} style={{position:"fixed",top:0,left:0,right:0,zIndex:950,background:C.surface,borderBottom:`2px solid ${C.cyan}`,padding:"14px 16px",display:"flex",alignItems:"center",gap:12,cursor:"pointer",boxShadow:"0 4px 24px rgba(0,0,0,0.5)"}}>
          <span style={{fontSize:22,flexShrink:0}}>🕐</span>
          <div style={{flex:1,minWidth:0}}>
            <div style={{color:C.cyan,fontSize:12,fontWeight:800,marginBottom:2}}>ΑΙΤΗΜΑ ΑΛΛΑΓΗΣ ΩΡΑΣ</div>
            <div style={{color:C.white,fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{slotReqBanner}</div>
          </div>
          <div style={{color:C.cyan,fontSize:20,fontWeight:700,flexShrink:0}}>›</div>
          <button onClick={e=>{e.stopPropagation();setSlotReqBanner(null);}} style={{background:"none",border:"none",color:C.muted,fontSize:16,cursor:"pointer",padding:"2px 4px",flexShrink:0}}>✕</button>
        </div>
      )}
    </>
  );
}
