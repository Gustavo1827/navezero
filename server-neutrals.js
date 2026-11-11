/* New neutral rules run on Node; the existing match transport and engine remain intact. */
'use strict';
const fs=require('node:fs'),vm=require('node:vm'),{Ledger,createPlan,assignments}=require('./assets/neutral-rules'),RoleRules=require('./assets/role-rules'),NeutralRules=require('./assets/neutral-rules');
const source=fs.readFileSync(require('node:path').join(__dirname,'index.html'),'utf8');
const a=source.indexOf('const TASK_TEMPLATES='),b=source.indexOf('\n];',a)+3,TEMPLATES=vm.runInNewContext(source.slice(a,b)+';TASK_TEMPLATES');
function geometry(map){
 const context={COLS:64,ROWS:46,Uint8Array,Int16Array,ROOM_DEFS:map.rooms,DOOR_DEFS:map.doors,DECOR:map.decor,STATION_DEFS:map.stations,CORRIDORS:map.corridors,ROOM_BY_ID:Object.fromEntries(map.rooms.map(r=>[r.id,r])),ACTIVE_MAP_ID:map.id,map};
 const k=source.indexOf('function kryosFloorData('),end=source.indexOf('\nfunction activateMapData',k),start=source.indexOf('  const corridorMask=',end),stop=source.indexOf('  rebuildWalk();',start);
 vm.runInNewContext("let floor=new Uint8Array(COLS*ROWS),block=new Uint8Array(COLS*ROWS),roomAt=new Int16Array(COLS*ROWS).fill(-1),OUTSIDE_VOID,WATER_MASK;function fillR(arr,x,y,w,h,v){for(let j=y;j<y+h;j++)for(let i=x;i<x+w;i++)if(i>=0&&j>=0&&i<COLS&&j<ROWS)arr[j*COLS+i]=v}\n"+source.slice(k,end)+'\n'+source.slice(start,stop)+';globalThis.result={floor,block};',context);return context.result;
}
module.exports=function({maps,send,broadcast,clients,personalize,hostSnapshot,roomState,finish}){
 const kr=fs.readFileSync(require('node:path').join(__dirname,'assets/kryos-games.js'),'utf8'),ka=kr.indexOf(' const specs=['),kb=kr.indexOf(' GAMES.kr_oxygen=',ka);vm.runInNewContext(kr.slice(ka,kb),{MAP_LIBRARY:maps,TASK_TEMPLATES:TEMPLATES,FAKE_GAME:{}});
 const grids=Object.fromEntries(Object.entries(maps).map(([id,map])=>[id,geometry(map)]));
 function ray(room,c,p,s,target){const map=maps[room.settings.mapId],grid=grids[room.settings.mapId],dx=p.x-c.x,dy=p.y-c.y,d=Math.hypot(dx,dy),steps=Math.max(1,Math.ceil(d/3));for(let i=0;i<=steps;i++){const x=Math.floor((c.x+dx*i/steps)/48),y=Math.floor((c.y+dy*i/steps)/48),n=y*64+x;if(x<0||y<0||x>=64||y>=46||!grid.floor[n])return false;if(grid.block[n]&&!(target&&x>=target.x&&x<target.x+target.w&&y>=target.y&&y<target.y+target.h))return false;if(map.doors.some((r,j)=>s.doors?.[j]&&x>=r.x&&x<r.x+r.w&&y>=r.y&&y<r.y+r.h))return false}return true}
 function near(room,c,id,s){const st=maps[room.settings.mapId].stations.find(r=>r.id===id);if(!st)return false;const l=st.x*48+.5,t=st.y*48+.5,r=(st.x+st.w)*48-.5,b=(st.y+st.h)*48-.5,points=[{x:Math.max(l,Math.min(r,c.x)),y:Math.max(t,Math.min(b,c.y+4))}];for(const k of [.05,.25,.5,.75,.95])points.push({x:l,y:t+(b-t)*k},{x:r,y:t+(b-t)*k},{x:l+(r-l)*k,y:t},{x:l+(r-l)*k,y:b});return points.some(p=>Math.hypot(c.x-p.x,c.y+4-p.y)<=[48,120,220][room.settings.actionDistance??1]+1&&ray(room,{x:c.x,y:c.y+4},p,s,st))}

 function model(room){if(room.neutralLedger)return room.neutralLedger;let seq=1000000000+Math.floor(Math.random()*100000000);const picked=(pool,n)=>pool.slice().sort(()=>Math.random()-.5).slice(0,n);const common=picked(TEMPLATES.filter(t=>(t.map||'nave')===room.settings.mapId&&t.category==='common'),room.settings.commonTasks);room.neutralLedger=new Ledger({near:(c,id,s)=>near(room,c,id,s),ray:(c,t,s)=>ray(room,c,t,s),tasksFor:c=>{const pool=TEMPLATES.filter(t=>(t.map||'nave')===room.settings.mapId),chosen=[...common,...picked(pool.filter(t=>t.category==='medium'),room.settings.mediumTasks),...picked(pool.filter(t=>t.category==='long'),room.settings.longTasks)];if(!chosen.length)chosen.push(pool.find(t=>t.category==='medium')||pool[0]);return chosen.map(t=>({...structuredClone(t),id:++seq,owner:c.id,done:false,steps:t.steps.map(st=>({...st,done:false}))}))}});room.neutralViews=new Map();return room.neutralLedger}
 function enabled(room){return ['classic','mimica'].includes(room.mode)}
 function ids(room){return new Set([...room.players,...room.botRoster.slice(0,room.bots)].map(c=>c.id))}
 function publish(room){if(!enabled(room)||!room.neutralLedger)return;const m=model(room);for(const p of room.players){const v=m.view(p.id,p.id===room.hostId),sig=JSON.stringify(v);if(room.neutralViews.get(p.id)===sig)continue;room.neutralViews.set(p.id,sig);send(clients.get(p.id)?.ws,{type:'neutral_state',round:room.round,code:room.code,serverNow:Date.now(),state:v})}}
 function resend(room){if(room.roleRevision&&room.lastSnapshot){send(clients.get(room.hostId)?.ws,{type:'role_swap',code:room.code,round:room.round,snapshot:hostSnapshot(room.lastSnapshot,room.hostId)});return}sendPlan(room)}
 function swapped(room,e){
  const s=room.lastSnapshot;room.roleRevision=s.roleRevision;room.shiftHistory.push({actorId:e.actorId,targetId:e.targetId,gt:s.gt,revision:s.roleRevision});if(room.shiftHistory.length>256)room.shiftHistory.shift();room.shiftCounts.set(e.actorId,(room.shiftCounts.get(e.actorId)||0)+1);room.shifterTenures.set(e.targetId,(room.shifterTenures.get(e.targetId)||0)+1);
  for(const id of [e.actorId,e.targetId]){const ch=s.chars.find(c=>c.id===id);room.assignedRoles[id]={role:ch.role,function:ch.function};room.captainRecords?.delete(id);room.sheriffRecords?.delete(id);if(ch.function==='captain')room.captainRecords?.set(id,{uses:Math.max(0,ch.emUses||0),readyAt:ch.captainReadyAt,notBefore:performance.now()+room.settings.captainCooldown*1000})}
  room.roleSwapPending=true;
  for(const p of room.players)send(clients.get(p.id)?.ws,{type:'role_swap',code:room.code,round:room.round,snapshot:p.id===room.hostId?hostSnapshot(s,p.id):personalize(s,p.id)});
 }
 function events(room){const m=model(room);for(const e of m.events.splice(0)){
  if(e.type==='shift'){swapped(room,e);continue}
  if(e.type==='victory'){finish(room,{winner:'neutral',id:e.id,kind:e.kind,reason:'newNeutral.'+e.kind+'Win'});continue}
  broadcast(room,{...e,type:'neutral_event',eventType:e.type,round:room.round,code:room.code});
 }}
 function sync(room,snapshot){if(!enabled(room)||room.status!=='playing')return;const m=model(room);m.sync(snapshot,ids(room),room.settings);room.lastSnapshot=snapshot;events(room);publish(room)}
 function handle(room,client,msg){if(msg.type!=='neutral_action')return false;if(!enabled(room)||room.ending||room.roleSwapPending||room.captainPending||[...room.sheriffRecords?.values()||[]].some(r=>!r.applied)||performance.now()<room.sensorStartedAt||room.status!=='playing'||msg.round!==room.round||!room.lastSnapshot)return true;const m=model(room),id=msg.actorId&&client.id===room.hostId&&room.botRoster.some(b=>b.id===msg.actorId)?msg.actorId:client.id;m.sync(room.lastSnapshot,ids(room),room.settings);const result=m.action(id,msg.action,msg);if(result){m.sync(room.lastSnapshot,ids(room),room.settings);send(client.ws,{...result,type:'neutral_ack',resultType:result.type,round:room.round,code:room.code});events(room);publish(room)}else send(client.ws,{type:'neutral_rejected',round:room.round,code:room.code,actorId:id,action:msg.action});return true}
 function prepare(room){const all=[...ids(room)];room.neutralPlanRound=room.round+1;room.neutralAssignments=null;room.initialRoles=enabled(room)?RoleRules.create(all,room.settings,NeutralRules):null;room.assignedRoles=room.initialRoles?structuredClone(room.initialRoles):null;const chosen=Object.entries(room.initialRoles||{}).filter(([,r])=>r.role==='neutral');room.neutralPlan=enabled(room)?{order:[...chosen.map(([id])=>id),...all.filter(id=>!chosen.some(([n])=>n===id))],roles:chosen.map(([,r])=>r.function)}:null;room.roleSwapPending=false;room.shiftHistory=[];room.shiftCounts=new Map();room.shifterTenures=new Map()}
 function sendPlan(room){if(room.neutralPlan)send(clients.get(room.hostId)?.ws,{type:'neutral_plan',code:room.code,round:room.neutralPlanRound,plan:room.neutralPlan,initialRoles:room.initialRoles})}
 function validate(room,s){
  if(!enabled(room)||!room.neutralPlan)return true;
  if((s.roleRevision||0)!==(room.roleRevision||0))return false;
  const chars=s.chars||[];if(new Set(chars.map(c=>c.id)).size!==chars.length||[...ids(room)].some(id=>!chars.some(c=>c.id===id)))return false;if(room.assignedRoles){
   const previous=room.lastSnapshot;
   for(const ch of chars){let expected=room.assignedRoles[ch.id];if(!expected)return false;
    const before=previous?.chars?.find(c=>c.id===ch.id);
    if(before?.alive===false&&ch.alive&&ch.revivedOnce&&!before.revivedOnce)expected=room.assignedRoles[ch.id]={role:'crew',function:null};
    if(before?.role==='crew'&&ch.role==='imp'&&previous?.parasiteInfections?.[ch.id]&&previous.state==='meeting'&&s.state==='playing')expected=room.assignedRoles[ch.id]={role:'imp',function:null};
    if(ch.role!==expected.role||ch.function!==expected.function)return false;ch.shiftCount=room.shiftCounts?.get(ch.id)||0;ch.shifterTenure=room.shifterTenures?.get(ch.id)||0;
   }
  }
  const chosen=Object.fromEntries(Object.entries(room.assignedRoles||{}).filter(([,v])=>v.role==='neutral').map(([id,v])=>[id,v.function]));
  const neutrals=chars.filter(c=>c.role==='neutral');if(new Set(neutrals.map(c=>c.id)).size!==neutrals.length)return false;
  room.neutralAssignments=chosen;room.roleSwapPending=false;return true;
 }
 return{sync,handle,publish,near,ray,model,prepare,sendPlan,validate,resend};
};
