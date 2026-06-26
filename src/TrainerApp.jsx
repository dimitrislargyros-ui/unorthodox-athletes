import { useState, useEffect } from "react";

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
const getAllPkgs      = (tk)      => dbGet("packages","is_active=eq.true&select=*",tk);
const getTodayBooks  = (date,tk) => dbGet("bookings",`book_date=eq.${date}&status=eq.booked&select=*,schedule_slots(start_time_min),profiles(id,name,initials)`,tk);
const getClientSess  = (uid,tk)  => dbGet("sessions",`client_id=eq.${uid}&order=session_date.desc&select=*,session_notes(*),exercises(*)`,tk);
const getSlots       = (dow,tk)  => dbGet("schedule_slots",`day_of_week=eq.${dow}&is_active=eq.true&order=start_time_min.asc`,tk);
const getDayBookCnt  = (date,tk) => dbGet("bookings",`book_date=eq.${date}&status=eq.booked&select=slot_id`,tk);
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

// ── Time utils ──
const toTime  = (min) => { const h=Math.floor(min/60),m=min%60,ampm=h<12?"AM":"PM",h12=h===0?12:h>12?h-12:h; return `${h12}:${m.toString().padStart(2,"0")} ${ampm}`; };
const toSlot  = (s)   => `${toTime(s)} — ${toTime(s+SESS_MIN)}`;
const fmtDate = (iso) => { if(!iso) return ""; return new Date(iso+"T12:00:00").toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"2-digit"}); };
const todayISO= ()    => new Date().toISOString().split("T")[0];
const todayDow= ()    => { const d=new Date().getDay(); return d===0?6:d-1; };

// Day num: cycles based on sessions_per_week
const calcDayNum = async (clientId, date, tk, spw=3) => {
  const all = await dbGet("sessions",`client_id=eq.${clientId}&session_date=lte.${date}&status=eq.completed`,tk).catch(()=>[]);
  return ((all?.length||0) % spw) + 1;
};

const WDAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const WDATES_BASE = (() => {
  const d=new Date(),dow=d.getDay()===0?6:d.getDay()-1;
  return Array.from({length:7},(_,i)=>{ const dd=new Date(d); dd.setDate(d.getDate()-dow+i); return {label:dd.getDate(),iso:dd.toISOString().split("T")[0],dow:i}; });
})();
const HOURS=[5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21];
const SLOT_TIMES=[300,390,480,840,900,1020];

