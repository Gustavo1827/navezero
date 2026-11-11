/* Shared NPC navigation, tasks, perception, roles and mode decisions. */
'use strict';
function npcVisionRange(ch){
  if(!ch)return 0;
  const base=ch.role==='imp'?CFG.impVision:CFG.crewVision;
  return ch.role==='crew'&&(G.sab.lights||0)>0?Math.max(110,base*.34):base;
}

function npcCanSeePoint(ch,x,y){
  if(!ch?.alive||ch.vent||!Number.isFinite(x)||!Number.isFinite(y))return false;
  return Math.hypot(ch.x-x,ch.y-y)<=npcVisionRange(ch)&&losClear(ch.x,ch.y,x,y);
}

function npcCanSeeChar(ch,target){
  if(!target||target===ch||!target.alive||target.vent)return false;
  if(ch.role==='crew'&&target.spectralInvisible)return false;
  return npcCanSeePoint(ch,target.x,target.y);
}

function botRoomPoints(ch){
 const ai=ch.ai,points=[];ai.navVisits=ai.navVisits||{};
 for(const r of ROOM_DEFS){for(let n=0;n<5;n++){const x=rand(r.x,r.x+r.w-1),y=rand(r.y,r.y+r.h-1),p={x:(x+.5)*TILE,y:(y+.5)*TILE-OFF_Y,room:r.id};if(walk[y*COLS+x]&&roomAt[y*COLS+x]===r.idx&&!boxBlocked(p.x,p.y,false)){const crowd=G.chars.filter(o=>o!==ch&&o.alive&&o.ai?.navRoom===r.id).length,age=G.gt-(ai.navVisits[r.id]??-100);p.score=Math.random()*180+Math.min(age,90)*7-crowd*190-(roomAtPx(ch.x,ch.y)?.id===r.id?300:0);points.push(p);break}}}
 return points;
}

function botTaskRoute(ch){
 const ai=ch.ai;ai.taskRetry=ai.taskRetry||{};
 const tasks=pendingFor(ch).filter(t=>{const step=nextStep(t);return step&&stationById[step.st]&&(!ai.taskRetry[step.st]||ai.taskRetry[step.st]<G.gt)});
 tasks.sort((a,b)=>{const score=t=>{const s=stationById[nextStep(t).st],crowd=G.chars.filter(o=>o!==ch&&o.alive&&o.ai?.goal?.s?.id===s.id).length;return dist(ch,stationPos(s.id))+crowd*220};return score(a)-score(b)});
 for(const t of tasks){if(!t.fake&&(ch.role!=='crew'&&ch.function!=='worker'||t.owner!==ch.id))continue;const step=nextStep(t),s=stationById[step.st],set=approachSet(s.id,s);if(goTo(ch,{type:'task',t,step,s},(x,y)=>set.has(y*COLS+x)))return true;ai.taskRetry[s.id]=G.gt+5}
 return false;
}

function botFleeRoute(ch,threat,type){
 const ai=ch.ai,points=botRoomPoints(ch).filter(p=>dist(p,ch)>TILE*2);
 points.sort((a,b)=>(dist(b,threat)-dist(b,ch)*.28+b.score*.25)-(dist(a,threat)-dist(a,ch)*.28+a.score*.25));
 const start=tileOf(ch);let best=null;
 for(const p of points.slice(0,6)){const tile=tileOf(p),path=findPath(start.x,start.y,(x,y)=>x===tile.x&&y===tile.y,!!(MAP_LIBRARY[ACTIVE_MAP_ID].decon||MAP_LIBRARY[ACTIVE_MAP_ID].decons));if(!path?.length)continue;const clearance=Math.min(...path.slice(0,8).map(w=>dist(w,threat))),score=clearance*2+dist(p,threat)-path.length*8+p.score*.2;if(!best||score>best.score)best={p,path,score,tile}}
 if(!best)return wander(ch);ai.path=best.path;ai.goal={type};ai.isGoal=(x,y)=>x===best.tile.x&&y===best.tile.y;ai.pathVer=G.walkVer;ai.state='walk';ai.stuck=ai.wpT=0;ai.navRoom=best.p.room;return true;
}

function botLocatorThink(ch,dt){
 if(ch.function!=='locator'||!ch.alive)return;const ai=ch.ai;
 ch.netTrackCd=Math.max(0,(ch.netTrackCd||0)-abilityCooldownDelta(ch,dt));const blocked=roleAbilityBlockedByComms();
 if(ch.netTrackTime>0){ch.netTrackTime=Math.max(0,ch.netTrackTime-dt);const target=charById(ch.netTrackTarget);if(!blocked&&target?.alive&&!target.vent)ai.locatorClue={id:target.id,room:roomName(target.x,target.y),t:G.gt};if(!target?.alive||ch.netTrackTime<=0){ch.netTrackTime=0;ch.netTrackTarget=null;ch.netTrackCd=CFG.locCooldown}return}
 if(blocked)return;ai.locPlan=(ai.locPlan||0)-dt;if(ai.locPlan>0||ch.netTrackCd>0||ch.vent)return;ai.locPlan=2+Math.random();const target=G.chars.filter(c=>npcCanSeeChar(ch,c)&&dist(ch,c)<=actionDistancePx('locator')).sort((a,b)=>(ai.susp[b.id]||0)-(ai.susp[a.id]||0)||dist(ch,a)-dist(ch,b))[0];if(target){ch.netTrackTarget=target.id;ch.netTrackTime=CFG.locDuration}
}

function goTo(ch,goal,isGoal){
  const t=tileOf(ch), p=findPath(t.x,t.y,isGoal,!!(MAP_LIBRARY[ACTIVE_MAP_ID].decon||MAP_LIBRARY[ACTIVE_MAP_ID].decons)); if(p===null)return false;
  const ai=ch.ai;ai.wpT=0;ai.navRoom=goal.s?.room||roomAtPx(p.at(-1)?.x??ch.x,p.at(-1)?.y??ch.y)?.id||null; ai.path=p; ai.goal=goal; ai.isGoal=isGoal; ai.pathVer=G.walkVer; ai.state='walk'; ai.stuck=0; return true;
}

function repath(ch){
  const ai=ch.ai, t=tileOf(ch), p=findPath(t.x,t.y,ai.isGoal,!!(MAP_LIBRARY[ACTIVE_MAP_ID].decon||MAP_LIBRARY[ACTIVE_MAP_ID].decons)); if(p===null)return false;
  ai.path=p; ai.pathVer=G.walkVer; return true;
}

function npcHandleDeconWaypoint(ch,w){
  if(ACTIVE_MAP_ID!=='nexus'||!ch?.ai)return false;
  const tx=Math.floor(w.x/TILE),ty=Math.floor((w.y+OFF_Y)/TILE),door=deconDoorAtTile(tx,ty);
  if(!door||!door.closed)return false;
  const side=door.id===deconDoorId('w')?'w':'e',inside=charInsideDecon(ch);
  if(inside&&G.decon?.phase==='idle'){
    const st=stationById[`decon_${side}_in`];if(st)useDeconButton(ch,st);
  }else if(!inside&&G.decon?.phase==='idle'){
    const st=stationById[`decon_${side}_out`];if(st)useDeconButton(ch,st);
  }
  ch.moving=false;ch.ai.stuck=0;ch.ai.wpT=0;return true;
}

function followPath(ch,dt){
  const ai=ch.ai; if(!ai.path.length){ch.moving=false;return true}
  const w=ai.path[0];if(npcHandleDeconWaypoint(ch,w))return false;
  const dx=w.x-ch.x, dy=w.y-ch.y, d=Math.hypot(dx,dy);
  ai.wpT=(ai.wpT||0)+dt;
  if(ai.wpT>2.5){ai.wpT=0;ai.navFailures=(ai.navFailures||0)+1;if(ai.navFailures>2||!repath(ch)){if(ai.goal?.s){ai.taskRetry=ai.taskRetry||{};ai.taskRetry[ai.goal.s.id]=G.gt+8}ai.path=[];ai.state='idle';ai.wait=1.5;ai.navFailures=0}ch.moving=false;return false}
  if(d<16){ai.navFailures=0;ai.wpT=0;ai.path.shift(); if(!ai.path.length){ch.moving=false;return true} return false}
  const st=Math.min(d,moveSpeedFor(ch,ai.speed)*dt), ox=ch.x, oy=ch.y;
  const moved=moveChar(ch,dx/d*st,dy/d*st); ch.moving=moved; if(moved)ch.walk+=dt;
  if(Math.hypot(ch.x-ox,ch.y-oy)<st*.3){ai.stuck+=dt; if(ai.stuck>1.2){ai.stuck=0; if(!repath(ch)){ai.state='idle';ai.wait=.8}}} else ai.stuck=0;
  return false;
}

function minerBotThink(ch,dt){
  if(ch.minerDig)return true;if(ch.vent||!minerActive(ch))return false;
  if(G.gt>=(ch.ai.minerNextDig||0)&&Math.random()<dt*.08&&beginMinerDig(ch))return true;
  if(ownedMinerHoles(ch).length>1&&Math.random()<dt*.08){const near=ownedMinerHoles(ch).find(h=>dist(ch,h)<actionDistancePx('vent'));if(near&&minerEnter(ch,near.id))return true}return false;
}

function spectralBotThink(ch,dt){
  if(!ch?.alive||ch.role!=='imp'||ch.function!=='spectral'||ch.vent||G.M||G.over)return false;
  if(ch.spectralTransition){ch.ai.hunt=null;return true}if(ch.spectralInvisible){ch.ai.hunt=null;const nearbyCrew=G.chars.some(o=>o!==ch&&o.alive&&o.role==='crew'&&!o.vent&&dist(ch,o)<280&&losClear(ch.x,ch.y,o.x,o.y));if((ch.spectralTime||0)<Math.max(2,spectralActiveDuration()*.55)&&!nearbyCrew&&Math.random()<dt*.18)setSpectralInvisible(ch,false);return true;}
  if(ch.spectralTransition)return true;if((ch.spectralCd||0)>0)return false;const nearCrew=G.chars.filter(o=>o!==ch&&o.alive&&o.role==='crew'&&!o.vent&&dist(ch,o)<300&&losClear(ch.x,ch.y,o.x,o.y));const risky=nearCrew.length>=2||!!ch.ai.hunt||nearCrew.some(o=>o.ai?.witnessOf===ch);if(risky&&Math.random()<Math.min(1,dt*.55)){setSpectralInvisible(ch,true);if(ch.ai.state!=='walk')wander(ch,650);return true}return false;
}

function guardianNpcThink(ch,dt){if(!ch?.guardian||ch.alive||roleAbilityBlockedByComms()||(ch.guardianCd||0)>0||guardianOwnerActive(ch))return false;const targets=guardianSelectableTargets(ch);if(!targets.length)return false;if(Math.random()<Math.min(1,dt*.9)){const t=pick(targets);protectWithGuardian(ch,t);ch.moving=false;return true}return false}

function chooseInstructorNpcPlan(ch){
  if(!ch?.instructor||ch.alive||(G.sab.comms||0)>0||(ch.instructorCd||0)>0)return false;const crew=instructorSelectableTargets(ch).filter(c=>c.role==='crew');if(!crew.length)return false;
  let target=null,point=null;const activeFix=FIX_KEYS.find(k=>G.sab[k]>0&&k!=='comms');if(activeFix){point=stationPos(FIX[activeFix].st);target=crew.slice().sort((a,b)=>dist(a,point)-dist(b,point))[0]}
  if(!target){const plans=[];for(const c of crew){const t=G.tasks.find(t=>t.owner===c.id&&!t.fake&&!t.done);const st=t&&nextStep(t);if(st){const p=stationPos(st.st);plans.push({c,p,d:dist(c,p)})}}plans.sort((a,b)=>a.d-b.d);if(plans.length){target=plans[0].c;point=plans[0].p}}
  if(!target||!point)return false;ch.instructorTargetId=target.id;ch.instructorPoint={x:point.x,y:point.y};return true;
}

function instructorNpcThink(ch,dt){
  if((G.sab.comms||0)>0){ch.instructorTargetId=null;ch.instructorPoint=null;return false}if((ch.instructorCd||0)>0)return false;if(!ch.instructorPoint||!charById(ch.instructorTargetId)?.alive){if(!chooseInstructorNpcPlan(ch))return false}
  const p=ch.instructorPoint,target=charById(ch.instructorTargetId);if(!target)return false;const dx=p.x-ch.x,dy=p.y-ch.y,d=Math.hypot(dx,dy);if(d<24){createInstructorTrail(ch,target,p.x,p.y);ch.moving=false;return true}const sp=(ch.ai?.speed||CFG.speed)*2*dt;ch.x+=dx/d*Math.min(sp,d);ch.y+=dy/d*Math.min(sp,d);ch.moving=true;ch.walk+=dt;if(dx)ch.face=dx>0?1:-1;return true;
}

function updateNPCs(dt){
  G.chars.forEach(ch=>{
    if(ch.isPlayer||ch.isRemoteHuman||G.over)return;
    if(G.freePlay&&ch.freeDummy){if(!ch.killDash)ch.moving=false;return}
    if(ch.alive)updateNPC(ch,dt); else if(ch.ghost)updateGhostNPC(ch,dt);
  });
  separateChars();
}

