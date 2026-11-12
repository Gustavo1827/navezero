/* Exact neutral setup, atomic role changes and a short, locked final presentation. */
'use strict';
const MATCH_UPDATE=(()=>{
 const classic=()=>!G.hns&&!G.hp&&(!NET.inRoom||NZMatchRules.classic(NET.room?.mode)),allowed=()=>!classic()||CFG.allowMeetings!==0;
 let finishTimer=null,claimed=false,fadeFrame=0,revealTimer=0,fadeKey=null,fadeStart=0,finishedRound=null;const fade=el('div');fade.id='matchFade';fade.hidden=true;fade.setAttribute('aria-hidden','true');document.body.append(fade);
 function clearFade(){cancelAnimationFrame(fadeFrame);clearTimeout(revealTimer);fadeKey=null;fade.style.transition='none';fade.style.opacity='0';fade.hidden=true}
 function animateFade(){if(!G.ending)return;fade.style.opacity=String(clamp((performance.now()-fadeStart)/450,0,1));fadeFrame=requestAnimationFrame(animateFade)}
 CFG_DEF.allowMeetings=1;CFG_LIM.allowMeetings=[0,1];CFG.allowMeetings=1;NET_SETTING_KEYS.push('allowMeetings');
 CFG_ROWS.push(['allowMeetings','match.allowMeetings','match.allowMeetingsHelp','']);ROOM_CFG_LABELS.allowMeetings={label:'match.allowMeetings',unit:''};
 function labels(){const row=CFG_ROWS.find(r=>r[0]==='allowMeetings');row[1]=t('match.allowMeetings');row[2]=t('match.allowMeetingsHelp');ROOM_CFG_LABELS.allowMeetings.label=row[1]}
 const oldLang=applyGameLanguage;applyGameLanguage=function(){const r=oldLang();labels();return r};labels();
 function reset(){clearTimeout(finishTimer);finishTimer=null;claimed=false;finishedRound=null;G.ending=null;clearFade();G.roleRevision=0;document.body.classList.remove('matchEnding')}
 function refreshRoles(changed=[]){
  const p=G.player;if(!p)return;G.role=p.role;for(const key of ['locator','observer','cleaner','parasite','paramedic','seer','noisy','judge'])G[key]=p.function===key;
  G.imps=G.chars.filter(c=>c.role==='imp');G.imp=G.imps[0]||null;G.killCd=p.netKillCd||0;G.sheriffCd=p.netSheriffCd||0;G.delayedCd=p.netDelayedCd||0;G.trackTarget=p.netTrackTarget||null;G.trackTime=p.netTrackTime||0;G.trackCd=p.netTrackCd||0;G.cleanerCd=p.cleanCd||0;G.cleanerUses=p.cleanUses||0;G.paramedicCd=p.paramedicCd||0;
  G.action=G.killT=G.sheriffT=G.delayedT=G.cleanerT=G.paramedicT=G.seerT=null;closeModalSilent();
  for(const c of G.chars)if(c.ai&&changed.includes(c.id)){c.ai.path=[];c.ai.goal=null;c.ai.fix=null;c.ai.hunt=null;c.ai.state='idle';c.ai.wait=.3;c.ai.killCd=c.netKillCd||0;delete c.ai.geminiVote}
  if(NET.isHost){NET.matchImpIds=new Set(G.imps.map(c=>c.id));NET.departedImpIds=new Set()}
  updateRolePanel(p);renderTasks();updateButtons();
 }
 function freeze(ending){
  const key=ending.id||ending.endsAt;if(fadeKey!==key){clearFade();fadeKey=key;fade.hidden=false;fadeStart=performance.now()+Math.max(0,(ending.fadeAt??ending.endsAt-450)-(ending.serverNow??Date.now()));fadeFrame=requestAnimationFrame(animateFade)}
  G.ending=ending;G.state='ending';G.mapOpen=false;G.action=null;G.delayedMarks={};G.parasiteInfections={};G.M=null;
  closeModalSilent();closeEmergencyDialog();$('mapView').hidden=true;$('ventPanel').hidden=true;$('meetingIntro').hidden=true;$('meet').hidden=true;$('settings').hidden=true;G.cfgOpen=false;
  joy.x=joy.y=0;keys.clear?.();NET.remoteInputs.clear();for(const c of G.chars){c.moving=false;c.controlTargetId=c.controlledBy=null;c.cleanPending=c.seerPending=null}
  document.body.classList.add('matchEnding');PING_METER.paint();
 }
 const originalEnd=endGame;
 function showFinal(winner,reason){clearTimeout(finishTimer);cancelAnimationFrame(fadeFrame);fade.hidden=false;fade.style.transition='none';fade.style.opacity='1';G.ending=null;G.over=false;const applying=NET.applying;NET.applying=true;try{originalEnd(winner,hasI18nKey(reason)?t(reason):reason)}finally{NET.applying=applying}clearTimeout(revealTimer);revealTimer=setTimeout(()=>{fade.style.transition='opacity 180ms ease-out';fade.style.opacity='0';revealTimer=setTimeout(()=>{fade.hidden=true;fadeKey=null;document.body.classList.remove('matchEnding')},190)},40)}
 endGame=function(winner,reason){
  if(!classic()||G.freePlay||NET.applying)return originalEnd(winner,reason);
  if(G.ending||claimed||G.over)return;
  if(NET.inRoom){if(!NET.isHost)return;claimed=true;netSend({type:'game_end',winner,reason,snapshot:netCaptureSnapshot()});return}
  const now=Date.now(),ending={winner,reason,serverNow:now,fadeAt:now+2400,endsAt:now+2850};freeze(ending);finishTimer=setTimeout(()=>showFinal(winner,reason),2850);
 };
 const beforeMenu=toMenu;toMenu=function(...a){reset();return beforeMenu(...a)};
 const oldCheck=checkEnd;checkEnd=function(){if(G.ending)return true;if(classic()&&!G.freePlay){const child=G.chars.find(c=>c.function==='child'&&c.role==='neutral'&&!c.alive&&G.bodies.some(b=>String(b.victimId??b.id)===String(c.id)&&b.killerId&&b.killerId!==c.id&&!['sheriff_misfire','eject','disconnect'].includes(b.cause)));if(child){G.neutralWinnerId=child.id;G.neutralWinnerIds=[child.id];endGame('neutral',t('newNeutral.childWin'));return true}}return oldCheck()};
 const oldNew=newGame;newGame=function(...args){if(classic()&&!G.freePlay&&!NET.inRoom){const cap=NZNeutralRules.capacity(15,CFG);if(!cap.valid){toast(t('neutral.invalidCapacity',cap),6000);return false}}reset();return oldNew(...args)};
 const oldSend=netSend;netSend=function(m){if(G.ending&&['action','input','neutral_action','captain_request','sheriff_request','ninja_request','sabotage_request','gesture_request','state_snapshot','motion_state','meeting_chat','game_end','advanced_ack','door_repair_begin','door_repair_finish'].includes(m?.type))return false;if(!allowed()&&(m?.type==='sabotage_request'||m?.type==='captain_request'||m?.type==='action'&&['sabotage','report','emergency'].includes(m.action)))return false;return oldSend(m)};
 const oldCapture=netCaptureSnapshot;netCaptureSnapshot=function(){const s=oldCapture();s.roleRevision=G.roleRevision||0;s.crewTaskGhostsActive=ghostActs();for(const c of s.chars){const ch=charById(c.id);c.shiftCount=ch.shiftCount||0;c.shifterTenure=ch.shifterTenure||0}return s};
 const oldApply=netApplySnapshot;netApplySnapshot=function(s,...args){const accepted=s&&(!Number.isFinite(+s.seq)||+s.seq>=NET.recvSeq),r=oldApply(s,...args);if(accepted){G.roleRevision=s.roleRevision||0;if(s.ending&&finishedRound!==NET.room?.code+'|'+NET.round)freeze(s.ending)}return r};
 const oldHandle=netHandleMessage;netHandleMessage=function(m){
  if(m.type==='room_error'&&m.key==='neutral.invalidCapacity')m={...m,message:t(m.key,m.params)};
  if(['game_start','left','room_expired','moderation_removed'].includes(m.type))reset();
  if(['role_swap','match_ending'].includes(m.type)){if(!NET.inRoom||m.code!==NET.room?.code||m.round!==NET.round||!m.snapshot)return;const changed=G.chars.filter(c=>{const n=m.snapshot.chars.find(n=>n.id===c.id);return n&&(n.role!==c.role||n.function!==c.function)}).map(c=>c.id);netApplySnapshot(m.snapshot,true);if(m.type==='role_swap'){refreshRoles(changed);if(NET.isHost)netSyncHostAfterAuthorityChange()}else freeze(m.ending);return}
  if(m.type==='game_end'&&m.snapshot?.endingConfirmed){if(!NET.inRoom||m.code!==NET.room?.code||m.round!==NET.round||finishedRound===m.code+'|'+m.round)return;finishedRound=m.code+'|'+m.round;const s={...m.snapshot,state:'ending',over:false};netApplySnapshot(s,true);G.neutralWinnerId=s.neutralWinnerId;G.neutralWinnerIds=s.neutralWinnerIds||[];showFinal(m.winner,m.reason);return}
  return oldHandle(m);
 };
 const oldUpdate=update;update=function(dt){if(!allowed()&&G.tool==='sab'){closeModal();G.tool=null;if(!G.over&&!G.ending)G.state='playing'}if(G.ending){updateDirectKillDashes(dt);updateKillSplashes(dt);updateRoleFx(dt);G.fx=Math.max(0,G.fx-dt*1.4);return}return oldUpdate(dt)};
 const beforeReport=playerReport;playerReport=function(...a){if(G.ending||!allowed())return false;return beforeReport(...a)};
 const beforePlayerSab=playerSab;playerSab=function(...a){if(G.ending||!allowed())return false;return beforePlayerSab(...a)};
 const beforeTool=openTool;openTool=function(a,...rest){if(G.ending||a?.tool==='sab'&&!allowed())return false;return beforeTool(a,...rest)};
 const beforeSabPanel=openSabPanel;openSabPanel=function(...a){if(G.ending||!allowed())return false;return beforeSabPanel(...a)};
 const beforeEmergency=pressEmergency;pressEmergency=function(...a){if(G.ending||!allowed())return false;return beforeEmergency(...a)};
 const beforeKill=doKill;doKill=function(...a){return G.ending?false:beforeKill(...a)};
 const beforeFinish=finishStep;finishStep=function(...a){if(G.ending)return false;return beforeFinish(...a)};
 const oldMeeting=callMeeting;callMeeting=function(...a){if(G.ending||!allowed())return false;return oldMeeting(...a)};
 const oldSab=startSabotage;startSabotage=function(...a){if(G.ending||!allowed())return false;return oldSab(...a)};
 const oldHost=netHostCommand;netHostCommand=function(m){if(G.ending||!allowed()&&['sabotage','report','emergency'].includes(m.command||m.action))return;return oldHost(m)};
 const oldWants=wantsEmergency;wantsEmergency=function(...a){return allowed()&&!G.ending&&oldWants(...a)};
 const oldBest=bestAction;bestAction=function(...args){const a=oldBest(...args);return !allowed()&&a?.type==='emergency'?null:a};
 const oldAction=actionFor;actionFor=function(st){const a=oldAction(st);if(!allowed()&&a?.type==='emergency'||['child','shifter'].includes(G.player?.function)&&a?.type==='task')return null;return a};
 const oldTask=openTask;openTask=function(a,...rest){if(G.ending||['child','shifter'].includes(G.player?.function)&&!a?.task?.fix)return;return oldTask(a,...rest)};
 const button=el('button','act2 neutralAbility');button.id='btnShift';button.type='button';button.hidden=true;$('btnLocator').before(button);
 const targets=ch=>G.chars.filter(c=>c!==ch&&c.function!=='shifter'&&!NZMatchRules.busy(c)&&dist(ch,c)<=actionDistancePx('object')&&interactionRayClear(ch.x,ch.y,c.x,c.y));
 button.onclick=()=>{const target=targets(G.player).sort((a,b)=>dist(G.player,a)-dist(G.player,b))[0];if(!button.disabled&&target)NEW_NEUTRALS.request(G.player,'shift',{targetId:target.id})};
 const oldButtons=updateButtons;updateButtons=function(){const r=oldButtons(),p=G.player;button.hidden=!(classic()&&p?.alive&&p.function==='shifter'&&G.state==='playing');if(!button.hidden){const cd=NEW_NEUTRALS.cooldown(NEW_NEUTRALS.record(p)),signal=G.sab.comms>0;button.disabled=G.ending||uiBusy()||NZMatchRules.busy(p)||signal||!NEW_NEUTRALS.record(p)||cd>0||!targets(p).length;setCls(button,'ready',!button.disabled);setCls(button,'no-signal',signal);setCls(button,'cooldown-label',signal||cd>0);if(signal)setAbilityCaption(button,'📡',t('message.noSignalText'));else if(cd>0)button.textContent=String(Math.ceil(cd));else setAbilityCaption(button,'🧬',t('newNeutral.shift'))}
  if(!allowed()){for(const id of ['btnReport','btnSab']){$(id).hidden=true;$(id).disabled=true}$('btnCaptain').disabled=true;}
  for(const id of ['btnDouse','btnIgnite','btnShift'])$(id)?.classList.add('neutralAbility');return r;
 };
 const oldKey=triggerFunctionKey;triggerFunctionKey=function(){if(G.player?.function==='shifter'){if(!button.hidden&&!button.disabled)button.click();return}return oldKey()};
 const oldNPC=updateNPC;updateNPC=function(ch,dt){if(G.ending)return;if(!allowed()&&ch.ai){ch.ai.seerReportBody=null;if(ch.ai.goal?.type==='body'){ch.ai.path=[];ch.ai.goal=null;ch.ai.state='idle';ch.ai.wait=0}ch.ai.bodySeen=null;ch.ai.reactT=0;}if(classic()&&ch.role==='neutral'&&['child','shifter'].includes(ch.function)&&ch.alive&&ch.ai){
  if(ch.function==='shifter'&&G.state==='playing'&&!G.M&&G.sab.comms<=0&&!NZMatchRules.busy(ch)){const r=NEW_NEUTRALS.record(ch),target=targets(ch).filter(c=>npcCanSeeChar(ch,c)).sort((a,b)=>dist(ch,a)-dist(ch,b))[0];if(r&&NEW_NEUTRALS.cooldown(r)<=0&&target&&NEW_NEUTRALS.request(ch,'shift',{targetId:target.id}))return}
  const ai=ch.ai;if(ai.state==='walk'){if(ai.pathVer!==G.walkVer&&!repath(ch)){ai.path=[];ai.state='idle';return}if(followPath(ch,dt)){ai.state='idle';ai.wait=1}}else if((ai.wait=(ai.wait||0)-dt)<=0){wander(ch);ai.wait=1.5}return;
 }return oldNPC(ch,dt)};
 // A player still holding Shifter never shares a team victory.
 const oldEndChar=drawEndChar;drawEndChar=function(dt){if(G.player?.function==='shifter'){$('end').className='lose neutral';$('endTitle').textContent=t('neutral.defeat')}return oldEndChar(dt)};
 return{allowed,refreshRoles,targets,freeze};
})();
