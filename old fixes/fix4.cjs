const fs = require('fs');
let c = fs.readFileSync('src/ClientApp.jsx', 'utf8');

console.log('Has TRAINER PORTAL:', c.includes('TRAINER PORTAL'));
console.log('File size:', c.length);

// Remove the TRAINER PORTAL badge from ClientApp
c = c.replace(
  `        <div style={{background:C.pink+"22",border:\`1px solid \${C.pink}55\`,borderRadius:20,
          padding:"5px 16px",color:C.pink,fontSize:12,fontWeight:700,letterSpacing:1}}>
          TRAINER PORTAL
        </div>`,
  ''
);

// Also try simpler replacement
c = c.replace('TRAINER PORTAL', 'CLIENT LOGIN');
c = c.replace('Trainer email', 'Email address');
c = c.replace('Entering...', 'Logging in...');
c = c.replace('"Enter →"', '"Let\'s Go →"');

fs.writeFileSync('src/ClientApp.jsx', c);
console.log('Fixed! Has TRAINER PORTAL now:', c.includes('TRAINER PORTAL'));
console.log('Has CLIENT LOGIN:', c.includes('CLIENT LOGIN'));
