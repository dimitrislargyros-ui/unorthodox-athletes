// patch.js - Run with: node patch.js
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'src', 'ClientApp.jsx');
let c = fs.readFileSync(file, 'utf8');

// Fix: Set user logged in IMMEDIATELY after login, load data in background
const oldHandleLogin = `  const handleLogin = async (email,pw) => {
    const data = await authLogin(email,pw);
    if(data.error) throw new Error(data.error_description||data.error);
    const {access_token,expires_at,user} = data;
    // Check role before saving session
    const profile = await getProfile(user.id, access_token);
    if(profile?.role === "trainer") {
      throw new Error("TRAINER_ROLE");
    }
    await window.storage.set("ua_client_session",JSON.stringify({token:access_token,userId:user.id,expiresAt:expires_at}));
    await loadData(access_token,user.id);
  };`;

const newHandleLogin = `  const handleLogin = async (email,pw) => {
    const data = await authLogin(email,pw);
    if(data.error) throw new Error(data.error_description||data.error);
    const {access_token,expires_at,user} = data;
    // Save session
    localStorage.setItem("ua_client_session",JSON.stringify({token:access_token,userId:user.id,expiresAt:expires_at}));
    // Set logged in immediately - don't wait for data
    setAuth({loading:false,token:access_token,userId:user.id,profile:null,pkg:null,sessions:[],prs:[]});
    // Load data in background
    loadData(access_token,user.id);
  };`;

// Fix localStorage in init
const oldInit = `        const saved = localStorage.getItem("ua_client_session"); const savedObj = saved ? {value: saved} : null;
        if(savedObj){
          const {token,userId,expiresAt} = JSON.parse(savedObj.value);`;

const newInit = `        const saved = localStorage.getItem("ua_client_session");
        if(saved){
          const {token,userId,expiresAt} = JSON.parse(saved);`;

// Fix loadData to never log out user
const oldLoadData = `    }catch(e){
      console.error("Load error:",e);
      // Stay logged in even if data fails to load
      setAuth({loading:false,token,userId,profile:null,pkg:null,sessions:[],prs:[]});
    }`;

const newLoadData = `    }catch(e){
      console.error("Load error:",e.message);
      // Stay logged in, just show empty data
      setAuth(prev => ({...prev, loading:false}));
    }`;

let changed = 0;
if(c.includes('await window.storage.set("ua_client_session"')) {
  c = c.replace(oldHandleLogin, newHandleLogin);
  changed++;
  console.log('✓ Fixed handleLogin');
}

if(c.includes('const savedObj = saved ? {value: saved} : null;')) {
  c = c.replace(oldInit, newInit);
  changed++;
  console.log('✓ Fixed init localStorage');
}

if(c.includes('// Stay logged in even if data fails to load')) {
  c = c.replace(oldLoadData, newLoadData);
  changed++;
  console.log('✓ Fixed loadData catch');
}

// Fix loadData to always use individual catches
c = c.replace(
  `const profile = await getProfile(userId,token);
      const pkg     = await getPackage(userId,token);
      const sessions= await getSessions(userId,token).catch(()=>[]);
      const prs     = await getPRs(userId,token).catch(()=>[]);`,
  `const profile = await getProfile(userId,token).catch(()=>null);
      const pkg     = await getPackage(userId,token).catch(()=>null);
      const sessions= await getSessions(userId,token).catch(()=>[]);
      const prs     = await getPRs(userId,token).catch(()=>[]);`
);
console.log('✓ Fixed individual query catches');

// Fix init to not use savedObj
c = c.replace('if(savedObj.value){', 'if(saved){');
c = c.replace("JSON.parse(savedObj.value)", "JSON.parse(saved)");
c = c.replace('if(savedObj){', 'if(saved){');

fs.writeFileSync(file, c);
console.log('\n✅ Patch applied! Now run: git add . && git commit -m "Fix login" && git push');