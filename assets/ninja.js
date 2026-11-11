/* Ninja reuses host simulation, teleport sequence numbers, collisions and ordinary kills. */
'use strict';
const NINJA=(()=>{
 const authority=()=>!NET.inRoom||NET.isHost,classic=()=>!G.hns&&!G.hp&&(!NET.inRoom||['classic','mimica'].includes(NET.room?.mode)),live=()=>classic()&&!G.over&&!G.M&&['playing','task','tool'].includes(G.state);
 const shaking=ch=>!!ch?.ninja&&ch.ninja.phase!=='away',pending=new Map();
 function valid(ch){return live()&&ch?.alive&&ch.role==='imp'&&ch.function==='ninja'&&(!ch.vent||ch.ninja?.phase==='away')&&!ch.controlledBy&&!ch.controlTargetId&&!ch.killDash&&!ch.minerDig&&!ch.morphTransition}
 function targets(ch){const eligible=G.chars.filter(c=>c!==ch&&c.alive&&!c.vent&&!c.controlledBy&&!c.killDash&&hunterTargetConnected(c)),radius=TILE*8;
  const alone=eligible.filter(c=>!G.chars.some(o=>o!==c&&o.alive&&!o.vent&&hunterTargetConnected(o)&&dist(c,o)<radius));
  return {alone:alone.sort((a,b)=>dist(ch,a)-dist(ch,b)),eligible};
 }
 function landing(target,ch){const points=[];for(let y=Math.floor(target.y/TILE)-2;y<=Math.floor(target.y/TILE)+2;y++)for(let x=Math.floor(target.x/TILE)-2;x<=Math.floor(target.x/TILE)+2;x++){
  const p={x:(x+.5)*TILE,y:(y+.5)*TILE-OFF_Y};if(x<0||x>=COLS||y<0||y>=ROWS||!walk[y*COLS+x]||boxBlocked(p.x,p.y,false)||!losClear(p.x,p.y,target.x,target.y)||G.chars.some(c=>c!==ch&&c.alive&&!c.vent&&dist(c,p)<26))continue;points.push(p)}
  return points.sort((a,b)=>dist(a,target)-dist(b,target))[0]||null;
 }
 function jump(ch,point){if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.y)||boxBlocked(point.x,point.y,false))return false;ch.x=point.x;ch.y=point.y;ch.teleportSeq=(ch.teleportSeq||0)+1;ch.moving=false;ch.ninjaSeq=(ch.ninjaSeq||0)+1;if(ch.ai){ch.ai.path=[];ch.ai.goal=null;ch.ai.hunt=null;ch.ai.repT=0;ch.ai.state='idle';ch.ai.wait=.2}if(ch===G.player){NET.reconcileX=NET.reconcileY=0;joy.x=joy.y=0}return true}
 function cancel(ch,cooldown=true){if(!ch?.ninja)return;ch.ninja=null;ch.moving=false;if(cooldown&&ch.alive)ch.ninjaCd=CFG.ninjaCooldown;pending.delete(ch.id)}
 function begin(ch){if(!authority()||!valid(ch)||shaking(ch))return false;pending.delete(ch.id);if(ch.ninja?.phase==='away'){if(ch.vent&&!exitVent(ch))return false;ch.ninja.phase='return';ch.ninja.readyAt=G.gt+1;ch.moving=false;return true}
  if((ch.ninjaCd||0)>0)return false;const {alone,eligible}=targets(ch),target=alone[0]||(eligible.length?pick(eligible):null);if(!target)return false;
  ch.ninja={phase:'outbound',readyAt:G.gt+1,targetId:target.id,origin:{x:ch.x,y:ch.y}};ch.moving=false;return true;
 }
 function request(ch=G.player){if(!valid(ch)||shaking(ch)||(!ch.ninja&&(ch.ninjaCd||0)>0)||(pending.get(ch.id)||0)>performance.now())return false;
  if(NET.inRoom){if(ch!==G.player&&!(NET.isHost&&ch.isBot))return false;const ok=netSend({type:'ninja_request',actorId:ch.id});if(ok)pending.set(ch.id,performance.now()+1500);return ok}return begin(ch);
 }
 function tick(dt){if(!authority())return;for(const ch of G.chars){if(ch.function!=='ninja'){if(ch.ninja)cancel(ch);continue}if(!live()||!ch.alive){if(ch.ninja)cancel(ch);continue}ch.ninjaCd=Math.max(0,(ch.ninjaCd||0)-abilityCooldownDelta(ch,dt));const n=ch.ninja;if(!n)continue;if(!valid(ch)){cancel(ch);continue}
  if(n.phase==='away'){if(G.gt>=n.until-1&&begin(ch))ch.ninja.readyAt=Math.max(G.gt,n.until);continue}ch.moving=false;if(G.gt<n.readyAt)continue;
  if(n.phase==='outbound'){const target=charById(n.targetId),point=target?.alive&&!target.vent&&hunterTargetConnected(target)?landing(target,ch):null;if(!point||!jump(ch,point)){cancel(ch);continue}n.phase='away';n.until=G.gt+CFG.ninjaDuration}
  else{const point=nearestWalkablePosition(n.origin.x,n.origin.y);jump(ch,point);cancel(ch)}
 }}
 const tab=$('btnNinjaSection');tab.addEventListener('click',()=>{G.cfgFunctionTab='ninja';buildCfgUI()});
 function buttonState(ch){if(ch.ninja)pending.delete(ch.id);const cooldown=!ch.ninja&&(ch.ninjaCd||0)>0;return{cooldown,label:shaking(ch)?'…':ch.ninja?t('ninja.return'):roleLabelByFunction('ninja'),disabled:!valid(ch)||shaking(ch)||(pending.get(ch.id)||0)>performance.now()||cooldown||G.state!=='playing'||uiBusy()}}
 const oldUpdate=update;update=function(dt){tick(simActive()?dt:0);return oldUpdate(dt)};
 const oldKey=triggerFunctionKey;triggerFunctionKey=function(){if(G.player?.alive&&G.player.function==='ninja'){if(G.state==='playing'&&!uiBusy())request();return}return oldKey()};
 const oldHost=netHostCommand;netHostCommand=function(m){const ch=charById(m.playerId),cmd=m.command||m.action;if(cmd==='ninja'){if(NET.isHost&&ch)begin(ch);return}if(shaking(ch)&&cmd!=='input')return;return oldHost(m)};
 const oldNpc=updateNPC;updateNPC=function(ch,dt){return ninjaBotUpdate(ch,dt,oldNpc)};
 const oldInteract=doInteract;doInteract=function(a){if(shaking(G.player))return;return oldInteract(a)};
 const oldSab=startSabotage;startSabotage=function(type,ch=G.player){if(shaking(ch))return false;return oldSab(type,ch)};
 const oldPlayerKill=playerKill;playerKill=function(){if(shaking(G.player))return;return oldPlayerKill()};
 const oldKill=doKill;doKill=function(k,v){if(shaking(k))return false;return oldKill(k,v)};
 const oldVent=enterVent;enterVent=function(ch,v){if(shaking(ch))return false;return oldVent(ch,v)};
 const oldKillChar=killChar;killChar=function(ch){cancel(ch,false);return oldKillChar(ch)};
 const oldMeeting=callMeeting;callMeeting=function(...args){const r=oldMeeting(...args);if(G.M)for(const ch of G.chars)cancel(ch);return r};
 const oldEnd=endGame;endGame=function(...args){for(const ch of G.chars)cancel(ch);return oldEnd(...args)};
 const oldNew=newGame;newGame=function(...args){pending.clear();return oldNew(...args)};
 const oldDraw=drawChar;drawChar=function(c,ch,...args){if(shaking(ch)){c.save();c.translate(Math.sin((G.t||0)*85)*2.7,Math.cos((G.t||0)*73)*1.2);oldDraw(c,ch,...args);c.restore();return}return oldDraw(c,ch,...args)};
 function capture(s){for(const record of s.chars){const ch=charById(record.id);record.ninja=ch?.ninja?{...ch.ninja,origin:{...ch.ninja.origin}}:null;record.ninjaCd=ch?.ninjaCd||0}return s}
 const oldCapture=netCaptureSnapshot;netCaptureSnapshot=function(){return capture(oldCapture())};
 const oldMotion=netCaptureMotion;netCaptureMotion=function(){return capture(oldMotion())};
 const oldLanguage=applyGameLanguage;applyGameLanguage=function(){const r=oldLanguage();tab.textContent='⚔️ '+roleLabelByFunction('ninja');if(G.player)updateButtons();return r};tab.textContent='⚔️ '+roleLabelByFunction('ninja');
 return{buttonState,request,begin,cancel,targets,landing,tick,shaking};
})();
