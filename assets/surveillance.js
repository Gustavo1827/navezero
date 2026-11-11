/* Existing positions, map geometry and visibility feed one selected camera or server-owned passage logs. */
'use strict';
const SURVEILLANCE=(()=>{
 const R=NZSurveillanceRules,colors={north:'#6cafff',southwest:'#7cdda4',southeast:'#f3c56d'},local={state:R.create(),startedAt:null},history=new Map();
 let cameraIndex=0,cameraCanvas=null,cameraMask=null,version=-1,blocked=false,subscribed=false,offlineClock=0;
 const inNexus=()=>ACTIVE_MAP_ID==='nexus',logsOpen=()=>G.state==='tool'&&G.tool==='sensor_logs'&&!$('modal').hidden&&!!$('sensorLogList');
 TOOLS.nexus_logs='Terminal de sensores';
 const oldAction=actionFor;actionFor=function(st){if(inNexus()&&st?.id==='cams')return null;return oldAction(st)};
 function validStation(id){const p=G.player,st=stationById[id];return !G.hns&&p?.alive&&!p.ghost&&!p.vent&&!p.ventAnim&&!p.controlledBy&&!p.controlTargetId&&!p.killDash&&!p.morphTransition&&!p.minerDig&&!G.M&&!G.over&&['playing','tool'].includes(G.state)&&st&&stationDist(st,p)<=stationUseRange(st)&&canAccessStation(p,st)}
 function validTerminal(){return inNexus()&&validStation('nexus_logs')}
 function unsubscribe(){if(subscribed&&NET.inRoom)netSend({type:'sensor_unsubscribe'});subscribed=false}
 function cameraLabels(){const cm=CAMS[cameraIndex];if($('surveillanceCameraName'))$('surveillanceCameraName').textContent=t(cm?.labelKey||'surveillance.camera.center');if($('surveillanceCameraCount'))$('surveillanceCameraCount').textContent=(cameraIndex+1)+'/'+CAMS.length}
 function openCamera(){
  if(ACTIVE_MAP_ID!=='kryos'||!validStation('cams'))return;unsubscribe();G.state='tool';G.player.moving=false;G.tool='cams';G.mini=null;++G.tok;
  showModal(t('surveillance.cameras'),t('surveillance.cameraHelp'));const panel=el('div','surveillanceMonitor');panel.setAttribute('data-i18n-skip','');cameraCanvas=document.createElement('canvas');cameraCanvas.width=480;cameraCanvas.height=300;cameraMask=document.createElement('canvas');cameraMask.width=480;cameraMask.height=300;G.camCtx=[cameraCanvas.getContext('2d')];
  const controls=el('div','surveillanceControls'),prev=el('button','mg','◀'),next=el('button','mg','▶'),info=el('div','surveillanceCameraInfo');info.append(el('strong'),el('span'));info.firstChild.id='surveillanceCameraName';info.lastChild.id='surveillanceCameraCount';info.lastChild.setAttribute('aria-live','polite');prev.type=next.type='button';prev.id='surveillancePrev';next.id='surveillanceNext';prev.setAttribute('aria-label',t('surveillance.previous'));next.setAttribute('aria-label',t('surveillance.next'));
  prev.addEventListener('click',e=>{e.stopPropagation();selectCamera(-1)});next.addEventListener('click',e=>{e.stopPropagation();selectCamera(1)});controls.append(prev,info,next);panel.append(cameraCanvas,controls);$('mbody').append(panel);cameraIndex=Math.max(0,Math.min(cameraIndex,CAMS.length-1));cameraLabels();renderCamera();
 }
 function selectCamera(delta){if(!CAMS.length)return;cameraIndex=(cameraIndex+delta+CAMS.length)%CAMS.length;cameraLabels();renderCamera();Snd.click()}
 function renderCamera(){
  if(!cameraCanvas||!cameraMask||!CAMS.length)return;if(!validStation('cams')){closeModal();return}const c=cameraCanvas.getContext('2d'),cm=CAMS[cameraIndex],w=640,h=400,k=cameraCanvas.width/w,x=(cm.tx+.5)*TILE,y=(cm.ty+.5)*TILE,cx=x-w/2,cy=y-h/2;
  c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,cameraCanvas.width,cameraCanvas.height);
  if(noSignal()){c.fillStyle='#050b1a';c.fillRect(0,0,cameraCanvas.width,cameraCanvas.height);c.fillStyle='#a9c8ed';c.font='700 22px sans-serif';c.textAlign='center';c.fillText(t('message.noSignalText'),cameraCanvas.width/2,cameraCanvas.height/2);return}
  const viewer={x,y,alive:true,role:G.player.role},radius=360;c.setTransform(k,0,0,k,-cx*k,-cy*k);drawWorld(c,cx,cy,w,h,{names:false,markers:false,chars:false,cullViewer:viewer,viewer,range:radius,camera:true});
  // A private, reusable camera mask uses the game's wall visibility, never the movement/camera globals.
  const m=cameraMask.getContext('2d');m.setTransform(1,0,0,1,0,0);m.globalCompositeOperation='source-over';m.fillStyle='rgba(2,7,18,.92)';m.fillRect(0,0,cameraMask.width,cameraMask.height);m.save();m.beginPath();m.moveTo(w*k/2,h*k/2);
  for(let i=0;i<=160;i++){const a=i/160*Math.PI*2,dx=Math.cos(a),dy=Math.sin(a),d=visionRayDistance(x,y,dx,dy,radius);m.lineTo((x+dx*d-cx)*k,(y+dy*d-cy)*k)}m.closePath();m.clip();m.globalCompositeOperation='destination-out';const g=m.createRadialGradient(w*k/2,h*k/2,30,w*k/2,h*k/2,radius*k);g.addColorStop(0,'rgba(0,0,0,1)');g.addColorStop(.68,'rgba(0,0,0,.96)');g.addColorStop(1,'rgba(0,0,0,.3)');m.fillStyle=g;m.fillRect(0,0,cameraMask.width,cameraMask.height);m.restore();
  c.setTransform(1,0,0,1,0,0);c.drawImage(cameraMask,0,0);
 }
 function colorLabel(id){return id===R.MASKED?t('surveillance.neutralColor'):colorDisplayName(COLOR_BY[id]||COLOR_BY.cinza)}
 function makeRow(entry){const row=el('div','sensorLogRow'),symbol=el('span','sensorLogSymbol','◌'),cv=document.createElement('canvas'),text=el('p'),stamp=document.createElement('time');row.dataset.seq=entry.seq;row.style.setProperty('--sensor-color',colors[entry.sensorId]||'#a3b3cf');cv.width=40;cv.height=48;cv.setAttribute('aria-hidden','true');
  if(entry.color===R.MASKED){const c=cv.getContext('2d');c.fillStyle=COMMS_COLOR.main;c.strokeStyle='#10122a';c.lineWidth=3;rr(c,6,8,28,33,10);c.fill();c.stroke();c.fillStyle='#c9f0ed';rr(c,18,12,18,12,5);c.fill();c.stroke()}else drawLobbyAvatar(cv,{color:entry.color,cosmetics:DEFAULT_COSMETICS});
  text.append(document.createTextNode(t('surveillance.entry',{color:colorLabel(entry.color),sensor:t('surveillance.sensor.'+entry.sensorId)})));const seconds=Math.floor(Math.max(0,Number(entry.elapsedMs)||0)/1000);stamp.dateTime='PT'+seconds+'S';stamp.textContent=t('surveillance.elapsed',{seconds});text.append(stamp);row.append(symbol,cv,text);return row;
 }
 function renderLogs(force=false){
  if(!logsOpen())return;if(!validTerminal()){unsubscribe();closeModal();return}const list=$('sensorLogList'),signature=USER_PREFS.language+'|'+version+'|'+blocked;if(!force&&list._signature===signature)return;list._signature=signature;
  $('sensorLogStatus').textContent=blocked?t('surveillance.noSignal'):t('surveillance.historyHelp',{count:R.LIMIT});
  if(blocked||!history.size){list.replaceChildren(el('div','sensorLogEmpty',blocked?t('message.noSignalText'):t('surveillance.empty')));return}
  const oldHeight=list.scrollHeight,oldTop=list.scrollTop,reading=oldTop>12,rows=new Map([...list.querySelectorAll('.sensorLogRow')].map(n=>[Number(n.dataset.seq),n])),entries=[...history.values()].sort((a,b)=>b.seq-a.seq).slice(0,R.LIMIT),nodes=entries.map((e,i)=>{const n=!force&&rows.get(e.seq)||makeRow(e);n.classList.toggle('recent',i<3);return n});list.replaceChildren(...nodes);if(reading&&!force)list.scrollTop=oldTop+list.scrollHeight-oldHeight;
 }
 function openLogs(){
  if(!validTerminal())return;unsubscribe();G.state='tool';G.player.moving=false;G.tool='sensor_logs';G.mini=null;++G.tok;showModal(t('surveillance.terminal'),t('surveillance.terminalHelp'));const panel=el('div','sensorLogPanel');panel.setAttribute('data-i18n-skip','');const status=el('p','sensorLogStatus'),list=el('div','sensorLogList');status.id='sensorLogStatus';list.id='sensorLogList';list.setAttribute('role','log');list.setAttribute('aria-label',t('surveillance.terminal'));panel.append(status,list);$('mbody').append(panel);history.clear();version=-1;blocked=(G.sab.comms||0)>0;
  if(NET.inRoom){subscribed=netSend({type:'sensor_subscribe'})}else{for(const e of local.state.events)history.set(e.seq,e);version=local.state.seq}renderLogs(true);
 }
 const oldOpen=openTool;openTool=function(a){if(a?.tool==='cams'&&ACTIVE_MAP_ID==='kryos')return openCamera();if(a?.tool==='nexus_logs'||a?.tool==='sensor_logs'||a?.tool==='cams'&&inNexus())return openLogs();return oldOpen(a)};
 const oldRender=renderTool;renderTool=function(){if(G.tool==='cams'&&ACTIVE_MAP_ID==='kryos'){renderCamera();return}if(G.tool==='sensor_logs'){blocked=(G.sab.comms||0)>0;renderLogs();return}return oldRender()};
 const oldClose=closeModal;closeModal=function(...a){if(G.tool==='sensor_logs')unsubscribe();return oldClose(...a)};
 const oldSilent=closeModalSilent;closeModalSilent=function(...a){unsubscribe();return oldSilent(...a)};
 const oldNew=newGame;newGame=function(...a){unsubscribe();local.state=R.create();local.startedAt=null;history.clear();version=-1;cameraIndex=0;cameraCanvas=null;cameraMask=null;return oldNew(...a)};
 const oldMotion=netCaptureMotion;netCaptureMotion=function(){const m=oldMotion();if(inNexus())for(const record of m.chars){const ch=charById(record.id);record.alive=!!ch?.alive;record.ghost=!!ch?.ghost;record.sensorColor=commsAnonymized()?R.MASKED:morphLook(ch).color}return m};
 const oldMessage=netHandleMessage;netHandleMessage=function(m){
  if(['sensor_history','sensor_delta','sensor_unavailable'].includes(m.type)){if(m.code!==NET.room?.code||m.round!==NET.round||!logsOpen())return;if(m.type==='sensor_unavailable'){unsubscribe();closeModal();return}if(m.type==='sensor_history')history.clear();blocked=!!m.blocked;for(const e of m.events||[])history.set(e.seq,e);for(const id of [...history.keys()].sort((a,b)=>b-a).slice(R.LIMIT))history.delete(id);version=m.version;renderLogs();return}return oldMessage(m);
 };
 const oldUpdate=update;update=function(dt){const result=oldUpdate(dt);if(!NET.inRoom&&inNexus()){offlineClock+=dt;if(offlineClock>=.1){offlineClock=0;const fresh=R.sample(local.state,R.definitions(MAP_LIBRARY.nexus),G.chars.map(ch=>({...ch,sensorColor:commsAnonymized()?R.MASKED:morphLook(ch).color})),{playing:['playing','tool','task'].includes(G.state)&&!G.M&&!G.over,masked:commsAnonymized(),elapsedMs:local.startedAt===null?0:performance.now()-local.startedAt});if(logsOpen()&&(fresh.length||version!==local.state.seq)){history.clear();for(const e of local.state.events)history.set(e.seq,e);version=local.state.seq;renderLogs()}}}if(subscribed&&!logsOpen())unsubscribe();return result};
 const oldStart=startPlay;startPlay=function(...a){const result=oldStart(...a);if(!NET.inRoom&&inNexus()&&G.state==='playing'&&local.startedAt===null)local.startedAt=performance.now();return result};
 const oldBuild=buildStatic;buildStatic=function(){const result=oldBuild();if(ACTIVE_MAP_ID!=='kryos')return result;const c=STATIC.getContext('2d');c.save();
  for(const cm of CAMS){const x=(cm.tx+.5)*TILE,y=(cm.ty+.5)*TILE;c.fillStyle='#536b85';c.strokeStyle='#102039';c.lineWidth=3;rr(c,x-13,y-17,25,15,4);c.fill();c.stroke();c.fillStyle='#91e4ed';c.fillRect(x+5,y-13,7,7);c.strokeRect(x+5,y-13,7,7);c.beginPath();c.moveTo(x-2,y-2);c.lineTo(x-2,y+6);c.lineTo(x-11,y+6);c.stroke()}
  c.restore();return result;
 };
 const oldLanguage=applyGameLanguage;applyGameLanguage=function(){const result=oldLanguage();TOOLS.nexus_logs=t('surveillance.terminal');if(logsOpen()){setTxt($('mtitle'),t('surveillance.terminal'));renderLogs(true)}if(G.tool==='cams'&&ACTIVE_MAP_ID==='kryos')cameraLabels();return result};
 document.addEventListener('keydown',e=>{if(G.state==='tool'&&G.tool==='cams'&&ACTIVE_MAP_ID==='kryos'&&!$('modal').hidden&&['ArrowLeft','ArrowRight'].includes(e.code)){e.preventDefault();e.stopPropagation();if(!e.repeat)selectCamera(e.code==='ArrowLeft'?-1:1)}});
 if(ACTIVE_MAP_ID==='kryos')buildStatic();return{openCamera,openLogs,selectCamera,renderCamera,history:()=>[...history.values()],local:()=>local.state};
})();