function updateGhostNPC(ch,dt){   // Mortos vagam sem colisões; Infiltrados mortos ainda podem sabotar.
  const ai=ch.ai; ch.ghost=true;if(ch.guardian&&ch.role==='crew'&&guardianNpcThink(ch,dt))return;if(ch.instructor&&ch.role==='crew'&&instructorNpcThink(ch,dt))return;
  if(ch.role==='crew'&&!G.hns&&!G.hp){
    if(ai.goal?.type==='task'&&ai.state==='work'){ai.work-=dt;ch.moving=false;if(ai.work<=0)finishWork(ch);return}
    if(ai.goal?.type==='task'&&ai.state==='walk'){if(ai.pathVer!==G.walkVer&&!repath(ch)){ai.state='idle';ai.wait=1}else if(followPath(ch,dt))onArrive(ch);return}
    ai.wait=Math.max(0,(ai.wait||0)-dt);if(ai.wait<=0&&botTaskRoute(ch))return;
  }
  if(!ai.ghostDir||!ai.ghostMoveT||ai.ghostMoveT<=0){const a=Math.random()*Math.PI*2;ai.ghostDir={x:Math.cos(a),y:Math.sin(a)};ai.ghostMoveT=rand(12,35)/10}
  ai.ghostMoveT-=dt; const sp=(ai.speed||CFG.speed)*2*dt, margin=TILE*.65;
  ch.x=clamp(ch.x+ai.ghostDir.x*sp,-margin,WORLD_W+margin);ch.y=clamp(ch.y+ai.ghostDir.y*sp,-margin,WORLD_H+margin);
  ch.moving=true;ch.walk+=dt;if(ai.ghostDir.x)ch.face=ai.ghostDir.x>0?1:-1;
  if(ch.role==='imp'){ai.sabT-=dt;if(ai.sabT<=0){ai.sabT=1.6;if(G.gt>45&&G.sab.cd<=0&&Math.random()<.07)aiSabotage(ch)}}
}

function updateNPC(ch,dt){
  if(ch.controlledBy||ch.killDash||ch.morphTransition||ch.minerDig)return;
  if(ch.role==='crew'&&G.state==='playing'&&G.gt>20&&ch.ai&&G.gt>(ch.ai.nextTaskEncourage||45)&&Math.random()<dt*.015){const left=G.tasks.filter(t=>!t.fake&&!t.done).length;ch.ai.nextTaskEncourage=G.gt+rand(25,55);if(left>0){if(left<=5)npcSay(ch,'Faltam poucas tarefas, vamos!');else if(Math.random()<.5)npcSay(ch,'Vamos fazer tarefas para vencer!');else npcSay(ch,'Mortos, façam as suas tarefas!')}}
  const ai=ch.ai;botLocatorThink(ch,dt);
  if(ch.function==='miner'&&minerBotThink(ch,dt))return;
  if(ch.function==='metamorph'&&ch.role==='imp'&&!ch.morphAppearance&&!ch.morphTransition&&ch.morphCd<=0&&Math.random()<dt*.18){const target=shuffle(G.chars.filter(c=>npcCanSeeChar(ch,c)))[0];if(target)beginMorph(ch,target)}
  if(ch.morphTransition)return;
  const paramedicBusy=ch.function==='paramedic'&&ch.role==='crew'&&paramedicBotThink(ch,dt);const seerBusy=ch.function==='seer'&&ch.role==='crew'&&seerBotThink(ch,dt);const cleanerBusy=ch.function==='cleaner'&&ch.role==='imp'&&cleanerBotThink(ch,dt);const parasiteBusy=ch.function==='parasite'&&ch.role==='imp'&&parasiteBotThink(ch,dt);const spectralBusy=ch.function==='spectral'&&ch.role==='imp'&&spectralBotThink(ch,dt);
  if(ch.function==='marionette'&&ch.role==='imp'&&ch.alive&&!ch.controlTargetId&&(ch.controlCd||0)<=0&&G.state==='playing'&&!G.M&&Math.random()<dt*.08){const target=controlTargetFor(ch);if(target&&!hasWitness(ch,target))startControl(ch,target)}
  if(ch.vent){ventUpdate(ch,dt);return}
  const rn=roomName(ch.x,ch.y); if(ai.trail[ai.trail.length-1]!==rn){ai.trail.push(rn);if(ai.trail.length>4)ai.trail.shift()}
  if(!ai.my.length||ai.my[ai.my.length-1].room!==rn){ai.my.push({room:rn,gt:G.gt});if(ai.my.length>14)ai.my.shift()}
  for(const k in ai.susp){const v=ai.susp[k];ai.susp[k]=v>0?Math.max(0,v-.01*dt):Math.min(0,v+.01*dt)}
  ai.pt-=dt; if(ai.pt<=0){ai.pt=.35;perceive(ch)}
  if(ai.reactT>0){ai.reactT-=dt;ch.moving=false;if(ai.reactT<=0)reactToBody(ch);return}
  if(paramedicBusy||seerBusy)return;
  if(ch.role==='imp'){if(!cleanerBusy&&!parasiteBusy&&!spectralBusy)impThink(ch,dt)}
  else if(ch.function==='sheriff')sheriffBotThink(ch,dt);
  if(G.over||ch.killDash)return;
  switch(ai.state){
    case 'idle': ch.moving=false; if(ai.wait>0){ai.wait-=dt;break} chooseGoal(ch); break;
    case 'walk': {
      if(ai.pathVer!==G.walkVer&&!repath(ch)){ai.state='idle';ai.wait=1;break}
      const g=ai.goal;
      if(g.type==='body'){
        if(!G.bodies.includes(g.b)){ai.state='idle';ai.wait=.3;break}
        if(dist(ch,g.b)<=actionDistancePx('report')&&losClear(ch.x,ch.y,g.b.x,g.b.y)){ch.moving=false;callMeeting(ch,'body',g.b);return}
      }
      if(g.type==='seer_body'){if(!G.bodies.includes(g.b)){ai.state='idle';ai.wait=.3;break}if(dist(ch,g.b)<=actionDistancePx('seer')&&losClear(ch.x,ch.y,g.b.x,g.b.y)){ch.moving=false;if(inspectBody(ch,g.b)){ai.seerReportBody=String(g.b.id);ai.bodySeen=null;return}}}
      if(g.type==='clean_body'){if(!G.bodies.includes(g.b)){ai.state='idle';ai.wait=.3;break}if(dist(ch,g.b)<actionDistancePx('cleaner')&&losClear(ch.x,ch.y,g.b.x,g.b.y)){ch.moving=false;cleanBody(ch,g.b);return}}
      if(g.type==='revive_body'){if(!G.bodies.includes(g.b)){ai.state='idle';ai.wait=.3;break}if(validReviveBodyFor(ch,g.b)){ch.moving=false;reviveBody(ch,g.b);return}}
      if(followPath(ch,dt))onArrive(ch);
      break;
    }
    case 'work': ch.moving=false; ai.work-=dt; if(ai.work<=0)finishWork(ch); break;
  }
}

function activeFakeStations(){
  return [...new Set(activeTaskTemplates().flatMap(t=>(t.steps||[]).map(s=>s.st)).concat(DIVERT_DESTS,['divert']))].filter(id=>stationById[id]);
}

function makeNPC(name,color){
  const c=bindBotColorName(newChar(name,color,0,0,false));
  c.emUses=CFG.emergencyUses;c.netKillCd=Math.max(0,Number(G.killCd)||0);c.netDelayedCd=0;c.netSheriffCd=0;c.cleanCd=0;c.cleanUses=0;c.guardianCd=0;c.parasiteReady=true;c.parasiteCd=0;c.parasiteTargetId=null;c.paramedicCd=0;c.paramedicSpent=0;c.paramedicUses=0;c.paramedicTaskBase=0;c.revivedOnce=false;c.spectralTransition=null;c.spectralInvisible=false;c.spectralTime=0;c.spectralEndsAt=0;c.spectralSeq=0;c.spectralCd=0;
  c.ai={state:'idle',path:[],goal:null,isGoal:null,pathVer:0,wait:rand(0,25)/10,work:0,workMax:1,stuck:0,pt:Math.random()*.3,
    reactT:0,bodySeen:null,ignore:new Set(),seen:{},trail:[],speed:CFG.speed*(0.88+Math.random()*.18),wanderP:.15+Math.random()*.25,skipW:.5+Math.random()*1.3,
    killCd:c.netKillCd,huntPause:0,hunt:null,huntT:1,repT:0,sabT:3,fix:null,witnessOf:null,lastVote:null,
    pers:pick(Object.keys(PERS)),susp:{},reasons:{},hist:{},my:[],ling:{},follow:{},scanT:{},incidents:0,nextEm:0,
    vents:[],ventSaw:null,cleanSaw:null,cleanMysteries:[],reviveSaw:null,seerClue:null,seerReportBody:null,spectralSeen:null,spectralMysteries:[],guardianReceived:null,guardianBlocked:null,guardianAttackSourceId:null,observerMap:{},instructorTrailHints:[],alerted:new Set(),ventHops:0,ventT:0,ventStay:0,sayT:0,bodiesFound:[],sabs:[],heard:[],avoid:null};
  return c;
}

function resetAI(c){
  const ai=c.ai; ai.state='idle'; ai.path=[]; ai.goal=null; ai.wait=rand(5,30)/10; ai.reactT=0; ai.bodySeen=null;
  ai.hunt=null; ai.witnessOf=null; ai.fix=null; ai.ignore=new Set(); ai.killCd=Math.max(0,Number(c.netKillCd??ai.killCd)||0); ai.huntPause=3; ai.stuck=0;
  ai.ling={}; ai.follow={}; ai.scanT={}; ai.incidents=0; ai.ventSaw=null; ai.cleanSaw=null; ai.cleanMysteries=[]; ai.reviveSaw=null; ai.seerClue=null; ai.seerReportBody=null; ai.spectralSeen=null; ai.spectralMysteries=[]; ai.guardianReceived=null; ai.guardianBlocked=null; ai.guardianAttackSourceId=null; ai.observerMap={}; ai.alerted=new Set(); ai.reactT=0;
}

function addSusp(ch,id,w,type,info){
  const ai=ch.ai; if(!ai||ch.role!=='crew'||id===ch.id)return; const P=PERS[ai.pers];
  const g=w>0?w*P.gain*(DIRECT.includes(type)?P.direct:1):w;
  ai.susp[id]=clamp((ai.susp[id]||0)+g,-4,10);
  if(w>0){const L=(ai.reasons[id]=ai.reasons[id]||[]); L.push({type,w,t:G.gt,...(info||{})}); if(L.length>6)L.shift()}
}

function topSuspect(ch){
  let best=null; for(const id in ch.ai.susp){const c=charById(id); if(!c||!c.alive||c===ch)continue; const s=ch.ai.susp[id]; if(s>0&&(!best||s>best.s))best={id,s}}
  return best;
}

function bestReason(ai,id){const L=ai.reasons[id]||[]; return L.reduce((a,r)=>(!a||r.w>a.w)?r:a,null)}

function myRoomAt(ch,gt){
  const my=ch.ai.my; let r=null; for(const e of my){if(e.gt<=gt+.01)r=e.room}
  return r||(my[0]&&my[0].room)||roomName(ch.x,ch.y);
}

function checkAlibi(L,sp,claim){
  const recs=histNear(L.ai,sp.id,claim.time,6);
  if(recs.length&&!recs.some(r=>r.room===claim.room))return recs[recs.length-1].room;
  return null;
}

function workInfo(ch){
  if(ch.isPlayer){if(G.state==='task'&&G.mini&&!G.mini.finished&&!G.mini.task.fix)return{st:G.mini.step.st,real:!G.mini.task.fake};return null}
  const ai=ch.ai; if(ai&&ai.state==='work'&&ai.goal&&ai.goal.type==='task')return{st:ai.goal.s.id,real:!ai.goal.t.fake};
  return null;
}

function wantsEmergency(ch){
  const ai=ch.ai;if(ch.role!=='crew'||ch.emUses<=0||G.meetCd>0||emergencySabotageBlocked()||G.M)return false;
  if(ai.ventSaw){const t=charById(ai.ventSaw.id); return !!(t&&t.alive)}   // viu um duto de verdade: convoca assim que puder
  if(G.gt<40||G.gt<ai.nextEm)return false;
  const top=topSuspect(ch); if(!top)return false; const P=PERS[ai.pers];
  return top.s>=P.call||(ai.incidents>=3&&top.s>=P.call*.6);
}

function noteBodyEvidence(o,b){
  const ai=o.ai; o.ai.incidents++;
  G.chars.forEach(x=>{
    if(!x.alive||x===o)return;
    const rec=(ai.hist[x.id]||[]).filter(h=>h.room===b.room&&h.gt>=b.tKill-20&&h.gt<=b.tKill+8);
    if(rec.length)addSusp(o,x.id,1,'nearBody',{room:b.room});
  });
}

