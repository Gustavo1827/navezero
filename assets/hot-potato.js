/* Hot Potato: independent match state; the host owns timers, transfers and eliminations. */
'use strict';
const HOT_POTATO=(()=>{
 const MODE='batata-quente',defs={hpType:[0,0,1],hpDuration:[90,60,120],hpPassCooldown:[5,5,15],hpExplosion:[20,10,30]};
 for(const [key,[value,min,max]]of Object.entries(defs)){CFG[key]=CFG_DEF[key]=value;CFG_LIM[key]=[min,max];NET_SETTING_KEYS.push(key);ROOM_CFG_LABELS[key]={label:key,unit:key==='hpType'?'':'s'}}
 const active=()=>!!G.hp&&!G.freePlay&&G.state!=='menu',mode=()=>HNS.mode()===MODE&&!G.freePlay,authority=()=>!NET.inRoom||NET.isHost,live=()=>['playing','task','tool'].includes(G.state)&&!G.over;
 const living=()=>G.chars.filter(c=>c.alive&&(!NET.inRoom||c.isBot||NET.room?.players.some(p=>p.id===c.id))),holder=()=>charById(G.hp?.holderId);
 let clock=performance.now(),received=clock,announced=0,heardPass=0,deathTimer=null,endVisualTimer=null;
 const passButton=el('button','act2');passButton.id='btnPotatoPass';passButton.hidden=true;passButton.type='button';$('actions').querySelector('.row2').append(passButton);
 const edge=el('div');edge.id='hpEdge';edge.hidden=true;document.body.append(edge);
 const status=el('div','chip');status.id='hpBombTime';status.hidden=true;status.setAttribute('data-i18n-skip','');$('tasksPanel').insertBefore(status,$('taskList'));
 Snd.hpPass=function(){if(!this.on||this.volume<=0)return;this.init();this.tone(360,.10,'triangle',.04,200);this.tone(720,.13,'sine',.028,180,.07)};
 function labelValue(key,v){return key==='hpType'?t(v?'hp.tasks':'hp.time'):key==='actionDistance'?translateRuntimeText(ACTION_DISTANCE_LABELS[v]):v+(key.endsWith('Vision')||key==='renderDist'?' px':key.startsWith('hp')?'s':'')}
 function entries(){return ['crewVision','speed','hpType',...(CFG.hpType?['commonTasks','mediumTasks','longTasks']:['hpDuration']),'hpPassCooldown','hpExplosion','actionDistance']}
 function settings(){CFG.hpPassCooldown=Math.min(CFG.hpPassCooldown,CFG.hpExplosion-1);G.cfgPage='settings';$('cfgTitle').textContent=t('hp.mode');$('cfgTabs').hidden=true;$('cfgFunctionFooter').hidden=true;$('cfgNote').hidden=false;$('cfgNote').textContent=t('hp.help');const box=$('cfgRows');box.replaceChildren();renderMapSelector(box,cfgEditingLocked());for(const key of entries()){
 const [min,max]=key==='hpPassCooldown'?[CFG_LIM[key][0],Math.min(CFG_LIM[key][1],CFG.hpExplosion-1)]:key==='hpExplosion'?[Math.max(CFG_LIM[key][0],CFG.hpPassCooldown+1),CFG_LIM[key][1]]:CFG_LIM[key],row=el('div','cfgrow'),top=el('div','cfgtop'),name=el('label','',t(key==='crewVision'?'hp.vision':key==='speed'?'hp.speed':key.startsWith('hp')?'hp.'+key:'settings.general.'+key+'.name')),out=el('b','',labelValue(key,CFG[key]));row.dataset.hpSetting=key;top.append(name,out);row.append(top);const locked=cfgEditingLocked(),change=v=>{if(locked)return;CFG[key]=clamp(Number(v),key==='hpExplosion'?Math.max(CFG_LIM[key][0],CFG.hpPassCooldown+1):min,key==='hpPassCooldown'?Math.min(CFG_LIM[key][1],CFG.hpExplosion-1):max);out.textContent=labelValue(key,CFG[key]);netNoteRoomSetting(key,CFG[key]);saveCfg();if(key==='hpPassCooldown'||key==='hpExplosion')for(const other of ['hpPassCooldown','hpExplosion']){const input=$('hp_'+other);if(input){input.min=other==='hpExplosion'?Math.max(CFG_LIM[other][0],CFG.hpPassCooldown+1):CFG_LIM[other][0];input.max=other==='hpPassCooldown'?Math.min(CFG_LIM[other][1],CFG.hpExplosion-1):CFG_LIM[other][1]}}};
 if(key==='hpType'||key==='actionDistance'){const choices=el('div','cfgChoice');for(let value=min;value<=max;value++){const b=el('button','',labelValue(key,value));b.type='button';b.disabled=locked;b.setAttribute('aria-pressed',String(CFG[key]===value));b.addEventListener('click',()=>{change(value);settings();Snd.click()});choices.append(b)}row.append(choices)}else{const input=document.createElement('input');input.type='range';input.className='range';input.id='hp_'+key;name.htmlFor=input.id;input.min=min;input.max=max;input.step=key==='crewVision'||key==='speed'?5:1;input.value=CFG[key];input.disabled=locked;input.addEventListener('input',()=>change(input.value));row.append(input)}row.append(el('small','',t(key.startsWith('hp')?'hp.'+key+'Help':key==='crewVision'?'hp.visionHelp':key==='speed'?'hp.speedHelp':'settings.general.'+key+'.desc')));box.append(row)}$('cfgReset').disabled=cfgEditingLocked()}
 function selectHolder(ch){const h=G.hp;h.holderId=ch?.id||null;h.lastPasserId=h.previous[ch?.id]||null;h.remaining=CFG.hpExplosion;h.passCd=Math.min(CFG.hpPassCooldown,CFG.hpExplosion-1);h.seq++;}
 function transfer(from,to,seq){if(!active()||!live()||!authority()||G.hp.endPending||!from?.alive||from.id!==G.hp.holderId||seq!==G.hp.seq||G.hp.passCd>0||!to?.alive||to===from||!living().includes(to)||dist(from,to)>actionDistancePx('object')||!losClear(from.x,from.y,to.x,to.y))return false;G.hp.previous[to.id]=from.id;selectHolder(to);G.hp.passSeq=(G.hp.passSeq||0)+1;return true}
 function nearest(ch){return living().filter(c=>c!==ch&&dist(ch,c)<=actionDistancePx('object')&&losClear(ch.x,ch.y,c.x,c.y)).sort((a,b)=>dist(ch,a)-dist(ch,b))[0]}
 function pass(){const p=G.player,to=p&&nearest(p);if(!active()||!p?.alive||p.id!==G.hp.holderId||G.hp.passCd>0||G.state!=='playing'||uiBusy()||!to)return;if(NET.inRoom&&!NET.isHost)netSend({type:'action',action:'hp_pass',targetId:to.id,hpSeq:G.hp.seq});else transfer(p,to,G.hp.seq)}
 passButton.addEventListener('pointerdown',e=>{e.preventDefault();pass()});
 function endCheck(){if(!active()||!authority()||G.over||G.hp.endPending)return !!G.over;const alive=living();if(!alive.length){G.hp.endCause='allDead';G.hp.winnerIds=[];endGame('imp',t('hp.allDead'));return true}if(alive.length===1&&alive[0].id===G.hp.holderId){G.hp.endCause='survivor';G.hp.winnerIds=[alive[0].id];endGame('crew',t('hp.lastSurvivor'));return true}if(CFG.hpType?progress()>=1:G.hp.matchRemaining<=0){G.hp.endCause=CFG.hpType?'tasks':'time';G.hp.winnerIds=alive.filter(c=>c.id!==G.hp.holderId).map(c=>c.id);endGame('crew',t(CFG.hpType?'hp.tasksWin':'hp.timeWin'));return true}return false}
 function explode(ch){
  if(!ch?.alive)return false;killChar(ch);
  const body=addBodyWithPet({id:ch.id,victimId:ch.id,name:ch.name,color:ch.color,cosmetics:cloneCosmetics(ch.cosmetics),x:ch.x,y:ch.y,room:roomName(ch.x,ch.y),tKill:G.gt,killerId:null,cause:'hot-potato'},ch);
  if(ch===G.player){closeModal();G.ghostMode='free';G.fx=1;showDeathIntro(null,ch);Snd.victimSting()}return body;
 }
 function tick(){const now=performance.now(),dt=Math.max(0,(now-clock)/1000);clock=now;if(!active()||!live()||!authority()||G.hp.endPending||endCheck())return;const h=G.hp;h.remaining-=dt;h.passCd=Math.max(0,h.passCd-dt);if(!CFG.hpType)h.matchRemaining-=dt;if(endCheck())return;const ch=holder();if(!ch?.alive||!living().includes(ch)){selectHolder(living().find(c=>c.id===h.previous[h.holderId])||pick(living()))}else if(h.remaining<=0){const previous=h.previous[ch.id];explode(ch);selectHolder(living().find(c=>c.id===previous)||pick(living()));renderTasks()}endCheck()}
 function hud(){
  const on=active(),p=G.player,h=G.hp,playing=on&&live(),own=playing&&p?.alive&&p.id===h.holderId;
  passButton.hidden=!own;edge.hidden=!own;status.hidden=!own;$('tasksPanel').classList.toggle('hpTime',!!(on&&!CFG.hpType));if(!on)return;
  if(playing&&h.seq!==announced)renderTasks();
  const elapsed=playing&&!authority()?(performance.now()-received)/1000:0;
  if(!status.hidden){const text=t('hp.bombTime',{seconds:Math.max(0,Math.ceil(h.remaining-elapsed))});if(status.textContent!==text)status.textContent=text}
  $('taskList').hidden=!CFG.hpType||!p?.alive;
  if(!CFG.hpType){const remaining=Math.max(0,h.matchRemaining-elapsed),title=$('tpHead').firstElementChild,time=Math.ceil(remaining)+'s';if(title.textContent!==t('hp.mode'))title.textContent=t('hp.mode');if($('pct').textContent!==time)$('pct').textContent=time;$('barFill').style.width=clamp(remaining/CFG.hpDuration*100,0,100)+'%'}
  const cd=Math.max(0,h.passCd-elapsed);passButton.classList.toggle('cooldown-label',cd>0);
  if(cd>0){const text=String(Math.ceil(cd));if(passButton.textContent!==text)passButton.textContent=text;passButton.setAttribute('aria-label',t('hp.pass')+' · '+text)}else setAbilityCaption(passButton,'🥔',t('hp.pass'));
  const keyTitle=t('hp.pass')+' · '+keyLabel(KEY_BINDINGS.function);if(passButton.title!==keyTitle)passButton.title=keyTitle;
  passButton.disabled=!own||cd>0||G.state!=='playing'||uiBusy()||!nearest(p);passButton.classList.toggle('ready',!passButton.disabled);
  const passSeq=h.passSeq||0;if(passSeq!==heardPass){if(playing&&passSeq>heardPass)Snd.hpPass();heardPass=passSeq}
  if(playing&&h.seq!==announced){announced=h.seq;if(h.seq===1)toast(t('hp.starts',{name:holder()?.name||'—'}),4500)}
 }
 function bot(ch,dt){if(!ch.alive||!ch.ai||!live())return;const ai=ch.ai,h=holder();ai.hpPlan=(ai.hpPlan||0)-dt;ai.hpTalk=(ai.hpTalk||0)-dt;if(ai.hpTalk<=0){ai.hpTalk=15+Math.random()*12;npcSay(ch,t(ch===h?'hp.npcHolder':'hp.npcFlee'))}
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
 const oldNew=newGame;newGame=function(...args){G.hp=null;announced=heardPass=0;restoreDeath();if(!mode())return oldNew(...args);const saved={...CFG};for(const key of Object.keys(CFG))if(key.endsWith('Chance')||key.endsWith('Max'))CFG[key]=0;try{oldNew(...args);for(const ch of G.chars){ch.role='crew';ch.function=null;ch.guardian=ch.instructor=false}G.imps=[];G.imp=null;G.role='crew';G.vision=G.visionTarget=CFG.crewVision;G.tasks=CFG.hpType?G.tasks:[];for(const task of G.tasks)task.fake=false;G.hp={holderId:null,lastPasserId:null,previous:{},remaining:0,passCd:0,matchRemaining:CFG.hpDuration,seq:0,passSeq:0};selectHolder(pick(living()));clock=received=performance.now();if(!args[0])showLocalRoleReveal(false);renderTasks()}finally{Object.assign(CFG,saved)}};
 const oldNormalize=normalizeCfgCaps;normalizeCfgCaps=function(cfg){const r=oldNormalize(cfg);if(Number.isFinite(cfg.hpExplosion)&&Number.isFinite(cfg.hpPassCooldown))cfg.hpPassCooldown=Math.min(cfg.hpPassCooldown,cfg.hpExplosion-1);return r};
 const oldProgress=progress;progress=function(){if(!active())return oldProgress();const ids=new Set(living().map(c=>c.id)),steps=G.tasks.filter(t=>ids.has(t.owner)&&!t.fake).flatMap(t=>t.steps);return steps.length?steps.filter(s=>s.done).length/steps.length:0};
 const oldCheck=checkEnd;checkEnd=function(){return active()?endCheck():oldCheck()};
 const oldUpdate=update;update=function(dt){tick();const result=oldUpdate(dt);hud();return result};
 const oldFunctionKey=triggerFunctionKey;triggerFunctionKey=function(){if(active())return pass();return oldFunctionKey()};
 const oldBot=updateNPC;updateNPC=function(ch,dt){return active()?bot(ch,dt):oldBot(ch,dt)};
 const oldGhostRole=maybeActivateGhostRole;maybeActivateGhostRole=function(ch){return active()?false:oldGhostRole(ch)};
 const oldCapture=netCaptureSnapshot;netCaptureSnapshot=function(){const s=oldCapture();s.hp=active()?JSON.parse(JSON.stringify(G.hp)):null;return s};
 const oldApply=netApplySnapshot;netApplySnapshot=function(s,force){const wasAlive=G.player?.alive;if(s&&(!Number.isFinite(+s.seq)||+s.seq>=NET.recvSeq)){G.hp=s.hp?JSON.parse(JSON.stringify(s.hp)):null;clock=received=performance.now()}const r=oldApply(s,force);if(active()&&wasAlive&&!G.player?.alive){closeModal();G.ghostMode='free';G.fx=1;showDeathIntro(null,G.player);Snd.victimSting()}hud();return r};
 const oldHost=netHostCommand;netHostCommand=function(m){if(active()){if(m.action==='hp_pass'||m.command==='hp_pass'){transfer(charById(m.playerId),charById(m.targetId),m.hpSeq);return}if(!['input','task_complete','decon_button'].includes(m.command||m.action))return;if((m.command||m.action)==='task_complete'&&(!CFG.hpType||!charById(m.playerId)?.alive))return}return oldHost(m)};
 const oldButtons=updateButtons;updateButtons=function(){oldButtons();if(active())for(const id of ['btnKill','btnSab','btnReport','btnEngineerVent','btnLocator','btnSheriff','btnDelayed','btnCleaner','btnParasite','btnMiner','btnMorph','btnSpectral','btnParamedic','btnSeer','btnHunter','btnInstructor','btnGuardian','btnControl'])$(id).hidden=true};
 const oldSab=startSabotage;startSabotage=function(...a){if(active())return false;return oldSab(...a)};
 const oldEmergencyPress=pressEmergency;pressEmergency=function(...a){if(active())return false;return oldEmergencyPress(...a)};
 const oldReport=playerReport;playerReport=function(...a){if(active())return false;return oldReport(...a)};
 const oldPlayerSab=playerSab;playerSab=function(...a){if(active())return false;return oldPlayerSab(...a)};
 const oldSabPanel=openSabPanel;openSabPanel=function(...a){if(active())return false;return oldSabPanel(...a)};
 const oldMeeting=callMeeting;callMeeting=function(...a){if(active())return false;return oldMeeting(...a)};
 const oldEmergency=drawEmergencyButton;drawEmergencyButton=function(...a){if(!active())return oldEmergency(...a)};
 const oldBest=bestAction;bestAction=function(){const a=oldBest();return active()&&a&&['emergency','vent'].includes(a.type)?null:a};
 const oldTask=openTask;openTask=function(...a){if(active()&&(!CFG.hpType||!G.player?.alive))return;return oldTask(...a)};
 const oldVent=enterVent;enterVent=function(...a){if(active())return false;return oldVent(...a)};
 const oldDraw=drawChar;drawChar=function(c,ch,...args){if(active()&&live()&&!args[1]?.portrait&&ch.id===G.hp.holderId&&ch.alive){ch.nameCol='#ff9b36';const v=netVisualState(ch)||ch;c.save();c.strokeStyle='#ff9b36';c.lineWidth=3;c.globalAlpha=.5+.5*Math.abs(Math.sin(G.t*7));c.beginPath();c.ellipse(v.x,v.y-3,25,35,0,0,Math.PI*2);c.stroke();c.restore()}return oldDraw(c,ch,...args)};
 const oldSettings=buildCfgUI;buildCfgUI=function(){return mode()?settings():oldSettings()};const oldPage=setCfgPage;setCfgPage=function(page){if(mode())return settings();return oldPage(page)};const oldOpen=openCfg;openCfg=function(){oldOpen();if(mode())settings()};
 const oldPlay=startPlay;startPlay=function(){const r=oldPlay();if(active()&&G.state==='playing')toast(t('hp.starts',{name:holder()?.name||'—'})+' '+t('hp.help'),4500);return r};
 const oldReveal=showLocalRoleReveal;showLocalRoleReveal=function(...a){const r=oldReveal(...a);if(active()){$('roleTitle').textContent=t('hp.revealHolder',{name:holder()?.name||'—'});$('roleMsg').textContent=t(CFG.hpType?'hp.revealTasks':'hp.revealTime');$('roleDetails').hidden=true}return r};
 const oldRoleDraw=drawRoleChar;drawRoleChar=function(dt){
  if(!active())return oldRoleDraw(dt);const ch=holder();if(!ch)return;
  rcv.setTransform(1,0,0,1,0,0);rcv.clearRect(0,0,320,240);rcv.setTransform(3.2,0,0,3.2,160,130);
  drawChar(rcv,{...ch,x:0,y:0,netVisualX:undefined,netVisualY:undefined,killDash:null,walk:G.t,moving:true},false,{portrait:true});
 };
 const deathTitle=$('deathIntro').querySelector('h2'),normalDeathTitle=deathTitle.textContent;
 function restoreDeath(){clearTimeout(endVisualTimer);endVisualTimer=null;deathKey=null;clearTimeout(deathTimer);deathTimer=null;if($('deathIntro').classList.contains('hpDeath')){$('deathIntro').hidden=true;$('deathIntro').classList.remove('hpDeath');deathTitle.textContent=translateRuntimeText(normalDeathTitle)}}
 const oldDeath=showDeathIntro;let deathKey=null;showDeathIntro=function(k,v){
  if(!active()||!G.bodies.some(b=>b.cause==='hot-potato'&&String(b.victimId??b.id)===String(v?.id))){restoreDeath();return oldDeath(k,v)}
  const body=G.bodies.find(b=>b.cause==='hot-potato'&&String(b.victimId??b.id)===String(v?.id)),key=String(v?.id)+':'+body.tKill;if(deathKey===key)return;deathKey=key;clearTimeout(deathTimer);const present=()=>{if(!active()||deathKey!==key)return;const wrap=$('deathIntro'),cv=$('deathCv'),c=cv.getContext('2d');wrap.classList.add('hpDeath');deathTitle.textContent=t('hp.deathTitle');$('deathDesc').textContent=t('hp.deathDesc');
  c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,cv.width,cv.height);c.save();c.translate(230,125);c.scale(1.55,1.55);
  drawBody(c,{x:-40,y:17,color:v.color,cosmetics:v.cosmetics,face:v.face});
  drawChar(c,{...v,x:48,y:-12,alive:false,ghost:true,moving:false,walk:0,netVisualX:undefined,netVisualY:undefined,killDash:null},false,{portrait:true,noPet:true});
  const pet=normalizeCosmetics(v.cosmetics).pet;if(pet!=='none')drawPetShape(c,pet,-80,36,String(v.id||v.name||'').length*.7,{sad:true,colorId:v.color});
  c.restore();wrap.hidden=false;deathTimer=setTimeout(()=>{wrap.hidden=true;deathTimer=null},2400)};deathTimer=setTimeout(present,Math.max(0,(body._deathStart-G.t)*1000));
 };
 const oldEnd=endGame;endGame=function(winner,msg){if(active()&&NET.inRoom&&!NET.applying){if(!authority()||G.hp.endPending)return;G.hp.endPending=true;netSend({type:'game_end',winner,reason:msg,snapshot:netCaptureSnapshot()});return}oldEnd(winner,msg);if(active()&&G.over){const delay=Math.max(0,...G.bodies.filter(b=>b.cause==='hot-potato').map(b=>(b._deathStart-G.t)*1000));if(delay>0){const round=G.hp;$('end').hidden=true;clearTimeout(endVisualTimer);endVisualTimer=setTimeout(()=>{if(G.hp===round&&G.over)$('end').hidden=false},delay)}$('endTitle').textContent=t(G.hp.winnerIds?.includes(G.player?.id)?'hp.victory':'hp.playerDefeat');$('endMsg').textContent=t('hp.'+(G.hp.endCause==='survivor'?'lastSurvivor':G.hp.endCause==='tasks'?'tasksWin':G.hp.endCause==='time'?'timeWin':'allDead'))}};
 const oldNoticeValue=roomCfgDisplayValue;roomCfgDisplayValue=function(key,value){return key==='hpType'?labelValue(key,value):oldNoticeValue(key,value)};
 function labels(){for(const key of Object.keys(defs))ROOM_CFG_LABELS[key].label=I18N['pt-BR']?.['hp.'+key]||key;let option=$('publicModeIn').querySelector('[value="'+MODE+'"]');if(!option){option=document.createElement('option');option.value=MODE;$('publicModeIn').append(option)}option.textContent=t('hp.mode')}
 const oldLanguage=applyGameLanguage;applyGameLanguage=function(){oldLanguage();labels();if(mode()&&G.cfgOpen)settings()};
 const classicHelp=$('hostRoomConfig').querySelector('p.phase').innerHTML;const oldRoom=netRenderRoom;netRenderRoom=function(){oldRoom();if(NET.room?.mode===MODE){$('roomModeText').textContent='🎮 '+t('hp.mode');const help=$('hostRoomConfig').querySelector('p.phase');help.textContent=t('hp.help');help.dataset.hp='1'}else{const help=$('hostRoomConfig').querySelector('p.phase');if(help.dataset.hp){if(NET.room?.mode==='classic'){help.innerHTML=classicHelp;localizeDom(help)}delete help.dataset.hp}}};
 const oldView=renderRoomViewSettings;renderRoomViewSettings=function(){if(NET.room?.mode!==MODE)return oldView();const before={...CFG};Object.assign(CFG,NET.room.settings);try{const box=$('roomViewSettingsBody');box.replaceChildren();for(const key of entries()){const row=el('div','roomViewSettingRow');row.append(el('span','',t(key==='crewVision'?'hp.vision':key==='speed'?'hp.speed':key.startsWith('hp')?'hp.'+key:'settings.general.'+key+'.name')),el('b','',labelValue(key,CFG[key])));box.append(row)}}finally{Object.assign(CFG,before)}};
 $('cfgReset').addEventListener('click',e=>{if(!mode())return;e.stopImmediatePropagation();if(cfgEditingLocked())return;for(const key of entries()){CFG[key]=CFG_DEF[key];netNoteRoomSetting(key,CFG[key])}settings()},true);
 const oldMenu=toMenu;toMenu=function(...a){const r=oldMenu(...a);G.hp=null;restoreDeath();edge.hidden=status.hidden=passButton.hidden=true;$('tasksPanel').classList.remove('hpTime');return r};
 const oldMessage=netHandleMessage;netHandleMessage=function(m){const r=oldMessage(m);if(G.state==='menu'&&!NET.inRoom){G.hp=null;restoreDeath();edge.hidden=status.hidden=passButton.hidden=true;$('tasksPanel').classList.remove('hpTime')}return r};
 labels();return{active,mode,defs,settings,transfer,tick,endCheck,living,bot};
})();
