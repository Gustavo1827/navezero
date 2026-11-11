/* Kryos integration: map identification and read-only Vitals. Mode rules remain delegated. */
'use strict';
const KRYOS=(()=>{
 const active=()=>ACTIVE_MAP_ID==='kryos';
 const info=el('p','phase');info.id='roomInfoMap';$('roomInfoMode').after(info);
 function labels(){
  $('publicMapLabel').textContent=t('kr.map');const current=$('publicMapIn').value||'all';$('publicMapIn').replaceChildren();for(const [id,name]of [['all',t('kr.all')],...Object.values(MAP_LIBRARY).map(m=>[m.id,translateRuntimeText(m.name)])]){const o=document.createElement('option');o.value=id;o.textContent=name;$('publicMapIn').append(o)}$('publicMapIn').value=current;
  $('createMapLabel').textContent=t('kr.map');const select=$('createMapIn');select.replaceChildren();for(const map of Object.values(MAP_LIBRARY)){const o=document.createElement('option');o.value=map.id;o.textContent=translateRuntimeText(map.name);select.append(o)}select.value=SELECTED_MAP_ID;
 }
 const label=el('label'),title=el('span'),select=document.createElement('select');title.id='createMapLabel';select.id='createMapIn';label.append(title,select);$('createPanel').querySelector('.createFields').append(label);select.addEventListener('change',()=>selectGameMap(select.value));
 $('btnCreateRoom').addEventListener('click',()=>select.value=SELECTED_MAP_ID);
 const oldSelect=selectGameMap;selectGameMap=function(...a){const r=oldSelect(...a);select.value=SELECTED_MAP_ID;return r};
 const oldInfo=showRoomInfo;showRoomInfo=function(data){oldInfo(data);info.textContent=t('kr.mapInfo',{map:translateRuntimeText(MAP_LIBRARY[data?.mapId]?.name||'—')})};
 const oldView=renderRoomViewSettings;renderRoomViewSettings=function(){oldView();if(!['classic','mimica'].includes(NET.room?.mode)){const row=el('div','roomViewSettingRow');row.append(el('span','',t('kr.map')),el('b','',translateRuntimeText(MAP_LIBRARY[NET.room?.settings?.mapId]?.name||'—')));$('roomViewSettingsBody').prepend(row)}};
 const oldRoom=netRenderRoom;netRenderRoom=function(){oldRoom();let tag=$('roomKryosMap');if(!tag){tag=el('span');tag.id='roomKryosMap';$('roomLobby').querySelector('.roomMetaLine').append(tag)}tag.textContent='🗺️ '+translateRuntimeText(MAP_LIBRARY[NET.room?.settings?.mapId]?.name||'—')};
 const oldLanguage=applyGameLanguage;applyGameLanguage=function(){const r=oldLanguage();labels();return r};

 const oldStationLabel=stationDisplayLabel;stationDisplayLabel=function(st){return active()?translateRuntimeText(st?.label||''):oldStationLabel(st)};
 TOOLS.kr_vitals='Vitais';
 function roster(){
  if(!active())return[];const records=new Map((G.kryosRoster||[]).map(r=>[r.id,r]));
  for(const ch of G.chars){const r=records.get(ch.id)||{id:ch.id};Object.assign(r,{name:ch.name,color:ch.color,cosmetics:cloneCosmetics(ch.cosmetics),bot:!!ch.isBot||!!ch.ai&&!ch.isPlayer&&!ch.isRemoteHuman,state:ch.alive?'alive':'dead'});records.set(ch.id,r)}
  if(NET.inRoom)for(const r of records.values())if(!r.bot&&(!NET.room?.players.some(p=>p.id===r.id)||!G.chars.some(c=>c.id===r.id)))r.state='disconnected';
  G.kryosRoster=[...records.values()];return G.kryosRoster;
 }
 function vitals(){
  const grid=$('krVitalsGrid');if(!grid)return;if(G.sab.comms>0){grid.replaceChildren();closeModal();toast('📡 Sem sinal');return}
  const list=roster(),signature=JSON.stringify([USER_PREFS.language,list]);if(grid._signature===signature)return;grid._signature=signature;grid.replaceChildren();
  for(const r of list){const row=el('div','krVitalRow'),cv=document.createElement('canvas');cv.width=44;cv.height=48;drawLobbyAvatar(cv,{color:r.color,cosmetics:r.cosmetics});const badge=el('b','krVitalStatus '+r.state,t('kr.state.'+r.state));row.append(cv,el('span','',r.name),badge);grid.append(row)}
 }
 const oldAction=actionFor;actionFor=function(st){if(active()&&st?.id==='kr_vitals'){if(!G.player?.alive||HNS.locked(G.player))return null;return{type:'tool',tool:'kr_vitals',station:st,label:t(G.sab.comms>0?'message.noSignalText':'kr.vitals')}}return oldAction(st)};
 const oldInteract=doInteract;doInteract=function(a){if(active()&&a?.tool==='kr_vitals'){const p=G.player,st=stationById.kr_vitals;if(G.state==='playing'&&p?.alive&&!p.vent&&!p.controlledBy&&!p.killDash&&!p.morphTransition&&!p.minerDig&&!uiBusy()&&!HNS.locked(p)&&stationDist(st,p)<=stationUseRange(st))return openTool(a);return}return oldInteract(a)};
 const oldOpen=openTool;openTool=function(a){if(a?.tool!=='kr_vitals')return oldOpen(a);if(!active()||!G.player?.alive||G.sab.comms>0){toast('📡 Sem sinal');return}G.state='tool';G.player.moving=false;G.tool='kr_vitals';G.mini=null;++G.tok;showModal(t('kr.vitals'),t('kr.vitalsHelp'));const grid=el('div','krVitals');grid.id='krVitalsGrid';$('mbody').append(grid);vitals()};
 const oldTool=renderTool;renderTool=function(){if(G.tool==='kr_vitals')return vitals();const r=oldTool();if(active()&&G.tool==='adminmap')for(const span of $('adminList')?.children||[]){const text=span.textContent,n=text.lastIndexOf(':');if(n<0)continue;const name=text.slice(0,n),translated=translateRuntimeText(name==='Corredor'?'Campos de Kryos':name)+text.slice(n);if(text!==translated)span.textContent=translated}return r};
 const oldUpdate=update;update=function(dt){const r=oldUpdate(dt);if(G.tool==='kr_vitals'&&(!active()||!G.player?.alive||G.sab.comms>0)){const blocked=G.sab.comms>0;$('krVitalsGrid')?.replaceChildren();closeModal();if(blocked)toast('📡 Sem sinal')}return r};
 const oldNew=newGame;newGame=function(...a){G.kryosRoster=[];const r=oldNew(...a);if(active())roster();return r};
 const oldCapture=netCaptureSnapshot;netCaptureSnapshot=function(){const s=oldCapture();if(active())s.kryosRoster=roster().map(r=>({...r,cosmetics:cloneCosmetics(r.cosmetics)}));return s};
 const oldApply=netApplySnapshot;netApplySnapshot=function(s,...a){const valid=s&&(!Number.isFinite(+s.seq)||+s.seq>=NET.recvSeq),r=oldApply(s,...a);if(valid&&Array.isArray(s.kryosRoster))G.kryosRoster=s.kryosRoster.map(p=>({id:p.id,name:p.name,color:p.color,cosmetics:cloneCosmetics(p.cosmetics),bot:!!p.bot,state:p.state}));if(active()&&G.tool==='kr_vitals')vitals();return r};
 const oldMessage=netHandleMessage;netHandleMessage=function(m){const r=oldMessage(m);if(active()&&['player_left','room_state'].includes(m?.type)){roster();if(G.tool==='kr_vitals')vitals()}return r};
 // Two separate players must continuously hold the two reactor terminals.
 const reactorStations=['kr_reactor_a','kr_reactor_b'];
 const stage2Activate=activateMapData;activateMapData=function(...args){const r=stage2Activate(...args);FIX.reactor.st=active()?'kr_reactor_a':'reactor';return r};
 FIX.reactor.st=active()?'kr_reactor_a':'reactor';
 function holdValid(id,record){const ch=charById(id),st=stationById[record?.stationId];return active()&&G.sab.reactor>0&&!G.over&&!G.M&&['playing','task','tool'].includes(G.state)&&ch?.alive&&!ch.vent&&!ch.controlledBy&&reactorStations.includes(st?.id)&&stationDist(st,ch)<=stationUseRange(st)&&canAccessStation(ch,st)&&G.gt-(record.at||0)<1.3&&(!NET.inRoom||ch.isBot||NET.room?.players.some(p=>p.id===id))}
 function hold(ch,stationId,on){if(NET.inRoom&&!NET.isHost)return false;G.sab.krHolds=G.sab.krHolds||{};if(!on){delete G.sab.krHolds[ch?.id];return true}const record={stationId,at:G.gt};if(!holdValid(ch?.id,record))return false;G.sab.krHolds[ch.id]=record;return true}
 function paired(){const entries=Object.entries(G.sab.krHolds||{}).filter(([id,r])=>holdValid(id,r));return new Set(entries.map(([id])=>id)).size>=2&&new Set(entries.map(([,r])=>r.stationId)).size===2}
 let holdTimer=null,heldStation=null;
 function release(){if(holdTimer)clearInterval(holdTimer);holdTimer=null;const stationId=heldStation;heldStation=null;if(!stationId)return;if(NET.inRoom&&!NET.isHost)netSend({type:'action',action:'reactor_hold',stationId,holding:false});else hold(G.player,stationId,false)}
 function startHold(stationId){if(heldStation===stationId)return;release();heldStation=stationId;const send=()=>{if(G.tool!=='kr_reactor'||!G.player?.alive||!G.sab.reactor){release();return}if(NET.inRoom&&!NET.isHost)netSend({type:'action',action:'reactor_hold',stationId,holding:true});else hold(G.player,stationId,true)};send();if(heldStation)holdTimer=setInterval(send,400)}
 const stage2Action=actionFor;actionFor=function(st){if(active()&&reactorStations.includes(st?.id)){if(!G.player?.alive||G.player.vent||!(G.sab.reactor>0))return null;return{type:'tool',tool:'kr_reactor',station:st,label:t('stage2.reactorHold')}}return stage2Action(st)};
 const stage2Tool=openTool;openTool=function(a){if(a?.tool!=='kr_reactor')return stage2Tool(a);if(!active()||!canAccessStation(G.player,a.station)||stationDist(a.station,G.player)>stationUseRange(a.station)||!G.player.alive||G.player.vent||!G.sab.reactor)return;G.state='tool';G.player.moving=false;G.tool='kr_reactor';G.mini=null;++G.tok;showModal(t('stage2.reactor'),t('stage2.reactorHelp'));const b=el('button','mg',t('stage2.reactorHold'));b.type='button';b.style.cssText='min-height:110px;width:100%;touch-action:none';b.id='krHoldButton';const st=a.station.id;
 b.addEventListener('pointerdown',e=>{e.preventDefault();b.setPointerCapture(e.pointerId);startHold(st)});for(const event of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(event,release);
 b.addEventListener('keydown',e=>{if((e.code==='Space'||e.code==='Enter')&&!e.repeat){e.preventDefault();startHold(st)}});b.addEventListener('keyup',release);b.addEventListener('blur',release);$('mbody').append(b,el('p','phase',t('stage2.reactorWaiting')));$('mbody').lastChild.id='krHoldStatus';
 };
 const stage2Close=closeModal;closeModal=function(...args){release();return stage2Close(...args)};
 addEventListener('blur',release);document.addEventListener('visibilitychange',()=>{if(document.hidden)release()});
 const stage2Resolve=resolveSab;resolveSab=function(type){if(active()&&type==='reactor'&&!paired())return false;const r=stage2Resolve(type);if(type==='reactor'){G.sab.krHolds={};release()}return r};
 const stage2Start=startSabotage;startSabotage=function(type,...args){const r=stage2Start(type,...args);if(active()&&type==='reactor'&&r)G.sab.krHolds={};return r};
 const stage2Command=netHostCommand;netHostCommand=function(m){if((m.command||m.action)==='reactor_hold'){if(active())hold(charById(m.playerId),m.stationId,m.holding===true);return}return stage2Command(m)};
 const stage2Fixers=dispatchFixers;dispatchFixers=function(type){if(!active()||type!=='reactor')return stage2Fixers(type);const bots=G.chars.filter(c=>c.alive&&c.role==='crew'&&c.ai&&!c.isRemoteHuman&&!c.isPlayer);for(const [index,ch]of bots.slice(0,2).entries()){const st=stationById[reactorStations[index]],set=approachSet(st.id,st);ch.ai.fix='reactor';ch.ai.hunt=null;goTo(ch,{type:'fix',sab:'reactor',s:st},(x,y)=>set.has(y*COLS+x))}};
 // Existing fixer navigation is retained; only holding at its assigned terminal is new.
 const stage2Npc=updateNPC;updateNPC=function(ch,dt){if(active()&&G.sab.reactor>0&&ch.ai?.fix==='reactor'&&reactorStations.includes(ch.ai.goal?.s?.id)){const st=ch.ai.goal.s;if(ch.alive&&!ch.vent&&stationDist(st,ch)<=stationUseRange(st)&&canAccessStation(ch,st)){ch.moving=false;hold(ch,st.id,true);return}}return stage2Npc(ch,dt)};
 const stage2Update=update;update=function(dt){const r=stage2Update(dt);if(active()){
  if(!NET.inRoom||NET.isHost){for(const [id,record]of Object.entries(G.sab.krHolds||{}))if(!holdValid(id,record))delete G.sab.krHolds[id];if(paired())resolveSab('reactor')}
  if(G.tool==='kr_reactor'){if(!(G.sab.reactor>0)||!G.player?.alive){closeModal()}else{const status=$('krHoldStatus');if(status)status.textContent=t('stage2.reactorCount',{count:new Set(Object.values(G.sab.krHolds||{}).map(r=>r.stationId)).size})}}
 }return r};

 labels();return{active,roster,vitals};
})();