function perceive(ch){
  const ai=ch.ai;
  if(ch.alive&&ch.role==='crew'&&ch.function==='observer'&&(G.sab.comms||0)<=0){for(const o of G.chars){if(!mapCanDetectPlayer(ch,o))continue;const rm=roomName(o.x,o.y);ai.observerMap[o.id]={room:rm,t:G.gt};ai.seen[o.id]={room:rm,t:G.gt,map:true};const h=(ai.hist[o.id]=ai.hist[o.id]||[]),l=h[h.length-1];if(!l||l.room!==rm||G.gt-l.gt>4){h.push({room:rm,gt:G.gt,map:true});if(h.length>16)h.shift()}}}
  const R=npcVisionRange(ch);
  if(!ai.reactT){
    for(const b of G.bodies){
      if(ai.ignore.has(b.id))continue;
      if(ch.function==='paramedic'&&validReviveBodyFor(ch,b,Math.max(R,actionDistancePx('paramedic'))))continue;if(ch.function==='seer'&&(ch.seerCd||0)<=0&&!ch.seerPending){ai.bodySeen=b;break}
      if(npcCanSeePoint(ch,b.x,b.y)){ai.bodySeen=b;ai.reactT=ai.witnessOf?.5:rand(5,12)/10;break}
    }
  }
  const vis=[];
  for(const o of G.chars){
    if(o===ch||!o.alive||o.vent||o.controlTargetId||(ch.role==='crew'&&o.spectralInvisible))continue;
    if(npcCanSeeChar(ch,o)){
      vis.push(o); const rm=roomName(o.x,o.y); ai.seen[o.id]={room:rm,t:G.gt};
      const h=(ai.hist[o.id]=ai.hist[o.id]||[]), l=h[h.length-1];
      if(ACTIVE_MAP_ID==='nexus'&&ch.role==='crew'&&l&&l.room!==rm){
        const from=ROOM_DEFS.find(r=>r.name===l.room)?.id,to=ROOM_DEFS.find(r=>r.name===rm)?.id,hops=from&&to?roomDist(from,to):0,elapsed=G.gt-l.gt,key=`move:${o.id}:${l.room}>${rm}`;
        if(hops>=2&&elapsed<Math.max(1.6,hops*1.15)&&!ai.alerted.has(key)){ai.alerted.add(key);addSusp(ch,o.id,Math.min(1.8,.45*hops),'contra',{room:rm,from:l.room});}
      }
      if(!l||l.room!==rm||G.gt-l.gt>4){h.push({room:rm,gt:G.gt});if(h.length>16)h.shift()}
    }
  }
  if(ch.role!=='crew')return;
  // permanecer perto de um corpo sem reportar
  for(const b of G.bodies)for(const o of vis){
    if(dist(o,b)>150)continue;
    const k=o.id+'|'+b.id; ai.ling[k]=(ai.ling[k]||0)+.35;
    if(ai.ling[k]>=4&&!ai.ling[k+'f']){ai.ling[k+'f']=1;addSusp(ch,o.id,1.8,'linger',{room:b.room})}
  }
  // seguir outro personagem por mais de uma sala
  const touched=new Set();
  for(const o of vis)for(const p of vis){
    if(o===p||!o.moving||!p.moving||dist(o,p)>230)continue;
    const k=o.id+'>'+p.id; touched.add(k);
    const f=(ai.follow[k]=ai.follow[k]||{n:0,rooms:new Set(),last:-99}); f.n++; f.rooms.add(roomName(p.x,p.y));
    if(f.n>=12&&f.rooms.size>=2&&G.gt-f.last>60){f.last=G.gt;f.n=0;f.rooms=new Set();addSusp(ch,o.id,.9,'follow',{})}
  }
  for(const k in ai.follow)if(!touched.has(k)&&ai.follow[k].n>0)ai.follow[k].n=Math.max(0,ai.follow[k].n-.5);
  // tarefa visual: o scanner acende de verdade só quando a tarefa é real
  const sp=stationById.scan?stationPos('scan'):null;
  for(const o of sp?vis:[]){
    const w=workInfo(o), at=w&&w.st==='scan'&&dist(o,sp)<130;
    if(!at){delete ai.scanT[o.id];continue}
    if(w.real){if(!ai.scanT[o.id+'c']){ai.scanT[o.id+'c']=1;addSusp(ch,o.id,-1.5,'clear',{})}}
    else{ai.scanT[o.id]=(ai.scanT[o.id]||0)+.35; if(ai.scanT[o.id]>=1.4&&!ai.scanT[o.id+'f']){ai.scanT[o.id+'f']=1;addSusp(ch,o.id,1.8,'fake',{room:'Enfermaria'})}}
  }
}

function chooseGoal(ch){
  const ai=ch.ai; if(!ch.alive)return;
  if(ch.function==='engineer'&&ch.role==='crew'&&(ch.engVentCd||0)<=0&&G.sab.comms<=0&&Math.random()<.12){const v=VENT_DEFS.filter(v=>Math.hypot(ch.x-v.px,ch.y-v.py)<650).sort((a,b)=>Math.hypot(ch.x-a.px,ch.y-a.py)-Math.hypot(ch.x-b.px,ch.y-b.py))[0];if(v&&ventWitnesses(v,ch).length===0&&goTo(ch,{type:'vent',v},(x,y)=>Math.abs(x-v.x)+Math.abs(y-v.y)<=1))return}
  if(ai.fix){
    if(G.sab[ai.fix]>0){const s=stationById[FIX[ai.fix].st], set=approachSet(s.id,s);
      if(goTo(ch,{type:'fix',sab:ai.fix,s},(x,y)=>set.has(y*COLS+x)))return}
    ai.fix=null;
  }
  if(wantsEmergency(ch)){
    const set=approachSet('table',TABLE);
    if(goTo(ch,{type:'cafeCall'},(x,y)=>set.has(y*COLS+x))){npcSay(ch,pick(['Acho melhor chamar uma reunião.','Precisamos conversar agora.']));return}
    ai.nextEm=G.gt+20;
  }
  if(ai.ventSaw&&alertSomeone(ch))return;   // botão indisponível: avisa outro tripulante pessoalmente
  let tasks=pendingFor(ch); const r=Math.random();
  if(ai.avoid&&G.gt<ai.avoid.until){const ok=tasks.filter(t=>ROOM_BY_ID[stationById[nextStep(t).st].room].name!==ai.avoid.room); if(ok.length)tasks=ok}   // evita a área onde achou um corpo
  if(tasks.length&&r>ai.wanderP&&botTaskRoute(ch))return;
  if(ch.role==='imp'&&ch.ventCd<=0&&Math.random()<.1){   // atalho pelo duto, só se ninguém estiver olhando
    const v=pick(VENT_DEFS.filter(v=>Math.hypot(v.px-ch.x,v.py-ch.y)<900));
    if(v&&ventWitnesses(v,ch).length===0&&goTo(ch,{type:'vent',v},(x,y)=>Math.abs(x-v.x)+Math.abs(y-v.y)<=1))return;
  }
  if(ch.role==='imp'&&r<.65){   // impostor finge tarefas: para em pontos de tarefa sem somar progresso
    const fakeList=activeFakeStations(),sid=fakeList.length?pick(fakeList):null,s=sid?stationById[sid]:null;
    if(s){const set=approachSet(s.id,s);if(goTo(ch,{type:'task',t:{fake:true,steps:[],done:false},step:{done:false,st:s.id},s},(x,y)=>set.has(y*COLS+x)))return}
  }
  if(Math.random()<.2&&G.gt>60){
    const set=approachSet('table',TABLE); if(goTo(ch,{type:'cafe'},(x,y)=>set.has(y*COLS+x)))return;
  }
  wander(ch);
}

function alertSomeone(ch){
  const ai=ch.ai, imp=charById(ai.ventSaw.id); if(!imp||!imp.alive)return false;
  const o=G.chars.filter(x=>x.alive&&!x.isPlayer&&!x.isRemoteHuman&&!x.vent&&x.role==='crew'&&x!==ch&&!ai.alerted.has(x.id)&&(x.ai.susp[imp.id]||0)<3)
    .sort((a,b)=>dist(ch,a)-dist(ch,b))[0];
  if(!o)return false; const ot=tileOf(o);
  return goTo(ch,{type:'alert',to:o},(x,y)=>Math.abs(x-ot.x)+Math.abs(y-ot.y)<=2);
}

function onArrive(ch){
  const ai=ch.ai, g=ai.goal;ai.navVisits=ai.navVisits||{};if(ai.navRoom)ai.navVisits[ai.navRoom]=G.gt; if(!g){ai.state='idle';return}
  if(g.type==='alert'){
    ai.state='idle'; ai.wait=.5; ai.alerted.add(g.to.id); const imp=charById(ai.ventSaw&&ai.ventSaw.id);
    if(imp&&g.to.alive&&dist(ch,g.to)<240&&!g.to.vent){
      addSusp(g.to,imp.id,3.4*trust(g.to,ch),'claim',{by:ch.id}); g.to.ai.vents.push({id:imp.id,room:ai.ventSaw.room,act:'told',gt:G.gt});
      npcSay(ch,ch.function==='locator'?`🧭 Localizador: vi ${imp.name} usar um duto!`:`Vi ${imp.name} num duto!`);
    }
    return;
  }
  if(g.type==='vent'){
    ai.state='idle'; ai.wait=0;
    if((ch.role==='imp'||NEUTRALS.isJester(ch)||(ch.role==='crew'&&ch.function==='engineer'))&&(ch.role==='imp'||((ch.engVentCd||0)<=0&&G.sab.comms<=0))&&(ventWitnesses(g.v,ch).length===0||Math.random()<.1)&&enterVent(ch,g.v)){ai.ventHops=rand(0,2);ai.ventT=.8;ai.ventStay=0}
    return;
  }
  if(g.type==='task'||g.type==='fix'){
    if(!g.s||stationDist(g.s,ch)>stationUseRange(g.s)||!canAccessStation(ch,g.s)){ai.state='idle';ai.wait=1;return}
    ai.state='work'; ai.work=ai.workMax=g.type==='fix'?rand(40,60)/10:rand(g.t?.category==='long'?60:35,g.t?.category==='long'?100:75)/10; ch.moving=false;
    ch.face=stationPos(g.s.id).x>=ch.x?1:-1; return;
  }
  if(g.type==='body'){ if(G.bodies.includes(g.b))callMeeting(ch,'body',g.b); else {ai.state='idle';ai.wait=.3} return }
  ai.state='idle';
  if(g.type==='cafe'||g.type==='cafeCall'){
    ai.wait=1.2;
    if(g.type==='cafeCall'){const go=wantsEmergency(ch); ai.nextEm=G.gt+rand(30,70); if(go)callMeeting(ch,'emergency')}
  }else if(g.type==='hunt')ai.wait=0;
  else ai.wait=g.type==='flee'?rand(5,15)/10:rand(6,30)/10;
}

function pendingFor(ch){return G.tasks.filter(t=>t.owner===ch.id&&!t.done)}

function wander(ch,far){
 const ai=ch.ai,points=botRoomPoints(ch).filter(p=>(!far||dist(p,ch)>=far)&&!(ai.avoid&&G.gt<ai.avoid.until&&ROOM_BY_ID[p.room]?.name===ai.avoid.room)).sort((a,b)=>b.score-a.score);
 for(const p of points){const tile=tileOf(p);if(dist(ch,p)<TILE*2)continue;if(goTo(ch,{type:far?'flee':'wander'},(x,y)=>x===tile.x&&y===tile.y)){ai.navRoom=p.room;return true}}
 ai.state='idle';ai.path=[];ai.wait=1.5+Math.random();return false;
}

function finishWork(ch){
  const ai=ch.ai,g=ai.goal;ai.state='idle';ai.wait=rand(5,15)/10;
  if(!g)return;
  if(g.type==='fix'){
    if(g.s&&stationDist(g.s,ch)<=actionDistancePx('object')&&canAccessStation(ch,g.s)&&G.sab[g.sab]>0&&ch.role==='crew')resolveSab(g.sab);
    ai.fix=null;return;
  }
  if(g.type==='task'){
    if(!g.s||stationDist(g.s,ch)>actionDistancePx('object')||!canAccessStation(ch,g.s))return;
    if(!g.t.fake&&(ch.role!=='crew'||g.t.owner!==ch.id||!g.t.steps.includes(g.step)))return;
    if(!g.step.done){g.step.done=true;g.t.done=g.t.steps.every(s=>s.done)}
    if(!g.t.fake){ai.lastTaskName=g.t.name;ai.lastTaskAt=G.gt;if(ch.function==='lazy')lazyTasksDone(ch)}
    renderTasks();if(!g.t.fake)checkEnd();
  }
}

function reactToBody(ch){
  const ai=ch.ai, b=ai.bodySeen; if(!b||!G.bodies.includes(b))return;
  if(ch.role==='crew'){ai.bodiesFound.push({id:b.id,room:b.room,gt:G.gt}); if(ai.bodiesFound.length>4)ai.bodiesFound.shift(); ai.avoid={room:b.room,until:G.gt+60}; npcSay(ch,pick(['Um corpo!','Alguém viu quem passou por aqui?','Chamem todo mundo!']))}
  if(ch.role==='imp'&&Math.random()>.2){ai.ignore.add(b.id);return}
  ai.hunt=null; const bt={x:clamp(Math.floor(b.x/TILE),0,COLS-1),y:clamp(Math.floor((b.y+OFF_Y)/TILE),0,ROWS-1)};
  if(!goTo(ch,{type:'body',b},(x,y)=>Math.abs(x-bt.x)+Math.abs(y-bt.y)<=1))callMeeting(ch,'body',b);
}

function ventWitnesses(v,who){   // tripulantes vivos que realmente enxergam a boca do duto
  return G.chars.filter(o=>o.alive&&!o.vent&&o!==who&&o.role==='crew'&&npcCanSeePoint(o,v.px,v.py));
}

