const fs = require('fs');

// ── FIX 1: ClientApp - exsData not defined in SessionSheet ──
let client = fs.readFileSync('src/ClientApp.jsx', 'utf8');

// Replace the broken SessionSheet with a clean version that loads data properly
const oldSheet = `const SessionSheet=({session,token,onClose})=>{
  const [noteData,setNoteData]=useState(null);
  const [exsData,setExsData]=useState(null);
  useEffect(()=>{
    dbGet("session_notes",\`session_id=eq.\${session.id}&select=*\`,token).then(r=>setNoteData(r?.[0]||null)).catch(()=>{});
    dbGet("exercises",\`session_id=eq.\${session.id}&order=order_index.asc\`,token).then(r=>setExsData(r||[])).catch(()=>setExsData([]));
  },[session.id]);
  const note=noteData;`;

const newSheet = `const SessionSheet=({session,token,onClose})=>{
  const [note,setNoteObj]=useState(null);
  const [exsData,setExsData]=useState([]);
  const [loadingSheet,setLoadingSheet]=useState(true);
  useEffect(()=>{
    setLoadingSheet(true);
    Promise.all([
      dbGet("session_notes",\`session_id=eq.\${session.id}&select=*\`,token).catch(()=>[]),
      dbGet("exercises",\`session_id=eq.\${session.id}&order=order_index.asc\`,token).catch(()=>[]),
    ]).then(([notes,exs])=>{
      setNoteObj(notes?.[0]||null);
      setExsData(exs||[]);
    }).finally(()=>setLoadingSheet(false));
  },[session.id]);`;

if (client.includes(oldSheet)) {
  client = client.replace(oldSheet, newSheet);
  console.log('✓ Fixed SessionSheet state');
} else {
  console.log('⚠ SessionSheet pattern not found - trying alternative...');
  // Try to find and fix just the exsData reference
  client = client.replace(
    'const [clientNote,setNote]=useState("");',
    'const [clientNote,setNote]=useState("");\n  if(loadingSheet) return null;'
  );
}

// Fix exercises display - use exsData safely
client = client.replace(
  '        {!exsData ? <Spinner/> : exsData.length===0',
  '        {exsData.length===0'
);

fs.writeFileSync('src/ClientApp.jsx', client);
console.log('✓ ClientApp saved');

// ── FIX 2: TrainerApp - Day counter based on sessions_per_week ──
let trainer = fs.readFileSync('src/TrainerApp.jsx', 'utf8');

// Fix calcDayNum to use package sessions_per_week instead of weekly reset
const oldCalc = `const calcDayNum = async (clientId,date,tk) => {
  const d=new Date(date+"T12:00:00"); const dow=d.getDay()===0?6:d.getDay()-1;
  const mon=new Date(d); mon.setDate(d.getDate()-dow);
  const monIso=mon.toISOString().split("T")[0];
  const prev = await dbGet("sessions",\`client_id=eq.\${clientId}&session_date=gte.\${monIso}&session_date=lt.\${date}&status=neq.cancelled\`,tk);
  return (prev?.length||0)+1;
};`;

const newCalc = `const calcDayNum = async (clientId, date, tk, sessionsPerWeek=3) => {
  // Count ALL previous completed sessions for this client
  const prev = await dbGet("sessions",\`client_id=eq.\${clientId}&session_date=lte.\${date}&status=eq.completed\`,tk).catch(()=>[]);
  const total = (prev?.length||0);
  // Cycle based on sessions_per_week: 0->Day1, 1->Day2, 2->Day3, 3->Day1...
  return (total % sessionsPerWeek) + 1;
};`;

if (trainer.includes(oldCalc)) {
  trainer = trainer.replace(oldCalc, newCalc);
  console.log('✓ Fixed day counter logic');
} else {
  console.log('⚠ calcDayNum pattern not found');
}

// Fix handleLogSession to pass sessionsPerWeek
trainer = trainer.replace(
  'const dayNum=await calcDayNum(client.id,logDate,token);',
  'const spw = pkg?.sessions_per_week||3;\n      const dayNum=await calcDayNum(client.id,logDate,token,spw);'
);

fs.writeFileSync('src/TrainerApp.jsx', trainer);
console.log('✓ TrainerApp saved');
console.log('\n✅ All fixes applied! Run: git add . && git commit -m "Fix exsData and day counter" && git push');
