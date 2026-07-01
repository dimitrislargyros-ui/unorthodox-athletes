import { useState, useEffect } from "react";

const LOGO_SRC = '/logo.png';

// ── Colors ──
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
const getPackage  = (uid,tk) => dbGet("packages",`client_id=eq.${uid}&is_active=eq.true&order=created_at.desc&limit=1`,tk).then(r=>r?.[0]);
const getSessions = (uid,tk) => dbGet("sessions",`client_id=eq.${uid}&order=session_date.desc&select=*,session_notes(*),exercises(*)`,tk);
const getPRs      = (uid,tk) => dbGet("personal_records",`client_id=eq.${uid}&order=record_date.desc`,tk);
const getSlots    = (dow,tk) => dbGet("schedule_slots",`day_of_week=eq.${dow}&is_active=eq.true&order=start_time_min.asc`,tk);
const getDayBooks = (date,tk)=> dbGet("bookings",`book_date=eq.${date}&status=eq.booked&select=slot_id`,tk);
const getMyBooks  = (uid,date,tk) => dbGet("bookings",`client_id=eq.${uid}&book_date=eq.${date}&select=*`,tk);
const bookSlot    = (slotId,uid,date,tk) => dbPost("bookings",{slot_id:slotId,client_id:uid,book_date:date},tk);
const cancelBook  = (id,tk)  => dbPatch("bookings",`id=eq.${id}`,{status:"cancelled"},tk);
const addPR       = (uid,d,tk)=> dbPost("personal_records",{...d,client_id:uid,record_date:new Date().toISOString().split("T")[0]},tk);
const deletePR    = (id,tk)  => dbDelete("personal_records",`id=eq.${id}`,tk);
const updateProfile=(uid,d,tk)=> dbPatch("profiles",`id=eq.${uid}`,d,tk);
const uploadAvatar=async(uid,file,tk)=>{
  const ext=file.name.split('.').pop()||'jpg';
  const path=`${uid}/avatar.${ext}`;
  const res=await fetch(`${SB_URL}/storage/v1/object/avatars/${path}`,{method:"POST",headers:{"apikey":SB_KEY,"Authorization":`Bearer ${tk}`,"Content-Type":file.type||"image/jpeg","x-upsert":"true"},body:file});
  if(!res.ok) throw new Error(await res.text());
  return `${SB_URL}/storage/v1/object/public/avatars/${path}?t=${Date.now()}`;
};

const saveClientNote = async (sessId, note, tk) => {
  const ex = await dbGet("session_notes",`session_id=eq.${sessId}`,tk).catch(()=>[]);
  if(ex?.length>0) return dbPatch("session_notes",`session_id=eq.${sessId}`,{client_note:note,updated_at:new Date().toISOString()},tk);
  return dbPost("session_notes",{session_id:sessId,client_note:note,updated_at:new Date().toISOString()},tk);
};

const getAnnouncements = (tk) => dbGet("announcements","order=created_at.desc&limit=20",tk);
const postSlotRequest  = (d,tk) => dbPost("slot_requests",d,tk);
const getMyWaitlistDay = (uid,date,tk) => dbGet("waitlist",`client_id=eq.${uid}&book_date=eq.${date}`,tk);
const joinWaitlist     = (d,tk) => dbPost("waitlist",d,tk);
const leaveWaitlist    = (id,tk) => dbDelete("waitlist",`id=eq.${id}`,tk);
const getSlotWaitlist  = (slotId,date,tk) => dbGet("waitlist",`slot_id=eq.${slotId}&book_date=eq.${date}&order=position.asc`,tk);
const getMyUpcomingBooks = (uid,date,tk) => dbGet("bookings",`client_id=eq.${uid}&book_date=gte.${date}&status=eq.booked&select=*,schedule_slots(start_time_min)`,tk);