function npcSpeechDisplayText(ch,text){const raw=String(text||''),translated=translateRuntimeText(raw),lang=validGameLanguage(USER_PREFS.language);return translated===raw&&ch?.ai&&!knownI18nKey(raw)&&!['pt-BR','pt-PT'].includes(lang)?t('npc.fallback'):translated}

function npcSay(ch,text){
  if(!ch.ai||G.t<(ch.ai.sayT||0))return; ch.bubble={text,until:G.t+2.8}; ch.ai.sayT=G.t+5;
}

function noteVentSeen(imp,v,act){
  const room=ROOM_BY_ID[v.room].name, ws=ventWitnesses(v,imp);
  ws.forEach(o=>{
    if(o.isPlayer||!o.ai)return;   // humanos veem com os próprios olhos; somente bots guardam testemunhos
    const ai=o.ai; addSusp(o,imp.id,6,'vent',{room});   // testemunho real: identifica o impostor para esta testemunha
    ai.vents.push({id:imp.id,room,act,gt:G.gt}); if(ai.vents.length>6)ai.vents.shift();
    ai.ventSaw={id:imp.id,room,gt:G.gt}; ai.alerted=new Set();
    ai.path=[]; ai.state='idle'; ai.wait=0; ai.hunt=null; ai.reactT=Math.max(ai.reactT,rand(4,8)/10);   // interrompe o que fazia
    npcSay(o,pick(['Aquilo foi um duto?!','Ei! Vi alguém no duto!']));
  });
  return ws;
}

function noteEngineerVentSeen(ch,v,act){
  if(ch.controlTargetId)ch=ventIdentity(ch);
  const room=ROOM_BY_ID[v.room].name;
  G.chars.filter(o=>o.alive&&!o.vent&&o!==ch&&o.role==='crew'&&npcCanSeePoint(o,v.px,v.py)).forEach(o=>{
    if(o.isPlayer||!o.ai)return;
    // Um Tripulante usando duto é evidência positiva de Engenheiro, não de Infiltrado.
    addSusp(o,ch.id,-1.2,'clear',{room,engineer:true});
    o.ai.vents.push({id:ch.id,room,act,gt:G.gt,engineer:true});if(o.ai.vents.length>6)o.ai.vents.shift();
    o.ai.engineerSaw={id:ch.id,room,act,gt:G.gt};
    npcSay(o,pick([`Vi ${ch.name} usando um duto; deve ser Engenheiro.`,`${ch.name} usou um duto. Parece ser Engenheiro.`]));
  });
}

function ventFlee(k){   // NPC impostor foge por um duto próximo depois de eliminar alguém
  if(Math.random()>.65||k.ventCd>0)return false;
  const v=VENT_DEFS.filter(v=>Math.hypot(v.px-k.x,v.py-k.y)<750).sort((a,b)=>Math.hypot(a.px-k.x,a.py-k.y)-Math.hypot(b.px-k.x,b.py-k.y))[0];
  return !!v&&goTo(k,{type:'vent',v},(x,y)=>Math.abs(x-v.x)+Math.abs(y-v.y)<=1);
}

function ventUpdate(ch,dt){
  if(isMinerHoleId(ch.vent)){const ai=ch.ai;ai.ventStay=(ai.ventStay||0)+dt;ai.ventT=Number.isFinite(ai.ventT)?ai.ventT-dt:1;if(!ch.ventAnim&&ch.ventMv<=0&&ai.ventT<=0){ai.ventT=1;const other=ownedMinerHoles(ch).filter(h=>h.id!==ch.vent&&h.id!==ai.lastMine);if(ai.ventStay<5&&other.length){ai.lastMine=ch.vent;minerTravel(ch,pick(other).id)}else{minerExit(ch);ai.ventStay=0}}return}   // NPCs dentro do duto: Infiltrados podem sabotar; Engenheiros usam a passagem limitada
  const ai=ch.ai; ch.moving=false;
  if(ch.role==='imp'){ai.sabT-=dt; if(ai.sabT<=0){ai.sabT=1.2; if(G.gt>45&&G.sab.cd<=0&&Math.random()<.07)aiSabotage(ch)}}
  if(ch.ventAnim||ch.ventMv>0)return;
  ai.ventT-=dt; if(ai.ventT>0)return; ai.ventT=rand(6,11)/10;
  if(ai.ventHops>0){ai.ventHops--; ventMove(ch,pick(VENT_ADJ[ch.vent])); return}
  const v=ventById[ch.vent];
  if(ventWitnesses(v,ch).length===0||Math.random()<.1||(ai.ventStay=(ai.ventStay||0)+1)>8)exitVent(ch);
}

function hasWitness(k,v){
  return G.chars.some(o=>o.alive&&!o.vent&&o!==k&&o!==v&&o.role==='crew'&&(npcCanSeeChar(o,k)||npcCanSeeChar(o,v)));
}

function botHuntPoint(ch,target){if(npcCanSeeChar(ch,target)){ch.ai.huntMemory={id:target.id,x:target.x,y:target.y,until:G.gt+3};return target}const m=ch.ai.huntMemory;return m&&m.id===target.id&&G.gt<m.until?m:null}

function pickVictim(ch){
  let best=null,bd=1e9;
  for(const v of G.chars){
    if(!v.alive||v===ch||v.id===ch.controlTargetId||v.role==='imp'||(ch.function==='delayed'&&G.delayedMarks[v.id])||(ch.function==='parasite'&&G.parasiteInfections?.[v.id]))continue;
    if(v.isPlayer&&(G.state!=='playing'||uiBusy()))continue;
    const d=dist(ch,v); if(d>1100||d>=bd||!npcCanSeeChar(ch,v))continue;
    // NPCs Infiltrados podem perseguir vítimas sem exigir isolamento exagerado.
    // Só evitam iniciar a perseguição quando há alguém muito próximo da vítima.
    const nearbyWitness=G.chars.some(o=>o.alive&&!o.vent&&o!==ch&&o!==v&&o.role==='crew'&&npcCanSeeChar(o,v));
    if(!nearbyWitness){best=v;bd=d}
  }
  return best;
}

function delayedBotThink(ch,dt){
  const ai=ch.ai;ch.netDelayedCd=Math.max(0,(ch.netDelayedCd||0)-abilityCooldownDelta(ch,dt));
  if(!ch.alive||ch.role!=='imp'||ch.function!=='delayed'||ch.vent||G.M||G.over||!['playing','task','tool'].includes(G.state)){ai.hunt=null;return}
  if((ch.netDelayedCd||0)>0||delayedPendingFor(ch)||ai.huntPause>0){ai.hunt=null;return}
  if(!ai.hunt){ai.huntT-=dt;if(ai.huntT>0)return;ai.huntT=.8;const v=pickVictim(ch);if(v){ai.hunt=v;ai.repT=0}return}
  const v=ai.hunt;if(!v.alive||v.role!=='crew'||G.delayedMarks[v.id]){ai.hunt=null;return}
  const point=botHuntPoint(ch,v);if(!point){ai.hunt=null;return}
  const d=dist(ch,point),range=actionDistancePx('delayed');
  if(point===v&&d<=range&&losClear(ch.x,ch.y,v.x,v.y)){if(doDelayedMark(ch,v)){ai.hunt=null;ai.huntPause=rand(20,35)/10;ai.state='idle';ai.wait=.5}else{ai.hunt=null;ai.wait=.8}return}
  ai.repT-=dt;if(ai.state!=='walk'||!ai.goal||ai.goal.type!=='delayed_hunt'||ai.repT<=0){ai.repT=.6;const vt=tileOf(point);goTo(ch,{type:'delayed_hunt',v},(x,y)=>Math.abs(x-vt.x)+Math.abs(y-vt.y)<=1)}
  if(point===v&&d>range&&d<Math.max(180,range+96)&&losClear(ch.x,ch.y,v.x,v.y)){const st=Math.min(d-Math.max(24,range-8),moveSpeedFor(ch,ai.speed)*dt);ai.path=[];if(st>0&&moveChar(ch,(v.x-ch.x)/d*st,(v.y-ch.y)/d*st)){ch.moving=true;ch.walk+=dt}}
}

function sheriffBotThink(ch,dt){
  const ai=ch.ai;if(!ch.alive||ch.role!=='crew'||ch.function!=='sheriff'||roleAbilityBlockedByComms()||ch.vent||G.M||G.over||!['playing','task','tool'].includes(G.state))return false;
  ch.netSheriffCd=Math.max(0,(ch.netSheriffCd||0)-abilityCooldownDelta(ch,dt));if(ch.netSheriffCd>0)return false;
  const targets=G.chars.filter(t=>t.alive&&!t.vent&&!t.spectralInvisible&&t!==ch&&npcCanSeeChar(ch,t)).map(t=>({t,s:Math.max(ai.susp[t.id]||0,ai.witnessOf?.id===t.id?6:0,(ai.vents||[]).some(v=>v.id===t.id&&!v.engineer)?6:0)})).filter(x=>x.s>=2.5).sort((a,b)=>b.s-a.s);
  if(!targets.length)return false;const target=targets[0].t,d=dist(ch,target);
  if(d<=actionDistancePx('sheriff')&&losClear(ch.x,ch.y,target.x,target.y)){const fired=doSheriffShot(ch,target);if(fired){ai.path=[];ai.goal=null;ai.state='idle';ai.wait=1;return true}}
  if(d<520&&(ai.state!=='walk'||ai.goal?.type!=='sheriff_hunt'||ai.goal?.v!==target||ai.repT<=0)){ai.repT=.65;const vt=tileOf(target);goTo(ch,{type:'sheriff_hunt',v:target},(x,y)=>Math.abs(x-vt.x)+Math.abs(y-vt.y)<=1)}
  return false;
}

function cleanerBotThink(ch,dt){
  if(ch.cleanPending){ch.moving=false;return true}
  if(!ch.alive||ch.role!=='imp'||ch.function!=='cleaner'||ch.vent||G.M||G.over||!['playing','task','tool'].includes(G.state))return false;
  ch.cleanCd=Math.max(0,(ch.cleanCd||0)-abilityCooldownDelta(ch,dt));if(ch.cleanCd>0||!G.bodies.length)return false;
  const bodies=G.bodies.filter(b=>npcCanSeePoint(ch,b.x,b.y)).map(b=>({b,d:dist(ch,b)})).sort((a,b)=>a.d-b.d);const hit=bodies[0];if(!hit)return false;
  if(hit.d<=actionDistancePx('cleaner')&&losClear(ch.x,ch.y,hit.b.x,hit.b.y))return cleanBody(ch,hit.b);
  const witnesses=G.chars.filter(o=>o.alive&&o.role==='crew'&&o!==ch&&npcCanSeePoint(o,hit.b.x,hit.b.y));
  if(witnesses.length>1&&Math.random()<.75)return false;
  if(ch.ai.state!=='walk'||ch.ai.goal?.type!=='clean_body'||ch.ai.goal?.b!==hit.b||ch.ai.repT<=0){ch.ai.repT=.7;const bt={x:clamp(Math.floor(hit.b.x/TILE),0,COLS-1),y:clamp(Math.floor((hit.b.y+OFF_Y)/TILE),0,ROWS-1)};goTo(ch,{type:'clean_body',b:hit.b},(x,y)=>Math.abs(x-bt.x)+Math.abs(y-bt.y)<=1)}
  return true;
}

function impThink(ch,dt){
  const ai=ch.ai;ch.netKillCd=Math.max(0,(Number(ch.netKillCd)||0)-abilityCooldownDelta(ch,dt));ai.killCd=ch.netKillCd;ai.huntPause-=dt;ai.sabT-=dt;
  if(G.state!=='playing'&&G.state!=='task'&&G.state!=='tool')return;
  if(ch.function==='spectral'&&ch.spectralInvisible){ai.hunt=null;return}
  if(ai.sabT<=0){ai.sabT=1.2;if(G.gt>45&&G.sab.cd<=0&&Math.random()<.07)aiSabotage(ch)}
  if(ch.function==='delayed'){delayedBotThink(ch,dt);return}
  if(ch.function==='hunter'&&!hunterTargetFor(ch)&&Math.random()<Math.min(1,dt*.8))hunterNpcPickTarget(ch);
  if((ch.netKillCd||0)>0||ai.huntPause>0){ai.hunt=null;return}
  if(!ai.hunt){
    ai.huntT-=dt;if(ai.huntT>0)return;ai.huntT=.9;
    const marked=ch.function==='hunter'?hunterTargetFor(ch):null;const v=(marked&&marked.role==='crew'&&marked.alive&&npcCanSeeChar(ch,marked))?marked:pickVictim(ch);if(v){ai.hunt=v;ai.repT=0}
    return;
  }
  const v=ai.hunt;if(!v.alive){ai.hunt=null;return}
  const point=botHuntPoint(ch,v);if(!point){ai.hunt=null;return}
  const d=dist(ch,point),range=actionDistancePx('kill');
  if(d<=range&&point===v){
    if(v.isPlayer&&(G.state!=='playing'||uiBusy())){ai.hunt=null;ai.huntPause=2;return}
    if(hasWitness(ch,v)){ai.hunt=null;ai.huntPause=rand(40,70)/10;ai.state='idle';ai.wait=0;return}
    doKill(ch,v);return;
  }
  ai.repT-=dt;
  if(ai.state!=='walk'||!ai.goal||ai.goal.type!=='hunt'||ai.repT<=0){ai.repT=.6;const vt=tileOf(point);goTo(ch,{type:'hunt',v},(x,y)=>Math.abs(x-vt.x)+Math.abs(y-vt.y)<=1)}
  if(point===v&&d>range&&d<Math.max(180,range+96)&&losClear(ch.x,ch.y,v.x,v.y)){
    const st=Math.min(d-Math.max(24,range-8),moveSpeedFor(ch,ai.speed)*dt);ai.path=[];
    if(st>0&&moveChar(ch,(v.x-ch.x)/d*st,(v.y-ch.y)/d*st)){ch.moving=true;ch.walk+=dt}
  }
  if(d>Math.max(160,range)&&Math.random()<dt*2&&hasWitness(ch,v)){ai.hunt=null;ai.huntPause=3}
}

