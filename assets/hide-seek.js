/* Hide and Seek. Classic rules are delegated to their existing implementations. */
'use strict';
const HNS=(()=>{
 const MODE='esconde-esconde',defs={hnsKillerVision:[700,260,1200,5,'killerVision'],hnsCrewVision:[900,260,900,5,'crewVision'],hnsAlertDuration:[2,1,3,1,'alertDuration'],hnsAlertInterval:[6,3,10,1,'alertInterval'],hnsStartDuration:[90,60,120,1,'startDuration'],hnsFinalDuration:[60,60,120,1,'finalDuration'],hnsCrewSpeed:[180,120,300,5,'crewSpeed'],hnsKillerSpeed:[320,310,400,5,'killerSpeed'],hnsKillerFinalSpeed:[420,410,500,5,'killerFinalSpeed'],hnsVentUses:[3,1,5,1,'ventUses'],hnsVentDuration:[5,1,10,1,'ventDuration']};
 let selected='classic',clock=performance.now(),received=performance.now(),heardAlert=0,lastPhase='',runtime=null;
 for(const [key,[value,min,max]] of Object.entries(defs)){CFG[key]=CFG_DEF[key]=value;CFG_LIM[key]=[min,max];NET_SETTING_KEYS.push(key);ROOM_CFG_LABELS[key]={label:(I18N['pt-BR']?.['hns.'+defs[key][4]]||key),unit:key.endsWith('Vision')?'px':(/Duration|Interval/.test(key)?'s':'')}}
 for(const key of ['speed','impVision','crewVision'])CFG[key]=clamp(Math.round(CFG[key]/5)*5,...CFG_LIM[key]);
 Snd.hnsAlarm=function(){if(!this.on||this.volume<=0)return;this.init();for(let i=0;i<2;i++){this.tone(660,.14,'triangle',.045,-30,i*.32);this.tone(990,.14,'sine',.038,-90,i*.32+.16)}};
 const active=()=>!!G.hns&&!G.freePlay&&G.state!=='menu',authority=()=>!NET.inRoom||NET.isHost;
 const mode=()=>G.freePlay?'classic':NET.inRoom?NET.room?.mode:(!$('createPanel').hidden?selected:'classic');
 const killer=()=>charById(G.hns?.killerId),locked=ch=>active()&&ch?.id===G.hns.killerId&&G.hns.phase==='preparing';
 const live=()=>['playing','task','tool'].includes(G.state)&&!G.over;
 const status=el('div','',null);status.id='hnsStatus';status.hidden=true;status.setAttribute('role','status');status.setAttribute('data-i18n-skip','');status.append(el('span',''),el('b',''));document.body.append(status);
 const blind=el('div');blind.id='hnsBlind';blind.hidden=true;blind.setAttribute('data-i18n-skip','');blind.append(el('h2'),el('p'));document.body.append(blind);
 const vignette=el('div');vignette.id='hnsVignette';vignette.hidden=true;document.body.append(vignette);
 const crewCount=el('div','chip');crewCount.id='hnsCrewCount';crewCount.hidden=true;crewCount.setAttribute('role','status');crewCount.setAttribute('aria-live','polite');crewCount.setAttribute('data-i18n-skip','');
 const crewIcon=document.createElement('canvas');crewIcon.width=32;crewIcon.height=38;crewIcon.setAttribute('aria-hidden','true');drawLobbyAvatar(crewIcon,{color:'azul',cosmetics:DEFAULT_COSMETICS});crewCount.append(crewIcon,el('span'));$('topRight').append(crewCount);
 const participating=ch=>!NET.inRoom||ch?.isBot||NET.room?.players?.some(p=>p.id===ch?.id);
 const livingCrew=()=>G.chars.filter(c=>c.alive&&c.role==='crew'&&participating(c));
 function updateCrewCount(){
  crewCount.hidden=!(active()&&live()&&G.player?.alive&&G.player.role==='imp');
  if(crewCount.hidden)return;const text=t('role.teamCrew')+' × '+livingCrew().length;if(crewCount.lastChild.textContent!==text)crewCount.lastChild.textContent=text;
 }
 const modes=[['classic','public.classic'],[MODE,'hns.mode']];
 function labels(){
  for(const [key,def] of Object.entries(defs))ROOM_CFG_LABELS[key].label=I18N['pt-BR']?.['hns.'+def[4]]||key;
  const group=$('createModeButtons');for(const [id,key] of modes){let b=group.querySelector(`[data-mode="${id}"]`);if(!b){b=el('button','chip');b.type='button';b.dataset.mode=id;b.addEventListener('click',()=>{selected=id;labels();Snd.click()});group.append(b)}const label=t(key);if(b.textContent!==label)b.textContent=label;b.setAttribute('aria-pressed',String(selected===id))}
  group.setAttribute('aria-label',t('public.mode'));const opt=$('publicModeIn').options[1];if(opt)opt.textContent=t('hns.mode');
 }
 // A single local scheduler keeps music independent of rendering and remote snapshots.
 const music={timer:null,ctx:null,gain:null,nodes:new Set(),next:0,step:0,intensity:0,
  voice(frequency,time,duration,type,volume){const c=this.ctx,o=c.createOscillator(),gain=c.createGain();o.type=type;o.frequency.setValueAtTime(frequency,time);gain.gain.setValueAtTime(.0001,time);gain.gain.exponentialRampToValueAtTime(volume,time+.012);gain.gain.exponentialRampToValueAtTime(.0001,time+duration);o.connect(gain).connect(this.gain);this.nodes.add(o);o.onended=()=>{this.nodes.delete(o);o.disconnect();gain.disconnect()};o.start(time);o.stop(time+duration+.02)},
  schedule(){
   if(!active()||!live()||!G.player?.alive||!Snd.on||Snd.volume<=0){this.stop();return}
   if(!this.ctx||this.ctx.state!=='running')return;
   const c=this.ctx;this.next=Math.max(this.next,c.currentTime+.015);
   while(this.next<c.currentTime+.18){const n=this.step++%8,t=this.next,i=this.intensity;
    this.voice([110,110,146.83,130.81,98,98,123.47,146.83][n],t,.26,'triangle',.16);
    if(n%2===0)this.voice([440,523.25,493.88,587.33][n/2],t,.17,'sine',.045+i*.035);
    if(i>.35)this.voice(n%2?220:165,t,.055,'triangle',.045+i*.045);
    if(i>.7)this.voice(880+(n%3)*110,t+.075,.04,'sine',.035);
    this.next+=.34-i*.17;
   }
  },
  update(intensity){
   this.intensity=intensity;
   if(!G.player?.alive||!Snd.on||Snd.volume<=0){this.stop();return}
   if(!Snd.ctx){Snd.init();if(!Snd.ctx)return}
   if(this.ctx!==Snd.ctx){this.stop();this.ctx=Snd.ctx}
   if(!this.gain){this.gain=this.ctx.createGain();this.gain.gain.value=0;this.gain.connect(Snd.output());this.next=this.ctx.currentTime+.02;this.step=0}
   const level=Math.round((.30+intensity*.14)*1000)/1000;if(this.level!==level){this.gain.gain.setTargetAtTime(level,this.ctx.currentTime,.08);this.level=level}
   if(!this.timer){this.schedule();this.timer=setInterval(()=>this.schedule(),80)}
  },
  stop(){if(this.timer)clearInterval(this.timer);this.timer=null;for(const node of this.nodes){try{node.stop()}catch{}}this.nodes.clear();if(this.gain)this.gain.disconnect();this.gain=null;this.next=0;this.level=null}
 };
 const unlockMusic=e=>{if(active()||NET.room?.mode===MODE||e.target?.closest?.('#btnRoomInfoEnter,#btnJoinConfirm,#btnCreateConfirm,#btnStartRoom,#btnAgain'))Snd.init()};
 document.addEventListener('pointerdown',unlockMusic,{capture:true,passive:true});document.addEventListener('keydown',unlockMusic,{capture:true});
 function withRules(fn){if(!active()||runtime)return fn();runtime={kill:CFG.kill,impVision:CFG.impVision,crewVision:CFG.crewVision};Object.assign(CFG,{kill:1,impVision:CFG.hnsKillerVision,crewVision:CFG.hnsCrewVision});try{return fn()}finally{Object.assign(CFG,runtime);runtime=null}}
 function formatSetting(key,value){
  if(key.endsWith('Vision'))return String(value)+' px';
  if(key==='actionDistance')return translateRuntimeText(ACTION_DISTANCE_LABELS[clamp(Number(value),0,2)]);
  return String(value)+(/Duration|Interval/.test(key)?'s':key==='renderDist'?' px':'');
 }
 function settingEntries(){
  return [...Object.entries(defs).map(([key,[v,min,max,step,label]])=>[key,min,max,step,t('hns.'+label),t('settings.field.'+key+'.desc')]),...['renderDist','actionDistance','commonTasks','mediumTasks','longTasks'].map(key=>[key,...CFG_LIM[key],1,t('settings.general.'+key+'.name'),t('settings.general.'+key+'.desc')])];
 }
 function settings(){
  G.cfgPage='settings';$('cfgTitle').textContent=t('hns.mode');$('cfgTabs').hidden=true;$('cfgTabFunctions').hidden=$('cfgTabPresets').hidden=true;$('cfgFunctionFooter').hidden=true;$('cfgNote').hidden=false;$('cfgNote').textContent=t('hns.modeHelp');
  const box=$('cfgRows');box.replaceChildren();const disabled=cfgEditingLocked();
  const mapRow=el('div','cfgrow'),mapTop=el('div','cfgtop'),mapChoices=el('div','cfgChoice');
  mapTop.append(el('span','',t('freeplay.mapTitle')));
  for(const [id,map] of Object.entries(MAP_LIBRARY)){const button=el('button','',translateRuntimeText(map.name));button.type='button';button.disabled=disabled;button.setAttribute('aria-pressed',String(SELECTED_MAP_ID===id));button.addEventListener('click',()=>{if(disabled)return;selectGameMap(id)});mapChoices.append(button)}
  mapRow.append(mapTop,mapChoices);box.append(mapRow);
  for(const [key,min,max,step,label,desc] of settingEntries()){
   const row=el('div','cfgrow'),top=el('div','cfgtop'),name=el('label','',label),out=el('b','',formatSetting(key,CFG[key]));top.append(name,out);row.append(top);
   const change=value=>{if(disabled)return;CFG[key]=clamp(Math.round(Number(value)/step)*step,min,max);out.textContent=formatSetting(key,CFG[key]);netNoteRoomSetting(key,CFG[key]);saveCfg()};
   if(key==='actionDistance'){
    const choices=el('div','cfgChoice');for(let i=min;i<=max;i++){const button=el('button','',formatSetting(key,i));button.type='button';button.disabled=disabled;button.setAttribute('aria-pressed',String(CFG[key]===i));button.addEventListener('click',()=>{change(i);for(const [index,b] of [...choices.children].entries())b.setAttribute('aria-pressed',String(index===i));Snd.click()});choices.append(button)}row.append(choices);
   }else{const input=document.createElement('input');input.type='range';input.className='range';input.id='hns_'+key;name.htmlFor=input.id;input.min=min;input.max=max;input.step=step;input.value=CFG[key];input.disabled=disabled;input.addEventListener('input',()=>change(input.value));row.append(input)}
   row.append(el('small','',desc));box.append(row);
  }
  $('cfgReset').disabled=disabled;
 }
 function tasksAllowed(){return active()&&G.hns.phase!=='final'&&(G.hns.phase!=='start'||G.hns.remaining-(authority()?0:(performance.now()-received)/1000)>0)}
 function blockTasks(){
  if(!active()||tasksAllowed())return;
  G.pin=null;if(G.action?.type==='task')G.action=null;
  if(G.state==='task'&&G.mini&&!G.mini.task.fix)closeModal();
  for(const ch of G.chars)if(ch.ai?.goal?.type==='task'){ch.ai.goal=null;ch.ai.path=[];ch.ai.state='idle';ch.ai.hnsPlan=0}
 }
 function taskBar(){
  if(!active()||!G.player)return;
  const h=G.hns,remaining=Math.max(0,h.remaining-(authority()?0:(performance.now()-received)/1000));
  const phase=t('hns.'+(h.phase==='preparing'?'preparing':h.phase==='start'?'start':'final'));
  const title=$('tpHead').firstElementChild;if(title.textContent!==phase)title.textContent=phase;
  const time=Math.ceil(remaining)+'s';if($('pct').textContent!==time)$('pct').textContent=time;
  const duration=h.phase==='preparing'?10:h.phase==='start'?CFG.hnsStartDuration:CFG.hnsFinalDuration;
  $('barFill').style.width=clamp(remaining/duration*100,0,100)+'%';$('barFill').classList.toggle('hnsFinal',h.phase==='final');
  $('taskList').hidden=!tasksAllowed()||!G.player.alive||G.player.role!=='crew';$('tasksPanel').hidden=false;
 }

 function init(){const k=G.imps[0];G.hns={killerId:k.id,phase:'preparing',remaining:10,mainRemaining:CFG.hnsStartDuration,alertRemaining:0,nextAlert:0,alertSeq:0,counted:G.tasks.filter(t=>!t.fake&&t.done).map(t=>t.id)};clock=received=performance.now();heardAlert=0;lastPhase='';G.killCd=1;for(const c of G.chars){c.function=null;c.guardian=c.instructor=false;c.netKillCd=1;c.hnsVentsUsed=0;c.hnsVentTime=0;if(c.ai)c.ai.killCd=1}G.sab={lights:0,reactor:0,comms:0,doors:0,cd:0};}
 function alert(){const h=G.hns;h.alertSeq++;h.alertRemaining=CFG.hnsAlertDuration;h.nextAlert=CFG.hnsAlertDuration+CFG.hnsAlertInterval}
 function tick(){
  const now=performance.now(),elapsed=Math.max(0,(now-clock)/1000);clock=now;if(!active()||!live()||!authority())return;
  for(const ch of G.chars)if(ch.vent&&ch.alive&&ch.role==='crew'){ch.hnsVentTime=Math.max(0,(ch.hnsVentTime||0)-elapsed);if(ch.hnsVentTime<=0){ch.ventAnim=null;exitVent(ch)}}
  const h=G.hns;h.remaining-=elapsed;h.alertRemaining=Math.max(0,h.alertRemaining-elapsed);h.nextAlert-=elapsed;
  const done=G.tasks.filter(t=>!t.fake&&t.done),seen=new Set(h.counted||[]);for(const task of done)if(!seen.has(task.id)){if(h.phase==='start')h.remaining=Math.max(0,h.remaining-5);seen.add(task.id)}h.counted=[...seen];
  if(h.phase==='preparing'&&h.remaining<=0){h.phase='start';h.remaining=Math.max(0,h.mainRemaining+h.remaining);G.killCd=0;for(const c of G.imps)c.netKillCd=0}
  if(h.phase==='start'&&h.remaining<=0){h.phase='final';h.remaining=Math.max(0,CFG.hnsFinalDuration+h.remaining);alert()}
  else if(h.phase==='final'&&h.nextAlert<=0)alert();
  blockTasks();checkEnd();
 }
 function ui(){
  updateCrewCount();
  const on=active()&&live(),p=G.player,h=G.hns;status.hidden=true;blind.hidden=!(on&&p?.alive&&locked(p));vignette.hidden=!on;
  if(!on){$('game').style.transform='';vignette.style.opacity=0;music.stop();return}
  blockTasks();taskBar();
  const remaining=Math.max(0,h.remaining-(authority()?0:(performance.now()-received)/1000));
  if(!blind.hidden){const title=t('hns.killer'),message=t('hns.wait',{seconds:Math.ceil(remaining)});if(blind.firstChild.textContent!==title)blind.firstChild.textContent=title;if(blind.lastChild.textContent!==message)blind.lastChild.textContent=message;if(G.mapOpen)closeMap()}
  if(h.phase!==lastPhase){lastPhase=h.phase;if(h.phase==='preparing'&&p?.role==='crew')toast(t('hns.crewHelp'),4000);if(h.phase==='final'){toast(t('hns.final'),3500);Snd.tone(180,.45,'triangle',.05,200);Snd.tone(420,.4,'sine',.04,180,.2)}}
  if(h.alertSeq!==heardAlert){heardAlert=h.alertSeq;if(h.phase==='final'&&h.alertRemaining>0&&p?.alive)Snd.hnsAlarm();if(p?.role==='crew'&&p.alive){toast(t('hns.positions'),2500)}}
  const k=killer(),near=p?.role==='crew'&&p.alive&&k?.alive?Math.max(0,1-dist(p,k)/850):0,progress=h.phase==='preparing'?0:h.phase==='start'?.35*(1-h.remaining/CFG.hnsStartDuration):.5+.5*(1-h.remaining/CFG.hnsFinalDuration),intensity=clamp(progress+near*.5,0,1);
  vignette.style.opacity=p?.alive&&p.role==='crew'?Math.min(.28,intensity*.15+near*.13):0;
  const shake=near>.4?'translate('+(Math.round(Math.sin(G.t*37)*near*1.2*DPR)/DPR)+'px,'+(Math.round(Math.cos(G.t*31)*near*DPR)/DPR)+'px)':'';if($('game').style.transform!==shake)$('game').style.transform=shake;
  music.update(intensity);
 }
 function endCheck(){if(!active()||G.over||!authority())return !!G.over;const k=killer();if(!livingCrew().length){endGame('imp',t('hns.killerWin'));return true}if(!k||!k.alive||!participating(k)){endGame('crew',t('hns.killerLeft'));return true}if(G.hns.phase==='final'&&G.hns.remaining<=0){endGame('crew',t('hns.crewWin'));return true}return false}
 function hide(ch,v){if(!active()||!live()||!ch?.alive||ch.role!=='crew'||ch.vent||ch.ventAnim||(ch.ventCd||0)>0||(ch.hnsVentsUsed||0)>=CFG.hnsVentUses||!v||dist(ch,{x:v.px,y:v.py-OFF_Y})>actionDistancePx('vent'))return false;ch.hnsVentsUsed=(ch.hnsVentsUsed||0)+1;ch.hnsVentTime=CFG.hnsVentDuration;ch.vent=v.id;ch.x=v.px;ch.y=v.py-OFF_Y;ch.moving=false;ch.ventAnim={t:0,dur:.45,kind:'in'};ch.ventMv=0;if(ch.ai){ch.ai.path=[];ch.ai.state='idle';ch.ai.hnsHideAt=G.gt}if(ch===G.player){G.action=null;refreshVentPanel();Snd.tone(140,.2,'triangle',.035,-40)}return true}
 function restoreHideButton(){
  const b=$('btnEngineerVent');if(!b.classList.contains('hnsHide'))return;
  b.classList.remove('hnsHide','cooldown-label');b.innerHTML=b._classicContent||'';b.title=b._classicTitle||'';delete b._classicTitle;delete b._classicContent;delete b._l;delete b.dataset.abilityCaption;
 }
 function hideButton(){const p=G.player;if(!active()||!p)return;for(const id of ['btnSab','btnReport','btnLocator','btnSheriff','btnDelayed','btnCleaner','btnParasite','btnMiner','btnMorph','btnSpectral','btnParamedic','btnSeer','btnHunter','btnInstructor','btnGuardian','btnControl'])if($(id))$(id).hidden=true;
  $('tasksPanel').hidden=false;const b=$('btnEngineerVent');if(b._classicTitle===undefined)b._classicTitle=b.title;const title=t(p.vent?'hns.leave':'hns.hide');if(b.title!==title)b.title=title;b.hidden=!p.alive||p.role!=='crew';const v=nearestVentFor(p),cd=p.ventCd||0;b.disabled=G.state!=='playing'||uiBusy()||!!p.ventAnim||(!p.vent&&(cd>0||!v||(p.hnsVentsUsed||0)>=CFG.hnsVentUses));if(!b.classList.contains('hnsHide'))b._classicContent=b.innerHTML;b.classList.add('hnsHide');const cooling=!p.vent&&cd>0;b.classList.toggle('cooldown-label',cooling);let aria;
  if(cooling){aria=String(Math.ceil(cd));if(b.textContent!==aria)b.textContent=aria;delete b.dataset.abilityCaption}
  else{const caption=p.vent?t('hns.leave'):t('hns.hide');setAbilityCaption(b,'🕳',caption);let counter=b.querySelector('.hnsVentInfo');if(!counter){counter=el('small','hnsVentInfo');counter.setAttribute('aria-hidden','true');b.append(counter)}const info=p.vent?Math.ceil(p.hnsVentTime||0)+'s':Math.max(0,CFG.hnsVentUses-(p.hnsVentsUsed||0))+'/'+CFG.hnsVentUses;if(counter.textContent!==info)counter.textContent=info;aria='🕳 '+caption+' • '+info}
  if(b.getAttribute('aria-label')!==aria)b.setAttribute('aria-label',aria);b.classList.toggle('ready',!b.disabled);if(locked(p)){for(const id of ['btnKill','btnUse','btnMap'])$(id).disabled=true}if(!p.alive){$('btnUse').disabled=true;$('btnEngineerVent').hidden=true}
 }
 function monster(c,ch,x,y){
  c.save();c.translate(x,y);c.scale(ch.face||1,1);
  // The normal visor, silhouette, limbs and cosmetics are left intact.
  c.beginPath();c.rect(-13,-3,27,12);c.clip();c.fillStyle='#260f25';c.strokeStyle='#10122a';c.lineWidth=1.5;
  c.beginPath();c.moveTo(-12,-1);c.quadraticCurveTo(2,-5,13,-1);c.lineTo(12,7);c.quadraticCurveTo(0,10,-12,6);c.closePath();c.fill();c.stroke();
  c.fillStyle='#f8eedc';for(let i=0;i<5;i++){const px=-11+i*4.5;c.beginPath();c.moveTo(px,-1);c.lineTo(px+2,3);c.lineTo(px+4,-1);c.fill();c.beginPath();c.moveTo(px,7);c.lineTo(px+2,4.5);c.lineTo(px+4,7);c.fill()}
  c.strokeStyle='#b74665';c.lineWidth=1.6;c.beginPath();c.moveTo(-2,7);c.quadraticCurveTo(8,5,4,2);c.stroke();c.restore();
 }

 function route(ch,target,type='hns'){const tile=tileOf(target);return goTo(ch,{type},(x,y)=>Math.abs(x-tile.x)+Math.abs(y-tile.y)<=1)}
 function bot(ch,dt){
  const ai=ch.ai;if(!ai||!ch.alive)return;if(locked(ch)){ch.moving=false;return}ch.netKillCd=Math.max(0,(ch.netKillCd||0)-dt);ai.hnsPlan=(ai.hnsPlan||0)-dt;
  if(ch.vent){ch.moving=false;const k=killer(),safe=!k||dist(ch,k)>600;if(!ch.ventAnim&&G.gt-(ai.hnsHideAt||0)>4&&safe){exitVent(ch);ai.hnsPlan=0}return}
  if(ch.role==='imp'){
   const range=CFG.hnsKillerVision,targets=G.chars.filter(t=>t!==ch&&t.alive&&t.role==='crew'&&!t.vent&&(G.hns.alertRemaining>0||dist(ch,t)<range&&losClear(ch.x,ch.y,t.x,t.y))).sort((a,b)=>dist(ch,a)-dist(ch,b)),t=targets[0];
   const victim=targets.find(v=>dist(ch,v)<=actionDistancePx('kill')&&losClear(ch.x,ch.y,v.x,v.y));if(victim&&(ch.netKillCd||0)<=0){doKill(ch,victim);return}
   if(ai.hnsPlan<=0){ai.hnsPlan=.55;let routed=false;for(const candidate of targets)if(route(ch,candidate,'hnsHunt')){routed=true;break}if(!routed&&!ai.path?.length)wander(ch)}
  }else{
   const k=killer(),threat=k&&G.hns.phase!=='preparing'&&dist(ch,k)<750;
   if(threat){const vent=nearestVentFor(ch);if(vent&&(ch.ventCd||0)<=0&&hide(ch,vent))return;
    if(ai.hnsPlan<=0){ai.hnsPlan=.8;const options=ROOM_DEFS.map(r=>({x:(r.x+r.w/2)*TILE,y:(r.y+r.h/2)*TILE})).sort((a,b)=>(dist(b,k)-dist(b,ch)*.25)-(dist(a,k)-dist(a,ch)*.25));let ok=false;for(const dest of options.slice(0,5))if(route(ch,dest,'hnsFlee')){ok=true;break}if(!ok)wander(ch);}
   }else if(ai.state==='work'&&tasksAllowed()){ch.moving=false;ai.work-=dt;if(ai.work<=0)finishWork(ch);return}
   else if(ai.hnsPlan<=0){ai.hnsPlan=1.5;const tasks=G.hns.phase==='start'?pendingFor(ch).filter(t=>!t.fake):[];let chosen=false;for(const task of tasks.sort((a,b)=>dist(ch,stationPos(nextStep(a).st))-dist(ch,stationPos(nextStep(b).st)))){const step=nextStep(task),s=stationById[step.st],set=approachSet(s.id,s);if(goTo(ch,{type:'task',t:task,step,s},(x,y)=>set.has(y*COLS+x))){chosen=true;break}}if(!chosen&&!ai.path?.length)wander(ch)}
  }
  if(ai.state==='walk'){if(ai.pathVer!==G.walkVer&&!repath(ch)){ai.state='idle';ai.hnsPlan=0;return}if(followPath(ch,dt)){if(ai.goal?.type==='task'&&tasksAllowed())onArrive(ch);else{ai.state='idle';ai.hnsPlan=0}}}
 }
 // Only mode-specific execution takes these branches. Existing Classic functions stay intact.
 const oldNew=newGame;newGame=function(...args){G.hns=null;if(!NET.inRoom||NET.room?.mode!==MODE)return oldNew(...args);const saved={...CFG};for(const key of Object.keys(CFG))if(key.endsWith('Chance')||key.endsWith('Max'))CFG[key]=0;CFG.impostors=1;CFG.kill=1;try{const result=oldNew(...args);init();showLocalRoleReveal(false);if(args[0]){G.state='loading';$('role').hidden=true}return result}finally{Object.assign(CFG,saved)}};
 const oldSettings=netSettings;netSettings=function(){const settings=oldSettings();if(runtime)Object.assign(settings,runtime);return settings};
 const oldPayload=netRoomPayload;netRoomPayload=function(){return {...oldPayload(),mode:selected}};
 const oldLabels=syncPublicRoomLabels;syncPublicRoomLabels=function(){oldLabels();labels()};
 const oldLanguage=applyGameLanguage;applyGameLanguage=function(){oldLanguage();labels();if(G.cfgOpen&&mode()===MODE)settings()};
 const oldValue=roomViewSettingValue;roomViewSettingValue=function(key,value,unit){return key==='impVision'||key==='crewVision'?String(value)+' px':oldValue(key,value,unit)};
 const oldNoticeValue=roomCfgDisplayValue;roomCfgDisplayValue=function(key,value){return key==='speed'||key.endsWith('Speed')?String(value):key==='impVision'||key==='crewVision'||key.endsWith('Vision')?String(value)+' px':oldNoticeValue(key,value)};
 const oldRoom=netRenderRoom,classicHelp=$('hostRoomConfig').querySelector('p.phase').innerHTML,modeLine=el('span');modeLine.id='roomModeText';$('roomLobby').querySelector('.roomMetaLine').append(modeLine);netRenderRoom=function(){oldRoom();const h=NET.room?.mode===MODE;modeLine.textContent='🎮 '+t(h?'hns.mode':'public.classic');const help=$('hostRoomConfig').querySelector('p.phase');if(h){help.textContent=t('hns.modeHelp')+' '+t('hns.taskHelp');help.dataset.hns='1'}else if(help.dataset.hns){help.innerHTML=classicHelp;delete help.dataset.hns;localizeDom(help)}};
 const oldView=renderRoomViewSettings;renderRoomViewSettings=function(){if(NET.room?.mode!==MODE)return oldView();const box=$('roomViewSettingsBody'),cfg=NET.room.settings||CFG;box.replaceChildren();for(const [key,def] of Object.entries(defs)){const row=el('div','roomViewSettingRow');row.append(el('span','',t('hns.'+def[4])),el('b','',formatSetting(key,cfg[key])));box.append(row)}for(const key of ['renderDist','actionDistance','commonTasks','mediumTasks','longTasks']){const row=el('div','roomViewSettingRow');row.append(el('span','',t('settings.general.'+key+'.name')),el('b','',formatSetting(key,cfg[key])));box.append(row)}};
 const oldOpenCfg=openCfg;openCfg=function(){oldOpenCfg();if(mode()===MODE)$('cfgTabs').hidden=true};
 const oldCfg=setCfgPage;setCfgPage=function(page){if(mode()===MODE){settings();return}$('cfgTabs').hidden=false;$('cfgTabFunctions').hidden=$('cfgTabPresets').hidden=false;return oldCfg(page)};
 const oldBuild=buildCfgUI;buildCfgUI=function(){if(mode()===MODE)return settings();return oldBuild()};
 const oldSaveReset=$('cfgReset');oldSaveReset.addEventListener('click',e=>{if(mode()!==MODE)return;e.stopImmediatePropagation();if(cfgEditingLocked())return;for(const [key,[v]] of Object.entries(defs)){CFG[key]=v;netNoteRoomSetting(key,v)}for(const key of['renderDist','actionDistance','commonTasks','mediumTasks','longTasks']){CFG[key]=CFG_DEF[key];netNoteRoomSetting(key,CFG[key])}settings()},true);
 const oldReveal=showLocalRoleReveal;showLocalRoleReveal=function(reset){const ret=oldReveal(reset);if(active()){const k=killer()||G.imp;$('roleTitle').textContent=t('hns.reveal',{name:k?.name||'—'});$('roleMsg').textContent=t(G.player?.role==='imp'?'hns.killerHelp':'hns.crewHelp');$('roleDetails').hidden=true;$('role').classList.add('hnsReveal')}return ret};
 const oldRoleDraw=drawRoleChar;drawRoleChar=function(dt){if(!active())return oldRoleDraw(dt);const k=killer()||G.imp;if(!k)return;rcv.setTransform(1,0,0,1,0,0);rcv.clearRect(0,0,320,240);rcv.setTransform(3.2,0,0,3.2,160,130);drawChar(rcv,{...k,x:0,y:0,moving:false},false,{portrait:true})};
 const oldPlay=startPlay;startPlay=function(){const before=G.state;oldPlay();if(active()&&before==='role'&&G.state==='playing')toast(t(G.player?.role==='imp'?'hns.killerHelp':'hns.crewHelp'),4000)};
 const oldPanel=updateRolePanel;updateRolePanel=function(p){const host=$('roleName'),on=active()&&p?.role==='imp';if(!on&&host._hnsKillerLabel){delete host._rolePanelKey;delete host._hnsKillerLabel}oldPanel(p);if(on){host._hnsKillerLabel=true;const name=t('hns.killer');let team=host.querySelector('.roleTeam.imp');if(!team){team=el('span','roleTeam imp');host.replaceChildren(team)}if(team.textContent!==name)team.textContent=name;if($('rolePanel').getAttribute('aria-label')!==name)$('rolePanel').setAttribute('aria-label',name)}};
 const oldCapture=netCaptureSnapshot;netCaptureSnapshot=function(){const snap=oldCapture();if(active()){snap.hns=JSON.parse(JSON.stringify(G.hns));const chars=new Map(G.chars.map(c=>[c.id,c]));for(const record of snap.chars){const ch=chars.get(record.id);record.hnsVentsUsed=ch?.hnsVentsUsed||0;record.hnsVentTime=ch?.hnsVentTime||0}}return snap};
 const oldApply=netApplySnapshot;netApplySnapshot=function(s,force){if(s&&(!Number.isFinite(+s.seq)||+s.seq>=NET.recvSeq)){G.hns=s.hns?JSON.parse(JSON.stringify(s.hns)):null;clock=received=performance.now()}const result=oldApply(s,force);blockTasks();taskBar();updateCrewCount();return result};
 const oldMessage=netHandleMessage;netHandleMessage=function(m){const result=oldMessage(m);if(active()&&['room_state','player_left'].includes(m?.type))updateCrewCount();return result};
 const oldEnd=checkEnd;checkEnd=function(){return active()?endCheck():oldEnd()};
 const oldMove=moveChar;moveChar=function(ch,...args){if(locked(ch))return false;if(!active()||!ch?.alive)return oldMove(ch,...args);const [dx,dy]=args,steps=Math.max(1,Math.ceil(Math.max(Math.abs(dx),Math.abs(dy))/8));let moved=false;for(let i=0;i<steps;i++)moved=oldMove(ch,dx/steps,dy/steps)||moved;return moved};
 const oldSpeed=moveSpeedFor;moveSpeedFor=function(ch,base){if(active()&&ch?.alive)return ch.role==='imp'?(G.hns.phase==='final'?CFG.hnsKillerFinalSpeed:CFG.hnsKillerSpeed):CFG.hnsCrewSpeed;return oldSpeed(ch,base)};
 const oldUpdate=update;update=function(dt){tick();const result=withRules(()=>oldUpdate(dt));ui();return result};
 const oldNpc=updateNPC;updateNPC=function(ch,dt){return active()?bot(ch,dt):oldNpc(ch,dt)};
 const oldGhost=updateGhostNPC;updateGhostNPC=function(ch,dt){if(active()){ch.moving=false;return}return oldGhost(ch,dt)};
 const oldGhostRole=maybeActivateGhostRole;maybeActivateGhostRole=function(ch){if(active())return false;return oldGhostRole(ch)};
 const oldSay=npcSay;npcSay=function(...args){if(!active())return oldSay(...args)};
 const oldKill=doKill;doKill=function(k,v){if(!active())return oldKill(k,v);if(v?.vent||locked(k)||!live()||(k===G.player?G.killCd:(k?.netKillCd||0))>0)return false;const ok=withRules(()=>oldKill(k,v));if(ok){k.netKillCd=1;if(k===G.player)G.killCd=1;if(k.ai)k.ai.killCd=1;if(v===G.player)toast(t('hns.spectate'),3500);updateCrewCount()}return ok};
 const oldPlayerKill=playerKill;playerKill=function(){if(!active())return oldPlayerKill();const p=G.player;if(!p?.alive||p.role!=='imp'||locked(p)||G.killCd>0||G.state!=='playing'||uiBusy()||!G.killT)return;if(NET.inRoom&&!NET.isHost){netSend({type:'action',action:'kill',targetId:G.killT.id});G.killCd=1;return}return doKill(p,G.killT)};
 const oldPlayerSab=playerSab;playerSab=function(...args){if(!active())return oldPlayerSab(...args)};
 const oldSabPanel=openSabPanel;openSabPanel=function(...args){if(!active())return oldSabPanel(...args)};
 const oldReport=playerReport;playerReport=function(...args){if(!active())return oldReport(...args)};
 const oldSab=startSabotage;startSabotage=function(...args){if(active())return false;return oldSab(...args)};
 const oldMeeting=callMeeting;callMeeting=function(...args){if(active())return false;return oldMeeting(...args)};
 const oldDrawEmergency=drawEmergencyButton;drawEmergencyButton=function(...args){if(!active())return oldDrawEmergency(...args)};
 const oldEmergency=pressEmergency;pressEmergency=function(...args){if(active())return false;return oldEmergency(...args)};
 const oldPending=pendingAt;pendingAt=function(...args){if(active()&&!tasksAllowed())return null;return oldPending(...args)};
 const oldTasks=renderTasks;renderTasks=function(){if(!active())return oldTasks();if(tasksAllowed()&&G.player?.alive&&G.player.role==='crew')oldTasks();else if($('taskList').firstChild)$('taskList').replaceChildren();taskBar()};
 const oldTaskOpen=openTask;openTask=function(...args){if(active()&&!tasksAllowed())return;return oldTaskOpen(...args)};
 const oldFinish=finishStep;finishStep=function(...args){if(active()&&!tasksAllowed()){blockTasks();return}return oldFinish(...args)};
 const oldWork=finishWork;finishWork=function(ch){if(active()&&!tasksAllowed()){if(ch.ai){ch.ai.state='idle';ch.ai.goal=null}return}return oldWork(ch)};
 const oldAction=actionFor;actionFor=function(station){if(active()&&(!G.player?.alive||G.player.role==='imp'||locked(G.player)))return null;const a=oldAction(station);return active()&&a&&!['task','decon'].includes(a.type)?null:a};
 const oldBest=bestAction;bestAction=function(){const a=oldBest();if(active()&&a&&(['emergency','vent'].includes(a.type)||locked(G.player)))return null;return a};
 const oldInteract=doInteract;doInteract=function(a){if(active()&&(locked(G.player)||!G.player?.alive||!a||(a.type==='task'&&!tasksAllowed())||!['task','decon','vent'].includes(a.type)))return;return oldInteract(a)};
 const oldMap=openMap;openMap=function(){if(locked(G.player))return;return oldMap()};
 const oldEnter=enterVent;enterVent=function(ch,v){if(!active())return oldEnter(ch,v);if(NET.inRoom&&!NET.isHost&&ch===G.player&&!NET.applying){if(ch.role!=='crew'||!ch.alive)return false;netSend({type:'action',action:'vent_enter',ventId:v?.id});return true}return hide(ch,v)};
 const oldExit=exitVent;exitVent=function(ch){const result=oldExit(ch);if(active()&&result&&authority()){ch.ventCd=5;ch.hnsVentTime=0}return result};
 const oldVent=playerEngineerVent;playerEngineerVent=function(){if(!active())return oldVent();const p=G.player;if(!p?.alive||p.role!=='crew'||G.state!=='playing'||uiBusy()||p.ventAnim)return;if(p.vent)exitVent(p);else{const v=nearestVentFor(p);if(v)enterVent(p,v)}};
 const oldHost=netHostCommand;netHostCommand=function(m){if(active()){const ch=charById(m.playerId),cmd=m.command||m.action;if(!['input','kill','task_complete','vent_enter','vent_move','vent_exit','decon_button'].includes(cmd)||locked(ch)&&cmd!=='input')return;if(cmd==='kill'){if(live()&&ch?.alive&&ch.role==='imp'&&(ch.netKillCd||0)<=0)doKill(ch,charById(m.targetId));return}if(cmd==='vent_enter'){if(live())enterVent(ch,ventById[m.ventId]);return}if(cmd==='vent_move'&&(ch?.role!=='crew'||!ch.alive))return;if(cmd==='task_complete'&&(!tasksAllowed()||!ch?.alive||ch.role!=='crew'))return;return withRules(()=>oldHost(m))}return oldHost(m)};
 const oldButtons=updateButtons;updateButtons=function(){if(!active())restoreHideButton();oldButtons();hideButton()};
 const oldDraw=drawChar;drawChar=function(c,ch,...args){if(active()&&ch.id===G.hns.killerId)ch.nameCol='#ff6b7e';if(args[1]?.portrait)ch={...ch,netVisualX:undefined,netVisualY:undefined,killDash:null};oldDraw(c,ch,...args);if(active()&&ch.alive!==false&&(ch.id===G.hns.killerId||ch._hnsMonster)){const v=netVisualState(ch);monster(c,ch,v?.x??ch.x,v?.y??ch.y)}};
 const oldDeath=showDeathIntro;showDeathIntro=function(k,v){if(!active())return oldDeath(k,v);const wrap=$('deathIntro'),cv=$('deathCv'),c=cv.getContext('2d');$('deathDesc').textContent=t('hns.spectate');c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,cv.width,cv.height);c.save();c.translate(230,125);c.scale(1.55,1.55);drawChar(c,{...k,x:-48,y:-12,_hnsMonster:true},false,{portrait:true});drawBody(c,{x:48,y:17,color:v.color,cosmetics:v.cosmetics});c.restore();wrap.hidden=false;setTimeout(()=>wrap.hidden=true,2400)};
 const oldRender=render;render=function(){oldRender();if(active()&&live()&&G.hns.phase==='final'){ctx.save();ctx.setTransform(DPR,0,0,DPR,0,0);ctx.fillStyle='rgba(145,12,28,.075)';ctx.fillRect(0,0,innerWidth,innerHeight);ctx.restore()}if(!active()||!live()||G.player?.role!=='imp'||!G.player.alive||G.hns.phase!=='final'||G.hns.alertRemaining<=0)return;ctx.save();ctx.setTransform(DPR*ZOOM,0,0,DPR*ZOOM,-G.cam.x*DPR*ZOOM,-G.cam.y*DPR*ZOOM);for(const ch of G.chars)if(ch.alive&&ch.role==='crew'){const p=G.player,a=Math.atan2(ch.y-p.y,ch.x-p.x);ctx.save();ctx.translate(p.x+Math.cos(a)*75,p.y+Math.sin(a)*75);ctx.rotate(a);ctx.fillStyle='#ff5368';ctx.strokeStyle='#10122a';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(14,0);ctx.lineTo(-8,-10);ctx.lineTo(-2,0);ctx.lineTo(-8,10);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore()};ctx.restore()};
 function clear(){G.hns=null;restoreHideButton();ui();heardAlert=0;lastPhase='';$('tasksPanel').hidden=false;$('taskList').hidden=false;$('barFill').classList.remove('hnsFinal')}
 labels();return {active,mode,defs,init,tick,settings,hide,locked,bot,ui,clear,tasksAllowed,music};
})();
