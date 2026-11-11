/* Passage detection shared by the server and offline play; no client passage events are trusted. */
'use strict';
(function(root,factory){const rules=factory();if(typeof module==='object'&&module.exports)module.exports=rules;else root.NZSurveillanceRules=rules})(globalThis,()=>{
 const LIMIT=64,MASKED='__signal';
 const definitions=map=>(map.sensors||[]).map(s=>({...s,x:s.x*48,y:s.y*48,w:s.w*48,h:s.h*48}));
 const create=()=>({seq:0,events:[],people:new Map(),playing:false,lastAt:0});
 const contains=(s,p,margin=0)=>p.x>=s.x-margin&&p.x<=s.x+s.w+margin&&p.y>=s.y-margin&&p.y<=s.y+s.h+margin;
 function intersects(s,a,b){let lo=0,hi=1;for(const [from,to,min,max]of [[a.x,b.x,s.x,s.x+s.w],[a.y,b.y,s.y,s.y+s.h]]){const d=to-from;if(Math.abs(d)<.0001){if(from<min||from>max)return false;continue}let t0=(min-from)/d,t1=(max-from)/d;if(t0>t1)[t0,t1]=[t1,t0];lo=Math.max(lo,t0);hi=Math.min(hi,t1);if(lo>hi)return false}return true}
 function color(ch,masked){return masked?MASKED:ch.sensorColor||ch.morphAppearance?.color||ch.color}
 function sample(state,sensors,chars,{playing=true,masked=false,now=Date.now(),elapsedMs=0}={}){
  now=Math.max(now,state.lastAt);state.lastAt=now;
  if(!playing){state.people.clear();state.playing=false;return[]}
  const fresh=[],present=new Set();
  for(const ch of chars){if(!ch?.id||!Number.isFinite(ch.x)||!Number.isFinite(ch.y))continue;present.add(ch.id);const previous=state.people.get(ch.id),eligible=!!ch.alive&&!ch.ghost&&!ch.vent&&!ch.ventAnim,teleport=Number(ch.teleportSeq)||0;
   const p={x:ch.x,y:ch.y,eligible,teleport,inside:new Set(previous?.inside||[])};
   const seed=!state.playing||!previous||!eligible||!previous.eligible||previous.teleport!==teleport||Math.hypot(p.x-previous.x,p.y-previous.y)>384;
   for(const s of sensors){const inside=contains(s,p);if(seed){if(inside)p.inside.add(s.id);else p.inside.delete(s.id);continue}
    if(p.inside.has(s.id)){if(!contains(s,p,6))p.inside.delete(s.id);continue}
    if(inside||intersects(s,previous,p)){fresh.push({sensorId:s.id,color:color(ch,masked),at:now,elapsedMs:Math.max(0,Math.floor(Number(elapsedMs)||0))});if(inside)p.inside.add(s.id)}
   }
   state.people.set(ch.id,p);
  }
  for(const id of state.people.keys())if(!present.has(id))state.people.delete(id);
  state.playing=true;
  for(const entry of fresh){entry.seq=++state.seq;state.events.push(entry)}if(state.events.length>LIMIT)state.events.splice(0,state.events.length-LIMIT);
  return fresh;
 }
 return{LIMIT,MASKED,definitions,create,sample,contains,intersects};
});