function aiSabotage(ch){
  const opts=ACTIVE_MAP_ID==='nexus'?[['lights',2],['comms',3.2],['doors',1.5],['reactor',progress()>.45?4.5:1.3]]:[['lights',2],['comms',2],['doors',1],['reactor',progress()>.5?4:1]];
  if(ACTIVE_MAP_ID==='kryos')opts.push(['oxygen',1.3]);
  let r=Math.random()*opts.reduce((a,o)=>a+o[1],0), type='lights';
  for(const o of opts){r-=o[1];if(r<=0){type=o[0];break}}
  const by=ch;   // Preserva a identidade do Infiltrado, inclusive após a eliminação.
  startSabotage(type,by);
}

function hunterNpcPickTarget(ch){if(!ch?.alive||ch.role!=='imp'||ch.function!=='hunter'||hunterTargetFor(ch)||(ch.hunterTargetCd||0)>0)return false;const target=hunterEligibleTargets(ch)[0]||null;return target?setHunterTarget(ch,target):false}

function parasiteBotThink(ch,dt){
  if(!ch.alive||ch.role!=='imp'||ch.function!=='parasite'||ch.vent||G.M||G.over||ch.parasiteReady===false||(ch.parasiteCd||0)>0)return false;
  const t=parasiteTargetFor(ch,actionDistancePx('parasite'));if(!t)return false;if(Math.random()<Math.min(1,dt*5)){infectTarget(ch,t);if(ch.ai){ch.ai.hunt=null;ch.ai.path=[];ch.ai.wait=.5}return true}return false;
}

function paramedicBotThink(ch,dt){
  if(!ch?.alive||ch.role!=='crew'||ch.function!=='paramedic'||ch.vent||G.M||G.over||paramedicBlockedByComms()||(ch.paramedicCd||0)>0||paramedicAvailableUses(ch)<=0)return false;
  const near=paramedicBodyFor(ch);if(near){reviveBody(ch,near);return true}
  const candidates=G.bodies.filter(b=>npcCanSeePoint(ch,b.x,b.y)||ch.ai?.bodySeen===b).map(b=>({b,v:bodyVictim(b)})).filter(x=>x.v&&!x.v.alive&&x.v.role==='crew'&&!x.v.revivedOnce).sort((a,b)=>dist(ch,a.b)-dist(ch,b.b));if(!candidates.length)return false;
  const body=candidates[0].b;if(ch.ai?.goal?.type==='revive_body'&&ch.ai.goal.b===body)return false;const bt={x:clamp(Math.floor(body.x/TILE),0,COLS-1),y:clamp(Math.floor((body.y+OFF_Y)/TILE),0,ROWS-1)};goTo(ch,{type:'revive_body',b:body},(x,y)=>Math.abs(x-bt.x)+Math.abs(y-bt.y)<=1);return false;
}

function seerBotThink(ch,dt){
  if(!ch?.alive||ch.role!=='crew'||ch.function!=='seer'||roleAbilityBlockedByComms()||ch.vent||G.M||G.over)return false;const ai=ch.ai;
  if(ch.seerPending){ch.moving=false;return true}
  if(ai?.seerReportBody){const body=G.bodies.find(b=>String(b.id)===String(ai.seerReportBody));if(!body){ai.seerReportBody=null;return false}if(dist(ch,body)<=actionDistancePx('report')&&losClear(ch.x,ch.y,body.x,body.y)){ai.seerReportBody=null;callMeeting(ch,'body',body);return true}}
  if((ch.seerCd||0)>0)return false;
  const candidates=G.bodies.filter(b=>npcCanSeePoint(ch,b.x,b.y)||ai?.bodySeen===b).sort((a,b)=>dist(ch,a)-dist(ch,b));if(!candidates.length)return false;const body=candidates[0];
  if(dist(ch,body)<=actionDistancePx('seer')&&losClear(ch.x,ch.y,body.x,body.y)){if(inspectBody(ch,body)){ai.seerReportBody=String(body.id);ai.bodySeen=null;ch.moving=false;return true}}
  const bt={x:clamp(Math.floor(body.x/TILE),0,COLS-1),y:clamp(Math.floor((body.y+OFF_Y)/TILE),0,ROWS-1)};if(ai?.goal?.type!=='seer_body'||ai.goal.b!==body)goTo(ch,{type:'seer_body',b:body},(x,y)=>Math.abs(x-bt.x)+Math.abs(y-bt.y)<=1);return false;
}