// ── Shared Components ──
const Logo=({size=48})=>(<img src={LOGO_SRC} alt="UA" style={{width:size,height:size,borderRadius:"50%",objectFit:"contain",background:"#000",flexShrink:0}}/>);
const SL=({children,style={}})=>(<div style={{color:C.muted,fontSize:10,fontWeight:700,letterSpacing:1.8,textTransform:"uppercase",marginBottom:10,...style}}>{children}</div>);
const Card=({children,style={},glow})=>(<div style={{background:C.surface,borderRadius:14,padding:"16px",border:`1px solid ${glow?glow+"55":C.border}`,...style}}>{children}</div>);
const GBtn=({label,onClick,style={},sm,ghost,color,disabled})=>{
  const base={borderRadius:sm?8:12,cursor:disabled?"not-allowed":"pointer",padding:sm?"8px 14px":"15px",fontWeight:800,fontSize:sm?13:15,fontFamily:"inherit",opacity:disabled?.5:1,...style};
  if(ghost) return <button onClick={onClick} disabled={disabled} style={{...base,background:(color||C.cyan)+"20",border:`1px solid ${color||C.cyan}55`,color:color||C.cyan}}>{label}</button>;
  return <button onClick={onClick} disabled={disabled} style={{...base,background:`linear-gradient(135deg,${C.cyan},${C.pink})`,border:"none",color:C.white}}>{label}</button>;
};
const Avatar=({initials,size=44})=>(<div style={{width:size,height:size,borderRadius:"50%",background:`linear-gradient(135deg,${C.cyan}55,${C.pink}55)`,display:"flex",alignItems:"center",justifyContent:"center",color:C.white,fontWeight:800,fontSize:size*0.3,flexShrink:0}}>{initials||"?"}</div>);
const Spinner=()=>(<div style={{display:"flex",justifyContent:"center",padding:"32px"}}><div style={{width:26,height:26,borderRadius:"50%",border:`3px solid ${C.border}`,borderTopColor:C.pink,animation:"spin 0.8s linear infinite"}}/><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>);
const Empty=({msg})=>(<div style={{textAlign:"center",padding:"28px 16px",color:C.muted,fontSize:14}}>{msg}</div>);
const BottomNav=({active,onNav})=>(<div className="ua-app" style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",background:C.surface,borderTop:`1px solid ${C.border}`,display:"flex",justifyContent:"space-around",padding:"10px 0 24px",zIndex:100}}>{[{id:"today",l:"Today",i:"◈"},{id:"clients",l:"Clients",i:"◉"},{id:"schedule",l:"Schedule",i:"◫"}].map(t=>(<button key={t.id} onClick={()=>onNav(t.id)} style={{background:"none",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:5,color:active===t.id?C.pink:C.muted,padding:"0 10px"}}><span style={{fontSize:20}}>{t.i}</span><span style={{fontSize:10,fontWeight:700,letterSpacing:0.5}}>{t.l}</span></button>))}</div>);

// ── Session Editor ──
const SessionEditor=({session,spw,token,onClose,onSaved})=>{
  const note=session.session_notes?.[0]||null;
  const [tNote,setTNote]=useState(note?.trainer_note||"");
  const [exs,setExs]=useState(session.exercises||[]);
  const [newEx,setNewEx]=useState({name:"",sets:"",reps:"",weight:""});
  const [showAdd,setShowAdd]=useState(false);
  const [saving,setSaving]=useState(false);
  const [saved,setSaved]=useState(false);
  const dn=session.day_num;

  const addEx=()=>{ if(!newEx.name) return; setExs(p=>[...p,{...newEx}]); setNewEx({name:"",sets:"",reps:"",weight:""}); setShowAdd(false); };
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
          <button onClick={()=>setShowAdd(p=>!p)} style={{background:"transparent",border:`1px solid ${C.border}`,borderRadius:6,padding:"4px 10px",color:C.muted,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>{showAdd?"▲ Cancel":"+ Add"}</button>
        </div>
        {showAdd&&(
          <div style={{background:C.surface2,borderRadius:10,padding:"12px",marginBottom:10}}>
            <div style={{display:"flex",gap:6,marginBottom:8}}>{inp(newEx.name,v=>setNewEx(p=>({...p,name:v})),"Exercise name")}</div>
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
    catch(e){ setErr(e.message==="NOT_TRAINER"?"Access denied. Trainer accounts only.":e.message||"Wrong email or password."); }
    setL(false);
  };
  const inp={background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"14px 16px",color:C.white,fontSize:15,outline:"none",fontFamily:"inherit",width:"100%",boxSizing:"border-box"};
  return(
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"40px 28px"}}>
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:16,marginBottom:36}}>
        <Logo size={110}/>
        <div style={{textAlign:"center"}}>
          <div style={{color:C.white,fontSize:26,fontWeight:900,letterSpacing:3,textTransform:"uppercase",lineHeight:1}}>UNORTHODOX</div>
          <div style={{fontSize:26,fontWeight:900,letterSpacing:3,textTransform:"uppercase",lineHeight:1,background:`linear-gradient(90deg,${C.cyan},${C.pink})`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>ATHLETES</div>
          <div style={{color:C.muted,fontSize:11,letterSpacing:3,marginTop:8,textTransform:"uppercase"}}>Think · Perform · Develop</div>
        </div>
        <div style={{background:C.pink+"22",border:`1px solid ${C.pink}55`,borderRadius:20,padding:"5px 16px",color:C.pink,fontSize:12,fontWeight:700,letterSpacing:1}}>TRAINER PORTAL</div>
      </div>
      <div style={{width:"100%",maxWidth:320,display:"flex",flexDirection:"column",gap:12}}>
        <input style={inp} placeholder="Trainer email" value={email} onChange={e=>setE(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handle()}/>
        <input style={inp} type="password" placeholder="Password" value={pw} onChange={e=>setPw(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handle()}/>
        {err&&<div style={{color:C.pink,fontSize:13,textAlign:"center"}}>{err}</div>}
        <GBtn label={loading?"Entering...":"Enter →"} onClick={handle} disabled={loading} style={{marginTop:4,width:"100%"}}/>
      </div>
    </div>
  );
};

// ── Today ──
const TodayScreen=({trainerName,token,clients,onViewClient})=>{
  const [bookings,setBookings]=useState([]);
  const [loading,setLoad]=useState(true);
  useEffect(()=>{getTodayBooks(todayISO(),token).then(b=>setBookings(b||[])).finally(()=>setLoad(false));
  },[]);

  const bySlot={};
  bookings.forEach(b=>{ const st=b.schedule_slots?.start_time_min; if(st!=null){if(!bySlot[st])bySlot[st]=[];bySlot[st].push(b);} });
  const slots=Object.keys(bySlot).sort((a,b)=>a-b);
  const alerts=clients.filter(c=>{const pkg=c._pkg;return pkg&&(pkg.sessions_total-pkg.sessions_used)<=2;});
  const todayStr=new Date().toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"});

  return(
    <div style={{paddingBottom:80}}>
      <div style={{padding:"22px 20px 0",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div><div style={{color:C.muted,fontSize:13}}>{todayStr}</div><div style={{color:C.white,fontSize:22,fontWeight:800}}>{trainerName||"Coach"}</div></div>
        <Logo size={44}/>
      </div>

      {/* Summary */}
      <div style={{padding:"14px 20px 0"}}>
        <div style={{background:C.surface,border:`1px solid ${C.pink}33`,borderRadius:12,padding:"13px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div><div style={{color:C.white,fontSize:14,fontWeight:700}}>Today's Overview</div><div style={{color:C.muted,fontSize:12,marginTop:2}}>{bookings.length} sessions · {clients.length} active clients</div></div>
          <div style={{display:"flex",gap:10}}>
            {[{v:bookings.length,l:"Today",c:C.cyan},{v:clients.length,l:"Clients",c:C.pink}].map(s=>(
              <div key={s.l} style={{background:C.surface2,borderRadius:8,padding:"8px 12px",textAlign:"center"}}>
                <div style={{color:s.c,fontSize:20,fontWeight:900}}>{s.v}</div>
                <div style={{color:C.muted,fontSize:9,fontWeight:700}}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Alerts */}
      {alerts.length>0&&(
        <div style={{padding:"12px 20px 0"}}>
          <div style={{background:C.surface,border:`1px solid ${C.amber}44`,borderRadius:12,padding:"13px 16px"}}>
            <div style={{color:C.amber,fontSize:12,fontWeight:700,marginBottom:8}}>⚠️ Expiring Packages</div>
            {alerts.map(c=>{
              const left=c._pkg.sessions_total-c._pkg.sessions_used;
              return(<div key={c.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:`1px solid ${C.border}`}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}><Avatar initials={c.initials} size={28}/><div style={{color:C.white,fontSize:13,fontWeight:600}}>{c.name}</div></div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{color:left===1?C.pink:C.amber,fontSize:12,fontWeight:700}}>{left} left</span>
                  <button onClick={()=>onViewClient(c)} style={{background:C.surface2,border:`1px solid ${C.border}`,borderRadius:6,padding:"4px 10px",color:C.muted,fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>Renew →</button>
                </div>
              </div>);
            })}
          </div>
        </div>
      )}

      {/* Schedule */}
      <div style={{padding:"14px 20px 0"}}>
        <SL>Today's Schedule</SL>
        {loading?<Spinner/>:slots.length===0?<Card style={{textAlign:"center",padding:"28px"}}><Empty msg="No bookings for today"/></Card>:
          slots.map(st=>{
            const slotBookings=bySlot[st]; const pct=(slotBookings.length/GYM_CAP)*100;
            return(<Card key={st} style={{marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                <div><div style={{color:C.white,fontSize:15,fontWeight:800}}>{toSlot(parseInt(st))}</div><div style={{color:C.muted,fontSize:12,marginTop:2}}>{slotBookings.length}/{GYM_CAP} booked</div></div>
                <div style={{background:`linear-gradient(135deg,${C.cyan},${C.pink})`,borderRadius:20,padding:"5px 14px",color:C.white,fontSize:14,fontWeight:900}}>{slotBookings.length}</div>
              </div>
              <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:10}}>
                {slotBookings.map((b,j)=>{
                  const cp=b.profiles; const full=clients.find(c=>c.id===cp?.id);
                  return(<button key={j} onClick={()=>full&&onViewClient(full)} style={{background:full?C.cyan+"22":C.surface2,border:`1px solid ${full?C.cyan+"55":C.border}`,borderRadius:20,padding:"5px 12px",color:full?C.cyan:C.muted,fontSize:12,fontWeight:600,cursor:full?"pointer":"default",fontFamily:"inherit"}}>{cp?.name||"Unknown"}</button>);
                })}
              </div>
              <div style={{height:4,background:C.surface2,borderRadius:2}}><div style={{width:`${pct}%`,height:"100%",borderRadius:2,background:`linear-gradient(90deg,${C.cyan},${C.pink})`}}/></div>
            </Card>);
          })
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
        <div><div style={{color:C.white,fontSize:22,fontWeight:800}}>Clients</div><div style={{color:C.muted,fontSize:13}}>{clients.length} active members</div></div>
      </div>
      <div style={{padding:"0 20px 14px"}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search client..." style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"12px 16px",color:C.white,fontSize:14,outline:"none",fontFamily:"inherit",boxSizing:"border-box"}}/>
      </div>
      <div style={{padding:"0 20px",display:"flex",flexDirection:"column",gap:10}}>
        {filtered.length===0?<Empty msg="No clients found"/>:filtered.map(c=>{
          const pkg=c._pkg; const left=pkg?(pkg.sessions_total-pkg.sessions_used):null;
          const pct=pkg?(pkg.sessions_used/pkg.sessions_total)*100:0; const isLow=left!=null&&left<=2;
          return(<button key={c.id} onClick={()=>onViewClient(c)} style={{background:C.surface,border:`1px solid ${isLow?C.pink+"44":C.border}`,borderRadius:14,padding:"16px",cursor:"pointer",textAlign:"left",width:"100%"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:pkg?12:0}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <Avatar initials={c.initials}/>
                <div>
                  <div style={{color:C.white,fontSize:15,fontWeight:700}}>{c.name}</div>
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

// ── Client Detail ──
const ClientDetail=({client,trainerId,token,onBack,onClientUpdated})=>{
  const [sessions,setSessions]=useState([]);
  const [pkg,setPkg]=useState(client._pkg||null);
  const [loading,setLoad]=useState(true);
  const [activeSession,setAS]=useState(null);
  const [showPkg,setShowPkg]=useState(false);
  const [showLog,setShowLog]=useState(false);
  const [newPkgTotal,setNPT]=useState("10");
  const [newSpw,setNSpw]=useState("3");
  const [hasInjury,setHasInj]=useState(false);
  const [injuryNotes,setInjNotes]=useState("");
  const [pkgNotes,setPkgNotes]=useState("");
  const [logDate,setLogDate]=useState(todayISO());
  const [logTime,setLogTime]=useState(300);
  const [logging,setLogging]=useState(false);
  const spw=pkg?.sessions_per_week||3;
  const left=pkg?(pkg.sessions_total-pkg.sessions_used):null;

  useEffect(()=>{ getClientSess(client.id,token).then(s=>setSessions(s||[])).finally(()=>setLoad(false)); },[client.id]);

  const handleRenew=async()=>{
    try{
      await deactivatePkgs(client.id,token);
      const end=new Date(); end.setDate(end.getDate()+35);
      const res=await createPkg({client_id:client.id,sessions_total:parseInt(newPkgTotal),sessions_used:0,sessions_per_week:parseInt(newSpw),weeks:5,start_date:todayISO(),end_date:end.toISOString().split("T")[0],has_injury:hasInjury,injury_notes:injuryNotes,package_notes:pkgNotes},token);
      const created=Array.isArray(res)?res[0]:res;
      setPkg(created); setShowPkg(false);
      onClientUpdated({...client,_pkg:created});
    }catch(e){ alert("Error: "+e.message); }
  };

  const handleLog=async()=>{
    setLogging(true);
    try{
      const dayNum=await calcDayNum(client.id,logDate,token,spw);
      const res=await createSession({client_id:client.id,trainer_id:trainerId,session_date:logDate,start_time_min:logTime,day_num:dayNum,status:"completed"},token);
      const created=Array.isArray(res)?res[0]:res;
      const full={...created,session_notes:[],exercises:[]};
      setSessions(p=>[full,...p]);
      setAS(full); setShowLog(false);
    }catch(e){ alert("Error: "+e.message); }
    setLogging(false);
  };

  const completedSessions=sessions.filter(s=>s.status==="completed");

  return(
    <div style={{paddingBottom:80}}>
      {activeSession&&<SessionEditor session={activeSession} spw={spw} token={token} onClose={()=>setAS(null)} onSaved={updated=>setSessions(p=>p.map(s=>s.id===updated.id?updated:s))}/>}

      <div style={{padding:"22px 20px 0",display:"flex",alignItems:"center",gap:12}}>
        <button onClick={onBack} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"8px 12px",color:C.muted,cursor:"pointer",fontSize:13,fontFamily:"inherit"}}>← Back</button>
        <div style={{flex:1}}/><Logo size={36}/>
      </div>

      {/* Client info */}
      <div style={{padding:"16px 20px 0",display:"flex",flexDirection:"column",alignItems:"center",gap:10}}>
        <Avatar initials={client.initials} size={72}/>
        <div style={{textAlign:"center"}}>
          <div style={{color:C.white,fontSize:20,fontWeight:800}}>{client.name}</div>
          <div style={{color:C.muted,fontSize:13,marginTop:3}}>{client.email}</div>
        </div>
        <div style={{display:"flex",gap:10}}>
          {[{v:completedSessions.length,l:"Sessions"},{v:`${spw}x`,l:"Per Week"},{v:left??"-",l:"Pkg Left",warn:left!=null&&left<=2}].map(s=>(
            <div key={s.l} style={{background:C.surface,border:`1px solid ${s.warn?C.pink+"44":C.border}`,borderRadius:10,padding:"10px 14px",textAlign:"center",minWidth:60}}>
              <div style={{color:s.warn?C.pink:C.cyan,fontSize:20,fontWeight:900}}>{s.v}</div>
              <div style={{color:C.muted,fontSize:10,fontWeight:600,marginTop:2}}>{s.l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Package */}
      <div style={{padding:"14px 20px 0"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <SL style={{marginBottom:0}}>Package</SL>
          <button onClick={()=>setShowPkg(p=>!p)} style={{background:`linear-gradient(135deg,${C.cyan},${C.pink})`,border:"none",borderRadius:8,padding:"6px 14px",color:C.white,fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>{showPkg?"▲ Cancel":"↻ Renew"}</button>
        </div>
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
                {SLOT_TIMES.map(t=><button key={t} onClick={()=>setLogTime(t)} style={{background:logTime===t?C.cyan+"33":C.surface2,border:`1px solid ${logTime===t?C.cyan:C.border}`,borderRadius:7,padding:"7px 10px",color:logTime===t?C.cyan:C.muted,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>{toTime(t)}</button>)}
              </div>
            </div>
            <GBtn label={logging?"Logging...":"Log Session & Add Notes"} onClick={handleLog} disabled={logging} style={{width:"100%"}}/>
          </Card>
        )}
        {loading?<Spinner/>:completedSessions.length===0?<Empty msg="No sessions logged yet"/>:
          completedSessions.map((s,i)=>(
            <button key={i} onClick={()=>setAS(s)} style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"14px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",marginBottom:8}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <div style={{width:36,height:36,borderRadius:10,background:C.cyan+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>💪</div>
                <div style={{textAlign:"left"}}>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <div style={{color:C.white,fontSize:14,fontWeight:600}}>Personal Training</div>
                    {s.day_num&&<span style={{background:`linear-gradient(135deg,${C.cyan},${C.pink})`,color:C.white,fontSize:10,fontWeight:800,padding:"2px 6px",borderRadius:20}}>Day {s.day_num}</span>}
                  </div>
                  <div style={{color:C.muted,fontSize:12}}>{fmtDate(s.session_date)} · {toTime(s.start_time_min)} · {(s.exercises||[]).length} exercises</div>
                </div>
              </div>
              <span style={{color:C.pink,fontSize:12,fontWeight:700}}>Edit →</span>
            </button>
          ))
        }
      </div>
    </div>
  );
};

// ── Schedule ──
const ScheduleScreen=({trainerId,token})=>{
  const [dayIdx,setDay]=useState(todayDow());
  const [slots,setSlots]=useState([]);
  const [counts,setCounts]=useState({});
  const [loading,setLoad]=useState(false);
  const [confirm,setConf]=useState(null);
  const [pickH,setPickH]=useState(null);
  const [pickM,setPickM]=useState(0);
  const selDay=WDATES_BASE[dayIdx]; const isSun=dayIdx===6;

  useEffect(()=>{
    if(isSun) return; setLoad(true);
    Promise.all([getSlots(selDay.dow,token),getDayBookCnt(selDay.iso,token)])
      .then(([sl,bks])=>{ setSlots(sl||[]); const c={}; (bks||[]).forEach(b=>{c[b.slot_id]=(c[b.slot_id]||0)+1;}); setCounts(c); })
      .finally(()=>setLoad(false));
  },[dayIdx]);

  const selectedStart=pickH!=null?pickH*60+pickM:null;
  const conflict=selectedStart!=null&&slots.find(s=>s.start_time_min===selectedStart);

  const handleAdd=async()=>{
    if(!selectedStart||conflict) return;
    try{ const res=await addSlot({trainer_id:trainerId,day_of_week:selDay.dow,start_time_min:selectedStart},token); const c=Array.isArray(res)?res[0]:res; if(c)setSlots(p=>[...p,c].sort((a,b)=>a.start_time_min-b.start_time_min)); setPickH(null); setPickM(0); }
    catch(e){ alert("Error: "+e.message); }
  };

  const handleRemove=async(slot)=>{
    try{ await removeSlot(slot.id,token); setSlots(p=>p.filter(s=>s.id!==slot.id)); setConf(null); }
    catch(e){ alert("Error: "+e.message); }
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
        <div><div style={{color:C.white,fontSize:22,fontWeight:800}}>Schedule</div><div style={{color:C.muted,fontSize:13,marginTop:2}}>Manage slots · Max {GYM_CAP} per slot</div></div>
        <Logo size={40}/>
      </div>
      <div style={{padding:"0 20px 16px",display:"flex",gap:5}}>
        {WDATES_BASE.map((d,i)=>{const isToday=i===todayDow();return(
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
              const cnt=counts[slot.id]||0; const pct=Math.min((cnt/GYM_CAP)*100,100);
              const barCol=pct>=100?C.pink:pct>=75?C.amber:C.cyan;
              return(<Card key={i} style={{marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                  <div><div style={{color:C.white,fontSize:15,fontWeight:800}}>{toSlot(slot.start_time_min)}</div><div style={{color:C.muted,fontSize:12,marginTop:2}}>{cnt}/{GYM_CAP} booked</div></div>
                  <button onClick={()=>setConf(slot)} style={{background:C.surface2,border:`1px solid ${C.border}`,borderRadius:8,padding:"6px 10px",color:C.pink,fontSize:12,cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>Remove</button>
                </div>
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
    </div>
  );
};

// ── App Root ──
export default function App(){
  const [auth,setAuth]=useState({loading:true,token:null,userId:null,profile:null});
  const [clients,setClients]=useState([]);
  const [screen,setScreen]=useState("today");
  const [selClient,setSel]=useState(null);

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
      case "today":    return <TodayScreen trainerName={auth.profile?.name} token={auth.token} clients={clients} onViewClient={c=>{setSel(c);setScreen("clients");}}/>;
      case "clients":  return <ClientsScreen clients={clients} onViewClient={setSel}/>;
      case "schedule": return <ScheduleScreen trainerId={auth.userId} token={auth.token}/>;
      default: return null;
    }
  };

  return(
    <div className="ua-app" style={{fontFamily:"'Inter',-apple-system,sans-serif",background:C.bg,minHeight:"100vh"}}>
      {renderScreen()}
      <BottomNav active={screen} onNav={handleNav}/>
    </div>
  );
}
