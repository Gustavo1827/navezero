'use strict';
const SEER_EVIDENCE=(()=>{
 const seen=new Set(),note=el('div','seerEvidence');note.hidden=true;note.setAttribute('data-i18n-skip','');$('tasksPanel').append(note);
 const oldHandle=netHandleMessage;netHandleMessage=function(m){
  if(['seer_order','seer_replay'].includes(m.type)){
   if(!NET.inRoom||m.code!==NET.room?.code||m.round!==NET.round||m.actorId!==NET.id&&!NET.isHost)return;
   const ch=charById(m.actorId);if(!ch||!ch.alive||ch.role!=='crew'||ch.function!=='seer')return;
   if(m.type==='seer_order'){ch.seerCd=m.cooldown;ch.seerPending={...m.pending};ch._seerRequestUntil=0;if(ch===G.player){Snd.roleFx('seer','use');toast(t('seer.analyzing'),1600)}}
   else{const key=NET.room.code+'|'+NET.round+'|'+m.actorId+'|'+m.replay.bodyId+'|'+m.replay.startedAt;if(seen.has(key))return;seen.add(key);if(seen.size>64)seen.delete(seen.values().next().value);ch.seerPending=null;ch.seerReplay=structuredClone(m.replay);const last=m.replay.trace.at(-1);if(ch.ai)ch.ai.seerClue={victimName:m.replay.victimName,room:last?.room,vented:m.replay.trace.some(f=>f.vent),cause:m.replay.cause,controlled:m.replay.controlled,t:G.gt};if(ch===G.player){G.seerReplay=ch.seerReplay;const body=G.bodies.find(b=>String(b.id)===m.replay.bodyId);if(body)emitRoleFx(body.x,body.y,'seer');Snd.roleFx('seer','done');toast(t('seer.ready',{victim:m.replay.victimName}),2200)}}return;
  }
  if(['game_start','left','room_expired'].includes(m.type)){seen.clear();note.hidden=true}return oldHandle(m);
 };
 const oldUpdate=update;update=function(dt){const r=oldUpdate(dt),replay=G.seerReplay;note.hidden=!(replay&&G.player?.alive&&G.player.role==='crew'&&G.player.function==='seer'&&!G.over&&['playing','task','tool'].includes(G.state)&&G.gt<replay.until);if(!note.hidden){const text=t('seer.evidence',{victim:replay.victimName})+'\n'+t('seer.cause.'+(NZDeathRules.causes.has(replay.cause)?replay.cause:'unknown'))+(replay.controlled?'\n'+t('seer.controlled'):'');if(note.textContent!==text)note.textContent=text}return r};
 return{};
})();
