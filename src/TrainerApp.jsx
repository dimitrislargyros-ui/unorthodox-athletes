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
    .ua-btn-grad{transition:transform .18s cubic-bezier(.22,1,.36,1),box-shadow .18s ease}
    .ua-btn-grad:not(:disabled):hover{transform:translateY(-2px);box-shadow:0 8px 28px rgba(0,201,225,.35)}
    .ua-btn-grad:not(:disabled):active{transform:translateY(0) scale(.97)}
    .ua-btn-ghost{transition:background .18s ease,border-color .18s ease}
    .ua-btn-ghost:not(:disabled):hover{background:rgba(0,201,225,.15)!important}
    .ua-card-glass{backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
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

const sb = async (path,method="GET",body=null,token=null,prefer="return=representation") => {
  const res = await fetch(`${SB_URL}${path}`,{method,headers:{"apikey":SB_KEY,"Authorization":`Bearer ${token||SB_KEY}`,"Content-Type":"application/json","Prefer":prefer},body:body?JSON.stringify(body):undefined});
  if(!res.ok){
    if(res.status===401||res.status===403){ localStorage.removeItem("ua_trainer_auth"); window.location.reload(); return; }
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
const findActiveSlot      = (trainerId,dow,startMin,tk) => dbGet("schedule_slots",`trainer_id=eq.${trainerId}&day_of_week=eq.${dow}&start_time_min=eq.${startMin}&is_active=eq.true`,tk).then(r=>r?.[0]||null);
const getSlotBookCount    = (slotId,date,tk)    => dbGet("bookings",`slot_id=eq.${slotId}&book_date=eq.${date}&status=eq.booked&select=id`,tk).then(r=>r?.length||0);
const createBooking       = (d,tk)              => dbPost("bookings",d,tk);
const cancelBookingRow    = (id,tk)              => dbPatch("bookings",`id=eq.${id}`,{status:"cancelled"},tk);
const cancelSessionRow    = (id,tk)              => dbPatch("sessions",`id=eq.${id}`,{status:"cancelled"},tk);
const decrementPkgUsed    = (pkgId,currentUsed,tk)=> dbPatch("packages",`id=eq.${pkgId}`,{sessions_used:Math.max((currentUsed||0)-1,0)},tk);
const postNotification    = (d,tk)              => dbPost("notifications",d,tk);

// ── Schedule periods ──
const getAllPeriods      = (tk)             => dbGet("schedule_periods","order=start_date.desc",tk);
const createPeriod       = (d,tk)           => dbPost("schedule_periods",d,tk);
const deletePeriodRow    = (id,tk)          => dbDelete("schedule_periods",`id=eq.${id}`,tk);
const getPeriodSlots     = (periodId,tk)    => dbGet("period_slots",`period_id=eq.${periodId}`,tk);
const getAllSlotsForDay  = (dow,tk)         => dbGet("schedule_slots",`day_of_week=eq.${dow}&order=start_time_min.asc`,tk);
const addPeriodSlot      = (d,tk)           => dbPost("period_slots",d,tk);
const removePeriodSlotRow= (id,tk)          => dbDelete("period_slots",`id=eq.${id}`,tk);

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
  const all = await dbGet("sessions", `client_id=eq.${clientId}&session_date=lte.${date}`, tk).catch(()=>[]);
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
const Logo=({size=48})=>(<img src={LOGO_SRC} alt="UA" style={{width:size,height:size,borderRadius:"50%",objectFit:"contain",background:"#000",flexShrink:0}}/>);
const SL=({children,style={}})=>(<div style={{color:C.muted,fontSize:10,fontWeight:700,letterSpacing:1.8,textTransform:"uppercase",marginBottom:10,fontFamily:"'Oswald',sans-serif",...style}}>{children}</div>);
const Card=({children,style={},glow})=>(<div className="ua-card-glass" style={{background:"rgba(22,22,22,0.72)",borderRadius:14,padding:"16px",border:`1px solid ${glow?glow+"55":C.border}`,...style}}>{children}</div>);
const GBtn=({label,onClick,style={},sm,ghost,color,disabled})=>{
  const base={borderRadius:sm?8:12,cursor:disabled?"not-allowed":"pointer",padding:sm?"8px 14px":"15px",fontWeight:800,fontSize:sm?13:15,fontFamily:"inherit",opacity:disabled?.5:1,...style};
  if(ghost) return <button onClick={onClick} disabled={disabled} className="ua-btn-ghost" style={{...base,background:(color||C.cyan)+"20",border:`1px solid ${color||C.cyan}55`,color:color||C.cyan}}>{label}</button>;
  return <button onClick={onClick} disabled={disabled} className="ua-btn-grad" style={{...base,background:`linear-gradient(135deg,${C.cyan},${C.pink})`,border:"none",color:C.white}}>{label}</button>;
};
const Avatar=({initials,size=44,avatarUrl})=>(avatarUrl?<img src={avatarUrl} style={{width:size,height:size,borderRadius:"50%",objectFit:"cover",flexShrink:0}} alt="av"/>:<div style={{width:size,height:size,borderRadius:"50%",background:`linear-gradient(135deg,${C.cyan}55,${C.pink}55)`,display:"flex",alignItems:"center",justifyContent:"center",color:C.white,fontWeight:800,fontSize:size*0.3,flexShrink:0}}>{initials||"?"}</div>);
const Spinner=()=>(<div style={{display:"flex",justifyContent:"center",padding:"32px"}}><div style={{width:26,height:26,borderRadius:"50%",border:`3px solid ${C.border}`,borderTopColor:C.pink,animation:"ua-spin 0.8s linear infinite"}}/></div>);
const Empty=({msg})=>(<div style={{textAlign:"center",padding:"28px 16px",color:C.muted,fontSize:14}}>{msg}</div>);
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
const BottomNav=({active,onNav,scheduleBadge=0})=>(<div className="ua-app" style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",background:"rgba(10,10,10,0.85)",backdropFilter:"blur(20px) saturate(180%)",WebkitBackdropFilter:"blur(20px) saturate(180%)",borderTop:"1px solid rgba(255,255,255,0.07)",display:"flex",justifyContent:"space-around",padding:"10px 0 24px",zIndex:100}}>{[{id:"today",l:"Today",i:"◈"},{id:"clients",l:"Clients",i:"◉"},{id:"schedule",l:"Schedule",i:"◫"},{id:"programs",l:"Programs",i:"▦"}].map(t=>(<button key={t.id} onClick={()=>onNav(t.id)} style={{background:"none",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:5,color:active===t.id?C.pink:C.muted,padding:"0 10px"}}><div style={{position:"relative",display:"inline-flex",alignItems:"center",justifyContent:"center"}}><span style={{fontSize:20}}>{t.i}</span>{t.id==="schedule"&&scheduleBadge>0&&<span style={{position:"absolute",top:-4,right:-6,background:C.pink,borderRadius:"50%",width:8,height:8,display:"block"}}/>}</div><span style={{fontSize:10,fontWeight:700,letterSpacing:0.5}}>{t.l}</span></button>))}</div>);

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
  const dn=session.day_num;

  useEffect(()=>{ getTemplates(trainerId,token).then(r=>setTemplates(r||[])).catch(()=>{}); },[]);

  const addEx=()=>{ if(!newEx.name) return; setExs(p=>[...p,{...newEx}]); setNewEx({name:"",sets:"",reps:"",weight:""}); setShowAdd(false); };

  const handleSaveTemplate=async()=>{
    if(exs.length===0) return;
    const name=window.prompt("Template name:");
    if(!name||!name.trim()) return;
    setSavingTemplate(true);
    try{
      const res=await createTemplate({trainer_id:trainerId,name:name.trim(),exercises:exs},token);
      const created=Array.isArray(res)?res[0]:res;
      if(created) setTemplates(p=>[...p,created].sort((a,b)=>a.name.localeCompare(b.name)));
    }catch(e){ alert("Error: "+e.message); }
    setSavingTemplate(false);
  };

  const handleLoadTemplate=(tpl)=>{
    if(exs.length>0&&!window.confirm(`Replace current exercise list with "${tpl.name}"?`)) return;
    setExs(tpl.exercises||[]);
    setShowTemplates(false);
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
    }catch(e){ alert("Error: "+e.message); }
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
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"40px 28px"}}>
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:16,marginBottom:36}}>
        <Logo size={110}/>
        <div style={{textAlign:"center"}}>
          <div style={{color:C.white,fontSize:26,fontWeight:900,letterSpacing:3,textTransform:"uppercase",lineHeight:1,fontFamily:"'Oswald',sans-serif"}}>UNORTHODOX</div>
          <div style={{fontSize:26,fontWeight:900,letterSpacing:3,textTransform:"uppercase",lineHeight:1,background:`linear-gradient(90deg,${C.cyan},${C.pink})`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",fontFamily:"'Oswald',sans-serif"}}>ATHLETES</div>
          <div style={{color:C.muted,fontSize:11,letterSpacing:3,marginTop:8,textTransform:"uppercase",fontFamily:"'Oswald',sans-serif"}}>Think · Perform · Develop</div>
        </div>
        <div style={{background:C.pink+"22",border:`1px solid ${C.pink}55`,borderRadius:20,padding:"5px 16px",color:C.pink,fontSize:12,fontWeight:700,letterSpacing:1}}>TRAINER PORTAL</div>
      </div>
      <div style={{width:"100%",maxWidth:320,display:"flex",flexDirection:"column",gap:12}}>
        <input style={inp} placeholder="Trainer email" value={email} onChange={e=>setE(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handle()}/>
        <input style={inp} type="password" placeholder="Password" value={pw} onChange={e=>setPw(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handle()}/>
        {err&&<div style={{color:C.pink,fontSize:13,textAlign:"center"}}>{err}</div>}
        <GBtn label={loading?"Entering...":"Enter →"} onClick={handle} disabled={loading} style={{marginTop:4,width:"100%"}}/>
        <a href="/reset-password" style={{background:"none",border:"none",color:C.muted,fontSize:13,fontFamily:"inherit",textAlign:"center",width:"100%",textDecoration:"none"}}>Forgot password?</a>
      </div>
    </div>
  );
};

// ── Today ──
const TodayScreen=({trainerName,trainerId,token,clients,onViewClient})=>{
  const [sessions,setSessions]=useState([]);
  const [loading,setLoad]=useState(true);
  const [announcements,setAnn]=useState([]);
  const [showAnnForm,setShowAnnForm]=useState(false);
  const [annTitle,setAnnTitle]=useState("");
  const [annBody,setAnnBody]=useState("");
  const [annPosting,setAnnPosting]=useState(false);
  const [dismissedSetup,setDismissedSetup]=useState(()=>new Set(JSON.parse(localStorage.getItem("ua_dismissed_setup")||"[]")));

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
      setAnnTitle(""); setAnnBody(""); setShowAnnForm(false);
    }catch(e){ alert("Error: "+e.message); }
    setAnnPosting(false);
  };

  const handleDeleteAnn=async(a)=>{
    if(!window.confirm("Delete this announcement?")) return;
    try{ await deleteAnnouncement(a.id,token); setAnn(p=>p.filter(x=>x.id!==a.id)); }
    catch(e){ alert("Error: "+e.message); }
  };

  return(
    <div style={{paddingBottom:80}}>
      <div style={{padding:"22px 20px 0",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div><div style={{color:C.muted,fontSize:13}}>{todayStr}</div><div style={{color:C.white,fontSize:22,fontWeight:800,fontFamily:"'Oswald',sans-serif"}}>{trainerName||"Coach"}</div></div>
        <Logo size={44}/>
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
const MonthlyReportModal=({client,timeline,statusMap,pkg,prs,spw,onClose})=>{
  const now=new Date();
  const monthStr=localISO(now).slice(0,7);
  const monthLabel=now.toLocaleDateString("en-US",{month:"long",year:"numeric"});
  const monthItems=timeline.filter(t=>t._type!=="booking"&&statusMap[t.id]==="completed"&&t.session_date?.slice(0,7)===monthStr);
  const weeksElapsed=Math.max(1,Math.ceil(now.getDate()/7));
  const perWeekAvg=(monthItems.length/weeksElapsed).toFixed(1);
  const dayBreakdown={};
  monthItems.forEach(t=>{ dayBreakdown[t._dayNum]=(dayBreakdown[t._dayNum]||0)+1; });
  const monthPRs=(prs||[]).filter(p=>p.record_date?.slice(0,7)===monthStr);
  const ratings=monthItems.map(t=>firstNote(t.session_notes)?.rating).filter(r=>r!=null);
  const avgRating=ratings.length?(ratings.reduce((a,b)=>a+b,0)/ratings.length):null;

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
            <div style={{color:C.muted,fontSize:13,marginTop:2}}>{client.name} · {monthLabel}</div>
          </div>
          <button onClick={onClose} style={{background:C.surface2,border:`1px solid ${C.border}`,borderRadius:8,padding:"6px 12px",color:C.muted,cursor:"pointer",fontFamily:"inherit"}}>✕</button>
        </div>
        <Row label="Sessions completed this month" value={monthItems.length}/>
        <Row label="Sessions per week (avg)" value={perWeekAvg}/>
        <Row label="Package usage" value={pkg?`${pkg.sessions_used} of ${pkg.sessions_total}`:"No active package"}/>
        <Row label="PRs set this month" value={monthPRs.length}/>
        <Row label="Average session rating" value={avgRating?`★ ${avgRating.toFixed(1)}`:"No ratings yet"}/>
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
  const [loading,setLoad]=useState(true);
  const [activeSession,setAS]=useState(null);
  const [showReport,setShowReport]=useState(false);
  const [prs,setPrs]=useState(null);
  const [showPkg,setShowPkg]=useState(false);
  const [showLog,setShowLog]=useState(false);
  const [newPkgTotal,setNPT]=useState("10");
  const [newSpw,setNSpw]=useState("3");
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
  const spw=pkg?.sessions_per_week||3;
  const left=pkg?(pkg.sessions_total-pkg.sessions_used):null;
  const ratings=sessions.map(s=>firstNote(s.session_notes)?.rating).filter(r=>r!=null);
  const avgRating=ratings.length?(ratings.reduce((a,b)=>a+b,0)/ratings.length):null;

  useEffect(()=>{
    Promise.all([getClientSess(client.id,token), getClientBooks(client.id,token)])
      .then(([s,b])=>{ setSessions(s||[]); setClientBooks(b||[]); })
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

  const handleCreateProgramInline=async(setter)=>{
    const name=window.prompt("New program name:");
    if(!name||!name.trim()) return;
    try{
      const res=await createTemplate({trainer_id:trainerId,name:name.trim(),exercises:[]},token);
      const created=Array.isArray(res)?res[0]:res;
      if(created){ setPrograms(p=>[...p,created].sort((a,b)=>a.name.localeCompare(b.name))); setter(created.id); }
    }catch(e){ alert("Error: "+e.message); }
  };

  useEffect(()=>{
    if(!showLog) return;
    const d=new Date(logDate+"T12:00:00"); const dow=d.getDay()===0?6:d.getDay()-1;
    getSlots(dow,token).then(r=>{ const sl=r||[]; setLogSlots(sl); if(sl.length>0) setLogTime(sl[0].start_time_min); }).catch(()=>setLogSlots([]));
    if(pkg) calcDayNum(client.id,logDate,token,spw).then(dn=>setLogDayNum(dn)).catch(()=>{});
  },[logDate,showLog]);

  const handleRenew=async()=>{
    try{
      await deactivatePkgs(client.id,token);
      const end=new Date(); end.setDate(end.getDate()+35);
      const res=await createPkg({client_id:client.id,sessions_total:parseInt(newPkgTotal),sessions_used:0,sessions_per_week:parseInt(newSpw),weeks:5,start_date:todayISO(),end_date:localISO(end),has_injury:hasInjury,injury_notes:injuryNotes,package_notes:pkgNotes,program_id:newPkgProgramId||null},token);
      const created=Array.isArray(res)?res[0]:res;
      created.workout_templates=programs.find(p=>p.id===newPkgProgramId)||null;
      setPkg(created); setShowPkg(false);
      onClientUpdated({...client,_pkg:created});
      await postNotification({client_id:client.id,type:"package_renewed",message:`Your package was renewed: ${newPkgTotal} sessions · ${newSpw}x/week.`},token).catch(()=>{});
    }catch(e){ alert("Error: "+e.message); }
  };

  const handleLog=async()=>{
    if(!pkg){ alert("This client has no active package. Assign one first."); return; }
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
        }
      }
      const full={...created,session_notes:[],exercises:[]};
      setSessions(p=>[full,...p]);
      if(status==="completed") setAS(full);
      setShowLog(false);
    }catch(e){ alert("Error: "+e.message); }
    setLogging(false);
  };

  const handleOpenReport=async()=>{
    if(prs===null){ const r=await getClientPRs(client.id,token).catch(()=>[]); setPrs(r||[]); }
    setShowReport(true);
  };

  const handleTogglePaid=async()=>{
    if(!pkg) return;
    const newPaid=!pkg.paid;
    try{
      await dbPatch("packages",`id=eq.${pkg.id}`,{paid:newPaid},token);
      const updPkg={...pkg,paid:newPaid};
      setPkg(updPkg);
      onClientUpdated({...client,_pkg:updPkg});
    }catch(e){ alert("Error: "+e.message); }
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
    }catch(e){ alert("Error: "+e.message); }
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
  timeline.forEach((item,i)=>{ item._sessionNum=i+1; item._dayNum=(i%spw)+1; });
  const statusMap=computeStatusMap(timeline.filter(s=>s.session_date).map(s=>({...s,_key:s.id})),new Date());

  const handleCancelSession=async(item)=>{
    if(!window.confirm("Cancel this session?")) return;
    if(!window.confirm("Are you sure? This cannot be undone.")) return;
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
      await postAnnouncement({title:"Slot Available",body:"A session slot has opened up — check the schedule!"},token).catch(()=>{});
    }catch(e){ alert("Error: "+e.message); }
  };

  return(
    <div style={{paddingBottom:80}}>
      {activeSession&&<SessionEditor session={activeSession} spw={spw} token={token} trainerId={trainerId} onClose={()=>setAS(null)} onSaved={updated=>setSessions(p=>p.map(s=>s.id===updated.id?updated:s))}/>}
      {showReport&&<MonthlyReportModal client={client} timeline={timeline} statusMap={statusMap} pkg={pkg} prs={prs} spw={spw} onClose={()=>setShowReport(false)}/>}

      <div style={{padding:"22px 20px 0",display:"flex",alignItems:"center",gap:12}}>
        <button onClick={onBack} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"8px 12px",color:C.muted,cursor:"pointer",fontSize:13,fontFamily:"inherit"}}>← Back</button>
        <div style={{flex:1}}/><Logo size={36}/>
      </div>

      {/* Client info */}
      <div style={{padding:"16px 20px 0",display:"flex",flexDirection:"column",alignItems:"center",gap:10}}>
        <Avatar initials={client.initials} size={72} avatarUrl={client.avatar_url}/>
        <div style={{textAlign:"center"}}>
          <div style={{color:C.white,fontSize:20,fontWeight:800}}>{client.name}</div>
          <div style={{color:C.muted,fontSize:13,marginTop:3}}>{client.email}</div>
          {client.created_at&&<div style={{color:C.muted,fontSize:12,marginTop:3}}>Member since {fmtMemberSince(client.created_at)}</div>}
        </div>
        <div style={{display:"flex",gap:10}}>
          {[{v:timeline.length,l:"Sessions"},{v:pkg?`${spw}x`:"-",l:"Per Week"},{v:left??"-",l:"Pkg Left",warn:left!=null&&left<=2},{v:avgRating?`★${avgRating.toFixed(1)}`:"-",l:"Avg Rating"}].map(s=>(
            <div key={s.l} style={{background:C.surface,border:`1px solid ${s.warn?C.pink+"44":C.border}`,borderRadius:10,padding:"10px 14px",textAlign:"center",minWidth:60}}>
              <div style={{color:s.warn?C.pink:C.cyan,fontSize:20,fontWeight:900}}>{s.v}</div>
              <div style={{color:C.muted,fontSize:10,fontWeight:600,marginTop:2}}>{s.l}</div>
            </div>
          ))}
        </div>
        <button onClick={handleOpenReport} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"9px 16px",color:C.cyan,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>📊 Monthly Report</button>
      </div>

      {/* Package */}
      <div style={{padding:"14px 20px 0"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <SL style={{marginBottom:0}}>Package</SL>
          <div style={{display:"flex",gap:8}}>
            {pkg&&<button onClick={()=>showEditNotes?setShowEditNotes(false):handleOpenEditNotes()} style={{background:C.surface2,border:`1px solid ${C.border}`,borderRadius:8,padding:"6px 14px",color:C.cyan,fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>{showEditNotes?"▲ Cancel":"✎ Notes"}</button>}
            <button onClick={()=>setShowPkg(p=>!p)} style={{background:`linear-gradient(135deg,${C.cyan},${C.pink})`,border:"none",borderRadius:8,padding:"6px 14px",color:C.white,fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>{showPkg?"▲ Cancel":"↻ Renew"}</button>
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
            <div style={{color:C.muted,fontSize:11,fontWeight:600,marginBottom:6}}>Total Sessions</div>
            <div style={{display:"flex",gap:8,marginBottom:12}}>
              {[8,10,12].map(n=><button key={n} onClick={()=>setNPT(String(n))} style={{flex:1,background:newPkgTotal===String(n)?C.pink+"33":C.surface2,border:`1px solid ${newPkgTotal===String(n)?C.pink:C.border}`,borderRadius:8,padding:"10px",color:newPkgTotal===String(n)?C.pink:C.muted,fontWeight:700,fontSize:14,cursor:"pointer",fontFamily:"inherit"}}>{n}<br/><span style={{fontSize:10}}>sessions</span></button>)}
            </div>
            <div style={{color:C.muted,fontSize:11,fontWeight:600,marginBottom:6}}>Sessions per Week</div>
            <div style={{display:"flex",gap:8,marginBottom:12}}>
              {[1,2,3,4].map(n=><button key={n} onClick={()=>setNSpw(String(n))} style={{flex:1,background:newSpw===String(n)?C.cyan+"33":C.surface2,border:`1px solid ${newSpw===String(n)?C.cyan:C.border}`,borderRadius:8,padding:"10px",color:newSpw===String(n)?C.cyan:C.muted,fontWeight:700,fontSize:14,cursor:"pointer",fontFamily:"inherit"}}>{n}x</button>)}
            </div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderTop:`1px solid ${C.border}`,marginBottom:8}}>
              <span style={{color:C.white,fontSize:14,fontWeight:600}}>⚠️ Injury / Limitation</span>
              <button onClick={()=>setHasInj(p=>!p)} style={{background:hasInjury?C.amber+"33":C.surface2,border:`1px solid ${hasInjury?C.amber:C.border}`,borderRadius:20,padding:"6px 16px",color:hasInjury?C.amber:C.muted,fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>{hasInjury?"Yes ✓":"No"}</button>
            </div>
            {hasInjury&&<input value={injuryNotes} onChange={e=>setInjNotes(e.target.value)} placeholder="Describe the injury..." style={{width:"100%",background:C.surface2,border:`1px solid ${C.amber}55`,borderRadius:8,padding:"10px 12px",color:C.white,fontSize:13,outline:"none",fontFamily:"inherit",boxSizing:"border-box",marginBottom:8}}/>}
            <div style={{color:C.muted,fontSize:11,fontWeight:600,marginBottom:6,marginTop:4}}>Program</div>
            {programPicker(newPkgProgramId,setNewPkgProgramId)}
            <div style={{color:C.muted,fontSize:11,fontWeight:600,marginBottom:6,marginTop:4}}>Training Notes</div>
            <textarea value={pkgNotes} onChange={e=>setPkgNotes(e.target.value)} placeholder="Focus areas, goals..." style={{width:"100%",background:C.surface2,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 12px",color:C.white,fontSize:13,fontFamily:"inherit",resize:"none",height:70,outline:"none",boxSizing:"border-box",lineHeight:1.5,marginBottom:12}}/>
            <GBtn label={`Assign ${newPkgTotal}-Session Pack (${newSpw}x/week)`} onClick={handleRenew} style={{width:"100%"}}/>
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
            <button onClick={handleTogglePaid} style={{marginTop:12,background:pkg.paid?"rgba(0,0,0,0.25)":"rgba(0,0,0,0.4)",border:"none",borderRadius:8,padding:"8px 14px",color:C.bg,fontWeight:800,fontSize:12,cursor:"pointer",fontFamily:"inherit",width:"100%"}}>{pkg.paid?"✓ Paid":"⚠ Unpaid — tap to mark paid"}</button>
          </div>
        ):<Card><Empty msg="No active package"/></Card>}
      </div>

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
        {loading?<Spinner/>:timeline.length===0?<Empty msg="No sessions yet"/>:
          [...timeline].reverse().map((s,i)=>{
            const isBooking=s._type==="booking";
            const badgeStatus=statusMap[s.id];
            const isCancellable=badgeStatus==="upcoming"||badgeStatus==="booked";
            const icon=isBooking?"📅":s._type==="cancelled"?"🚫":s._type==="completed"?"💪":"⏳";
            const iconBg=isBooking?C.amber+"22":s._type==="cancelled"?C.muted+"22":s._type==="completed"?C.cyan+"22":C.pink+"22";
            return(
            <div key={s.id||i} onClick={isBooking?undefined:()=>setAS(s)} style={{width:"100%",background:C.surface,border:`1px solid ${badgeStatus!=="completed"?(isBooking?C.amber+"44":C.cyan+"33"):C.border}`,borderRadius:12,padding:"14px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:isBooking?"default":"pointer",marginBottom:8,textAlign:"left",boxSizing:"border-box"}}>
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
                {isCancellable&&<button onClick={e=>{e.stopPropagation();handleCancelSession(s);}} style={{background:"none",border:"none",color:C.pink,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",padding:0}}>Cancel</button>}
              </div>
            </div>
          );})
        }
      </div>
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
  const todayStr=todayISO();

  useEffect(()=>{
    getPendingRequests(token).then(r=>{ const reqs=r||[]; setPendingReqs(reqs); setReqsLoaded(true); onPendingChange?.(reqs.length); }).catch(()=>setReqsLoaded(true));
    getAllPeriods(token).then(r=>setPeriods(r||[])).catch(()=>{}).finally(()=>setPeriodsLoaded(true));
  },[]);

  useEffect(()=>{
    if(!expandedPeriod) return;
    getAllSlotsForDay(periodDayIdx,token).then(r=>setPeriodDaySlots(r||[])).catch(()=>setPeriodDaySlots([]));
  },[expandedPeriod,periodDayIdx]);

  const reloadDay=()=>{
    if(isSun) return; setLoad(true);
    return Promise.all([getSlots(selDay.dow,token),getDayBookings(selDay.iso,token)])
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

  const handleAdd=async()=>{
    if(!selectedStart||conflict) return;
    try{
      const res=await addSlot({trainer_id:trainerId,day_of_week:selDay.dow,start_time_min:selectedStart},token);
      const c=Array.isArray(res)?res[0]:res;
      if(c){
        setSlots(p=>[...p,c].sort((a,b)=>a.start_time_min-b.start_time_min));
        await postAnnouncement({title:"New Slot Added",body:`New time slot: ${WDAYS[selDay.dow]} ${toTime(selectedStart)}`},token).catch(()=>{});
      }
      setPickH(null); setPickM(0);
    }catch(e){ alert("Error: "+e.message); }
  };

  const handleRemove=async(slot)=>{
    try{ await removeSlot(slot.id,token); setSlots(p=>p.filter(s=>s.id!==slot.id)); setConf(null); }
    catch(e){ alert("Error: "+e.message); }
  };

  const handleApproveRequest=async(r)=>{
    try{
      const dow=dowOf(r.requested_date);
      let slot=await findActiveSlot(trainerId,dow,r.requested_time_min,token);
      if(!slot){
        // A custom time that doesn't land on an existing slot must not overlap
        // one either — otherwise gym capacity at the overlapped time wouldn't
        // reflect this booking at all (two unrelated slot rows, same room).
        const daySlots=await getSlots(dow,token).catch(()=>[]);
        const reqStart=r.requested_time_min, reqEnd=reqStart+SESS_MIN;
        const overlapping=(daySlots||[]).find(s=>reqStart<s.start_time_min+SESS_MIN&&s.start_time_min<reqEnd);
        if(overlapping){
          alert(`${toTime(reqStart)} overlaps the existing ${toTime(overlapping.start_time_min)} slot. Approve them into that slot instead, or reject and ask for a fully free time.`);
          return;
        }
        const created=await addSlot({trainer_id:trainerId,day_of_week:dow,start_time_min:r.requested_time_min},token);
        slot=Array.isArray(created)?created[0]:created;
      }
      const cnt=await getSlotBookCount(slot.id,r.requested_date,token);
      if(cnt>=GYM_CAP){ alert(`That slot is already full (${GYM_CAP}/${GYM_CAP}) on ${fmtDate(r.requested_date)}. Reject the request or free up a spot first.`); return; }
      await createBooking({slot_id:slot.id,client_id:r.client_id,book_date:r.requested_date,status:"booked"},token);
      await resolveRequest(r.id,"approved",token).catch(()=>{});
      await postNotification({client_id:r.client_id,type:"slot_request_approved",message:`Your custom time request for ${fmtDate(r.requested_date)} at ${toTime(r.requested_time_min)} was approved — it's on your schedule!`},token).catch(()=>{});
      const upd=pendingReqs.filter(x=>x.id!==r.id); setPendingReqs(upd); onPendingChange?.(upd.length);
      if(r.requested_date===selDay.iso&&dow===selDay.dow) reloadDay();
    }catch(e){ alert("Error: "+e.message); }
  };

  const handleRejectRequest=async(r)=>{
    try{
      await resolveRequest(r.id,"rejected",token).catch(()=>{});
      await postNotification({client_id:r.client_id,type:"slot_request_rejected",message:`Your custom time request for ${fmtDate(r.requested_date)} at ${toTime(r.requested_time_min)} was declined. Talk to your trainer for alternatives.`},token).catch(()=>{});
      const upd=pendingReqs.filter(x=>x.id!==r.id); setPendingReqs(upd); onPendingChange?.(upd.length);
    }catch(e){ alert("Error: "+e.message); }
  };

  const handleCancelBooking=async(b,slot)=>{
    if(!window.confirm(`Cancel ${b.profiles?.name||"this client"}'s booking?`)) return;
    if(!window.confirm("Are you sure? This cannot be undone.")) return;
    try{
      await cancelBookingRow(b.id,token);
      setBookingsMap(p=>({...p,[slot.id]:(p[slot.id]||[]).filter(x=>x.id!==b.id)}));
      await postNotification({client_id:b.client_id,type:"session_cancelled",message:`Your session on ${fmtDate(b.book_date)} at ${toTime(slot.start_time_min)} was cancelled by your trainer.`},token).catch(()=>{});
      await postAnnouncement({title:"Slot Available",body:"A session slot has opened up — check the schedule!"},token).catch(()=>{});
    }catch(e){ alert("Error: "+e.message); }
  };

  const handleCreatePeriod=async()=>{
    if(!periodName.trim()||!periodStart||!periodEnd) return;
    try{
      const res=await createPeriod({trainer_id:trainerId,name:periodName.trim(),start_date:periodStart,end_date:periodEnd},token);
      const created=Array.isArray(res)?res[0]:res;
      if(created){ setPeriods(p=>[created,...p]); setPeriodName(""); setShowNewPeriod(false); }
    }catch(e){ alert("Error: "+e.message); }
  };

  const handleDeletePeriod=async(id)=>{
    if(!window.confirm("Delete this schedule period? Existing bookings are not affected.")) return;
    try{
      await dbDelete("period_slots",`period_id=eq.${id}`,token);
      await deletePeriodRow(id,token);
      setPeriods(p=>p.filter(x=>x.id!==id));
      setPeriodSlotsMap(p=>{ const n={...p}; delete n[id]; return n; });
      if(expandedPeriod===id) setExpandedPeriod(null);
    }catch(e){ alert("Error: "+e.message); }
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
      catch(e){ alert("Error: "+e.message); }
    }else{
      try{
        const res=await addPeriodSlot({period_id:period.id,day_of_week:periodDayIdx,start_time_min:slot.start_time_min},token);
        const created=Array.isArray(res)?res[0]:res;
        if(created) setPeriodSlotsMap(p=>({...p,[period.id]:[...(p[period.id]||[]),created]}));
      }catch(e){ alert("Error: "+e.message); }
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
    }catch(e){ alert("Error: "+e.message); }
  };

  return(
    <div style={{paddingBottom:80}}>
      {confirm&&(
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
      )}
      <div style={{padding:"22px 20px 12px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div><div style={{color:C.white,fontSize:22,fontWeight:800,fontFamily:"'Oswald',sans-serif"}}>Schedule</div><div style={{color:C.muted,fontSize:13,marginTop:2}}>Manage slots · Max {GYM_CAP} per slot</div></div>
        <Logo size={40}/>
      </div>

      {/* Pending custom time requests */}
      {reqsLoaded&&pendingReqs.length>0&&(
        <div style={{padding:"0 20px 4px"}}>
          <div style={{background:C.surface,border:`1px solid ${C.pink}44`,borderRadius:12,padding:"13px 16px"}}>
            <div style={{color:C.pink,fontSize:12,fontWeight:700,marginBottom:8}}>📬 Custom Time Requests ({pendingReqs.length})</div>
            {pendingReqs.map((r,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:i<pendingReqs.length-1?`1px solid ${C.border}`:"none"}}>
                <div>
                  <div style={{color:C.white,fontSize:13,fontWeight:600}}>{r.profiles?.name||"Unknown"}</div>
                  <div style={{color:C.muted,fontSize:12,marginTop:2}}>{r.requested_date} · {toTime(r.requested_time_min)}</div>
                </div>
                <div style={{display:"flex",gap:6}}>
                  <button onClick={()=>handleApproveRequest(r)} style={{background:C.green+"22",border:`1px solid ${C.green}44`,borderRadius:6,padding:"5px 10px",color:C.green,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>✓</button>
                  <button onClick={()=>handleRejectRequest(r)} style={{background:C.pink+"22",border:`1px solid ${C.pink}44`,borderRadius:6,padding:"5px 10px",color:C.pink,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>✕</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div style={{padding:"0 20px 10px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <button onClick={()=>setWeekOffset(p=>p-1)} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"6px 10px",color:C.muted,cursor:"pointer",fontFamily:"inherit"}}>‹</button>
        <span style={{color:C.cyan,fontSize:13,fontWeight:700}}>{weekLabel}</span>
        <button onClick={()=>setWeekOffset(p=>p+1)} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"6px 10px",color:C.muted,cursor:"pointer",fontFamily:"inherit"}}>›</button>
      </div>
      <div style={{padding:"0 20px 16px",display:"flex",gap:5}}>
        {weekDates.map((d,i)=>{const isToday=isCurrentWeek&&i===todayDow();return(
          <button key={i} onClick={()=>setDay(i)} style={{flex:1,padding:"9px 2px",borderRadius:10,border:`1px solid ${isToday&&dayIdx!==i?C.pink+"55":"transparent"}`,cursor:"pointer",background:dayIdx===i?C.pink:C.surface,display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
            <span style={{color:dayIdx===i?C.white:C.muted,fontSize:9,fontWeight:700}}>{WDAYS[i]}</span>
            <span style={{color:i===6?C.muted:C.white,fontSize:14,fontWeight:900}}>{d.label}</span>
          </button>
        );})}
      </div>
      {isSun?<div style={{padding:"0 20px"}}><Card style={{textAlign:"center",padding:"32px 20px"}}><div style={{fontSize:32,marginBottom:12}}>😴</div><div style={{color:C.white,fontSize:18,fontWeight:800}}>Rest Day</div><div style={{color:C.muted,fontSize:14,marginTop:6}}>Gym closed Sundays.</div></Card></div>:(
        <div style={{padding:"0 20px"}}>
          {loading?<Spinner/>:slots.length===0?<div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:14,padding:"24px",textAlign:"center",marginBottom:10,color:C.muted,fontSize:14}}>No slots for this day</div>:
            slots.map((slot,i)=>{
              const slotBks=bookingsMap[slot.id]||[];
              const cnt=slotBks.length; const pct=Math.min((cnt/GYM_CAP)*100,100);
              const barCol=pct>=100?C.pink:pct>=75?C.amber:C.cyan;
              return(<Card key={i} style={{marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                  <div><div style={{color:C.white,fontSize:15,fontWeight:800}}>{toSlot(slot.start_time_min)}</div><div style={{color:C.muted,fontSize:12,marginTop:2}}>{cnt}/{GYM_CAP} booked</div></div>
                  <button onClick={()=>setConf(slot)} style={{background:C.surface2,border:`1px solid ${C.border}`,borderRadius:8,padding:"6px 10px",color:C.pink,fontSize:12,cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>Remove</button>
                </div>
                {slotBks.length>0&&(
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
                  </div>
                )}
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <div style={{flex:1,height:6,background:C.surface2,borderRadius:3}}><div style={{width:`${pct}%`,height:"100%",borderRadius:3,background:barCol}}/></div>
                  <span style={{color:C.muted,fontSize:11,fontWeight:700,minWidth:50,textAlign:"right"}}>{GYM_CAP-cnt} free</span>
                </div>
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
            {selectedStart!=null&&<div style={{background:C.surface,borderRadius:8,padding:"10px",textAlign:"center",marginBottom:12}}><div style={{color:conflict?C.amber:C.white,fontSize:14,fontWeight:700}}>{conflict?"⚠️ Slot already exists":`📅 ${toSlot(selectedStart)}`}</div></div>}
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
        {periodsLoaded&&periods.length===0&&<Empty msg="No schedule periods — default slots apply"/>}
        {periods.map(period=>{
          const isExpanded=expandedPeriod===period.id;
          const isActiveNow=todayStr>=period.start_date&&todayStr<=period.end_date;
          const daySlotIds=new Set((periodSlotsMap[period.id]||[]).filter(ps=>ps.day_of_week===periodDayIdx).map(ps=>ps.start_time_min));
          return(
            <Card key={period.id} glow={isActiveNow?C.cyan:null} style={{marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{color:C.white,fontSize:14,fontWeight:700}}>{period.name} {isActiveNow&&<span style={{color:C.cyan,fontSize:11,fontWeight:800}}>· Active</span>}</div>
                  <div style={{color:C.muted,fontSize:12,marginTop:2}}>{fmtDate(period.start_date)} → {fmtDate(period.end_date)}</div>
                </div>
                <div style={{display:"flex",gap:6,flexShrink:0}}>
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
    </div>
  );
};

// ── Programs (named workout templates) ──
const PROG_PRESETS=["Agility","Conditioning","Strength","Cardio","Mobility","Flexibility","HIIT","Olympic Lifting"];

const ProgramsScreen=({trainerId,token})=>{
  const [programs,setPrograms]=useState([]);
  const [loading,setLoad]=useState(true);
  const [expanded,setExpanded]=useState(null);
  const [showNew,setShowNew]=useState(false);
  const [newName,setNewName]=useState("");
  const [creating,setCreating]=useState(false);
  const [newEx,setNewEx]=useState({name:"",sets:"3",reps:"10",weight:"",unit:"kg"});
  const [showAddEx,setShowAddEx]=useState(null);
  const [savingId,setSavingId]=useState(null);
  const [editEx,setEditEx]=useState(null); // {progId, idx}

  useEffect(()=>{
    getTemplates(trainerId,token).then(r=>setPrograms(r||[])).catch(()=>{}).finally(()=>setLoad(false));
  },[]);

  const handleCreate=async(nameOverride)=>{
    const name=nameOverride||newName.trim();
    if(!name) return;
    setCreating(true);
    try{
      const res=await createTemplate({trainer_id:trainerId,name,exercises:[]},token);
      const created=Array.isArray(res)?res[0]:res;
      if(created){ setPrograms(p=>[...p,created].sort((a,b)=>a.name.localeCompare(b.name))); setExpanded(created.id); }
      setNewName(""); setShowNew(false);
    }catch(e){ alert("Error: "+e.message); }
    setCreating(false);
  };

  const handleDelete=async(prog)=>{
    if(!window.confirm(`Delete "${prog.name}"? This can't be undone.`)) return;
    try{ await deleteTemplate(prog.id,token); setPrograms(p=>p.filter(x=>x.id!==prog.id)); if(expanded===prog.id) setExpanded(null); }
    catch(e){ alert("Error: "+e.message); }
  };

  const persistExercises=async(prog,exs)=>{
    setSavingId(prog.id);
    try{
      await updateTemplate(prog.id,{exercises:exs},token);
      setPrograms(p=>p.map(x=>x.id===prog.id?{...x,exercises:exs}:x));
    }catch(e){ alert("Error: "+e.message); }
    setSavingId(null);
  };

  const handleAddExercise=(prog)=>{
    if(!newEx.name) return;
    const ex={name:newEx.name,sets:newEx.sets,reps:newEx.reps,weight:newEx.weight?`${newEx.weight}${newEx.unit}`:newEx.unit==="BW"?"BW":""};
    persistExercises(prog,[...(prog.exercises||[]),ex]);
    setNewEx({name:"",sets:"3",reps:"10",weight:"",unit:"kg"});
    setShowAddEx(null);
  };

  const handleRemoveExercise=(prog,idx)=>{
    persistExercises(prog,(prog.exercises||[]).filter((_,i)=>i!==idx));
  };

  const handleMove=(prog,idx,dir)=>{
    const exs=[...(prog.exercises||[])];
    const to=idx+dir;
    if(to<0||to>=exs.length) return;
    [exs[idx],exs[to]]=[exs[to],exs[idx]];
    persistExercises(prog,exs);
  };

  const handleRename=(prog)=>{
    const name=window.prompt("Program name:",prog.name);
    if(!name||!name.trim()||name.trim()===prog.name) return;
    updateTemplate(prog.id,{name:name.trim()},token)
      .then(()=>setPrograms(p=>p.map(x=>x.id===prog.id?{...x,name:name.trim()}:x).sort((a,b)=>a.name.localeCompare(b.name))))
      .catch(e=>alert("Error: "+e.message));
  };

  const inp=(val,set,ph,type="text")=>(<input type={type} value={val} onChange={e=>set(e.target.value)} placeholder={ph} style={{background:"rgba(255,255,255,0.07)",border:`1px solid ${C.border}`,borderRadius:8,padding:"9px 10px",color:C.white,fontSize:13,outline:"none",fontFamily:"inherit",flex:1,minWidth:0}}/>);

  const unitSel=(val,set)=>(
    <select value={val} onChange={e=>set(e.target.value)} style={{background:"rgba(255,255,255,0.07)",border:`1px solid ${C.border}`,borderRadius:8,padding:"9px 8px",color:C.white,fontFamily:"inherit",outline:"none",fontSize:13}}>
      <option value="kg">kg</option><option value="lbs">lbs</option><option value="BW">BW</option>
    </select>
  );

  // presets available = those not yet created
  const existingNames=new Set(programs.map(p=>p.name.toLowerCase()));
  const availablePresets=PROG_PRESETS.filter(n=>!existingNames.has(n.toLowerCase()));

  return(
    <div style={{paddingBottom:80}}>
      <div style={{padding:"22px 20px 12px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div><div style={{color:C.white,fontSize:22,fontWeight:800,fontFamily:"'Oswald',sans-serif"}}>Programs</div><div style={{color:C.muted,fontSize:13,marginTop:2}}>Reusable workout programs</div></div>
        <Logo size={40}/>
      </div>

      <div style={{padding:"0 20px 16px"}}>
        {/* Quick-create preset chips */}
        {availablePresets.length>0&&(
          <div style={{marginBottom:12}}>
            <div style={{color:C.muted,fontSize:10,fontWeight:700,letterSpacing:1.5,textTransform:"uppercase",marginBottom:8}}>Quick create</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
              {availablePresets.map(n=>(
                <button key={n} onClick={()=>handleCreate(n)} style={{background:"rgba(255,255,255,0.05)",border:`1px dashed ${C.pink}66`,borderRadius:20,padding:"7px 14px",color:C.pink,fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit",letterSpacing:0.5}}>+ {n}</button>
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

      <div style={{padding:"0 20px"}}>
        {loading?<Spinner/>:programs.length===0?<Empty msg="No programs yet — use Quick Create or Custom above"/>:
          programs.map(prog=>{
            const isExpanded=expanded===prog.id;
            const exs=prog.exercises||[];
            const isSaving=savingId===prog.id;
            return(
              <Card key={prog.id} style={{marginBottom:10}}>
                {/* Header */}
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{flex:1,cursor:"pointer",minWidth:0}} onClick={()=>setExpanded(isExpanded?null:prog.id)}>
                    <div style={{color:C.white,fontSize:15,fontWeight:700}}>{prog.name}</div>
                    <div style={{color:C.muted,fontSize:12,marginTop:2}}>{exs.length} exercise{exs.length!==1?"s":""}{isSaving?" · saving…":""}</div>
                  </div>
                  <div style={{display:"flex",gap:6,flexShrink:0}}>
                    <button onClick={()=>handleRename(prog)} style={{background:"rgba(255,255,255,0.06)",border:`1px solid ${C.border}`,borderRadius:6,padding:"5px 10px",color:C.cyan,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Rename</button>
                    <button onClick={()=>handleDelete(prog)} style={{background:"rgba(255,255,255,0.06)",border:`1px solid ${C.border}`,borderRadius:6,padding:"5px 10px",color:C.pink,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Delete</button>
                    <button onClick={()=>setExpanded(isExpanded?null:prog.id)} style={{background:"rgba(255,255,255,0.06)",border:`1px solid ${C.border}`,borderRadius:6,width:28,height:28,color:C.muted,fontSize:13,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center"}}>{isExpanded?"▲":"▾"}</button>
                  </div>
                </div>

                {/* Expanded: exercise list */}
                {isExpanded&&(
                  <div style={{marginTop:14}}>
                    {exs.length===0
                      ? <Empty msg="No exercises yet — add one below"/>
                      : <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:12}}>
                          {exs.map((ex,i)=>(
                            <div key={i} style={{background:"rgba(255,255,255,0.05)",borderRadius:10,padding:"11px 12px",display:"flex",alignItems:"center",gap:8,border:`1px solid ${C.border}`}}>
                              {/* Order number */}
                              <div style={{color:C.muted,fontSize:11,fontWeight:800,minWidth:18,textAlign:"center"}}>{i+1}</div>
                              {/* Info */}
                              <div style={{flex:1,minWidth:0}}>
                                <div style={{color:C.white,fontSize:14,fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{ex.name}</div>
                                <div style={{color:C.cyan,fontSize:12,fontWeight:700,marginTop:2}}>
                                  {ex.sets&&ex.reps?`${ex.sets} sets × ${ex.reps} reps`:ex.sets?`${ex.sets} sets`:ex.reps?`${ex.reps} reps`:""}
                                  {ex.weight?` · ${ex.weight}`:""}
                                </div>
                              </div>
                              {/* Reorder */}
                              <div style={{display:"flex",flexDirection:"column",gap:2}}>
                                <button onClick={()=>handleMove(prog,i,-1)} disabled={i===0||isSaving} style={{background:"none",border:"none",color:i===0?C.border:C.muted,cursor:i===0?"default":"pointer",fontSize:11,padding:"1px 4px",lineHeight:1}}>▲</button>
                                <button onClick={()=>handleMove(prog,i,1)} disabled={i===exs.length-1||isSaving} style={{background:"none",border:"none",color:i===exs.length-1?C.border:C.muted,cursor:i===exs.length-1?"default":"pointer",fontSize:11,padding:"1px 4px",lineHeight:1}}>▼</button>
                              </div>
                              {/* Remove */}
                              <button onClick={()=>handleRemoveExercise(prog,i)} disabled={isSaving} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:16,padding:"4px",flexShrink:0}}>✕</button>
                            </div>
                          ))}
                        </div>
                    }

                    {/* Add exercise form */}
                    {showAddEx===prog.id?(
                      <div style={{background:"rgba(255,255,255,0.04)",borderRadius:12,padding:"14px",border:`1px solid ${C.border}`}}>
                        <div style={{color:C.muted,fontSize:10,fontWeight:700,letterSpacing:1.5,textTransform:"uppercase",marginBottom:10}}>New Exercise</div>
                        <div style={{marginBottom:8}}>
                          <ExercisePicker value={newEx.name} onChange={v=>setNewEx(p=>({...p,name:v}))} placeholder="Exercise name"/>
                        </div>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr auto",gap:6,marginBottom:10}}>
                          {inp(newEx.sets,v=>setNewEx(p=>({...p,sets:v})),"Sets","text")}
                          {inp(newEx.reps,v=>setNewEx(p=>({...p,reps:v})),"Reps","text")}
                          {newEx.unit!=="BW"
                            ? inp(newEx.weight,v=>setNewEx(p=>({...p,weight:v})),"Weight","text")
                            : <div style={{background:"rgba(255,255,255,0.04)",borderRadius:8,padding:"9px 10px",color:C.muted,fontSize:12,display:"flex",alignItems:"center"}}>Bodyweight</div>
                          }
                          {unitSel(newEx.unit,v=>setNewEx(p=>({...p,unit:v})))}
                        </div>
                        <div style={{display:"flex",gap:8}}>
                          <GBtn label="Add Exercise" onClick={()=>handleAddExercise(prog)} disabled={!newEx.name||isSaving} sm style={{flex:1}}/>
                          <GBtn label="Cancel" onClick={()=>{setShowAddEx(null);setNewEx({name:"",sets:"3",reps:"10",weight:"",unit:"kg"});}} ghost sm style={{flex:1}}/>
                        </div>
                      </div>
                    ):(
                      <GBtn label={isSaving?"Saving…":"+ Add Exercise"} onClick={()=>setShowAddEx(prog.id)} sm ghost style={{width:"100%"}} disabled={isSaving}/>
                    )}
                  </div>
                )}
              </Card>
            );
          })
        }
      </div>
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

  useEffect(()=>{
    const init=async()=>{
      try{
        const saved=localStorage.getItem("ua_trainer_auth");
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
      const [profile,allClients,pkgs]=await Promise.all([getProfile(userId,token),getClients(token),getAllPkgs(token)]);
      if(profile?.role!=="trainer"){ localStorage.removeItem("ua_trainer_auth"); setAuth({loading:false,token:null,userId:null,profile:null}); return; }
      const enriched=(allClients||[]).map(c=>({...c,_pkg:pkgs?.find(p=>p.client_id===c.id)||null}));
      setClients(enriched);
      setAuth({loading:false,token,userId,profile});
    }catch(e){ setAuth(p=>({...p,loading:false})); }
  };

  const handleLogin=async(email,pw)=>{
    const data=await authLogin(email,pw);
    if(data.error) throw new Error(data.error_description||data.error);
    const {access_token,expires_at,user}=data;
    const profile=await getProfile(user.id,access_token).catch(()=>null);
    if(profile?.role!=="trainer") throw new Error("NOT_TRAINER");
    localStorage.setItem("ua_trainer_auth",JSON.stringify({token:access_token,userId:user.id,expiresAt:expires_at}));
    await loadData(access_token,user.id);
  };

  const handleLogout=async()=>{
    try{ await authLogout(auth.token); }catch(e){}
    localStorage.removeItem("ua_trainer_auth");
    setAuth({loading:false,token:null,userId:null,profile:null});
    setClients([]); setScreen("today"); setSel(null);
  };

  const handleNav=(s)=>{ setScreen(s); setSel(null); };
  const handleClientUpdated=(updated)=>{ setClients(p=>p.map(c=>c.id===updated.id?updated:c)); setSel(updated); };

  if(auth.loading) return(<div className="ua-app" style={{fontFamily:"'Inter',-apple-system,sans-serif",background:C.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"}}><Spinner/></div>);

  if(!auth.token) return(<div className="ua-app" style={{fontFamily:"'Inter',-apple-system,sans-serif",background:C.bg,minHeight:"100vh"}}><LoginScreen onLogin={handleLogin}/></div>);

  const renderScreen=()=>{
    if(selClient) return <ClientDetail client={selClient} trainerId={auth.userId} token={auth.token} onBack={()=>setSel(null)} onClientUpdated={handleClientUpdated}/>;
    switch(screen){
      case "today":    return <TodayScreen trainerName={auth.profile?.name} trainerId={auth.userId} token={auth.token} clients={clients} onViewClient={c=>{setSel(c);setScreen("clients");}}/>;
      case "clients":  return <ClientsScreen clients={clients} onViewClient={setSel}/>;
      case "schedule": return <ScheduleScreen trainerId={auth.userId} token={auth.token} onPendingChange={setScheduleBadge} clients={clients} onViewClient={c=>{setSel(c);setScreen("clients");}}/>;
      case "programs": return <ProgramsScreen trainerId={auth.userId} token={auth.token}/>;
      default: return null;
    }
  };

  return(
    <div className="ua-app" style={{fontFamily:"'Inter',-apple-system,sans-serif",background:C.bg,minHeight:"100vh"}}>
      {renderScreen()}
      <BottomNav active={screen} onNav={handleNav} scheduleBadge={scheduleBadge}/>
    </div>
  );
}