// ── Time utils ──
const toTime = (min) => {
  const h=Math.floor(min/60),m=min%60;
  return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}`;
};
const toSlot = (s) => `${toTime(s)} — ${toTime(s+SESS_MIN)}`;
const fmtDate= (iso) => { if(!iso) return ""; return new Date(iso+"T12:00:00").toLocaleDateString("en-GB",{day:"numeric",month:"short"}); };
const todayISO = () => new Date().toISOString().split("T")[0];
const todayDow = () => { const d=new Date().getDay(); return d===0?6:d-1; };
const calcDayNum = (sessionsUsedBefore, sessionsPerWeek=3) => (sessionsUsedBefore % sessionsPerWeek) + 1;

const computeDayNum = (session, allSessions, spw=3) => {
  const sorted=[...allSessions]
    .filter(s=>s.status==="completed"||s.status==="booked")
    .sort((a,b)=>a.session_date.localeCompare(b.session_date)||(a.start_time_min-b.start_time_min));
  const idx=sorted.findIndex(x=>x.id===session.id);
  return idx>=0?(idx%spw)+1:(session.day_num||null);
};

const WDAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const WDATES_BASE = (() => {
  const d=new Date(), dow=d.getDay()===0?6:d.getDay()-1;
  return Array.from({length:7},(_,i)=>{ const dd=new Date(d); dd.setDate(d.getDate()-dow+i); return {label:dd.getDate(),iso:dd.toISOString().split("T")[0],dow:i}; });
})();
const addDays = (isoDate, n) => { const d=new Date(isoDate); d.setUTCDate(d.getUTCDate()+n); return d.toISOString().split("T")[0]; };
const HOURS=[5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21];

// ── Shared components ──
const Logo=({size=48})=>(<img src={LOGO_SRC} alt="UA" style={{width:size,height:size,borderRadius:"50%",objectFit:"contain",background:"#000",flexShrink:0}}/>);
const SL=({children,style={}})=>(<div style={{color:C.muted,fontSize:10,fontWeight:700,letterSpacing:1.8,textTransform:"uppercase",marginBottom:10,...style}}>{children}</div>);
const Card=({children,style={},glow})=>(<div style={{background:C.surface,borderRadius:14,padding:"16px",border:`1px solid ${glow?glow+"55":C.border}`,...style}}>{children}</div>);
const GBtn=({label,onClick,style={},sm,ghost,color,disabled})=>{
  const base={borderRadius:sm?8:12,cursor:disabled?"not-allowed":"pointer",padding:sm?"8px 14px":"15px",fontWeight:800,fontSize:sm?13:15,fontFamily:"inherit",opacity:disabled?.5:1,...style};
  if(ghost) return <button onClick={onClick} disabled={disabled} style={{...base,background:(color||C.cyan)+"20",border:`1px solid ${color||C.cyan}55`,color:color||C.cyan}}>{label}</button>;
  return <button onClick={onClick} disabled={disabled} style={{...base,background:`linear-gradient(135deg,${C.cyan},${C.pink})`,border:"none",color:C.white}}>{label}</button>;
};
const Spinner=()=>(<div style={{display:"flex",justifyContent:"center",padding:"32px"}}><div style={{width:26,height:26,borderRadius:"50%",border:`3px solid ${C.border}`,borderTopColor:C.cyan,animation:"spin 0.8s linear infinite"}}/><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>);
const Empty=({msg})=>(<div style={{textAlign:"center",padding:"28px 16px",color:C.muted,fontSize:14}}>{msg}</div>);
const BottomNav=({active,onNav,avatarUrl,initials})=>(<div className="ua-app" style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",background:C.surface,borderTop:`1px solid ${C.border}`,display:"flex",justifyContent:"space-around",padding:"10px 0 24px",zIndex:100}}>{[{id:"home",l:"Home",i:"⊞"},{id:"schedule",l:"Schedule",i:"◫"},{id:"announcements",l:"Gym",i:"◎"},{id:"profile",l:"Profile",i:"◯"}].map(t=>(<button key={t.id} onClick={()=>onNav(t.id)} style={{background:"none",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:5,color:active===t.id?C.cyan:C.muted,padding:"0 8px"}}>{t.id==="profile"?(avatarUrl?<img src={avatarUrl} style={{width:22,height:22,borderRadius:"50%",objectFit:"cover",border:`2px solid ${active==="profile"?C.cyan:"transparent"}`}} alt="av"/>:<div style={{width:22,height:22,borderRadius:"50%",background:active==="profile"?C.cyan+"33":C.surface2,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:800,color:active==="profile"?C.cyan:C.muted}}>{initials||"◯"}</div>):<span style={{fontSize:18}}>{t.i}</span>}<span style={{fontSize:10,fontWeight:700,letterSpacing:0.5}}>{t.l}</span></button>))}</div>);

// ── Session Sheet ──
const SessionSheet=({session,token,onClose})=>{
  const rawNotes = session.session_notes;
  const noteObj = Array.isArray(rawNotes) ? (rawNotes[0]||null) : (rawNotes||null);
  const exercises = session.exercises || [];
  const spw = session._pkg_spw || 3;
  const dayNum = session.sessions_used_before!=null ? calcDayNum(session.sessions_used_before, spw) : session.day_num;
  const [clientNote, setClientNote] = useState(noteObj?.client_note||"");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    if(saving||saved) return;
    setSaving(true);
    try {
      await saveClientNote(session.id, clientNote, token);
      setSaved(true);
      setTimeout(()=>{ setSaved(false); onClose(); }, 1200);
    } catch(e) { alert("Error saving: "+e.message); }
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

        <SL>Trainer Notes</SL>
        <div style={{background:C.surface2,borderRadius:10,padding:"12px 14px",color:noteObj?.trainer_note?C.white:C.muted,fontSize:14,lineHeight:1.5,marginBottom:20,border:`1px solid ${C.cyan}22`}}>
          {noteObj?.trainer_note||"Trainer hasn't added notes yet."}
        </div>

        <SL>Your Notes</SL>
        <textarea value={clientNote} onChange={e=>setClientNote(e.target.value)}
          placeholder="How did it go? Anything to remember..."
          style={{width:"100%",background:C.surface2,border:`1px solid ${C.border}`,borderRadius:10,padding:"12px 14px",color:C.white,fontSize:14,fontFamily:"inherit",resize:"none",height:90,outline:"none",boxSizing:"border-box",lineHeight:1.5,marginBottom:12}}/>
        <GBtn label={saving?"Saving...":saved?"✓ Saved!":"Save Notes"} onClick={save} disabled={saving} style={{width:"100%"}}/>
      </div>
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
    catch(e){ setErr(e.message||"Wrong email or password."); }
    setL(false);
  };
  const inp={background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"14px 16px",color:C.white,fontSize:15,outline:"none",fontFamily:"inherit",width:"100%",boxSizing:"border-box"};
  return(
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"40px 28px"}}>
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:16,marginBottom:44}}>
        <Logo size={110}/>
        <div style={{textAlign:"center"}}>
          <div style={{color:C.white,fontSize:26,fontWeight:900,letterSpacing:3,textTransform:"uppercase",lineHeight:1}}>UNORTHODOX</div>
          <div style={{fontSize:26,fontWeight:900,letterSpacing:3,textTransform:"uppercase",lineHeight:1,background:`linear-gradient(90deg,${C.cyan},${C.pink})`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>ATHLETES</div>
          <div style={{color:C.muted,fontSize:11,letterSpacing:3,marginTop:8,textTransform:"uppercase"}}>Think · Perform · Develop</div>
        </div>
      </div>
      <div style={{width:"100%",maxWidth:320,display:"flex",flexDirection:"column",gap:12}}>
        <input style={inp} placeholder="Email address" value={email} onChange={e=>setE(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handle()}/>
        <input style={inp} type="password" placeholder="Password" value={pw} onChange={e=>setPw(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handle()}/>
        {err&&<div style={{color:C.pink,fontSize:13,textAlign:"center"}}>{err}</div>}
        <GBtn label={loading?"Logging in...":"Let's Go →"} onClick={handle} disabled={loading} style={{marginTop:4,width:"100%"}}/>
        <button onClick={onSignUp} style={{background:"none",border:"none",color:C.cyan,fontSize:13,cursor:"pointer",padding:"8px",fontFamily:"inherit",textAlign:"center",width:"100%"}}>Don't have an account? Sign up →</button>
      </div>
    </div>
  );
};

// ── Sign Up ──
const SignUpScreen=({onSignUp,onBack})=>{
  const [name,setName]=useState(""); const [email,setE]=useState(""); const [pw,setPw]=useState(""); const [phone,setPhone]=useState("");
  const [loading,setL]=useState(false); const [err,setErr]=useState(""); const [done,setDone]=useState(false);
  const handle=async()=>{
    if(!name||!email||!pw) return; setL(true); setErr("");
    try{ const ok=await onSignUp(name.trim(),email,pw,phone.trim()||null); if(!ok) setDone(true); }
    catch(e){ setErr(e.message||"Sign up failed."); }
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
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:16,marginBottom:40}}>
        <Logo size={88}/>
        <div style={{textAlign:"center"}}>
          <div style={{color:C.white,fontSize:22,fontWeight:900,letterSpacing:2,textTransform:"uppercase"}}>Create Account</div>
          <div style={{color:C.muted,fontSize:13,marginTop:6}}>Join Unorthodox Athletes</div>
        </div>
      </div>
      <div style={{width:"100%",maxWidth:320,display:"flex",flexDirection:"column",gap:12}}>
        <input style={inp} placeholder="Full name" value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handle()}/>
        <input style={inp} placeholder="Email address" value={email} onChange={e=>setE(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handle()}/>
        <input style={inp} type="password" placeholder="Password (min 6 chars)" value={pw} onChange={e=>setPw(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handle()}/>
        <input style={{...inp,opacity:0.7}} placeholder="Phone number (optional)" value={phone} onChange={e=>setPhone(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handle()}/>
        {err&&<div style={{color:C.pink,fontSize:13,textAlign:"center"}}>{err}</div>}
        <GBtn label={loading?"Creating account...":"Create Account →"} onClick={handle} disabled={loading} style={{marginTop:4,width:"100%"}}/>
        <button onClick={onBack} style={{background:"none",border:"none",color:C.muted,fontSize:13,cursor:"pointer",padding:"8px",fontFamily:"inherit",textAlign:"center"}}>← Back to login</button>
      </div>
    </div>
  );
};

// ── Home ──
const HomeScreen=({profile,pkg,sessions,onNav,onOpenSession,token,userId})=>{
  const [now,setNow]=useState(new Date());
  const [todaySlots,setTodaySlots]=useState([]);
  const [todayCounts,setTodayCounts]=useState({});
  const [myTodayBook,setMyBook]=useState(null);
  const [slotsLoaded,setSlotsLoaded]=useState(false);
  const [bookingSlot,setBookingSlot]=useState(null);
  const [homeMsg,setHomeMsg]=useState(null);
  const [myUpcomingBooks,setMyUpcomingBooks]=useState([]);

  useEffect(()=>{ const t=setInterval(()=>setNow(new Date()),60000); return()=>clearInterval(t); },[]);

  useEffect(()=>{
    const dow=todayDow(); const today=todayISO();
    Promise.all([
      getSlots(dow,token),
      getDayBooks(today,token),
      getMyBooks(userId,today,token),
      getMyUpcomingBooks(userId,today,token),
    ]).then(([slots,books,myBooks,upBooks])=>{
      setTodaySlots(slots||[]);
      const c={}; (books||[]).forEach(b=>{c[b.slot_id]=(c[b.slot_id]||0)+1;}); setTodayCounts(c);
      setMyBook((myBooks||[]).find(b=>b.status==="booked")||null);
      setMyUpcomingBooks(upBooks||[]);
    }).catch(()=>{}).finally(()=>setSlotsLoaded(true));
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

  const bookingItems=myUpcomingBooks
    .filter(b=>b.schedule_slots)
    .map(b=>({id:`bk_${b.id}`,session_date:b.book_date,start_time_min:b.schedule_slots.start_time_min,status:"booked",_fromBooking:true}))
    .filter(b=>{const [yr,mo,dy]=b.session_date.split('-').map(Number);return new Date(yr,mo-1,dy,Math.floor(b.start_time_min/60),b.start_time_min%60,0)>now;});
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
  const weekFull=!!pkg&&thisWeekSessions.length>=spw;

  const myBookedSlot=myTodayBook?todaySlots.find(s=>s.id===myTodayBook.slot_id):null;
  const otherSlots=todaySlots.filter(s=>s.id!==myBookedSlot?.id);
  const todaySession=sessions.find(s=>s.session_date===today&&s.status==="booked");
  const bookedSynth=myBookedSlot?{session_date:today,start_time_min:myBookedSlot.start_time_min}:null;

  const cdFull=(s)=>{
    const [yr,mo,dy]=s.session_date.split('-').map(Number);
    const dt=new Date(yr,mo-1,dy,Math.floor(s.start_time_min/60),s.start_time_min%60,0);
    const m=Math.round((dt-now)/60000);
    if(m<=0) return "Starting now!";
    const d=Math.floor(m/1440),h=Math.floor((m%1440)/60),mn=m%60;
    if(d>=2) return `${d} days`;
    if(d===1) return h>0?`1 day and ${h}h`:"Tomorrow";
    if(h>0&&mn>0) return `${h} hour${h!==1?"s":""} ${mn} minute${mn!==1?"s":""}`;
    if(h>0) return `${h} hour${h!==1?"s":""}`;
    return `${mn} minute${mn!==1?"s":""}`;
  };
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

  const handleHomeBook=async(slot)=>{
    if(myTodayBook){ setHomeMsg("You already have a session booked for today"); setTimeout(()=>setHomeMsg(null),3000); return; }
    if(bookingSlot) return;
    const cnt=todayCounts[slot.id]||0;
    if(cnt>=GYM_CAP) return;
    setBookingSlot(slot.id);
    try{
      const bk=await bookSlot(slot.id,userId,todayISO(),token);
      const created=Array.isArray(bk)?bk[0]:bk;
      if(created){ setMyBook(created); setTodayCounts(p=>({...p,[slot.id]:(p[slot.id]||0)+1})); }
    }catch(e){ alert("Error: "+e.message); }
    setBookingSlot(null);
  };

  const hour=now.getHours();
  const greeting=hour<12?"morning":hour<17?"afternoon":"evening";
  const dateStr=now.toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"});

  return(
    <div style={{paddingBottom:80}}>
      {homeMsg&&(
        <div style={{position:"fixed",top:20,left:"50%",transform:"translateX(-50%)",width:"calc(100% - 40px)",maxWidth:390,background:C.surface2,border:`1px solid ${C.amber}66`,borderRadius:14,padding:"14px 16px",zIndex:200,textAlign:"center"}}>
          <div style={{color:C.amber,fontWeight:700,fontSize:14}}>{homeMsg}</div>
        </div>
      )}
      {/* Date + greeting header */}
      <div style={{padding:"22px 20px 0",display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <div>
          <div style={{color:C.muted,fontSize:13}}>Good {greeting},</div>
          <div style={{color:C.white,fontSize:22,fontWeight:800}}>{profile?.name?.split(" ")[0]||"Athlete"}</div>
          <div style={{color:C.cyan,fontSize:14,fontWeight:700,marginTop:4}}>{dateStr}</div>
        </div>
        <Logo size={44}/>
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

      {/* Today's booked session countdown (when already booked) */}
      {myTodayBook&&myBookedSlot&&(
        <div style={{padding:"14px 20px 0"}}>
          <div style={{background:`linear-gradient(135deg,${C.cyan},${C.pink})`,borderRadius:16,padding:"20px"}}>
            <div style={{color:C.bg,fontSize:13,fontWeight:700,opacity:0.9,marginBottom:8,lineHeight:1.5}}>
              ⏱ {cdFull(bookedSynth)==="Starting now!"
                ?<span style={{fontWeight:900}}>Starting now!</span>
                :<><span style={{fontWeight:900}}>{cdFull(bookedSynth)}</span> until your session</>}
            </div>
            <div style={{color:C.bg,fontSize:30,fontWeight:900,lineHeight:1.1}}>{toTime(myBookedSlot.start_time_min)}</div>
            <div style={{color:C.bg,fontSize:13,opacity:0.8,marginTop:6,fontWeight:600}}>Your session today · 90 min · Booked ✓</div>
          </div>
        </div>
      )}

      {/* Book Session CTA — only when can't book inline */}
      {(myTodayBook||weekFull||todayDow()===6||!pkg)&&(
        <div style={{padding:"14px 20px 0"}}>
          <button onClick={()=>onNav("schedule")} style={{width:"100%",background:`linear-gradient(135deg,${C.cyan},${C.pink})`,border:"none",borderRadius:16,padding:"20px",display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer",fontFamily:"inherit"}}>
            <div style={{textAlign:"left"}}>
              <div style={{color:C.white,fontSize:11,fontWeight:700,letterSpacing:1.5,textTransform:"uppercase",opacity:0.85}}>Personal Training · 90 min</div>
              <div style={{color:C.white,fontSize:24,fontWeight:900,marginTop:2}}>Book Session</div>
              <div style={{color:C.white,fontSize:13,opacity:0.8,marginTop:2}}>Max {GYM_CAP} per slot</div>
            </div>
            <div style={{fontSize:40}}>📅</div>
          </button>
        </div>
      )}

      {/* Upcoming booked sessions */}
      {allUpcoming.length>0&&(
        <div style={{padding:"14px 20px 0"}}>
          <SL>Your Next Sessions</SL>
          {(()=>{const s=allUpcoming[0];const dn=s._fromBooking?null:computeDayNum(s,sessions,spw);return(
            <div style={{background:`linear-gradient(135deg,${C.cyan},${C.pink})`,borderRadius:18,padding:"22px 20px",marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
                {dn?<span style={{background:"rgba(0,0,0,0.25)",borderRadius:20,padding:"5px 14px",color:C.white,fontSize:13,fontWeight:800}}>Day {dn}</span>:<span/>}
                {!s._fromBooking&&<button onClick={()=>onOpenSession(s)} style={{background:"rgba(0,0,0,0.2)",border:"none",borderRadius:8,padding:"8px 14px",color:C.white,fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>Notes →</button>}
              </div>
              <div style={{color:C.bg,fontSize:38,fontWeight:900,lineHeight:1.1}}>{toTime(s.start_time_min)}</div>
              <div style={{color:C.bg,fontSize:14,opacity:0.85,marginTop:5,fontWeight:600}}>{fmtDate(s.session_date)} · 90 min</div>
              <div style={{height:1,background:"rgba(0,0,0,0.15)",margin:"12px 0"}}/>
              <div style={{color:C.bg,fontSize:13,fontWeight:700}}>⏱ in {cdShort(s)}</div>
            </div>
          )})()}
          {allUpcoming.slice(1).map((s,i)=>{
            const dn=s._fromBooking?null:computeDayNum(s,sessions,spw);
            return(
              <button key={i} onClick={s._fromBooking?undefined:()=>onOpenSession(s)} style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:14,padding:"13px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:s._fromBooking?"default":"pointer",marginBottom:8,textAlign:"left"}}>
                <div>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                    {dn&&<span style={{background:`linear-gradient(135deg,${C.cyan},${C.pink})`,color:C.white,fontSize:11,fontWeight:800,padding:"3px 9px",borderRadius:20,flexShrink:0}}>Day {dn}</span>}
                    <span style={{color:C.white,fontSize:14,fontWeight:700}}>{fmtDate(s.session_date)} · {toTime(s.start_time_min)}</span>
                  </div>
                  <div style={{color:C.muted,fontSize:12}}>in {cdShort(s)}</div>
                </div>
                {!s._fromBooking&&<span style={{color:C.cyan,fontSize:14,fontWeight:700,flexShrink:0,marginLeft:8}}>›</span>}
              </button>
            );
          })}
        </div>
      )}

      {/* Week complete */}
      {weekFull&&(
        <div style={{padding:"14px 20px 0"}}>
          <div style={{background:C.green+"18",border:`1px solid ${C.green}44`,borderRadius:14,padding:"16px 18px"}}>
            <div style={{color:C.green,fontSize:15,fontWeight:800,marginBottom:8}}>Week Complete 💪</div>
            <div style={{color:C.white,fontSize:13,marginBottom:10,lineHeight:1.6}}>
              {thisWeekSessions.map((s,i)=>{
                const dn=computeDayNum(s,sessions,spw);
                return <span key={i} style={{display:"block"}}>Day {dn} — {fmtDate(s.session_date)}</span>;
              })}
            </div>
            <div style={{height:1,background:C.border,marginBottom:10}}/>
            <div style={{color:C.muted,fontSize:13,lineHeight:1.5}}>Time to rest! For an extra session, message your trainer.</div>
          </div>
        </div>
      )}

      {/* Today's schedule — only when not booked and week not full */}
      {todayDow()!==6&&!myTodayBook&&!weekFull&&(
        <div style={{padding:"14px 20px 0"}}>
          <SL>Book Today</SL>
          {!slotsLoaded&&<Spinner/>}
          {slotsLoaded&&todaySlots.length===0&&<Empty msg="No sessions scheduled today"/>}
          {otherSlots.map(slot=>{
            const cnt=todayCounts[slot.id]||0;
            const full=cnt>=GYM_CAP;
            const isBooking=bookingSlot===slot.id;
            return(
              <div key={slot.id} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"13px 16px",marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{color:C.white,fontSize:14,fontWeight:600}}>{toTime(slot.start_time_min)}</div>
                  <div style={{color:full?C.pink:C.green,fontSize:12,fontWeight:700,marginTop:3}}>{full?"Full":"Available"}</div>
                </div>
                {full
                  ? <span style={{color:C.pink,fontSize:12,fontWeight:700}}>Full</span>
                  : <button onClick={()=>handleHomeBook(slot)} disabled={isBooking} style={{background:C.cyan+"20",border:`1px solid ${C.cyan}44`,borderRadius:8,padding:"6px 12px",color:C.cyan,fontSize:12,fontWeight:700,cursor:isBooking?"wait":"pointer",fontFamily:"inherit",opacity:isBooking?.6:1}}>{isBooking?"...":" Book →"}</button>
                }
              </div>
            );
          })}
        </div>
      )}

      {/* Package */}
      {pkg&&(
        <div style={{padding:"14px 20px 0"}}>
          <Card>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
              <div>
                <div style={{color:C.white,fontSize:14,fontWeight:700}}>{pkg.sessions_total}-Session Pack · {spw}x/week</div>
                <div style={{color:C.muted,fontSize:12,marginTop:3}}>Expires {fmtDate(pkg.end_date)}</div>
                {pkg.package_notes&&<div style={{color:C.cyan,fontSize:12,marginTop:3}}>📋 {pkg.package_notes}</div>}
                {pkg.has_injury&&<div style={{color:C.amber,fontSize:12,marginTop:3}}>⚠️ {pkg.injury_notes}</div>}
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

      {/* Recent sessions */}
      <div style={{padding:"14px 20px 0"}}>
        <SL>Recent Sessions</SL>
        {recent.length===0?<Empty msg="No completed sessions yet"/>:
          recent.map((s,i)=>{
            const dn=computeDayNum(s,sessions,spw);
            return(
              <Card key={i} style={{marginBottom:8}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{display:"flex",alignItems:"center",gap:12}}>
                    <div style={{width:36,height:36,borderRadius:10,background:C.cyan+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>💪</div>
                    <div>
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <div style={{color:C.white,fontSize:14,fontWeight:600}}>Personal Training</div>
                        {dn&&<span style={{background:`linear-gradient(135deg,${C.cyan},${C.pink})`,color:C.white,fontSize:10,fontWeight:800,padding:"2px 6px",borderRadius:20}}>Day {dn}</span>}
                      </div>
                      <div style={{color:C.muted,fontSize:12}}>{fmtDate(s.session_date)} · {toTime(s.start_time_min)}</div>
                    </div>
                  </div>
                  <span style={{color:C.green,fontSize:12,fontWeight:700}}>✓</span>
                </div>
              </Card>
            );
          })
        }
      </div>
    </div>
  );
};

// ── Schedule ──
const ScheduleScreen=({userId,token,sessions,pkg})=>{
  const [weekOffset,setWeekOffset]=useState(0);
  const [dayIdx,setDay]=useState(todayDow());
  const [slots,setSlots]=useState([]);
  const [counts,setCounts]=useState({});
  const [myBooks,setMyB]=useState([]);
  const [myWaitlist,setMyWaitlist]=useState([]);
  const [myWeekBookCount,setMyWeekBookCount]=useState(0);
  const [loading,setLoad]=useState(false);
  const [toast,setToast]=useState(null);
  const [weekMsgVisible,setWeekMsgVisible]=useState(false);
  const [activeSession,setAS]=useState(null);
  const [showCustom,setShowC]=useState(false);
  const [pickH,setPickH]=useState(null);
  const [pickM,setPickM]=useState(0);
  const [reqSent,setReqSent]=useState(false);
  const [reqSending,setReqSending]=useState(false);
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

  const thisWeekSessionCount=sessions.filter(s=>
    (s.status==="booked"||s.status==="completed")&&
    s.session_date>=WDATES_BASE[0].iso&&s.session_date<=WDATES_BASE[5].iso
  ).length;
  const currentWeekFull=isCurrentWeek&&!!pkg&&(myWeekBookCount+thisWeekSessionCount)>=spw;

  const sessionDaySet=new Set(sessions.filter(s=>s.status==="completed"||s.status==="booked").map(s=>s.session_date));

  useEffect(()=>{
    const ws=WDATES_BASE[0].iso,we=WDATES_BASE[5].iso;
    dbGet("bookings",`client_id=eq.${userId}&book_date=gte.${ws}&book_date=lte.${we}&status=eq.booked&select=id`,token)
      .then(r=>setMyWeekBookCount((r||[]).length)).catch(()=>{});
  },[]);

  useEffect(()=>{
    if(isSun||isPastDay){ setSlots([]); setCounts({}); setMyB([]); setMyWaitlist([]); setLoad(false); return; }
    setLoad(true); setReqSent(false);
    Promise.all([
      getSlots(selDay.dow,token),
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

  const handleBook=async(slot)=>{
    const already=myBooks.find(b=>b.slot_id===slot.id&&b.status==="booked");
    if(already){
      await cancelBook(already.id,token).catch(()=>{});
      setMyB(p=>p.filter(b=>b.id!==already.id));
      setCounts(p=>({...p,[slot.id]:Math.max((p[slot.id]||1)-1,0)}));
      if(isCurrentWeek) setMyWeekBookCount(p=>Math.max(p-1,0));
      const waitlist=await getSlotWaitlist(slot.id,selDay.iso,token).catch(()=>[]);
      if(waitlist?.length>0){
        const first=waitlist[0];
        try{ await bookSlot(slot.id,first.client_id,selDay.iso,token); await leaveWaitlist(first.id,token); setCounts(p=>({...p,[slot.id]:(p[slot.id]||0)+1})); }catch(e){}
      }
      return;
    }
    // "Change" case: already have a booking on a different slot today
    const existingDayBook=myBooks.find(b=>b.status==="booked");
    if(existingDayBook){
      const cnt=counts[slot.id]||0;
      if(cnt>=GYM_CAP){ setToast({slot,next:null}); return; }
      await cancelBook(existingDayBook.id,token).catch(()=>{});
      setMyB(p=>p.filter(b=>b.id!==existingDayBook.id));
      setCounts(p=>({...p,[existingDayBook.slot_id]:Math.max((p[existingDayBook.slot_id]||1)-1,0)}));
      try{ const bk=await bookSlot(slot.id,userId,selDay.iso,token); const created=Array.isArray(bk)?bk[0]:bk; if(created){setMyB(p=>[...p,created]);setCounts(p=>({...p,[slot.id]:(p[slot.id]||0)+1}));} }
      catch(e){ alert("Error: "+e.message); }
      return;
    }
    // Week-full check (current week only)
    if(isCurrentWeek&&currentWeekFull){
      setWeekMsgVisible(true); setTimeout(()=>setWeekMsgVisible(false),3000); return;
    }
    const cnt=counts[slot.id]||0;
    if(cnt>=GYM_CAP){ const next=slots.find(s=>s.id!==slot.id&&(counts[s.id]||0)<GYM_CAP); setToast({slot,next}); return; }
    try{
      const bk=await bookSlot(slot.id,userId,selDay.iso,token); const created=Array.isArray(bk)?bk[0]:bk;
      if(created){ setMyB(p=>[...p,created]); setCounts(p=>({...p,[slot.id]:(p[slot.id]||0)+1})); if(isCurrentWeek) setMyWeekBookCount(p=>p+1); }
    }catch(e){ alert("Error: "+e.message); }
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
    }catch(e){ alert("Error joining waitlist: "+e.message); }
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
    }catch(e){ alert("Error: "+e.message); }
    setReqSending(false);
  };

  const SlotCard=({slot})=>{
    const booked=myBooks.find(b=>b.slot_id===slot.id&&b.status==="booked");
    const myDayBook=myBooks.find(b=>b.status==="booked");
    const hasOtherBook=myDayBook&&!booked;
    const onWaitlist=myWaitlist.find(w=>w.slot_id===slot.id);
    const cnt=(counts[slot.id]||0);
    const full=!booked&&cnt>=GYM_CAP;
    return(
      <Card glow={booked?C.cyan:null} style={{marginBottom:10}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
          <div>
            <div style={{color:C.white,fontSize:15,fontWeight:800}}>Personal Training</div>
            <div style={{color:C.muted,fontSize:13,marginTop:2}}>{toSlot(slot.start_time_min)}</div>
          </div>
          {booked
            ?<GBtn label="✕ Cancel" onClick={()=>handleBook(slot)} sm ghost color={C.muted}/>
            :full
              ?<button onClick={()=>handleWaitlist(slot)} style={{background:onWaitlist?C.amber+"33":C.pink+"20",border:`1px solid ${onWaitlist?C.amber+"55":C.pink+"44"}`,borderRadius:8,padding:"8px 14px",color:onWaitlist?C.amber:C.pink,fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>
                {onWaitlist?"On Waitlist ✓":"Join Waitlist"}
              </button>
              :hasOtherBook
                ?<GBtn label="Change →" onClick={()=>handleBook(slot)} sm/>
                :<GBtn label="Book" onClick={()=>handleBook(slot)} sm/>
          }
        </div>
        <div style={{color:booked?C.cyan:full?C.pink:C.green,fontSize:12,fontWeight:700}}>
          {booked?"Booked ✓":full?"Full":"Available"}
        </div>
      </Card>
    );
  };

  const pastSessions=sessions.filter(s=>s.status==="completed").slice(0,5);

  const pastDaySessions=sessions.filter(s=>s.session_date===selDay.iso&&(s.status==="completed"||s.status==="booked"));
  const weekLabel=weekOffset===0?"This week":`Week of ${fmtDate(weekDates[0].iso)}`;

  return(
    <div style={{paddingBottom:80}}>
      {weekMsgVisible&&(
        <div style={{position:"fixed",top:20,left:"50%",transform:"translateX(-50%)",width:"calc(100% - 40px)",maxWidth:390,background:C.surface2,border:`1px solid ${C.amber}66`,borderRadius:14,padding:"14px 16px",zIndex:200,textAlign:"center"}}>
          <div style={{color:C.amber,fontWeight:700,fontSize:14}}>Week quota reached — rest up! Contact trainer for extras.</div>
        </div>
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
        <div style={{color:C.white,fontSize:22,fontWeight:800}}>Book a Session</div>
        <div style={{color:C.muted,fontSize:13,marginTop:2}}>Personal training · 90 min · Max {GYM_CAP} in gym</div>
      </div>

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
                          <div style={{color:C.white,fontSize:14,fontWeight:600}}>Personal Training</div>
                          {dn&&<span style={{background:`linear-gradient(135deg,${C.cyan},${C.pink})`,color:C.white,fontSize:10,fontWeight:800,padding:"2px 6px",borderRadius:20}}>Day {dn}</span>}
                        </div>
                        <div style={{color:C.muted,fontSize:12}}>{toTime(s.start_time_min)} · {s.status}</div>
                      </div>
                    </div>
                    <span style={{color:C.cyan,fontSize:12,fontWeight:700}}>Notes →</span>
                  </button>
                );
              })
            :loading?<Spinner/>
            :slots.length===0?<Empty msg="No slots available for this day. Contact your trainer."/>
            :slots.map(s=><SlotCard key={s.id} slot={s}/>)
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

      <div style={{padding:"0 20px"}}>
        <SL style={{marginTop:8}}>Past Sessions — tap for notes</SL>
        {pastSessions.length===0?<Empty msg="No past sessions yet"/>:
          pastSessions.map((s,i)=>{
            const dn=computeDayNum(s,sessions,spw);
            return(
              <button key={i} onClick={()=>setAS(s)} style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"14px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",marginBottom:8}}>
                <div style={{display:"flex",alignItems:"center",gap:12}}>
                  <div style={{width:36,height:36,borderRadius:10,background:C.cyan+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>💪</div>
                  <div style={{textAlign:"left"}}>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <div style={{color:C.white,fontSize:14,fontWeight:600}}>Personal Training</div>
                      {dn&&<span style={{background:`linear-gradient(135deg,${C.cyan},${C.pink})`,color:C.white,fontSize:10,fontWeight:800,padding:"2px 6px",borderRadius:20}}>Day {dn}</span>}
                    </div>
                    <div style={{color:C.muted,fontSize:12}}>{fmtDate(s.session_date)} · {toTime(s.start_time_min)} · {(s.exercises||[]).length} exercises</div>
                  </div>
                </div>
                <span style={{color:C.cyan,fontSize:12,fontWeight:700}}>Notes →</span>
              </button>
            );
          })
        }
      </div>
    </div>
  );
};

// ── Announcements ──
const AnnouncementsScreen=({token})=>{
  const [announcements,setAnn]=useState([]);
  const [loading,setLoad]=useState(true);
  useEffect(()=>{
    getAnnouncements(token).then(a=>setAnn(a||[])).finally(()=>setLoad(false));
  },[]);
  return(
    <div style={{paddingBottom:80}}>
      <div style={{padding:"22px 20px 12px"}}>
        <div style={{color:C.white,fontSize:22,fontWeight:800}}>Announcements</div>
        <div style={{color:C.muted,fontSize:13,marginTop:2}}>Updates from your trainer</div>
      </div>
      <div style={{padding:"0 20px"}}>
        {loading?<Spinner/>:announcements.length===0?<Empty msg="No announcements yet"/>:
          announcements.map((a,i)=>(
            <Card key={i} style={{marginBottom:10}}>
              <div style={{color:C.white,fontSize:15,fontWeight:700,marginBottom:6}}>{a.title}</div>
              <div style={{color:C.muted,fontSize:13,lineHeight:1.6,whiteSpace:"pre-wrap"}}>{a.body}</div>
              <div style={{color:C.muted,fontSize:11,marginTop:8}}>{fmtDate(a.created_at?.split("T")[0])}</div>
            </Card>
          ))
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
  const handleAvatarChange=async(e)=>{
    const file=e.target.files?.[0]; if(!file) return;
    setUploading(true);
    try{
      const url=await uploadAvatar(userId,file,token);
      await updateProfile(userId,{avatar_url:url},token);
      setAvatarUrl(url); onAvatarChange?.(url);
    }catch(e){ alert("Upload failed: "+e.message); }
    setUploading(false);
    e.target.value="";
  };
  const spw=pkg?.sessions_per_week||3;
  const left=pkg?pkg.sessions_total-pkg.sessions_used:0;

  const savePR=async()=>{
    if(!newPR.exercise||!newPR.weight) return;
    try{ const r=await addPR(userId,newPR,token); const c=Array.isArray(r)?r[0]:r; if(c)setPRs(p=>[c,...p]); setNew({exercise:"",weight:"",unit:"kg",reps:"1"}); setShowAddPR(false); }
    catch(e){ alert("Error: "+e.message); }
  };
  const removePR=async(id)=>{ try{ await deletePR(id,token); setPRs(p=>p.filter(x=>x.id!==id)); }catch(e){} };
  const saveName=async()=>{
    if(!newName.trim()) return; setSavingN(true);
    const initials=newName.trim().split(" ").map(w=>w[0]).join("").toUpperCase().slice(0,2);
    try{ await updateProfile(userId,{name:newName.trim(),initials,phone:phone.trim()||null},token); setEditing(false); }catch(e){ alert("Error: "+e.message); }
    setSavingN(false);
  };
  const inp=(val,set,ph)=>(<input value={val} onChange={e=>set(e.target.value)} placeholder={ph} style={{background:C.surface2,border:`1px solid ${C.border}`,borderRadius:8,padding:"9px 10px",color:C.white,fontSize:13,outline:"none",fontFamily:"inherit",flex:1}}/>);

  return(
    <div style={{paddingBottom:80}}>
      <div style={{padding:"22px 20px 0"}}><div style={{color:C.white,fontSize:22,fontWeight:800}}>My Profile</div></div>

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
            <input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="Full name" autoFocus style={{background:C.surface2,border:`1px solid ${C.cyan}66`,borderRadius:10,padding:"10px 14px",color:C.white,fontSize:16,outline:"none",fontFamily:"inherit",width:"100%",boxSizing:"border-box",textAlign:"center"}}/>
            <input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="Phone (optional)" style={{background:C.surface2,border:`1px solid ${C.border}`,borderRadius:10,padding:"10px 14px",color:C.white,fontSize:14,outline:"none",fontFamily:"inherit",width:"100%",boxSizing:"border-box",textAlign:"center"}}/>
            <div style={{display:"flex",gap:8,width:"100%"}}>
              <GBtn label={savingName?"Saving...":"Save"} onClick={saveName} disabled={savingName} sm style={{flex:1}}/>
              <GBtn label="Cancel" onClick={()=>{setEditing(false);setNewName(profile?.name||"");setPhone(profile?.phone||"");}} sm ghost color={C.muted} style={{flex:1}}/>
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
                <div style={{color:C.bg,fontSize:11,fontWeight:700,letterSpacing:1.5,textTransform:"uppercase",opacity:0.8}}>{pkg.sessions_total}-Session Pack</div>
                <div style={{color:C.bg,fontSize:20,fontWeight:900,marginTop:3}}>{spw}x per week · {pkg.weeks} weeks</div>
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
        </div>
      )}

      {/* Stats */}
      <div style={{padding:"0 20px 16px"}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
          {[{l:"Total",v:sessions.filter(s=>s.status==="completed").length},{l:"This Month",v:sessions.filter(s=>s.status==="completed"&&s.session_date?.slice(0,7)===new Date().toISOString().slice(0,7)).length},{l:"PRs",v:prs.length}].map(s=>(
            <div key={s.l} style={{background:C.surface,borderRadius:12,padding:"14px 10px",textAlign:"center",border:`1px solid ${C.border}`}}>
              <div style={{color:C.cyan,fontSize:22,fontWeight:900}}>{s.v}</div>
              <div style={{color:C.muted,fontSize:10,fontWeight:600,marginTop:3}}>{s.l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* PRs */}
      <div style={{padding:"0 20px 16px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <SL style={{marginBottom:0}}>Personal Records</SL>
          <button onClick={()=>setShowAddPR(p=>!p)} style={{background:`linear-gradient(135deg,${C.cyan},${C.pink})`,border:"none",borderRadius:8,padding:"6px 12px",color:C.white,fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>{showAddPR?"▲ Cancel":"+ Add PR"}</button>
        </div>
        {showAddPR&&(
          <Card style={{marginBottom:12}}>
            <div style={{display:"flex",gap:8,marginBottom:8}}>{inp(newPR.exercise,v=>setNew(p=>({...p,exercise:v})),"Exercise name")}</div>
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
        {sessions.filter(s=>s.status==="completed").length===0?<Empty msg="No completed sessions yet"/>:
          sessions.filter(s=>s.status==="completed").map((s,i)=>{
            const dn=computeDayNum(s,sessions,spw);
            return(
              <div key={i} style={{padding:"12px 0",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <div style={{color:C.white,fontSize:14,fontWeight:600}}>Personal Training</div>
                  {dn&&<span style={{background:`linear-gradient(135deg,${C.cyan},${C.pink})`,color:C.white,fontSize:10,fontWeight:800,padding:"2px 6px",borderRadius:20}}>Day {dn}</span>}
                </div>
                <div style={{textAlign:"right"}}><div style={{color:C.muted,fontSize:12}}>{fmtDate(s.session_date)}</div><div style={{color:C.green,fontSize:12,fontWeight:700}}>✓ Done</div></div>
              </div>
            );
          })
        }
      </div>

      <div style={{padding:"0 20px 8px"}}>
        <button onClick={onLogout} style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"14px",color:C.pink,fontWeight:700,fontSize:15,cursor:"pointer",fontFamily:"inherit"}}>Log Out</button>
      </div>
    </div>
  );
};

// ── App Root ──
export default function App(){
  const [auth,setAuth]=useState({loading:true,token:null,userId:null,profile:null,pkg:null,sessions:[],prs:[]});
  const [screen,setScreen]=useState("home");
  const [openSess,setOpenSess]=useState(null);
  const [showSignUp,setShowSignUp]=useState(false);

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
      setAuth({loading:false,token,userId,profile,pkg:pkg||null,sessions:sessions||[],prs:prs||[]});
    }catch(e){
      setAuth(prev=>({...prev,loading:false}));
    }
  };

  const handleSignUp=async(name,email,pw,phone=null)=>{
    const data=await authSignUp(email,pw);
    if(data?.error) throw new Error(data.error_description||data.error);
    const {access_token,expires_at,user}=data||{};
    if(!access_token) return false;
    const initials=name.trim().split(" ").map(w=>w[0]).join("").toUpperCase().slice(0,2);
    await dbPost("profiles",{id:user.id,role:"client",name:name.trim(),email,initials,...(phone&&{phone})},access_token).catch(()=>{});
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

  if(auth.loading) return(
    <div className="ua-app" style={{fontFamily:"'Inter',-apple-system,sans-serif",background:C.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"}}><Spinner/></div>
  );
  if(!auth.token) return(
    <div className="ua-app" style={{fontFamily:"'Inter',-apple-system,sans-serif",background:C.bg,minHeight:"100vh"}}>
      {showSignUp
        ? <SignUpScreen onSignUp={handleSignUp} onBack={()=>setShowSignUp(false)}/>
        : <LoginScreen onLogin={handleLogin} onSignUp={()=>setShowSignUp(true)}/>
      }
    </div>
  );

  const renderScreen=()=>{
    switch(screen){
      case "home": return <HomeScreen profile={auth.profile} pkg={auth.pkg} sessions={auth.sessions} onNav={setScreen} onOpenSession={setOpenSess} token={auth.token} userId={auth.userId}/>;
      case "schedule": return <ScheduleScreen userId={auth.userId} token={auth.token} sessions={auth.sessions} pkg={auth.pkg}/>;
      case "announcements": return <AnnouncementsScreen token={auth.token}/>;
      case "profile": return <ProfileScreen profile={auth.profile} pkg={auth.pkg} sessions={auth.sessions} prs={auth.prs} userId={auth.userId} token={auth.token} onLogout={handleLogout} onAvatarChange={url=>setAuth(p=>({...p,profile:{...p.profile,avatar_url:url}}))}/>;
      default: return null;
    }
  };

  return(
    <div className="ua-app" style={{fontFamily:"'Inter',-apple-system,sans-serif",background:C.bg,minHeight:"100vh"}}>
      {openSess&&<SessionSheet session={{...openSess,_pkg_spw:auth.pkg?.sessions_per_week||3}} token={auth.token} onClose={()=>setOpenSess(null)}/>}
      {renderScreen()}
      <BottomNav active={screen} onNav={setScreen} avatarUrl={auth.profile?.avatar_url} initials={auth.profile?.initials}/>
    </div>
  );
}
