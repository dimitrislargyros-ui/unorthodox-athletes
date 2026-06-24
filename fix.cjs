const fs = require('fs');
let c = fs.readFileSync('src/TrainerApp.jsx', 'utf8');
c = c.replace(
  'const save=async()=>{',
  'const save=async()=>{ if(saving||saved) return;'
);
fs.writeFileSync('src/TrainerApp.jsx', c);
console.log('Fixed:', c.includes('if(saving||saved) return;'));
