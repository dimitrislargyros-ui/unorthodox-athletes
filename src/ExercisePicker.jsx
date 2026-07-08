import { useState, useRef } from "react";
import { EXERCISE_LIST } from "./exerciseList.js";

const C = {
  surface2:"#252525", border:"#2A2A2A", white:"#FFFFFF", muted:"#666666", cyan:"#00C9E1",
};

export default function ExercisePicker({ value, onChange, placeholder="Exercise name", style={} }){
  const [open,setOpen]=useState(false);
  const blurTimer=useRef(null);

  const q=(value||"").trim().toLowerCase();
  const matches=(q?EXERCISE_LIST.filter(n=>n.toLowerCase().includes(q)):EXERCISE_LIST).slice(0,8);

  const select=(name)=>{ onChange(name); setOpen(false); };

  return (
    <div style={{position:"relative",flex:1}}>
      <input
        value={value||""}
        onChange={e=>{ onChange(e.target.value); setOpen(true); }}
        onFocus={()=>setOpen(true)}
        onBlur={()=>{ blurTimer.current=setTimeout(()=>setOpen(false),150); }}
        placeholder={placeholder}
        style={{background:C.surface2,border:`1px solid ${C.border}`,borderRadius:8,padding:"9px 10px",color:C.white,fontSize:13,outline:"none",fontFamily:"inherit",width:"100%",boxSizing:"border-box",...style}}
      />
      {open&&matches.length>0&&(
        <div style={{position:"absolute",top:"calc(100% + 4px)",left:0,right:0,background:"#1E1E1E",border:`1px solid ${C.border}`,borderRadius:8,maxHeight:200,overflowY:"auto",zIndex:50,boxShadow:"0 8px 20px rgba(0,0,0,0.5)"}}>
          {matches.map(name=>(
            <div key={name}
              onMouseDown={(e)=>{ e.preventDefault(); clearTimeout(blurTimer.current); select(name); }}
              style={{padding:"9px 12px",fontSize:13,color:C.white,cursor:"pointer",borderBottom:`1px solid ${C.border}`}}
              onMouseEnter={e=>e.currentTarget.style.background=C.surface2}
              onMouseLeave={e=>e.currentTarget.style.background="transparent"}
            >{name}</div>
          ))}
        </div>
      )}
    </div>
  );
}
