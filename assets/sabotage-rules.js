/* Door rules shared by the authoritative server and offline matches. Geometry stays in MAP_LIBRARY. */
'use strict';
(function(root,factory){const rules=factory();if(typeof module==='object'&&module.exports)module.exports=rules;else root.NZSabotageRules=rules})(globalThis,()=>{
 const MAIN=['reactor','oxygen','lights','comms'],overlap=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
 function catalog(map){
  const rooms=map.rooms.filter(r=>!r.hall),ship=rooms.find(r=>r.id==='ship');
  const list=map.doors.filter(d=>!d.decon&&!(map.id==='kryos'&&(ship?.openings||[]).some(o=>overlap(o,d))));
  const groups=rooms.filter(r=>!(map.id==='kryos'&&r.id==='ship')).map(r=>({id:r.id,name:r.name,doorIds:[]}));
  for(const d of list){let rs=groups.filter(g=>(rooms.find(r=>r.id===g.id).openings||[]).some(o=>overlap(o,d)));
   if(!rs.length&&map.id!=='kryos'){const ranked=groups.map(g=>{const r=rooms.find(r=>r.id===g.id),x=d.x+d.w/2,y=d.y+d.h/2;return{g,d:Math.hypot(Math.max(r.x-x,0,x-r.x-r.w),Math.max(r.y-y,0,y-r.y-r.h))}}).sort((a,b)=>a.d-b.d);rs=ranked.filter(x=>x.d<=ranked[0].d+2).slice(0,2).map(x=>x.g)}
   for(const r of rs)r.doorIds.push(d.id);
  }
  return{doors:list.filter(d=>groups.some(g=>g.doorIds.includes(d.id))),groups:groups.filter(g=>g.doorIds.length)};
 }
 function create(mapId){return{mapId,revision:0,locks:{},cooldowns:{},doorCooldowns:{},main:null,cooldownUntil:0}}
 function expire(state,now){let changed=false;const owners=new Set();for(const [id,l]of Object.entries(state.locks))if(l.until&&now>=l.until){owners.add(l.roomId);(state.doorCooldowns||(state.doorCooldowns={}))[id]=now+10000;delete state.locks[id];changed=true}
  for(const id of owners)if(!Object.values(state.locks).some(l=>l.roomId===id))state.cooldowns[id]=now+10000;
  if(changed)state.revision++;return changed;
 }
 function lock(state,cat,roomId,doorId,now){expire(state,now);const group=cat.groups.find(g=>g.id===roomId);if(!group||state.main||state.cooldowns[roomId]>now||(doorId&&!group.doorIds.includes(doorId)))return false;
  const ids=group.doorIds;if(!ids.length||ids.some(id=>!group.doorIds.includes(id)||state.locks[id]||state.doorCooldowns?.[id]>now))return false;
  for(const id of ids)state.locks[id]={roomId,until:state.mapId==='kryos'?0:now+10000};state.revision++;return true;
 }
 function open(state,id,now){const l=state.locks[id];if(!l)return false;delete state.locks[id];if(state.mapId!=='kryos')(state.doorCooldowns||(state.doorCooldowns={}))[id]=now+10000;if(state.mapId!=='kryos'&&!Object.values(state.locks).some(o=>o.roomId===l.roomId))state.cooldowns[l.roomId]=now+10000;state.revision++;return true}
 function reserve(state,type,now,cd=0){expire(state,now);if(!MAIN.includes(type)||(type==='oxygen'&&state.mapId!=='kryos')||state.main||Object.keys(state.locks).length||cd>0||state.cooldownUntil>now)return false;state.main={type,pending:true,at:now};state.revision++;return true}
 function sync(state,sab,now,cooldown){if(!sab)return false;let changed=false;const active=state.main;
  for(const key of MAIN)if(key!==active?.type)sab[key]=0;
  if(active&&sab[active.type]>0){if(active.pending){active.pending=false;state.revision++;changed=true}}
  else if(active&&!active.pending){state.main=null;state.cooldownUntil=now+cooldown*1000;state.revision++;changed=true}
  return changed;
 }
 function nearby(ch,d,range){if(!ch||!d||!ch.alive||ch.vent||ch.controlledBy)return false;const x=ch.x,y=ch.y+6;return Math.hypot(Math.max(d.x*48-x,0,x-(d.x+d.w)*48),Math.max(d.y*48-y,0,y-(d.y+d.h)*48))<=range}
 return{MAIN,catalog,create,expire,lock,open,reserve,sync,nearby};
});
