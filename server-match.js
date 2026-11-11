'use strict';
const crypto=require('node:crypto'),Rules=require('./assets/match-rules');
module.exports=function({send,broadcast,clients,personalize,hostSnapshot,roomState}){
 function finish(room){
  const ending=room.ending;if(!ending||room.status!=='playing')return;
  const s=room.lastSnapshot;s.ending=null;s.endingConfirmed=true;s.over=true;s.state='over';s.winner=ending.winner;s.endReason=ending.reason;
  room.authorityTransfer=null;room.status='ended';room.winner=ending.winner;room.endReason=ending.reason;room.ending=null;
  for(const p of room.players)send(clients.get(p.id)?.ws,{type:'game_end',round:room.round,code:room.code,winner:room.winner,reason:room.endReason,snapshot:personalize(s,p.id)});
  roomState(room);
 }
 function lock(room,result){
  if(!Rules.classic(room.mode)||room.status!=='playing'||room.ending||!result||!room.lastSnapshot)return false;
  const s=room.lastSnapshot,ending={id:crypto.randomUUID(),endsAt:Date.now()+2500,winner:result.winner,reason:result.reason};room.ending=ending;
  s.ending=ending;s.state='ending';s.over=false;s.winner=result.winner;s.endReason=result.reason;
  if(result.id){s.neutralWinnerId=result.id;s.neutralWinnerIds=[result.id];s.newNeutralWinnerKind=result.kind}
  s.delayedMarks={};s.parasiteInfections={};room.captainPending=null;room.doorControl&&(room.doorControl.main=null);
  for(const r of room.neutralLedger?.records.values()||[]){r.pending=null;r.ticket=null}
  for(const c of s.chars){c.moving=false;c.killDash=null;c.minerDig=null;c.morphTransition=null;c.controlTargetId=null;c.controlledBy=null;c.cleanPending=null;c.seerPending=null}
  for(const p of room.players)send(clients.get(p.id)?.ws,{type:'match_ending',code:room.code,round:room.round,ending,snapshot:p.id===room.hostId?hostSnapshot(s,p.id):personalize(s,p.id)});
  room.finishTimer=setTimeout(()=>finish(room),2500);room.finishTimer.unref?.();return true;
 }
 function evaluate(room,previous,claim=null){
  if(!Rules.classic(room.mode)||room.ending||room.status!=='playing')return false;
  const s=room.lastSnapshot,ids=new Set([...room.players,...room.botRoster.slice(0,room.bots)].map(c=>c.id));
  let result=Rules.result(s,ids,previous);
  const ledger=room.neutralLedger;if(ledger?.winner)result={winner:'neutral',id:ledger.winner.id,kind:ledger.winner.kind,reason:'newNeutral.'+ledger.winner.kind+'Win'};
  if(!result||result.winner!=='neutral'){
   const id=previous?.meeting?.ejectId,ch=s.chars.find(c=>c.id===id);if(ch?.role==='neutral'&&ch.function==='jester'&&!ch.alive&&previous?.meeting?.ejectId===id&&!previous.meeting.judge)result={winner:'neutral',id,kind:'jester',reason:'neutral.jesterWin'};
  }
  if(!result&&claim?.winner==='imp')for(const key of ['reactor','oxygen'])if(previous?.sab?.[key]>0&&s.sab?.[key]===0&&(s.gt||0)-(previous.gt||0)>=previous.sab[key]-.06)result={winner:'imp',reason:key==='oxygen'?'stage2.oxygenLoss':'match.reactorLoss'};
  return result?lock(room,result):false;
 }
 return{lock,evaluate,finish};
};