function npcStatement(ch,M){
  const ai=ch.ai, P=PERS[ai.pers];
  if(ch.function==='locator'&&ai.locatorClue&&G.gt-ai.locatorClue.t<45&&Math.random()<.3){const rec=ai.locatorClue,other=charById(rec.id);if(other)return {from:ch,text:t('stage3.locatorReport',{name:other.name,room:roomDisplayName(rec.room)}),claim:{from:ch.id,kind:'statement',target:rec.id,room:rec.room}}}
  if(ai.morphReport){ai.morphReport=false;return {from:ch,text:t('morph.botReport'),claim:{from:ch.id,kind:'statement',role:'metamorph'}}}
  if(M.body&&ch===M.caller&&Math.random()<.85)return {from:ch,text:pickLine([`Corpo de ${M.body.name} em ${M.body.room}.`,`Encontrei o corpo de ${M.body.name} em ${M.body.room}`,`Encontrei o corpo de ${M.body.name} em ${M.body.room}!`]),claim:{from:ch.id,kind:'bodyReport',target:M.body.id,room:M.body.room,time:M.body.tKill}};
  if(M.body&&Math.random()<.12)return {from:ch,text:`Onde que mataram ${M.body.name}?`,claim:{from:ch.id,kind:'ask',bodyInquiry:true}};
  if(G.sab.reactor>0&&Math.random()<.35)return {from:ch,text:'Cuidado! Vamos resolver o reator!',claim:null};
  const lastSab=ai.sabs[ai.sabs.length-1];if(lastSab&&G.sab[lastSab.type]>0&&G.gt-lastSab.gt<18&&Math.random()<.22){if(lastSab.type==='doors')return {from:ch,text:'As portas estão travadas. Temos que esperar abrir!',claim:null};const sn={lights:'as luzes',comms:'as comunicações',reactor:'o reator'}[lastSab.type]||'a sabotagem';return {from:ch,text:`Cuidado! Vamos resolver ${sn}!`,claim:null}}
  // Proteção só vira fala se o NPC realmente recebeu ou consumiu a proteção.
  const blocked=ai.guardianBlocked;if(blocked&&!blocked.reported&&G.gt-(Number(blocked.gt)||0)<120){blocked.reported=true;const attacker=blocked.attackerId?charById(blocked.attackerId):null;if(attacker)return {from:ch,text:`Alguém me protegeu de um ataque de ${attacker.name}.`,claim:{from:ch.id,kind:'guardianProtected',target:attacker.id,strong:true}};return {from:ch,text:'Alguém me protegeu!',claim:{from:ch.id,kind:'guardianProtected',strong:true}}}
  const received=ai.guardianReceived;if(received&&!received.reported&&G.gt-(Number(received.gt)||0)<120){received.reported=true;return {from:ch,text:'Alguém me protegeu!',claim:{from:ch.id,kind:'guardianProtected',strong:false}}}
  // Só relata trilhas que este NPC realmente recebeu do Instrutor.
  if(ai.morphSeen){const who=charById(ai.morphSeen);ai.morphSeen=null;if(who)return {from:ch,text:t('morph.witness',{name:who.name}),claim:{from:ch.id,kind:'accuse',target:who.id,strong:true,role:'metamorph'}}}
  const trailHint=(ai.instructorTrailHints||[]).slice().reverse().find(h=>!h.reported&&G.gt-(Number(h.gt)||0)<240);
  if(trailHint){trailHint.reported=true;const pointed=trailHint.targetId?charById(trailHint.targetId):null;if(pointed&&pointed.alive)return {from:ch,text:`Recebi uma trilha que apontava a ${pointed.name}.`,claim:{from:ch.id,kind:'instructorTrail',target:pointed.id,room:trailHint.room,time:trailHint.gt,strong:false,trail:true}};if(trailHint.room)return {from:ch,text:`Recebi uma trilha que levava a ${trailHint.room}.`,claim:{from:ch.id,kind:'instructorTrail',room:trailHint.room,time:trailHint.gt,strong:false,trail:true}}}
  // Pergunta o motivo sobretudo quando outra pessoa chamou uma reunião de emergência sem contexto evidente para este NPC.
  if(M.reason==='emergency'&&M.caller!==ch&&!M.evid&&Math.random()<.28)return {from:ch,text:'Por que você chamou a reunião?',claim:{from:ch.id,kind:'ask',meetingReason:true,target:M.caller?.id||null}};
  if(ai.controlVictimSaw&&G.gt-ai.controlVictimSaw.gt<45&&Math.random()<.55){const seen=charById(ai.controlVictimSaw.id);if(seen)return {from:ch,text:pick([`Vi ${seen.name} usar a função de Marionetista!`,`${seen.name} é Marionetista!!!`,`${seen.name} me controlou! Acho que é Marionetista.`]),claim:{from:ch.id,kind:'accuse',target:seen.id,strong:true,role:'marionette'}}}
  if(ai.controlSaw&&G.gt-ai.controlSaw.gt<35&&Math.random()<.22){const seen=charById(ai.controlSaw.id);if(seen)return {from:ch,text:pick([`${seen.name} é Infiltrado? Eu vi algo estranho durante o controle.`,`${seen.name} é Marionetista? O comportamento durante o controle foi estranho.`]),claim:{from:ch.id,kind:'accuse',target:seen.id,strong:false}}}
  if(ai.engineerSaw&&G.gt-ai.engineerSaw.gt<45&&Math.random()<.20){const seen=charById(ai.engineerSaw.id);if(seen)return {from:ch,text:pick([`Vi ${seen.name} a entrar em um duto. Pode ser Engenheiro ou Infiltrado.`,`Vi ${seen.name} usando um duto, mas isso sozinho não prova a função.`]),claim:{from:ch.id,kind:'suspicion',target:seen.id,vent:true,strong:false}}}
  if(ai.ventSaw&&G.gt-ai.ventSaw.gt<45&&Math.random()<.16){const seen=charById(ai.ventSaw.id);if(seen)return {from:ch,text:pick([`Vi ${seen.name} a entrar em um duto!`,`${seen.name} é Infiltrado? Eu vi essa pessoa entrando em um duto.`]),claim:{from:ch.id,kind:'suspicion',target:seen.id,vent:true,strong:false}}}
  if(ai.reviveSaw&&G.gt-ai.reviveSaw.gt<75&&Math.random()<.65){const medic=charById(ai.reviveSaw.medicId),victim=charById(ai.reviveSaw.victimId);if(medic&&victim)return {from:ch,text:pick([`Vi ${medic.name} usar a função de Paramédico!`,`${medic.name} é Paramédico!!! Eu vi ${medic.name} reviver ${victim.name}.`,`Vi ${medic.name} trazer ${victim.name} de volta. É Paramédico.`]),claim:{from:ch.id,kind:'defend',target:medic.id,role:'paramedic'}}}
  if(ai.cleanSaw&&G.gt-ai.cleanSaw.gt<60&&Math.random()<.65){const seen=charById(ai.cleanSaw.id);if(seen&&seen.alive)return {from:ch,text:pick([`Vi ${seen.name} usar a função de Faxineiro!`,`${seen.name} é Faxineiro!!! Eu vi o corpo desaparecer perto dessa pessoa.`,`Vi ${seen.name} perto do corpo quando ele desapareceu. Pode ser Faxineiro.`,`O corpo sumiu quando ${seen.name} estava ali. Isso foi muito suspeito.`]),claim:{from:ch.id,kind:'accuse',target:seen.id,strong:true,role:'cleaner'}}}
  const cleanMyst=(ai.cleanMysteries||[]).filter(e=>G.gt-e.gt<90);if(cleanMyst.length&&Math.random()<.5){const e=cleanMyst[cleanMyst.length-1];return {from:ch,text:pick([`Eu tinha visto um corpo ${inRoom(e.room)} e depois ele sumiu. Pode existir um Faxineiro.`,`Um corpo desapareceu ${inRoom(e.room)}. Isso parece trabalho de Faxineiro.`]),claim:{from:ch.id,kind:'theory',role:'cleaner'}}}
  if(ai.spectralSeen&&G.gt-ai.spectralSeen.gt<90&&Math.random()<.62){const seen=charById(ai.spectralSeen.id);if(seen&&seen.alive)return {from:ch,text:pick([`Acho que vi um Espectral. ${seen.name} estava bem onde surgiu aquela fumaça.`,`Acho que vi um Espectral. Vi uma fumaça estranha perto de ${seen.name}.`]),claim:{from:ch.id,kind:'suspicion',target:seen.id,strong:false,role:'spectral'}}}
  const spectralMyst=(ai.spectralMysteries||[]).filter(e=>G.gt-e.gt<90);if(spectralMyst.length&&Math.random()<.46){const e=spectralMyst[spectralMyst.length-1];return {from:ch,text:pick([`Acho que vi um Espectral. Surgiu uma fumaça estranha ${inRoom(e.room)}.`,`Vi uma fumaça estranha ${inRoom(e.room)}. Pode existir um Espectral.`]),claim:{from:ch.id,kind:'theory',role:'spectral'}}}
  if(ch.function==='seer'&&ai.seerClue&&G.gt-ai.seerClue.t<120&&Math.random()<.78){const q=ai.seerClue;return {from:ch,text:q.vented?`Vi a silhueta de quem matou ${q.victimName}, entrou em um duto!`:`Vi a silhueta de quem matou ${q.victimName}, foi para ${q.room}.`,claim:{from:ch.id,kind:'seer',room:q.room,vent:!!q.vented,strong:false,role:'seer'}}}
  if(ch.function==='observer'&&(G.sab.comms||0)<=0){const recs=Object.entries(ai.observerMap||{}).filter(([id,r])=>r&&G.gt-r.t<35&&charById(id)?.alive);if(recs.length&&Math.random()<.24){const [id,r]=pick(recs),seen=charById(id);if(seen)return {from:ch,text:`No mapa de observação, observei que ${seen.name} foi para ${r.room}.`,claim:{from:ch.id,kind:'sight',target:seen.id,room:r.room,time:r.t,strong:false,role:'observer'}}}}
  if(M.body&&Math.random()<.12)return {from:ch,text:pick([`Sim. O corpo de ${M.body.name} foi encontrado ${inRoom(M.body.room)}.`,`Isso é verdade: encontramos ${M.body.name} ${inRoom(M.body.room)}.`]),claim:{from:ch.id,kind:'ask',bodyInquiry:true}};
  const ownRealTasks=G.tasks.filter(t=>t.owner===ch.id&&!t.fake),allOwnTasksDone=ownRealTasks.length>0&&ownRealTasks.every(t=>t.done);
  if(ch.role==='crew'&&allOwnTasksDone&&!ai.reportedTasksDone&&Math.random()<.55){ai.reportedTasksDone=true;return {from:ch,text:'Terminei minhas tarefas.',claim:{from:ch.id,kind:'taskDone'}}}
  const recentTask=ai.state==='work'&&ai.goal?.type==='task'&&!ai.goal.t?.fake?ai.goal.t.name:(ai.lastTaskName&&G.gt-(ai.lastTaskAt||0)<30?ai.lastTaskName:null);
  const unseen=G.chars.filter(x=>x.alive&&x!==ch&&(!ai.seen[x.id]||G.gt-(ai.seen[x.id].t||0)>22));
  const unseenTarget=unseen.length?pick(unseen):null;
  const knownTop=topSuspect(ch);
  // Uma suspeita moderada sobre o corpo vira pergunta, nunca confirmação de autoria.
  if(M.body&&knownTop&&knownTop.s>0&&knownTop.s<P.thr*.95&&Math.random()<.34){const suspect=charById(knownTop.id);if(suspect)return {from:ch,text:`${suspect.name} matou ${M.body.name}?`,claim:{from:ch.id,kind:'suspicion',target:suspect.id,victimId:M.body.id,strong:false}}}
  // Em reuniões, Tripulantes com suspeita concreta falam primeiro sobre quem acreditam ser o Infiltrado.
  // Isso mantém a discussão ligada à memória individual do NPC, em vez de cair em fala genérica por acaso.
  if(ch.role==='crew'&&knownTop&&knownTop.s>=Math.max(.9,P.thr*.45)){
    const suspect=charById(knownTop.id),rs=bestReason(ai,knownTop.id);
    if(suspect){
      if(rs)return {from:ch,text:reasonText(ch,knownTop.id,rs,knownTop.s>=P.thr),claim:reasonClaim(ch,knownTop.id,rs)};
      return {from:ch,text:pickLine(knownTop.s>=P.thr?[`Vamos expulsar ${suspect.name} do jogo!`,`Vamos votar em ${suspect.name}.`,`Suspeito de ${suspect.name}.`,`${suspect.name} é suspeito.`]:[`Vamos expulsar ${suspect.name} do jogo?`,`Suspeito de ${suspect.name}.`,`${suspect.name} é suspeito.`,`${suspect.name} é Infiltrado?`,`Estou desconfiando de ${suspect.name}.`]),claim:{from:ch.id,kind:'accuse',target:suspect.id,strong:knownTop.s>=P.thr}};
    }
  }
  const recentSeen=Object.entries(ai.seen||{}).map(([id,rec])=>({id,rec})).filter(x=>x.rec&&x.rec.room&&G.gt-(Number(x.rec.t)||0)<30&&charById(x.id)?.alive);
  if(recentSeen.length&&Math.random()<.16){const hit=pick(recentSeen),seen=charById(hit.id);if(seen)return {from:ch,text:`${seen.name} estava ${inRoom(hit.rec.room)}.`,claim:{from:ch.id,kind:'sight',target:seen.id,room:hit.rec.room,time:hit.rec.t,strong:false}}}
  const trusted=G.chars.filter(x=>x.alive&&x!==ch&&(ai.susp[x.id]||0)<=-.65);if(ch.role==='crew'&&trusted.length&&Math.random()<.22){const t=pick(trusted);return {from:ch,text:`Não desconfio de ${t.name}.`,claim:{from:ch.id,kind:'defend',target:t.id,strong:false}}}
  const danger=crewEliminationsUntilLoss();if(ch.role==='crew'&&danger>0&&danger<=2&&Math.random()<.34)return {from:ch,text:lossWarningText(danger),claim:{from:ch.id,kind:'caution',eliminationsRemaining:danger}};
  if(ch.role==='crew'&&(ai.pers==='cauteloso'||ai.pers==='observador')&&(!knownTop||knownTop.s<P.thr)&&Math.random()<.26)return {from:ch,text:'Devemos votar com cuidado!',claim:{from:ch.id,kind:'caution'}};
  if(M.body&&Math.random()<.24){
    // Não usa `body.cause`: NPCs só discutem o que poderiam observar ou ouvir.
    return {from:ch,text:pickLine(['Não sei qual habilidade causou isso; precisamos de testemunhas.','Uma eliminação pode ter várias causas. Só dá para concluir com evidências.','Alguém viu alguma habilidade ou comportamento estranho perto do corpo?']),claim:{from:ch.id,kind:'theory',cause:'unknown'}};
  }
  if(M.body&&Math.random()<.12)return {from:ch,text:pickLine(['Onde foi o corpo?']),claim:{from:ch.id,kind:'ask',bodyInquiry:true}};
  if(recentTask&&Math.random()<.2)return {from:ch,text:pickLine([`Estava fazendo ${recentTask}.`]),claim:{from:ch.id,kind:'alibi',target:ch.id,room:myRoomAt(ch,M.body?M.body.tKill:M.gt0),time:M.body?M.body.tKill:M.gt0}};
  if(unseenTarget&&Math.random()<.17)return {from:ch,text:pickLine([`Não vi ${unseenTarget.name}.`]),claim:{from:ch.id,kind:'ask',target:unseenTarget.id}};
  if(unseenTarget&&Math.random()<.18)return {from:ch,text:pickLine([`Alguém viu ${unseenTarget.name}?`]),claim:{from:ch.id,kind:'ask',target:unseenTarget.id}};
  if(ch.role==='imp'){
    const r=Math.random(), crew=G.chars.filter(c=>c.alive&&c!==ch);
    if(r<.45){
      const real=myRoomAt(ch,M.body?M.body.tKill:M.gt0), mine=ai.my.map(e=>e.room).filter(x=>x!==real&&!(M.body&&x===M.body.room));
      const fake=mine.length?pick(mine):pick(ROOM_DEFS.map(x=>x.name).filter(x=>x!==real&&!(M.body&&x===M.body.room)));
      return alibiMsg(ch,M,fake);
    }
    if(r<.8&&crew.length){
      const T=crew.reduce((a,c)=>(!a||(M.heat[c.id]||0)<(M.heat[a.id]||0)&&Math.random()<.5)?c:a,null)||pick(crew);
      return {from:ch,text:pickLine([`Não tenho certeza, mas ${T.name} foi estranho.`,`Desconfio de ${T.name}. Alguém viu o que fazia?`]),claim:{from:ch.id,kind:'accuse',target:T.id,strong:false}};
    }
    return {from:ch,text:pickLine(['Não vi nada, só estava nas minhas tarefas.','Precisamos de calma, ninguém viu nada de concreto.']),claim:null};
  }
  const top=topSuspect(ch);
  if(top&&top.s>=P.thr*.6){
    const rs=bestReason(ch.ai,top.id);
    if(rs){const strong=top.s>=P.thr; return {from:ch,text:reasonText(ch,top.id,rs,strong),claim:reasonClaim(ch,top.id,rs)}}
  }
  const sb=ai.sabs[ai.sabs.length-1];
  if(G.sab.reactor>0&&Math.random()<.5)return {from:ch,text:pickLine(['Precisamos resolver essa sabotagem primeiro.','O reator está em perigo, melhor votar rápido e consertar!']),claim:null};
  if(sb&&G.gt-sb.gt<160&&Math.random()<.35){const T={lights:'as luzes apagaram',comms:'as comunicações caíram',reactor:'o reator entrou em alerta',doors:'as portas travaram'}[sb.type]; return {from:ch,text:pickLine([`Eu estava ${inRoom(sb.room)} quando ${T}.`,`Quando ${T}, eu estava ${inRoom(sb.room)} fazendo tarefa.`]),claim:null}}
  if(Math.random()<.55)return alibiMsg(ch,M);
  if(G.chars.some(x=>!x.alive)&&Math.random()<.16)return {from:ch,text:'Mortos, nos ajudem!',claim:null};
  return {from:ch,text:pickLine(NEUTRAL[ai.pers]),claim:null};
}

function genChat(){
  const M=G.M, L=[], npcs=meetingNPCs();
  const c=M.caller;
  if(!c.isPlayer&&!c.isRemoteHuman){
    if(M.reason==='body')L.push({from:c,text:pickLine([`Corpo de ${M.body.name} em ${M.body.room}.`,`Encontrei o corpo de ${M.body.name} em ${M.body.room}`,`Encontrei o corpo de ${M.body.name} em ${M.body.room}!`]),claim:null});
    else if(M.evid)L.push({from:c,text:'Chamei a reunião porque '+M.evid.text.charAt(0).toLowerCase()+M.evid.text.slice(1),claim:M.evid.claim});
    else L.push({from:c,text:'Chamei a reunião. Precisamos conversar.',claim:null});
  }
  const wit=npcs.filter(x=>x!==c&&(x.ai.ventSaw||x.ai.witnessOf||x.ai.controlSaw||x.ai.controlVictimSaw));
  const rest=npcs.filter(x=>x!==c&&!wit.includes(x)).sort((a,b)=>((topSuspect(b)?.s||0)-(topSuspect(a)?.s||0))||String(a.id).localeCompare(String(b.id)));
  [...wit,...rest].slice(0,5).forEach(ch=>{const msg=npcStatement(ch,M);if(msg&&msg.from&&msg.text)L.push(msg)});   // testemunhas e NPCs mais desconfiados falam primeiro
  // Garante participação mínima dos NPCs mesmo quando nenhum deles acumulou uma pista forte.
  const minNpcLines=Math.min(2,npcs.length);
  for(const ch of npcs){
    if(L.filter(m=>m&&m.from&&!m.from.isPlayer&&!m.from.isRemoteHuman).length>=minNpcLines)break;
    if(L.some(m=>m&&m.from===ch))continue;
    L.push({from:ch,text:pickLine(NEUTRAL[ch.ai.pers]||['Não tenho certeza. Precisamos discutir.']),claim:null});
  }
  const seenT=new Set(); L.forEach(m=>{if(seenT.has(m.text))m.text=pick(['Eu também: ','Confirmo: ','Pois é: '])+m.text.charAt(0).toLowerCase()+m.text.slice(1); seenT.add(m.text)});   // sem falas idênticas na mesma reunião
  M.msgs=L;
}

