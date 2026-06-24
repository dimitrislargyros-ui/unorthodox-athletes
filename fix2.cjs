const fs = require('fs');
let c = fs.readFileSync('src/TrainerApp.jsx', 'utf8');

// Fix saveNote to use PATCH if exists, POST if not
c = c.replace(
  "const saveNote       = (sessId,note,tk) => dbUpsert(\"session_notes\",{session_id:sessId,trainer_note:note,updated_at:new Date().toISOString()},tk);",
  `const saveNote = async (sessId, note, tk) => {
  const existing = await dbGet("session_notes", \`session_id=eq.\${sessId}\`, tk);
  if (existing && existing.length > 0) {
    return dbPatch("session_notes", \`session_id=eq.\${sessId}\`, {trainer_note: note, updated_at: new Date().toISOString()}, tk);
  } else {
    return dbPost("session_notes", {session_id: sessId, trainer_note: note, updated_at: new Date().toISOString()}, tk);
  }
};`
);

fs.writeFileSync('src/TrainerApp.jsx', c);
console.log('Fixed:', c.includes('existing.length > 0'));
