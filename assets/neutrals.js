/* Classic neutral roles. Assignment never creates a neutral without a role. */
'use strict';
const NEUTRALS=(()=>{
 const classic=()=>!NET.inRoom||NET.room?.mode==='classic';
 const isJester=ch=>classic()&&ch?.role==='neutral'&&ch.function==='jester';
 const winners=()=>[...new Set((Array.isArray(G.neutralWinnerIds)&&G.neutralWinnerIds.length?G.neutralWinnerIds:[G.neutralWinnerId]).filter(id=>typeof id==='string'&&id))];
 const victoryTitle=()=>t(winners().length>1?'neutral.teamVictoryPlural':'neutral.teamVictory');
 const count=()=>NET.inRoom?NET.room.players.length+NET.room.bots:G.freePlay&&G.chars.length?G.chars.length:15;
 const limit=()=>Math.max(0,Math.floor(count()/3));
 let saved={};try{saved=JSON.parse(localStorage.getItem('nz_cfg')||'{}')}catch{}
 for(const [key,value,hi] of [['neutrals',0,5],['jesterMax',5,5],['jesterChance',100,100]]){CFG_DEF[key]=value;CFG_LIM[key]=[0,hi];CFG[key]=clamp(Number.isFinite(+saved[key])?Math.round(+saved[key]):value,0,hi);NET_SETTING_KEYS.push(key);ROOM_CFG_LABELS[key]={label:key,unit:key.endsWith('Chance')?'%':''}}
 // New neutral roles can register their own quantity and chance keys here.
 const roles=[{id:'jester',maxKey:'jesterMax',chanceKey:'jesterChance'}];
 CFG_ROWS.push(['jesterMax','Quantidade de Palhaços','Máximo de Palhaços sorteados, limitado pela quantidade geral de Neutros e pelos participantes.',''],['jesterChance','Chance de existir Palhaço','Chance de habilitar Palhaços no sorteio da partida. Se não forem sorteados, essas vagas continuam Tripulantes.','%']);
 PRESET_DEFS.push({id:'neutrals',theme:'neutrals',name:'Hora dos Neutros',desc:'Base de Todos ajudam com um terço dos participantes em funções Neutras disponíveis.',tag:'Objetivos próprios',art:'assets/presets/preset_hora_neutros.png?v=d497714380b06fc5'});
 const oldPreset=presetConfig;presetConfig=function(id){
  const cfg={...oldPreset(id==='neutrals'?'help':id)},quantity=id==='neutrals'?limit():0;cfg.neutrals=quantity;
  for(const role of roles){cfg[role.maxKey]=quantity;cfg[role.chanceKey]=id==='neutrals'?100:0}
  return cfg;
 };
 function ensureCapacity(config=CFG){
  const changed=[],n=Math.max(0,Number(config.neutrals)||0);
  const set=(key,value)=>{if(config[key]!==value){config[key]=value;changed.push(key)}};
  for(const role of roles)set(role.maxKey,Math.min(n,Math.max(0,Number(config[role.maxKey])||0)));
  let missing=n-roles.reduce((sum,role)=>sum+config[role.maxKey],0);
  const selected=roles.filter(role=>config[role.maxKey]>0);
  for(const role of (selected.length?selected:roles)){
   if(missing<=0)break;const extra=Math.min(missing,n-config[role.maxKey]);set(role.maxKey,config[role.maxKey]+extra);missing-=extra;
  }
  return changed;
 }
 ensureCapacity();

 function assign(){
  if(!classic()||G.freePlay)return;
  const n=Math.min(Math.floor(G.chars.length/3),CFG.neutrals),pool=shuffle(G.chars.filter(c=>c.role==='crew'));
  const available=shuffle(roles.filter(role=>Math.random()*100<CFG[role.chanceKey]&&CFG[role.maxKey]>0)),used={};
  for(const ch of pool.slice(0,n)){
   const role=available.filter(role=>(used[role.id]||0)<CFG[role.maxKey]).sort((a,b)=>(used[a.id]||0)-(used[b.id]||0))[0];
   if(!role)break;used[role.id]=(used[role.id]||0)+1;ch.role='neutral';ch.function=role.id;ch.instructor=ch.guardian=false;
  }
  G.role=G.player.role;
 }

 const oldLimit=cfgLimitFor;cfgLimitFor=function(key){
  if(key==='neutrals')return[0,limit()];
  const role=roles.find(role=>role.maxKey===key);if(role){const n=Math.min(limit(),CFG.neutrals),others=roles.filter(other=>other!==role).reduce((sum,other)=>sum+(Number(CFG[other.maxKey])||0),0);return[Math.max(0,n-others),n]}
  return oldLimit(key);
 };
 function row(box,key){
  const [min,max]=cfgLimitFor(key),r=el('div','cfgrow'),top=el('div','cfgtop'),label=el('label','',t('neutral.'+key)),out=el('b');const input=document.createElement('input');input.type='range';input.className='range';input.id='neutral_'+key;label.htmlFor=input.id;input.min=min;input.max=max;input.step=1;CFG[key]=clamp(CFG[key],min,max);input.value=CFG[key];out.textContent=CFG[key]+(key==='jesterChance'?'%':'');input.disabled=cfgEditingLocked();input.addEventListener('input',()=>{if(input.disabled)return;CFG[key]=clamp(+input.value,min,max);if(key==='neutrals')for(const changedKey of ensureCapacity())netNoteRoomSetting(changedKey,CFG[changedKey]);out.textContent=CFG[key]+(key==='jesterChance'?'%':'');netNoteRoomSetting(key,CFG[key]);saveCfg()});top.append(label,out);r.append(top,input,el('small','',t('neutral.'+key+'Help')));box.append(r);
 }
 const oldBuild=buildCfgUI;buildCfgUI=function(){
  if(!classic())return oldBuild();const neutral=G.cfgPage==='functions'&&G.cfgFunctionTab==='jester';
  oldBuild();if(G.cfgPage==='settings')row($('cfgRows'),'neutrals');if(neutral)$('cfgRows').append(el('small','cfgnote',t('neutral.capacityHelp',{count:Math.min(CFG.neutrals,limit())})));
  const root=$('cfgFunctionTabs');let group=root.querySelector('.neutralGroup');if(!group){group=el('section','functionGroup neutralGroup');group.append(el('h3'),el('div','functionButtons'));const b=el('button','big alt');b.id='btnJesterSection';b.type='button';b.addEventListener('click',()=>{G.cfgFunctionTab='jester';setCfgPage('functions');Snd.click()});group.lastChild.append(b);root.append(group)}group.firstChild.textContent=t('neutral.category');$('btnJesterSection').textContent='🤡 '+roleLabelByFunction('jester');$('btnJesterSection').classList.toggle('alt',!neutral);
  for(const key of ['neutrals','jesterMax','jesterChance'])ROOM_CFG_LABELS[key].label=t('neutral.'+key);
 };
 const oldLanguage=applyGameLanguage;applyGameLanguage=function(){const result=oldLanguage();for(const key of ['neutrals','jesterMax','jesterChance'])ROOM_CFG_LABELS[key].label=I18N['pt-BR']?.['neutral.'+key]||key;return result};
 const oldPanel=updateRolePanel;updateRolePanel=function(p){
  const host=$('roleName');if(p?.role!=='neutral'&&host._neutral){delete host._rolePanelKey;delete host._neutral}if(p?.role!=='neutral')return oldPanel(p);
  const key=USER_PREFS.language+'|neutral|'+p.function;if(host._rolePanelKey!==key){host._neutral=true;host._rolePanelKey=key;host.replaceChildren(el('span','roleTeam neutralText',t('role.teamNeutral')),el('span','roleSep',' • '),el('span','roleFunction',roleLabelByFunction(p.function)));$('rolePanel').setAttribute('aria-label',t('role.teamNeutral')+' · '+roleLabelByFunction(p.function))}
 };
 const oldReveal=showLocalRoleReveal;showLocalRoleReveal=function(...args){const result=oldReveal(...args);if(isJester(G.player)){$('role').className='neutral';$('roleTitle').textContent=t('neutral.reveal');$('roleMsg').textContent=t('role.desc.jester')}return result};
 const oldAction=actionFor;actionFor=function(st){const action=oldAction(st);return isJester(G.player)&&action?.type==='task'?null:action};
 const oldTask=openTask;openTask=function(task,...args){if(isJester(G.player))return;return oldTask(task,...args)};
 const oldRenderTasks=renderTasks;renderTasks=function(){
  const panel=$('tasksPanel');
  if(isJester(G.player)){
   if(!panel._jesterTaskLock)panel._beforeJesterFold=panel.classList.contains('fold');
   panel._jesterTaskLock=true;panel.classList.add('fold');
  }else if(panel._jesterTaskLock){panel.classList.toggle('fold',panel._beforeJesterFold);delete panel._jesterTaskLock;delete panel._beforeJesterFold}
  return oldRenderTasks();
 };
 const oldResult=showResult;showResult=function(){oldResult();const M=G.M,ch=M.result?.eject;if(isJester(ch)&&ch.alive&&!M.judge){G.neutralWinnerId=ch.id;G.neutralWinnerIds=[ch.id];M.result.headline=[t('neutral.ejected',{name:ch.name}),t('neutral.jesterWin'),t('meeting.impsRemaining',{count:G.chars.filter(c=>c.alive&&c.role==='imp').length})].join('\n')}};
 const oldEndMeeting=endMeeting;endMeeting=function(){const ch=G.M?.result?.eject;if(isJester(ch)&&ch.alive&&G.neutralWinnerId===ch.id&&!G.M.judge){killChar(ch);$('meet').hidden=true;$('meetingIntro').hidden=true;G.M=null;endGame('neutral',t('neutral.jesterWin'));return}return oldEndMeeting()};
 const oldFreeClass=setFreePlayClass;setFreePlayClass=function(ch,role){if(role!=='neutral'){const was=isJester(ch);const result=oldFreeClass(ch,role);if(result&&was&&!G.tasks.some(t=>t.owner===ch.id)){const common=taskTemplateSelection(TASK_POOLS.common,CFG.commonTasks);const tasks=createTasksFor(ch.id,common);if(role==='imp')tasks.forEach(t=>t.fake=true);G.tasks.push(...tasks);renderTasks()}return result}if(!G.freePlay||!ch)return false;oldRemove(ch);clearFreePlayFunctionState(ch);if(ch.vent){ch.ventAnim=null;exitVent(ch)}ch.role='neutral';ch.function='jester';ch.instructor=ch.guardian=false;G.tasks=G.tasks.filter(t=>t.owner!==ch.id);G.imps=G.chars.filter(c=>c.role==='imp');G.imp=G.imps[0]||null;if(ch===G.player){G.role='neutral';G.vision=G.visionTarget=CFG.crewVision;updateRolePanel(ch);renderTasks();updateButtons()}return true};
 const oldFreeFn=setFreePlayFunction;setFreePlayFunction=function(ch,fn){if(fn==='jester')return setFreePlayClass(ch,'neutral');if(isJester(ch))setFreePlayClass(ch,'crew');return oldFreeFn(ch,fn)};
 const oldRemove=removeFreePlayFunction;removeFreePlayFunction=function(ch){if(isJester(ch))return setFreePlayClass(ch,'crew');return oldRemove(ch)};
 const oldInfo=freePlayRoleInfo;freePlayRoleInfo=function(ch){return isJester(ch)?t('role.desc.jester').replace(/^.*?\s[—-]\s/u,''):oldInfo(ch)};
 const oldBot=updateNPC;updateNPC=function(ch,dt){if(!isJester(ch))return oldBot(ch,dt);if(!ch.alive||!ch.ai)return;const ai=ch.ai;if(ch.vent){ventUpdate(ch,dt);return}if(ai.state==='walk'){if(ai.pathVer!==G.walkVer&&!repath(ch)){ai.path=[];ai.state='idle';ai.wait=1;return}if(followPath(ch,dt)){ai.navVisits=ai.navVisits||{};if(ai.navRoom)ai.navVisits[ai.navRoom]=G.gt;ai.state='idle';ai.wait=1.5}}else{ai.wait=(ai.wait||0)-dt;if(ai.wait<=0){const v=nearestVentFor(ch),witnesses=v&&ventWitnesses(v,ch);if(v&&witnesses?.length&&Math.random()<.35&&enterVent(ch,v)){ai.ventHops=1;ai.ventT=1;return}wander(ch);ai.wait=2}}};
 const oldChoose=npcChoose;npcChoose=function(ch){return isJester(ch)&&ch.alive?ch.id:oldChoose(ch)};
 const oldStatement=npcStatement;npcStatement=function(ch,...args){return isJester(ch)?{from:ch,text:t('npc.jesterGoal'),claim:null}:oldStatement(ch,...args)};
 const oldReason=reasonText;reasonText=function(ch,id,rs,...args){return classic()&&rs.type==='vent'?t('npc.ventWitness',{name:charById(id)?.name||'—'}):oldReason(ch,id,rs,...args)};
 const oldHear=hear;hear=function(ch,claim){const reply=oldHear(ch,claim);if(!reply||!classic())return reply;if(isJester(ch))reply.text=t('npc.jesterGoal');else if(claim.vent)reply.text=t('npc.ventUncertain');return reply};
 const oldDraw=drawChar;drawChar=function(c,ch,...args){if(isJester(ch)&&(ch.id===G.player?.id||!G.player?.alive))ch.nameCol='#b7bdd0';return oldDraw(c,ch,...args)};
 return{assign,isJester,limit,winners,victoryTitle,roles,ensureCapacity};
})();