function hear(L,claim){
  const ai=L.ai, P=PERS[ai.pers], M=G.M, sp=charById(claim.from); if(!sp||sp===L)return null;
  ai.heard.push({from:sp.id,kind:claim.kind,target:claim.target,gt:G.gt}); if(ai.heard.length>8)ai.heard.shift();
  const T=claim.target?charById(claim.target):null, tr=trust(L,sp), heard=P.hear*tr, imp=L.role==='imp';
  let text=null,prio=0;
  if(claim.kind==='accuse'&&T){
    if(T===L){
      text=pick(imp?['Isso é conversa fiada, eu estava nas tarefas.','Acusar sem provas só ajuda o Infiltrado de verdade.']:['Eu? Eu estava fazendo minhas tarefas!','Cadê as provas disso?','Não fui eu, vocês estão errando.']); prio=3;
      addSusp(L,sp.id,.5,'claim');
    }else if(imp){
      text=Math.random()<.5?pick([`Também acho ${T.name} suspeito.`,`Pode ser. ${T.name} estava sozinho antes.`]):pick(['Não vamos nos precipitar.','Precisamos de mais informações.']); prio=1;
    }else{
      const own=ai.susp[T.id]||0;
      const sawVent=(ai.vents||[]).some(v=>v.id===T.id);
      addSusp(L,T.id,(claim.vent?3.2:(claim.strong?1.8:1))*heard*(own>0?1.25:1)*(own<=-1?.2:1),'claim',{by:sp.id});
      if(claim.vent&&sawVent){text=pick(['Sim.','Verdade.',`Eu também vi ${T.name} num duto!`,`Confirmo! ${T.name} estava no duto!`]);prio=4}
      else if(claim.vent&&own<P.thr*.6){text=pick(['Não vi!',`Eu não vi isso, mas ${sp.name} parece ter certeza.`,`Se for verdade, ${T.name} é o Infiltrado. Quem mais viu?`]);prio=3}
      else if(own<=-1){text=pick(['Discordo.','Não.',`Não concordo, vi ${T.name} fazendo tarefa de verdade.`]);prio=3}
      else if(own>=P.thr*.6){text=pick(['Concordo.','Sim.',`Concordo, eu também desconfio de ${T.name}.`,`É, ${T.name} também me chamou atenção.`]);prio=3}
      else if((ai.pers==='cauteloso'||ai.pers==='observador')&&Math.random()<.8){text=pick(['Você não tem provas','Que evidências você tem?','Onde você viu isso exatamente?','Calma, sem provas é arriscado.']);prio=2}
      else if(ai.pers==='impulsivo'&&Math.random()<.55){text=pick([`Faz sentido, ${T.name} está estranho mesmo.`,`Boa, vamos de ${T.name}!`]);prio=2}
      else if(ai.pers==='desconfiado'&&Math.random()<.45){text=`Pode ser, ${T.name} não me passa confiança.`;prio=2}
      else{text=pick([`Hmm, ${T.name} não me pareceu tão suspeito.`,`Acho cedo para acusar ${T.name}.`,`Não vi nada contra ${T.name}.`]);prio=2}
    }
  }else if(claim.kind==='bodyReport'&&M.body){text=pick(['Sim.','Isso é verdade.',`Sim. O corpo de ${M.body.name} está ${inRoom(M.body.room)}.`]);prio=2}
  else if(claim.kind==='defend'&&T){
    const own=ai.susp[T.id]||0; if(!imp)addSusp(L,T.id,-.6*heard,'claim');
    if(own>=P.thr*.6){text=`Defender ${T.name} agora? Eu não confio.`;prio=2}
    else if(own<=-1){text=`Concordo, ${T.name} estava limpo.`;prio=2}
    else if(Math.random()<.4){text=pick(['Pode ser, mas precisamos de mais informações.','Hmm, e o que você sabe sobre isso?','Concordo.','Discordo.','Sim.','Não.','Isso é verdade.','Mentira!','Eu vi!','Não vi!']);prio=1}
  }else if(claim.kind==='self'){
    const own=ai.susp[sp.id]||0;
    if(own>=P.thr*.6){text=pick(['Conveniente você dizer isso agora.','Foi o que eu esperava ouvir.']);prio=2}
  }else if(claim.kind==='sight'&&T){
    const time=(claim.near&&M.body)?M.body.tKill:(claim.time!==undefined?claim.time:M.gt0), recs=histNear(ai,T.id,time,8);
    if(recs.length&&claim.room&&!recs.some(r=>r.room===claim.room)){
      text=pick(['Mentira.',`Estranho, eu vi ${T.name} ${inRoom(recs[recs.length-1].room)} nessa hora.`]); prio=4; addSusp(L,sp.id,1.4,'contra');
    }else if(recs.length&&claim.room){
      text=pick(['Verdade.','Isso é verdade.','Eu vi!',`Confirmo, também vi ${T.name} ${inRoom(claim.room)}.`,`Sim, ${T.name} estava ${inRoom(claim.room)} mesmo.`]); prio=3;
      if(!imp)addSusp(L,T.id,(claim.near?1.4:.5)*heard,'claim',{by:sp.id});
    }else{
      if(!imp)addSusp(L,T.id,(claim.near?1.2:.5)*heard,'claim',{by:sp.id});
      if(ai.pers==='cauteloso'||ai.pers==='observador'){text='Em que momento foi isso?';prio=2}
    }
  }else if(claim.kind==='alibi'){
    const c=checkAlibi(L,sp,claim);
    if(c){text=`Isso não combina com o que vimos: eu vi ${sp.name} ${inRoom(c)}.`;prio=4;addSusp(L,sp.id,2,'contra')}
  }else if(claim.kind==='ask'&&claim.bodyInquiry&&M.body){
    text=pick([`O corpo foi encontrado ${inRoom(M.body.room)}.`,`Pelo que foi reportado, foi ${inRoom(M.body.room)}.`,`A denúncia indicou ${inRoom(M.body.room)}.`]); prio=2;
  }else if(claim.kind==='roleSight'){
    const roleNames=chatRoleNames(),roleName=roleNames[claim.role]||'essa função';
    if(!T){text=pick(['Quem você viu usando essa função?','Pode ser. Alguém mais presenciou isso?','Você não tem provas de quem foi.']);prio=2}
    else{
      const supports=(claim.role==='marionette'&&(ai.controlSaw?.id===T.id||ai.controlVictimSaw?.id===T.id))||(claim.role==='paramedic'&&ai.reviveSaw?.medicId===T.id)||(claim.role==='cleaner'&&ai.cleanSaw?.id===T.id)||(claim.role==='spectral'&&ai.spectralSeen?.id===T.id);
      if(supports){text=pick(['Sim.','Verdade.',`Eu também vi ${T.name} usar algo compatível com ${roleName}.`]);prio=4}
      else{const hostile=['imp','cleaner','parasite','spectral','delayed','marionette','hunter','metamorph','miner','ninja'].includes(claim.role);if(!imp&&hostile)addSusp(L,T.id,.45*heard,'claim',{by:sp.id,role:claim.role});text=pick(['Você não tem provas','Eu não vi isso acontecer.',`Não consigo confirmar que ${T.name} seja ${roleName}.`]);prio=2}
    }
  }else if(claim.kind==='roleUseSelf'||claim.kind==='roleUseTarget'){
    const roleNames=chatRoleNames(),roleName=roleNames[claim.role]||'essa função';
    const hostile=['imp','cleaner','parasite','spectral','delayed','marionette','hunter','metamorph','miner','ninja'].includes(claim.role);
    if(hostile&&!imp){addSusp(L,sp.id,1.2*heard,'claim',{role:claim.role});text=claim.kind==='roleUseTarget'&&T?`Você usou ${roleName} em ${T.name}? Isso é muito suspeito.`:`Você está dizendo que usou ${roleName}? Isso é muito suspeito.`;prio=4}
    else if(claim.kind==='roleUseTarget'&&T){text=pick([`Boa! Então você usou ${roleName} em ${T.name}.`,`Muito bem ${sp.name}. Isso pode ajudar a entender o que aconteceu.`,`Certo. ${T.name} consegue confirmar isso?`]);prio=2}
    else{text=pick(['Boa!','Certo, isso pode ajudar.','Muito bem. Alguém consegue confirmar?']);prio=2}
  }else if(claim.kind==='guardianProtected'){
    if(T){text=pick([`Se você realmente identificou ${T.name} no ataque, isso é importante.`,`Eu não consigo confirmar que ${T.name} foi quem atacou.`]);prio=2}
    else{text=pick(['Entendi. Alguém te protegeu.','Certo, então havia uma proteção ativa.']);prio=1}
  }else if(claim.kind==='instructorTrail'){
    const ownTrail=(ai.instructorTrailHints||[]).slice().reverse().find(h=>(!claim.target||String(h.targetId||'')===String(claim.target))&&(!claim.room||h.room===claim.room));
    if(T){if(!imp)addSusp(L,T.id,(ownTrail?.7:.2)*heard,'claim',{by:sp.id,trail:true});text=ownTrail?pick(['Eu também recebi uma trilha parecida.','Isso combina com a trilha que eu recebi.']):pick([`Pode ser uma pista sobre ${T.name}, mas não é confirmação.`,`Entendi. Vamos tratar a trilha sobre ${T.name} como pista, não como prova.`]);prio=ownTrail?3:2}
    else if(claim.room){text=ownTrail?`Também recebi uma trilha que levava a ${claim.room}.`:`Entendi. A trilha para ${claim.room} pode ajudar a investigar.`;prio=ownTrail?3:1}
  }else if(claim.kind==='taskDone'){
    const own=ai.susp[sp.id]||0;
    if(own>=P.thr*.7){text=pick([`Boa, mas ainda preciso entender as suspeitas sobre ${sp.name}.`,`Terminar tarefas ajuda, mas ainda quero esclarecer o que aconteceu.`]);prio=2}
    else{text=pick(['Boa!',`Muito bem ${sp.name}`,`${sp.name} terminou as tarefas. Boa!`]);prio=2}
  }else if(claim.kind==='praise'){
    if(T===L){text=pick(['Valeu!','Boa!']);prio=1}
  }else if(claim.kind==='ask'&&claim.role&&T){
    const sawMarion=(ai.controlSaw?.id===T.id||ai.controlVictimSaw?.id===T.id),sawEngineer=ai.engineerSaw?.id===T.id,sawCleaner=ai.cleanSaw?.id===T.id,sawParamedic=ai.reviveSaw?.medicId===T.id;
    const roleNames=chatRoleNames();
    const guessedRole=roleNames[claim.role]||'essa função';
    if(claim.role==='marionette'&&sawMarion){text=pick(['Sim.','Verdade.','Isso é verdade.','Eu vi!']);prio=4}
    else if(claim.role==='engineer'&&sawEngineer){text=`Vi ${T.name} usando um duto, mas isso não confirma se é Engenheiro ou Infiltrado.`;prio=2}
    else if(claim.role==='paramedic'&&sawParamedic){text=pick(['Sim.','Verdade.','Eu vi essa pessoa reviver um Tripulante.']);prio=4}
    else if(claim.role==='cleaner'&&sawCleaner){text=pick(['Sim.','Verdade.','Isso é verdade.','Vi o corpo desaparecer perto dessa pessoa.']);prio=4}
    else if((ai.cleanSaw?.id===T.id&&claim.role!=='cleaner')||(sawParamedic&&claim.role!=='paramedic')||(sawMarion&&claim.role!=='marionette')){text=`Não acho que ${T.name} seja ${guessedRole}.`;prio=3}
    else{text='Não vi!';prio=1}
  }else if(claim.kind==='ask'&&Math.random()<.5){
    if(T){const seen=ai.seen[T.id]&&G.gt-(ai.seen[T.id].t||0)<25;text=seen?'Eu vi!':'Não vi!'}else text=pick([`Estava em ${myRoomAt(L,M.body?M.body.tKill:M.gt0)}.`,'Não vi nada de estranho.',`Alguém viu algo por perto?`]); prio=1;
  }else if(claim.kind==='suspicion'){
    const top=topSuspect(L);
    text=top&&top.s>=P.thr*.6?`Também estou de olho em ${charById(top.id)?.name||'alguém'}, mas precisamos confirmar.`:pick(['Quem você viu? Temos algum detalhe?','Suspeita sozinha não basta. Alguém tem uma pista concreta?','Eu não vi o suficiente para acusar alguém ainda.']); prio=2;
  }else if(claim.kind==='caution'){
    const top=topSuspect(L);
    text=top&&top.s>=P.thr?pick([`Eu tenho motivos para desconfiar de ${charById(top.id)?.name||'alguém'}.`,`Entendo, mas as pistas sobre ${charById(top.id)?.name||'alguém'} precisam ser consideradas.`]):pick(['Concordo, não devemos votar sem evidências.','Também prefiro separar fatos de suposições.','Alguém consegue confirmar alguma coisa?']); prio=1;
  }else if(claim.kind==='skip'){
    const top=topSuspect(L);
    text=top&&top.s>=P.thr?`Eu entendo, mas ainda acho ${charById(top.id)?.name||'alguém'} suspeito pelas pistas que vi.`:pick(['Talvez seja melhor pular se ninguém tiver provas.','Se aparecer uma evidência, podemos votar com mais confiança.','Vamos ouvir se alguém tem alguma observação concreta.']); prio=1;
  }
  return text?{L,text,prio}:null;
}

function hearAll(claim,fromPlayer){
  const M=G.M, out=[];
  meetingNPCs().forEach(L=>{if(L.id===claim.from)return; const r=hear(L,claim); if(r)out.push(r)});
  out.sort((a,b)=>(b.prio-a.prio)+(Math.random()-.5)*.8);
  out.filter(r=>fromPlayer||r.prio>=3).slice(0,fromPlayer?2:1).forEach((r,i)=>{
    if(M.remarks>=10)return; M.remarks++; M.replyQ.push({at:M.clock+1.2+i*1.9+Math.random()*.8,from:r.L,text:r.text});
  });
}

