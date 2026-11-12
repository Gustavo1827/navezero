/* Server-retained death evidence and private, validated Seer examinations. */
'use strict';
const Rules=require('./assets/death-rules');
module.exports=function({send,clients,ray,maps}){
 function model(room){if(room.deathEvidence?.round===room.round)return room.deathEvidence;return room.deathEvidence={round:room.round,deaths:new Map(),seers:new Map()}}
 function ingest(room,s,previous){
  const m=model(room),gt=Number(s.gt)||0;
  for(const body of s.bodies||[]){const victim=s.chars.find(c=>String(c.id)===String(body.victimId??body.id));if(!victim||victim.alive)continue;const key=Rules.key(body);let rec=m.deaths.get(key);
   if(!rec){
    const before=previous?.chars?.find(c=>c.id===victim.id),fire=body.cause==='pyromancer'&&room.neutralLedger?.deaths.has(victim.id);
    if(!before?.alive&&!fire)continue;
    let executorId=body.deathContext?.executorId||body.killerId||null,executor=s.chars.find(c=>c.id===executorId),controllerId=null;
    const snapshots=[previous,s];for(const state of snapshots){const e=state?.chars?.find(c=>c.id===executorId),owner=state?.chars?.find(c=>c.controlTargetId===executorId&&c.function==='marionette');if(e?.controlledBy&&owner?.id===e.controlledBy){controllerId=owner.id;break}}
    const claimed=body.deathContext?.controllerId,controller=s.chars.find(c=>c.id===claimed&&c.role==='imp'&&c.function==='marionette');
    if(!controllerId&&controller&&executor?.role==='crew')controllerId=controller.id;
    if(!executor&&!previous?.chars?.some(c=>c.id===executorId))executorId=null;
    const cause=Rules.causes.has(body.cause)?body.cause:Rules.causes.has(body.deathContext?.cause)?body.deathContext.cause:executorId?'kill':'unknown';
    rec={bodyId:String(body.id),victimId:victim.id,victimName:String(body.name||victim.name),executorId,controllerId,cause,face:(body.deathContext?.face??executor?.face)<0?-1:1,at:gt,trace:[{t:0,x:body.x,y:body.y,room:body.room||'',vent:null}]};m.deaths.set(key,rec);if(m.deaths.size>256)m.deaths.delete(m.deaths.keys().next().value);
   }
   // Identity/cause are fixed. Only this executor's observed route may extend the replay.
   const executor=s.chars.find(c=>c.id===rec.executorId);if(executor&&gt-rec.at<=10&&gt-rec.at>=.12){const f={t:Math.max(0,gt-rec.at),x:executor.x,y:executor.y,room:maps[room.settings.mapId].rooms.find(r=>executor.x>=r.x*48&&executor.x<(r.x+r.w)*48&&executor.y>=r.y*48&&executor.y<(r.y+r.h)*48)?.name||body.room||'',vent:executor.vent||null},last=rec.trace.at(-1);if(Math.hypot(f.x-last.x,f.y-last.y)>7||f.vent!==last.vent)rec.trace.push(f);if(rec.trace.length>90)rec.trace.shift()}
   body.killerId=rec.executorId;body.cause=rec.cause;body.deathContext={executorId:rec.executorId,controllerId:rec.controllerId,cause:rec.cause,face:rec.face};body.killerTrace=structuredClone(rec.trace);
  }
  return m;
 }
 function sync(room,s,previous){
  const m=ingest(room,s,previous),dt=Math.max(0,(Number(s.gt)||0)-(Number(previous?.gt)||0));s.seerReplays={};
  for(const ch of s.chars||[]){if(ch.role!=='crew'||ch.function!=='seer'){m.seers.delete(ch.id);continue}let r=m.seers.get(ch.id);if(!r){r={remaining:Math.max(0,Number(ch.seerCd)||0),pending:null,replay:null};m.seers.set(ch.id,r)}
   const before=previous?.chars?.find(c=>c.id===ch.id);if(previous?.state==='playing'&&!before?.vent&&!before?.ventAnim)r.remaining=Math.max(0,r.remaining-dt);r.remaining=Math.max(r.remaining,Number(ch.seerCd)||0);
   if(!ch.alive||s.state==='meeting'||s.over){r.pending=null;r.replay=null}
   if(r.pending&&s.state==='playing'&&s.gt>=r.pending.readyAt&&!(s.sab?.comms>0)){
    const body=s.bodies.find(b=>Rules.key(b)===r.pending.key),record=body&&m.deaths.get(r.pending.key);r.pending=null;
    if(record){r.replay=Rules.replay(record,s.gt,10);notify(room,ch.id,{type:'seer_replay',actorId:ch.id,replay:r.replay})}
   }
   if(r.replay&&s.gt>=r.replay.until)r.replay=null;
   ch.seerCd=r.remaining;ch.seerPending=r.pending?{bodyId:r.pending.bodyId,readyAt:r.pending.readyAt,server:true}:null;
   if(r.replay)s.seerReplays[ch.id]=structuredClone(r.replay);
  }
 }
 function notify(room,id,message){const payload={...message,round:room.round,code:room.code};send(clients.get(id)?.ws,payload);if(id!==room.hostId)send(clients.get(room.hostId)?.ws,payload)}
 function handle(room,client,msg){if(msg.type!=='seer_request'&&!(msg.type==='action'&&msg.action==='seer_inspect'))return false;
  const s=room.lastSnapshot,m=model(room),id=client.id===room.hostId&&room.botRoster.some(b=>b.id===msg.actorId)?msg.actorId:client.id,ch=s?.chars?.find(c=>c.id===id),body=s?.bodies?.find(b=>String(b.id)===String(msg.bodyId)),r=m.seers.get(id);
  if(room.status!=='playing'||room.ending||room.authorityTransfer||performance.now()<room.sensorStartedAt||s?.state!=='playing'||s.meeting||s.sab?.comms>0||!ch?.alive||ch.role!=='crew'||ch.function!=='seer'||ch.vent||ch.ventAnim||ch.controlledBy||!body||!r||r.remaining>0||r.pending||Math.hypot(ch.x-body.x,ch.y-body.y)>[48,120,220][room.settings.actionDistance??1]||!ray(room,ch,body,s)||!m.deaths.has(Rules.key(body)))return true;
  r.remaining=room.settings.seerCooldown;r.pending={key:Rules.key(body),bodyId:String(body.id),readyAt:s.gt+room.settings.seerDelay};ch.seerCd=r.remaining;ch.seerPending={bodyId:String(body.id),readyAt:r.pending.readyAt,server:true};notify(room,id,{type:'seer_order',actorId:id,cooldown:r.remaining,pending:ch.seerPending});sync(room,s,s);return true;
 }
 return{sync,ingest,handle,model};
};
