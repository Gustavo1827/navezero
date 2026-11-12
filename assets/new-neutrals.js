/* Worker and Pyromancer reuse tasks, role tabs, abilities, navigation and meeting transitions. */
'use strict';
const NEW_NEUTRALS=(()=>{
 const kinds=NZNeutralRules.kinds,classic=()=>!G.hns&&!G.hp&&(!NET.inRoom||['classic','mimica'].includes(NET.room?.mode));
 let state={own:null,bots:[],oil:[],alerts:[],hasPendingFire:false},offset=0,local=null,clock=0,waitingMeeting=false,finishing=false;
 const pending=new Map(),tickets=new Map(),seen=new Set(),fires=[];let finishTimer=0;
 const role=ch=>classic()&&ch?.role==='neutral'&&kinds.includes(ch.function),worker=ch=>role(ch)&&ch.function==='worker',pyro=ch=>role(ch)&&ch.function==='pyromancer';
 const record=ch=>ch?.id===G.player?.id?state.own:state.bots.find(r=>r.id===ch?.id),now=()=>Date.now()+offset;
 function cooldown(r){return r?Math.max(0,r.pause===null?r.readyAt-now():r.pause)/1000:0}
 function can(ch){return classic()&&!G.over&&!G.M&&G.state==='playing'&&ch?.alive&&!ch.vent&&!ch.ventAnim&&!ch.controlledBy&&!ch.controlTargetId&&!ch.killDash&&!ch.minerDig&&!ch.morphTransition&&!finishing}
 function targets(ch){return G.chars.filter(c=>c!==ch&&c.alive&&!c.spectralInvisible&&!c.ghost&&!c.vent&&!c.ventAnim&&!(record(ch)?.oil||[]).includes(c.id)&&dist(ch,c)<=actionDistancePx('object')&&interactionRayClear(ch.x,ch.y,c.x,c.y))}
 function request(ch,action,data={}){
  if(!role(ch)||!ch.alive||(pending.get(ch.id+'|'+action)||0)>performance.now())return false;
  if(NET.inRoom){if(ch!==G.player&&!(NET.isHost&&ch.isBot))return false;const sent=netSend({type:'neutral_action',round:NET.round,actorId:ch.id,action,...data});if(sent)pending.set(ch.id+'|'+action,performance.now()+800);return sent}
  syncLocal();const result=local.action(ch.id,action,data);if(!result)return false;G.tasks=local.snapshot.tasks;ack(result);syncLocal();return true;
 }
 function apply(v){state=v;G.workerAlerts=v.alerts||[];
  for(const r of [v.own,...v.bots||[]].filter(Boolean)){if(r.kind!=='worker')continue;const current=G.tasks.filter(t=>t.owner===r.id);if(JSON.stringify(current)!==JSON.stringify(r.tasks)){G.tasks=[...G.tasks.filter(t=>t.owner!==r.id),...structuredClone(r.tasks)];if(G.player?.id===r.id)renderTasks()}}
  if(!v.hasPendingFire)waitingMeeting=false;
 }
 function ack(m){for(const key of [...pending.keys()])if(key.startsWith(m.actorId+'|'))pending.delete(key);if(m.type==='ticket'){tickets.set(m.actorId,{...m,ready:performance.now()+m.waitMs});return}
  if(m.type==='task_done'){if(!NET.inRoom&&typeof TASK_CONFIRMATIONS!=='undefined')TASK_CONFIRMATIONS.ack(m);tickets.delete(m.actorId);const ch=charById(m.actorId);if(ch?.ai){ch.ai.state='idle';ch.ai.wait=1;ch.ai.goal=null}if(ch===G.player&&G.mini&&String(G.mini.task.id)===String(m.taskId)){closeModal();renderTasks();Snd.ok()}}
 }
 function event(e){
  const key=(NET.inRoom?NET.round:'local')+'|'+e.type+'|'+e.id;if(seen.has(key))return;seen.add(key);
  if(e.type==='shift'){MATCH_UPDATE.refreshRoles([e.actorId,e.targetId]);return}
  if(e.type==='burn'){for(const id of e.victims||[]){const c=charById(id);if(!c)continue;fires.push({x:c.x,y:c.y,until:performance.now()+1000});if(c.alive)killChar(c)}for(const b of e.bodies||[])if(!G.bodies.some(old=>old.victimId===b.victimId))G.bodies.push(structuredClone(b));return}
  if(e.type==='victory'){
   finishing=true;G.neutralWinnerId=e.id;G.neutralWinnerIds=[e.id];const finish=()=>{finishing=false;waitingMeeting=false;endGame('neutral',t('newNeutral.'+e.kind+'Win'))};
   if(e.kind==='pyromancer'&&fires.length){clearTimeout(finishTimer);finishTimer=setTimeout(finish,650)}else finish();
  }
 }
 function syncLocal(){
  if(NET.inRoom||!classic()||!G.player)return;
  if(!local)local=new NZNeutralRules.Ledger({near:(ch,id)=>!!stationById[id]&&canAccessStation(ch,stationById[id]),ray:(a,b)=>interactionRayClear(a.x,a.y,b.x,b.y),tasksFor:ch=>{let tasks=G.tasks.filter(t=>t.owner===ch.id&&!t.fake);if(!tasks.length)tasks=createTasksFor(ch.id,taskTemplateSelection(TASK_POOLS.common,CFG.commonTasks));if(!tasks.length)tasks=[makeTask(activeTaskTemplates().find(t=>t.category==='medium'),ch.id)];return structuredClone(tasks)}});
  const s={state:['task','tool'].includes(G.state)?'playing':G.state,chars:G.chars,tasks:G.tasks,sab:G.sab,doors:doors.map(d=>d.closed),meeting:G.M,over:G.over};const settings={...CFG};if(G.freePlay){settings.neutrals=Math.floor(G.chars.length/3);for(const id of NZNeutralRules.roles){settings[id+'Max']=5;settings[id+'Chance']=100}}
  local.sync(s,new Set(G.chars.map(c=>c.id)),settings);for(const e of local.events.splice(0))event(e);apply(local.view(G.player.id,true));
 }
 function reset(){clearTimeout(finishTimer);finishing=waitingMeeting=false;local=null;state={own:null,bots:[],oil:[],alerts:[],hasPendingFire:false};G.workerAlerts=[];pending.clear();tickets.clear();seen.clear();fires.length=0}
 const oldHandle=netHandleMessage;netHandleMessage=function(m){
  if(['game_start','left','room_expired'].includes(m.type))reset();
  if(['neutral_state','neutral_ack','neutral_rejected','neutral_event'].includes(m.type)){
   if(!NET.inRoom||m.code!==NET.room?.code||m.round!==NET.round)return;
   if(m.type==='neutral_state'){offset=m.serverNow-Date.now();apply(m.state)}else if(m.type==='neutral_ack')ack({...m,type:m.resultType});else if(m.type==='neutral_event')event({...m,type:m.eventType});else{pending.delete(m.actorId+'|'+m.action);if(m.action==='task_finish'&&m.actorId===G.player.id)closeModal()}return;
  }
  if(m.type==='game_end'&&!m.snapshot?.roleRevision&&!m.snapshot?.endingConfirmed&&m.snapshot?.newNeutralWinnerKind){event({type:'victory',id:m.snapshot.neutralWinnerId,kind:m.snapshot.newNeutralWinnerKind});return}
  return oldHandle(m);
 };
 const oldNew=newGame;newGame=function(...args){reset();const r=oldNew(...args);if(!NET.inRoom)syncLocal();return r};
 const oldTasks=renderTasks;renderTasks=function(){const r=oldTasks();if(worker(G.player)){const steps=G.tasks.filter(t=>t.owner===G.player.id).flatMap(t=>t.steps),ratio=steps.length?steps.filter(st=>st.done).length/steps.length:0;$('barFill').style.width=(infoOn()?ratio*100:0)+'%';$('pct').textContent=infoOn()?Math.round(ratio*100)+'%':'??'}return r};
 const oldReveal=showLocalRoleReveal;showLocalRoleReveal=function(...a){const r=oldReveal(...a);if(role(G.player)){$('role').className='neutral';$('roleTitle').textContent=t('neutral.reveal');$('roleMsg').textContent=t('role.desc.'+G.player.function);CAPTAIN.cleanReveal()}return r};
 const oldCheck=checkEnd;checkEnd=function(){if(finishing||waitingMeeting)return false;return oldCheck()};
 const oldMeeting=endMeeting;endMeeting=function(...a){if(NET.inRoom&&NET.isHost&&state.hasPendingFire)waitingMeeting=true;const r=oldMeeting(...a);if(NET.inRoom&&NET.isHost&&waitingMeeting)netSyncHostAfterAuthorityChange();if(!NET.inRoom)syncLocal();return r};
 function begin(ch,task,step){return request(ch,'task_begin',{taskId:task.id,stepId:step.st})}
 function complete(ch,task,step){const ticket=tickets.get(ch.id);if(!ticket||String(ticket.taskId)!==String(task.id)||ticket.stepId!==step.st){begin(ch,task,step);return false}if(performance.now()<ticket.ready)return false;return request(ch,'task_finish',{taskId:task.id,stepId:step.st,nonce:ticket.nonce})}
 const oldTask=openTask;openTask=function(a,...args){if(worker(G.player)&&!G.player.alive&&!a.task.fix)return;const r=oldTask(a,...args);if(worker(G.player)&&!a.task.fix&&G.mini)begin(G.player,a.task,a.step);return r};
 const oldFinish=finishStep;finishStep=function(tok){if(!worker(G.player)||G.mini?.task.fix)return oldFinish(tok);const m=G.mini;if(!m||m.tok!==tok||m.finished)return;return TASK_CONFIRMATIONS.start(m,true)};
 const oldArrive=onArrive;onArrive=function(ch){const r=oldArrive(ch);if(worker(ch)&&ch.ai?.state==='work'&&ch.ai.goal?.type==='task')begin(ch,ch.ai.goal.t,ch.ai.goal.step);return r};
 const oldWork=finishWork;finishWork=function(ch){const goal=ch.ai?.goal;if(worker(ch)&&goal?.type==='task'){complete(ch,goal.t,goal.step);if(ch.ai.goal){ch.ai.state='work';ch.ai.work=.4}return}return oldWork(ch)};
 const oldGoal=chooseGoal;chooseGoal=function(ch){if(worker(ch)){if(ch.ai.witnessOf){const threat=charById(ch.ai.witnessOf);if(threat&&npcCanSeeChar(ch,threat))return botFleeRoute(ch,threat,'flee')}if(botTaskRoute(ch))return}return oldGoal(ch)};
 const oldSee=npcCanSeeChar;npcCanSeeChar=function(ch,target){if(role(ch)&&target?.spectralInvisible)return false;return oldSee(ch,target)};
 const oldBot=updateNPC;updateNPC=function(ch,dt){if(pyro(ch)&&can(ch)&&G.sab.comms<=0){const r=record(ch);if(r?.canIgnite){request(ch,'ignite');return}if(r&&!r.pending&&cooldown(r)<=0){const target=targets(ch).filter(c=>npcCanSeeChar(ch,c)).sort((a,b)=>dist(ch,a)-dist(ch,b))[0];if(target){request(ch,'douse',{targetId:target.id});return}if(ch.ai?.state==='idle'){const seen=G.chars.filter(c=>c!==ch&&c.alive&&!c.spectralInvisible&&!r.oil.includes(c.id)&&npcCanSeeChar(ch,c)).sort((a,b)=>dist(ch,a)-dist(ch,b))[0];if(seen){const x=seen.x,y=seen.y,range=actionDistancePx('object');if(goTo(ch,{type:'pyro'},(tx,ty)=>Math.hypot((tx+.5)*TILE-x,(ty+.5)*TILE-y)<range*.85))return}}}}return oldBot(ch,dt)};
 const douse=el('button','act2 paramedic'),ignite=el('button','act2 paramedic');douse.id='btnDouse';ignite.id='btnIgnite';douse.type=ignite.type='button';douse.hidden=ignite.hidden=true;$('btnLocator').before(douse,ignite);
 douse.addEventListener('click',()=>{const target=targets(G.player).sort((a,b)=>dist(G.player,a)-dist(G.player,b))[0];if(target&&can(G.player)&&G.sab.comms<=0)request(G.player,'douse',{targetId:target.id})});ignite.addEventListener('click',()=>{if(can(G.player)&&G.sab.comms<=0)request(G.player,'ignite')});
 const oldButtons=updateButtons;updateButtons=function(){const r=oldButtons(),p=G.player,visible=pyro(p)&&p.alive&&G.state==='playing';douse.hidden=ignite.hidden=!visible;if(!visible)return r;const own=record(p),signal=G.sab.comms>0,cd=cooldown(own),busy=uiBusy()||!can(p);setCls(douse,'cooldown-label',signal||cd>0);setCls(ignite,'cooldown-label',signal);
  douse.disabled=busy||signal||!own||own.pending||cd>0||!targets(p).length||(pending.get(p.id+'|douse')||0)>performance.now();ignite.disabled=busy||signal||!own?.canIgnite||!!own?.pending||(pending.get(p.id+'|ignite')||0)>performance.now();for(const [b,icon,key]of [[douse,'🛢','douse'],[ignite,'🔥','ignite']]){setCls(b,'ready',!b.disabled);setCls(b,'no-signal',signal);if(signal)setAbilityCaption(b,'📡',t('message.noSignalText'));else if(b===douse&&cd>0)b.textContent=String(Math.ceil(cd));else setAbilityCaption(b,icon,t('newNeutral.'+key))}return r};
 const oldKey=triggerFunctionKey;triggerFunctionKey=function(){if(pyro(G.player)){if(!douse.disabled&&!douse.hidden)douse.click();return}return oldKey()};
 const alerts=el('div','newWorkerAlerts');alerts.setAttribute('data-i18n-skip','');alerts.style.cssText='font-size:12px;line-height:1.3;max-height:84px;overflow:auto;color:#ffd36c;margin:6px 0';alerts.hidden=true;
 function alertUI(){const list=G.workerAlerts||[],meeting=G.state==='meeting'&&['discuss','vote','result'].includes(G.M?.phase),visible=G.player?.alive&&G.role==='imp'&&!G.over&&(meeting||['playing','task','tool'].includes(G.state));alerts.hidden=!visible||!list.length;if(alerts.hidden)return;const parent=meeting?$('meetDesc').parentElement:$('tasksPanel');if(alerts.parentElement!==parent)parent.append(alerts);const text=list.map(a=>t('newNeutral.workerAlert',{name:a.name})).join('\n');if(alerts.textContent!==text){alerts.textContent=text;alerts.style.whiteSpace='pre-line'}}
 const oldUpdate=update;update=function(dt){const r=oldUpdate(dt);if(!NET.inRoom){clock+=dt;if(clock>=.1){clock=0;syncLocal()}}alertUI();return r};
 function visualScale(ch){if(LOBBY.active())return 1;const real=charById(ch?.id);return CFG.childSmall===1&&(real?.role==='neutral'&&real.function==='child'||ch?.visualScale===.72||real?.visualScale===.72)? .72:1}
 const oldDraw=drawChar;drawChar=function(c,ch,showName=true,...args){const scale=visualScale(ch),v=netVisualState(ch),x=v?.x??ch.x,y=v?.y??ch.y;c.save();if(scale!==1){c.translate(x,y);c.scale(scale,scale);c.translate(-x,-y)}const r=oldDraw(c,ch,showName,...args);if(G.player?.alive&&pyro(G.player)&&ch.alive&&showName&&(state.own?.oil||[]).includes(ch.id)){c.save();c.font='20px sans-serif';c.textAlign='center';const stacked=!G.player?.alive||G.parasiteInfections?.[ch.id]||hunterOwnerForTarget(ch);c.fillText('🛢',ch.x,ch.y-(stacked?100:64));c.restore()}c.restore();return r};
 const oldBody=drawBody;drawBody=function(c,b){const scale=visualScale(b);c.save();if(scale!==1){c.translate(b.x,b.y);c.scale(scale,scale);c.translate(-b.x,-b.y)}const r=oldBody(c,b);c.restore();return r};
 const oldFX=drawRoleFx;drawRoleFx=function(c){oldFX(c);const now=performance.now();for(let i=fires.length-1;i>=0;i--){const f=fires[i],life=(f.until-now)/1000;if(life<=0){fires.splice(i,1);continue}c.save();c.translate(f.x,f.y);c.globalAlpha=Math.min(1,life*2);c.beginPath();for(let n=0;n<20;n++){const a=n/20*Math.PI*2,r=(n%2?23:48)*(1.4-life*.4);c.lineTo(Math.cos(a)*r,Math.sin(a)*r)}c.closePath();c.fillStyle='#ff9b32';c.strokeStyle='#542441';c.lineWidth=4;c.fill();c.stroke();c.fillStyle='#fff18b';c.beginPath();c.arc(0,0,19,0,Math.PI*2);c.fill();c.restore()}};
 const roleIcons={worker:'💼',pyromancer:'🔥',child:'🍭',shifter:'🧬'};
 const configRows=[['workerChance','%'],['workerMax',''],['pyromancerChance','%'],['pyromancerMax',''],['pyromancerCooldown','s'],['childChance','%'],['childMax',''],['childSmall',''],['shifterChance','%'],['shifterMax',''],['shifterCooldown','s']];
 for(const [key,unit]of configRows){if(!CFG_ROWS.some(r=>r[0]===key))CFG_ROWS.push([key,'newNeutral.'+key,'newNeutral.'+key+'Help',unit]);ROOM_CFG_LABELS[key]={label:'newNeutral.'+key,unit}}
 const oldBuild=buildCfgUI;buildCfgUI=function(){const r=oldBuild();if(!classic())return r;const group=$('cfgFunctionTabs').querySelector('.neutralGroup .functionButtons');if(!group)return r;
  for(const [id,icon]of Object.entries(roleIcons)){let b=$('btn'+id+'Section');if(!b){b=el('button','big alt');b.id='btn'+id+'Section';b.type='button';b.addEventListener('click',()=>{G.cfgFunctionTab=id;setCfgPage('functions');Snd.click()});group.append(b)}b.textContent=icon+' '+roleLabelByFunction(id);b.classList.toggle('alt',G.cfgFunctionTab!==id)}
  return r};
 function labels(){for(const [key]of configRows){ROOM_CFG_LABELS[key].label=t('newNeutral.'+key);const row=CFG_ROWS.find(row=>row[0]===key);if(row){row[1]=t('newNeutral.'+key);row[2]=t('newNeutral.'+key+'Help')}}}
 const oldLanguage=applyGameLanguage;applyGameLanguage=function(){const r=oldLanguage();labels();if(!$('roomViewSettings').hidden)renderRoomViewSettings();return r};labels();
 const oldFreeClass=setFreePlayClass;setFreePlayClass=function(ch,...a){if(role(ch))local=null;return oldFreeClass(ch,...a)};
 const oldRemove=removeFreePlayFunction;removeFreePlayFunction=function(ch){if(role(ch)){local=null;return setFreePlayClass(ch,'crew')}return oldRemove(ch)};
 const oldClass=setFreePlayFunction;setFreePlayFunction=function(ch,fn){if(!kinds.includes(fn)){if(role(ch))setFreePlayClass(ch,'crew');return oldClass(ch,fn);}if(!G.freePlay||!ch)return false;removeFreePlayFunction(ch);ch.role='neutral';ch.function=fn;if(ch.ai)ch.freeDummy=false;ch.guardian=ch.instructor=false;G.tasks=G.tasks.filter(t=>t.owner!==ch.id);if(fn==='worker')G.tasks.push(...createTasksFor(ch.id,taskTemplateSelection(TASK_POOLS.common,CFG.commonTasks)));local=null;if(ch===G.player){G.role='neutral';updateRolePanel(ch);renderTasks();updateButtons()}syncLocal();return true};
 const oldFreeInfo=freePlayRoleInfo;freePlayRoleInfo=function(ch){return role(ch)?t('role.desc.'+ch.function):oldFreeInfo(ch)};
 return{icon:fn=>roleIcons[fn]||'',request,record,cooldown,targets,complete,syncLocal,get state(){return state},role,worker,pyro};
})();