function npcChoose(ch){
  const M=G.M, ai=ch.ai, P=PERS[ai.pers], cand=G.chars.filter(c=>c.alive&&c!==ch);
  let pickId='skip';
  if(ch.role==='imp'){
    // Infiltrados NPC simulam suspeitas: preferem um Tripulante já questionado na reunião,
    // evitando votar em outro Infiltrado quando existe uma alternativa plausível.
    const crew=cand.filter(c=>c.role!=='imp');
    const ranked=crew.map(c=>({id:c.id,score:(M.heat[c.id]||0)*1.2+Math.max(0,ai.susp[c.id]||0)})).sort((a,b)=>b.score-a.score);
    if(ranked.length&&ranked[0].score>.15)pickId=ranked[0].id;
    else if(crew.length&&ai.pers==='impulsivo')pickId=pick(crew).id;
  }else{
    // Tripulantes votam na pessoa em quem realmente acumulam mais suspeita.
    // Se não houver suspeita suficiente, pulam em vez de escolher alguém aleatoriamente.
    const ranked=cand.map(c=>({id:c.id,s:ai.susp[c.id]||0})).filter(x=>x.s>0).sort((a,b)=>b.s-a.s);
    const minVote=Math.max(.75,P.thr*.45);
    if(ranked.length&&ranked[0].s>=minVote)pickId=ranked[0].id;
  }
  ai.lastVote=pickId==='skip'?null:pickId; return pickId;
}

function hideSeekBot(ch,dt,api){const {oldSay,locked,route,killer,hide,tasksAllowed}=api;
  const ai=ch.ai;if(!ai||!ch.alive)return;ai.hnsTalk=(ai.hnsTalk||0)-dt;if(ai.hnsTalk<=0){ai.hnsTalk=14+Math.random()*12;oldSay(ch,t(ch.role==='imp'?'hns.npcHunt':ch.vent?'hns.npcHidden':'hns.npcHide'))}if(locked(ch)){ch.moving=false;return}ch.netKillCd=Math.max(0,(ch.netKillCd||0)-abilityCooldownDelta(ch,dt));ai.hnsPlan=(ai.hnsPlan||0)-dt;
  if(ch.vent){ch.moving=false;ai.hnsVentPlan=(ai.hnsVentPlan||0)-dt;if(!ch.ventAnim&&ch.ventMv<=0&&ai.hnsVentPlan<=0){ai.hnsVentPlan=1;const routes=(VENT_ADJ[ch.vent]||[]).map(id=>ventById[id]).filter(v=>v&&v.id!==ai.hnsPreviousVent),memory=ai.hnsThreat;if(routes.length&&(ch.hnsVentTime||0)>1.2&&!ai.hnsVentMoved){routes.sort((a,b)=>memory?dist(b,memory)-dist(a,memory):0);ai.hnsPreviousVent=ch.vent;if(ventMove(ch,routes[0].id))ai.hnsVentMoved=true}else if(G.gt-(ai.hnsHideAt||0)>=Math.min(3.5,CFG.hnsVentDuration-0.3)){exitVent(ch);ai.hnsPlan=0}}return}
  if(ch.role==='imp'){
   const targets=G.chars.filter(c=>c!==ch&&c.alive&&c.role==='crew'&&!c.vent&&(G.hns.alertRemaining>0||npcCanSeeChar(ch,c))).sort((a,b)=>dist(ch,a)-dist(ch,b)),victim=targets.find(v=>dist(ch,v)<=actionDistancePx('kill')&&losClear(ch.x,ch.y,v.x,v.y));
   if(victim&&ch.netKillCd<=0){doKill(ch,victim);return}
   const previous=targets.find(c=>c.id===ai.hnsTargetId),target=previous&&dist(ch,previous)<dist(ch,targets[0]||previous)*1.35?previous:targets[0];
   if(target){ai.hnsTargetId=target.id;ai.hnsLastSeen={x:target.x,y:target.y,until:G.gt+4}}
   if(ai.hnsPlan<=0){ai.hnsPlan=.65+Math.random()*.2;if(target)route(ch,target,'hnsHunt');else if(ai.hnsLastSeen&&G.gt<ai.hnsLastSeen.until){if(!ai.path?.length)route(ch,ai.hnsLastSeen,'hnsSearch')}else if(ai.state!=='walk'||!ai.path?.length)wander(ch)}
  }else{
   const k=killer(),perceived=k&&k.alive&&!locked(k)&&npcCanSeeChar(ch,k);
   if(perceived)ai.hnsThreat={x:k.x,y:k.y,until:G.gt+3};
   const threat=ai.hnsThreat&&G.gt<ai.hnsThreat.until?ai.hnsThreat:null;
   if(threat){const vent=nearestVentFor(ch);if(vent&&(ch.ventCd||0)<=0&&hide(ch,vent)){ai.hnsVentMoved=false;ai.hnsPreviousVent=null;ai.hnsVentPlan=.6;return}
    if(ai.hnsPlan<=0||!ai.path?.length){ai.hnsPlan=1.2+Math.random()*.4;botFleeRoute(ch,threat,'hnsFlee')}
   }else if(ai.state==='work'&&tasksAllowed()){ch.moving=false;ai.work-=dt;if(ai.work<=0)finishWork(ch);return}
   else if(ai.hnsPlan<=0){ai.hnsPlan=1.2+Math.random()*.8;if(ai.state!=='walk'||!ai.path?.length){const chosen=G.hns.phase==='start'&&tasksAllowed()&&botTaskRoute(ch);if(!chosen)wander(ch)}}
  }
  if(ai.state==='walk'){if(ai.pathVer!==G.walkVer&&!repath(ch)){ai.state='idle';ai.hnsPlan=.8;return}if(followPath(ch,dt)){if(ai.goal?.type==='task'&&tasksAllowed())onArrive(ch);else{ai.navVisits=ai.navVisits||{};if(ai.navRoom)ai.navVisits[ai.navRoom]=G.gt;ai.state='idle';ai.hnsPlan=.5}}}
 }

function hotPotatoBot(ch,dt,api){const {live,holder,nearest,transfer,living}=api;if(!ch.alive||!ch.ai||!live())return;const ai=ch.ai,h=holder();ai.hpPlan=(ai.hpPlan||0)-dt;ai.hpTalk=(ai.hpTalk||0)-dt;if(ai.hpTalk<=0){ai.hpTalk=15+Math.random()*12;npcSay(ch,t(ch===h?'hp.npcHolder':'hp.npcFlee'))}
 const route=(target,type)=>{const pos=tileOf(target);return goTo(ch,{type},(x,y)=>Math.abs(x-pos.x)+Math.abs(y-pos.y)<=1)};
 if(ch===h){const target=nearest(ch);if(target&&G.hp.passCd<=0){transfer(ch,target,G.hp.seq);ai.hpTargetId=null;return}if(ai.hpPlan<=0){ai.hpPlan=G.hp.remaining<5?.4:.8;const visible=living().filter(c=>c!==ch&&npcCanSeeChar(ch,c)).sort((a,b)=>dist(ch,a)-dist(ch,b)),kept=visible.find(c=>c.id===ai.hpTargetId),targets=kept?[kept,...visible.filter(c=>c!==kept)]:visible;let routed=false;for(const to of targets){if(route(to,'hpHunt')){ai.hpTargetId=to.id;routed=true;break}}if(!routed&&(ai.state!=='walk'||!ai.path?.length))wander(ch)}}
 else{
  if(h&&npcCanSeeChar(ch,h)&&dist(ch,h)<(G.hp.remaining<6?900:650))ai.hpThreat={x:h.x,y:h.y,id:h.id,until:G.gt+2};
  const threat=ai.hpThreat&&ai.hpThreat.id===h?.id&&G.gt<ai.hpThreat.until?ai.hpThreat:null;
  if(threat){if(ai.hpPlan<=0||!ai.path?.length){ai.hpPlan=.9+Math.random()*.4;botFleeRoute(ch,threat,'hpFlee')}}
  else if(CFG.hpType&&ai.state==='work'){ai.work-=dt;ch.moving=false;if(ai.work<=0)finishWork(ch);return}
  else if(ai.hpPlan<=0){ai.hpPlan=1.1+Math.random()*.8;if(ai.state!=='walk'||!ai.path?.length){if(!CFG.hpType||!botTaskRoute(ch))wander(ch)}}
 }
 if(ai.state==='walk'){if(ai.pathVer!==G.walkVer&&!repath(ch)){ai.state='idle';ai.hpPlan=.6;return}if(followPath(ch,dt)){if(ai.goal?.type==='task'&&CFG.hpType&&ch!==holder())onArrive(ch);else{ai.navVisits=ai.navVisits||{};if(ai.navRoom)ai.navVisits[ai.navRoom]=G.gt;ai.state='idle';ai.hpPlan=.5}}}
 }

/* Mímica communicates only evidence the bot has already perceived. Votes retain npcChoose. */
function mimicHearGesture(g){
 const actor=charById(g.actorId),target=g.targetId&&charById(g.targetId);if(!actor||!G.M)return;
 for(const bot of G.chars){if(!bot.ai||bot.isPlayer||bot.isRemoteHuman||bot===actor)continue;const ai=bot.ai;
  if(target&&target.alive&&NZGestureRules.POINT.has(g.kind)){const own=Number(ai.susp[target.id])||0;{G.M.heat[target.id]=(G.M.heat[target.id]||0)+.08;if(own>0)addSusp(bot,target.id,.12,'claim',{by:actor.id})}if(target===bot)ai.mimicReply={kind:'down',at:MIMIC.now()+700+Math.random()*900};else if(own>=1.8)ai.mimicReply={kind:'up',at:MIMIC.now()+1000+Math.random()*1200};else if(own<=-1)ai.mimicReply={kind:'down',at:MIMIC.now()+1000+Math.random()*1200}}
 }
}
function mimicBotThink(ch){
 if(!MIMIC.active()||!ch.ai||G.over||MIMIC.remaining(ch)>0)return;const ai=ch.ai,now=MIMIC.now(),ctx=NZGestureRules.context({state:G.state,meeting:G.M,over:G.over});if(!ctx||ch.vent||ch.ventAnim||ch.controlledBy||ch.spectralInvisible)return;
 if(now<(ai.mimicNextAt||0))return;ai.mimicNextAt=now+1400+Math.random()*800;
 const send=(kind,angle=0,targetId=null)=>{if(MIMIC.request(kind,angle,targetId,ch)){ai.mimicNextAt=now+CFG.gestureCooldown*1000+1000+Math.random()*3000;ai.mimicEvent=false;return true}return false};
 if(ctx==='meeting'){
  if(ai.mimicMeeting!==G.M){ai.mimicMeeting=G.M;ai.mimicAccused=null;ai.mimicReply=null;ai.mimicMeetingOpinion=null;ai.mimicNextAt=now+700+(String(ch.id).split('').reduce((n,v)=>n+v.charCodeAt(0),0)%13)*220;return}
  if(ai.mimicReply&&now>=ai.mimicReply.at){const kind=ai.mimicReply.kind;ai.mimicReply=null;if(send(kind))return}
  const top=topSuspect(ch),target=top&&charById(top.id),threshold=PERS[ai.pers]?.thr||2.5;
  if(target?.alive&&target!==ch&&top.s>=threshold*.65){if(ai.mimicAccused!==target.id||now-(ai.mimicAccusedAt||0)>22000){if(send('right',0,target.id)){ai.mimicAccused=target.id;ai.mimicAccusedAt=now}return}}
  if(ch.role==='neutral'&&ch.function==='jester'&&ai.mimicEvent){send('palm');return}
  if(!ai.mimicMeetingOpinion&&G.M.clock>5){ai.mimicMeetingOpinion=G.M;send('palm')}
  return;
 }
 if(!ch.alive)return;
 const top=topSuspect(ch),suspect=top&&charById(top.id);
 if(suspect&&top.s>=2&&npcCanSeeChar(ch,suspect)&&dist(ch,suspect)<500){if(ai.mimicWorldTarget!==suspect.id||G.gt-(ai.mimicWorldAt||0)>30){if(send('right',Math.atan2(suspect.y-ch.y,suspect.x-ch.x))){ai.mimicWorldTarget=suspect.id;ai.mimicWorldAt=G.gt}return}}
 if(ai.mimicCompletedAt&&G.gt-ai.mimicCompletedAt<8){const peer=G.chars.find(c=>c!==ch&&npcCanSeeChar(ch,c)&&dist(ch,c)<260);if(peer&&send('up'))ai.mimicCompletedAt=0;return}
 if(ai.mimicEvent){const body=G.bodies.find(b=>npcCanSeePoint(ch,b.x,b.y)&&dist(ch,b)<400);if(body){send('right',Math.atan2(body.y-ch.y,body.x-ch.x));return}if(ai.fix&&G.sab[ai.fix]>0){const station=stationPos(FIX[ai.fix].st);send('right',Math.atan2(station.y-ch.y,station.x-ch.x));return}ai.mimicEvent=false}
 const peer=G.chars.find(c=>c!==ch&&c.alive&&npcCanSeeChar(ch,c)&&dist(ch,c)<190);if(peer&&G.gt-(ai.mimicGreetAt||-50)>45){if(send('wave'))ai.mimicGreetAt=G.gt}
}
function ninjaBotUpdate(ch,dt,next){
 if(!G.hns&&!G.hp&&(!NET.inRoom||['classic','mimica'].includes(NET.room?.mode))&&ch.function==='ninja'&&ch.alive&&!G.over&&!G.M&&['playing','task','tool'].includes(G.state)){if(NINJA.shaking(ch))return;if(ch.ninja){if((ch.netKillCd||ch.ai?.killCd||0)>0&&ch.ninja.until-G.gt<1.5){NINJA.request(ch);return}}else if((ch.ninjaCd||0)<=0&&Math.random()<dt*.16){NINJA.request(ch);if(NINJA.shaking(ch))return}}return next(ch,dt);
}
