const fs = require('fs');
let c = fs.readFileSync('src/TrainerApp.jsx', 'utf8');

// Fix Avatar component to show image if available
c = c.replace(
  "Avatar=({initials,size=44})=>(<div style={{width:size,height:size,borderRadius:\"50%\",background:`linear-gradient(135deg,${C.cyan}55,${C.pink}55)`,display:\"flex\",alignItems:\"center\",justifyContent:\"center\",color:C.white,fontWeight:800,fontSize:size*0.3,flexShrink:0}}>{initials||\"?\"}</div>);",
  "Avatar=({initials,size=44,avatarUrl})=>(avatarUrl?<img src={avatarUrl} style={{width:size,height:size,borderRadius:\"50%\",objectFit:\"cover\",flexShrink:0}} alt=\"av\"/>:<div style={{width:size,height:size,borderRadius:\"50%\",background:`linear-gradient(135deg,${C.cyan}55,${C.pink}55)`,display:\"flex\",alignItems:\"center\",justifyContent:\"center\",color:C.white,fontWeight:800,fontSize:size*0.3,flexShrink:0}}>{initials||\"?\"}</div>);"
);

// Pass avatarUrl to Avatar in clients list
c = c.replace(
  "<Avatar initials={c.initials}/>",
  "<Avatar initials={c.initials} avatarUrl={c.avatar_url}/>"
);

// Pass avatarUrl in client detail
c = c.replace(
  "<Avatar initials={client.initials} size={72}/>",
  "<Avatar initials={client.initials} size={72} avatarUrl={client.avatar_url}/>"
);

// Pass avatarUrl in today screen chips
c = c.replace(
  "<Avatar initials={c.initials} size={28}/>",
  "<Avatar initials={c.initials} size={28} avatarUrl={c.avatar_url}/>"
);

fs.writeFileSync('src/TrainerApp.jsx', c);
console.log('Done! avatarUrl in Avatar:', c.includes('avatarUrl'));
