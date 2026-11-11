'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {createStaticSender}=require('./static-files');
const LobbyRules=require('./assets/lobby-rules');
const {moderate:moderateChat}=require('./assets/chat-moderation');
const { WebSocketServer, WebSocket } = require('./websocket');

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';
const HTML_FILE = path.join(__dirname, 'index.html');
const EXCLUSIVE_COSMETICS_FILE = path.join(__dirname, 'exclusive-cosmetics.json');
const LANGUAGES_FILE = path.join(__dirname, 'languages.json');
const rooms = new Map();
const clients = new Map();
const HANDOFF_LEASE_MS=6000;
const ROOM_REGIONS=new Set(['north-america','asia','europe']);
const ROOM_LANGUAGES=new Set(['pt-BR','pt-PT','es','en','ru','ja']);
const cleanRoomRegion=value=>ROOM_REGIONS.has(String(value||''))?String(value):'north-america';
const cleanRoomLanguage=value=>ROOM_LANGUAGES.has(String(value||''))?String(value):'pt-BR';
const COLORS = ['vermelho','azul','amarelo','verde','rosa','roxo','laranja','marrom','ciano','preto','branco','carmim','banana','caqui','coral','cinza','azul_claro','rosado','verde_forte','oliva','lavanda','mostarda','verde_claro'];
const LEGACY_COLORS={marinho:'azul_claro'};
const normalizeColor=value=>LEGACY_COLORS[String(value||'')]||String(value||'');
const COSMETIC_ALLOWED={
  hat:new Set(['none','antenna_lunar','cap_orbital','crown_scrap','sprout_solar','halo_signal','navigator_band','hat_traveler','hat_tide','hat_nightcap','hat_signal','hat_bow','hat_cosmic','hat_colorcap','hat_nyah','hat_orbit_badge','hat_eye_pod','hat_comet_mane','hat_void_topper','hat_dune_brim','hat_solar_peak','hat_nova_fold','hat_dust_spire','hat_polar_brim','hat_winter_comet','hat_signal_balloon','hat_micro_party','hat_ruby_knit','hat_supply_roll','hat_black_ranger','hat_rose_bucket','hat_bean_scout','hat_frost_basket']),
  pet:new Set(['none','drone_pingo','cube_bot','comet_pup','luna_bug','beacon_orb','pet_scout','pet_mini','pet_signal_orb','pet_pocket_eye']),
  outfit:new Set(['none','tech_vest','command_jacket','utility_belt','polar_wrap','explorer_harness','outfit_cadet','outfit_orbit_collar','outfit_signal_wrap']),
  visor:new Set(['none','hud_grid','prism_strip','data_monocle','star_sticker','scan_bar','visor_eclipse','visor_scope'])
};
const DEFAULT_COSMETICS={hat:'none',pet:'none',outfit:'none',visor:'none'};
const EXCLUSIVE_SLOTS=new Set(Object.keys(DEFAULT_COSMETICS));
function loadExclusiveCosmeticsConfig(){
  try{
    const raw=JSON.parse(fs.readFileSync(EXCLUSIVE_COSMETICS_FILE,'utf8'));
    const cosmetics=Array.isArray(raw?.cosmetics)?raw.cosmetics:[];
    const cleanCosmeticsList=[],ids=new Set();
    for(const item of cosmetics){
      const id=String(item?.id||'').trim(),name=String(item?.name||'').trim(),type=String(item?.type||'').trim(),slot=String(item?.slot||'').trim(),asset=String(item?.asset||'').trim();
      if(!/^[a-z0-9_]{3,80}$/.test(id)||!name||!EXCLUSIVE_SLOTS.has(slot)||ids.has(id))continue;
      ids.add(id);cleanCosmeticsList.push({id,name,type:type||slot,slot,asset,enabled:item?.enabled!==false,render:item?.render&&typeof item.render==='object'?item.render:{}});
    }
    return {version:Number(raw?.version)||1,cosmetics:cleanCosmeticsList};
  }catch(err){console.error('Falha ao carregar exclusive-cosmetics.json:',err.message);return {version:1,cosmetics:[]}}
}
const EXCLUSIVE_CONFIG=loadExclusiveCosmeticsConfig();
const EXCLUSIVE_COSMETIC_BY_ID=new Map(EXCLUSIVE_CONFIG.cosmetics.filter(x=>x.enabled).map(x=>[x.id,x]));
function loadExclusiveRedeemCodes(value){
  const text=String(value||'').trim();if(!text)return {ready:false,codes:new Map(),error:'NAVE_ZERO_REDEEM_CODES não configurada.'};
  try{
    const raw=JSON.parse(text),items=Array.isArray(raw)?raw:Object.entries(raw&&typeof raw==='object'?raw:{}).map(([code,cosmeticId])=>({code,cosmeticId})),codes=new Map();
    for(const item of items){const code=String(item?.code||'').trim(),cosmeticId=String(item?.cosmeticId||'').trim();if(!/^[A-Za-z0-9]{10}$/.test(code)||!EXCLUSIVE_COSMETIC_BY_ID.has(cosmeticId)||item?.enabled===false||codes.has(code))continue;codes.set(code,{code,cosmeticId})}
    if(!codes.size)return {ready:false,codes,error:'NAVE_ZERO_REDEEM_CODES não contém nenhum código válido.'};
    return {ready:true,codes,error:null};
  }catch(err){return {ready:false,codes:new Map(),error:`NAVE_ZERO_REDEEM_CODES inválida: ${err.message}`}}
}
for(const item of EXCLUSIVE_COSMETIC_BY_ID.values())COSMETIC_ALLOWED[item.slot]?.add(item.id);
function cleanCosmetics(input={}){const src=input&&typeof input==='object'?input:{};const out={};for(const key of Object.keys(DEFAULT_COSMETICS)){const id=String(src[key]||'none');out[key]=COSMETIC_ALLOWED[key].has(id)?id:'none'}return out}
function cleanExclusiveCosmeticIds(value){const src=Array.isArray(value)?value:[],out=[];for(const id0 of src){const id=String(id0||'');if(EXCLUSIVE_COSMETIC_BY_ID.has(id)&&!out.includes(id))out.push(id)}return out}
function cleanRedeemedExclusiveCodes(value){const src=Array.isArray(value)?value:[],out=[];for(const code0 of src){const code=String(code0||'');if(/^[A-Za-z0-9]{10}$/.test(code)&&!out.includes(code))out.push(code)}return out}
function cleanCosmeticsForClient(input,client){const out=cleanCosmetics(input),owned=new Set(client?.exclusiveCosmetics instanceof Set?[...client.exclusiveCosmetics]:cleanExclusiveCosmeticIds(client?.exclusiveCosmetics));for(const [slot,id] of Object.entries(out))if(EXCLUSIVE_COSMETIC_BY_ID.has(id)&&(!client?.accountId||!owned.has(id)))out[slot]='none';return out}
const LIMITS = {captainChance:[0,100],captainMax:[0,15],captainCooldown:[10,40],
  kill:[10,60], sab:[10,90], meet:[10,60], emergencyUses:[0,10], speed:[100,280], impVision:[260,1200], crewVision:[260,900],
  discussion:[5,90], voting:[5,90], impostors:[1,3], locMax:[0,15], locChance:[0,100], locCooldown:[15,60], locDuration:[40,90], sheriffCooldown:[50,120], sheriffChance:[0,100], sheriffMax:[0,15], obsChance:[0,100], obsMax:[0,15], instructorChance:[0,100], instructorMax:[0,15], instructorCooldown:[20,60],  instructorMaxDistance:[100,2000], guardianCooldown:[35,60], guardianDuration:[10,30], guardianChance:[0,100], guardianMax:[0,15], guardianImpostorVisible:[0,1], cleanerChance:[0,100], cleanerMax:[0,15], cleanerCooldown:[10,60],   parasiteChance:[0,100], parasiteMax:[0,3], minerCooldown:[5,30],minerChance:[0,100],minerMax:[0,3],minerHoles:[5,16],morphChance:[0,100],morphMax:[0,3],morphCooldown:[5,25],morphDuration:[5,31],spectralChance:[0,100], spectralMax:[0,15], spectralCooldown:[5,20], spectralDuration:[10,90],  paramedicChance:[0,100], paramedicMax:[0,15], paramedicCooldown:[5,25], paramedicTasksPerUse:[1,5], paramedicMaxUses:[1,3], seerChance:[0,100], seerMax:[0,15], seerCooldown:[10,45], seerDelay:[0,5],  noisyDuration:[5,15], noisyChance:[0,100], noisyMax:[0,15], noisyImpostorVisible:[0,1], judgeChance:[0,100], judgeMax:[0,15], judgeTaskPct:[0,100], lazyChance:[0,100], lazyMax:[0,15], lazySlowdown:[5,20], lazyTasks:[1,3], delayedEnabled:[0,1], delayedChance:[0,100], delayedMax:[0,3], delayedDuration:[5,40], engVentDuration:[10,61], engChance:[0,100], engMax:[0,15], engCooldown:[5,25], marionCooldown:[15,60], marionDuration:[5,30], marionChance:[0,100], marionMax:[0,3], hunterChance:[0,100], hunterMax:[0,3], hunterTargetCooldown:[5,25], ninjaChance:[0,100],ninjaMax:[0,3],ninjaCooldown:[10,40],ninjaDuration:[2,8],commsExpanded:[0,1], actionDistance:[0,2], commonTasks:[1,5], mediumTasks:[1,5], longTasks:[1,5], renderDist:[500,1500]
};
Object.assign(LIMITS,{allowMeetings:[0,1],childChance:[0,100],childMax:[0,5],shifterChance:[0,100],shifterMax:[0,5],shifterCooldown:[5,30]});
const ROOM_MODES=new Set(['classic','esconde-esconde','batata-quente','mimica']);
Object.assign(LIMITS,{hnsKillerVision:[260,1200],hnsCrewVision:[260,900],hnsAlertDuration:[1,3],hnsAlertInterval:[3,10],hnsStartDuration:[60,90],hnsFinalDuration:[30,60],hnsCrewSpeed:[120,300],hnsKillerSpeed:[310,400],hnsKillerFinalSpeed:[410,500],hnsVentUses:[1,5],hnsVentDuration:[1,10]});
const MAP_IDS=new Set(['nave','nexus','kryos']);
const DEFAULT_SETTINGS = {captainChance:0,captainMax:1,captainCooldown:20,mapId:'nave',kill:25,sab:30,meet:20,emergencyUses:1,speed:180,impVision:700,crewVision:520,discussion:25,voting:25,impostors:1,locMax:2,locChance:35,locCooldown:15,locDuration:40,sheriffCooldown:50,sheriffChance:35,sheriffMax:1,obsChance:0,obsMax:1,instructorChance:0,instructorMax:1,instructorCooldown:30,instructorMaxDistance:2000,guardianCooldown:35,guardianDuration:18,guardianChance:0,guardianMax:1,guardianImpostorVisible:1,cleanerChance:0,cleanerMax:1,cleanerCooldown:30,parasiteChance:0,parasiteMax:1,minerCooldown:10,minerChance:0,minerMax:1,minerHoles:5,morphChance:0,morphMax:1,morphCooldown:15,morphDuration:15,spectralChance:0,spectralMax:1,spectralCooldown:10,spectralDuration:25,paramedicChance:0,paramedicMax:1,paramedicCooldown:20,paramedicTasksPerUse:3,paramedicMaxUses:2,seerChance:0,seerMax:1,seerCooldown:25,seerDelay:2,noisyDuration:8,noisyChance:0,noisyMax:1,noisyImpostorVisible:1,judgeChance:0,judgeMax:1,judgeTaskPct:50,lazyChance:0,lazyMax:1,lazySlowdown:15,lazyTasks:2,delayedEnabled:0,delayedChance:35,delayedMax:1,delayedDuration:20,engVentDuration:30,engChance:25,engMax:1,engCooldown:15,marionCooldown:30,marionDuration:15,marionChance:25,marionMax:1,hunterChance:0,hunterMax:1,hunterTargetCooldown:10,ninjaChance:0,ninjaMax:1,ninjaCooldown:25,ninjaDuration:4,commsExpanded:0,actionDistance:1,commonTasks:2,mediumTasks:3,longTasks:2,renderDist:820};
Object.assign(DEFAULT_SETTINGS,{hnsKillerId:'',hnsKillerVision:700,hnsCrewVision:900,hnsAlertDuration:2,hnsAlertInterval:6,hnsStartDuration:90,hnsFinalDuration:60,hnsCrewSpeed:180,hnsKillerSpeed:320,hnsKillerFinalSpeed:420,hnsVentUses:3,hnsVentDuration:5});
Object.assign(DEFAULT_SETTINGS,{allowMeetings:1,childChance:0,childMax:1,shifterChance:0,shifterMax:1,shifterCooldown:15});
const BOT_NAMES_FALLBACK = Array.from({length:15},(_,i)=>`Tripulante ${i+1}`);
let BOT_NAMES_BY_LANGUAGE={};
try{const catalog=JSON.parse(fs.readFileSync(LANGUAGES_FILE,'utf8'));if(catalog?.botNames&&typeof catalog.botNames==='object')BOT_NAMES_BY_LANGUAGE=catalog.botNames}catch(err){console.error('Falha ao carregar nomes localizados dos bots:',err.message)}
function botNamesForRoom(room){const lang=cleanRoomLanguage(room?.language),list=BOT_NAMES_BY_LANGUAGE?.[lang];return Array.isArray(list)&&list.length?list:BOT_NAMES_FALLBACK}
const nameKey = value => String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').replace(/[^\p{L}\p{N}]/gu,'');
function ensureBotRoster(room){
  if(!room.botRoster)room.botRoster=[];if(!Number.isFinite(room.botNameSeq))room.botNameSeq=0;
  const used=new Set((room.players||[]).map(p=>nameKey(p.name))),usedColors=new Set((room.players||[]).map(p=>p.color));
  const makeName=()=>{
    const pool=botNamesForRoom(room);for(let tries=0;tries<500;tries++){const n=room.botNameSeq++,base=pool[n%pool.length],cycle=Math.floor(n/pool.length);const candidate=cycle?`${base} ${cycle+1}`:base;if(!used.has(nameKey(candidate))){used.add(nameKey(candidate));return candidate}}
    let n=1,candidate;do{candidate=`Bot ${n++}`}while(used.has(nameKey(candidate)));used.add(nameKey(candidate));return candidate;
  };
  for(let i=0;i<room.bots;i++){
    const current=room.botRoster[i];const currentName=current&&String(current.name||'').trim();
    if(!currentName||used.has(nameKey(currentName))){room.botRoster[i]={id:`bot_${room.code}_${i+1}`,name:makeName()};}
    else{room.botRoster[i]={id:`bot_${room.code}_${i+1}`,name:safeText(currentName,12,'Bot')};used.add(nameKey(room.botRoster[i].name));}
    const color=COLORS.includes(current?.color)&&!usedColors.has(current.color)?current.color:COLORS.find(c=>!usedColors.has(c));room.botRoster[i].color=color||COLORS[i%COLORS.length];usedColors.add(room.botRoster[i].color);
  }
  room.botRoster.length=room.bots;return room.botRoster;
}
Object.assign(LIMITS,{workerMax:[0,5],workerChance:[0,100],pyromancerMax:[0,5],pyromancerChance:[0,100],pyromancerCooldown:[5,25]});Object.assign(DEFAULT_SETTINGS,{workerMax:1,workerChance:0,pyromancerMax:1,pyromancerChance:0,pyromancerCooldown:15});
Object.assign(LIMITS,{neutrals:[0,5],jesterMax:[0,5],jesterChance:[0,100]});Object.assign(DEFAULT_SETTINGS,{neutrals:0,jesterMax:5,jesterChance:100});
Object.assign(LIMITS,{geminiBot:[0,1]});Object.assign(DEFAULT_SETTINGS,{geminiBot:0});
Object.assign(LIMITS,{gestureCooldown:[5,10],hpType:[0,1],hpDuration:[60,120],hpPassCooldown:[5,15],hpExplosion:[10,30]});Object.assign(DEFAULT_SETTINGS,{gestureCooldown:5,hpType:0,hpDuration:90,hpPassCooldown:5,hpExplosion:20});
const safeText = (v, max=12, fallback='Tripulante') => String(v ?? '').replace(/[<>\u0000-\u001f]/g,'').trim().slice(0,max) || fallback;
const send = (ws, obj) => { if(ws && ws.readyState===WebSocket.OPEN) ws.send(JSON.stringify(obj)); };
const broadcast = (room, obj, exceptId=null) => { for(const p of room.players){ if(p.id===exceptId)continue; const c=clients.get(p.id); if(c)send(c.ws,obj); } };
const broadcastSystemNotice=(room,text)=>broadcast(room,{type:'system_notice',text:String(text||'').slice(0,160)});
// Read the game's own trusted map literals once; the server and UI share the same door catalog.
const SabRules=require('./assets/sabotage-rules');
const GestureRules=require('./assets/gesture-rules');
const SurveillanceRules=require('./assets/surveillance-rules');
const MatchRules=require('./assets/match-rules'),NeutralRules=require('./assets/neutral-rules');
const classicRoom=room=>['classic','mimica'].includes(room.mode);
function roomGestures(room){return room.gestures||(room.gestures=GestureRules.create())}
function sendGestures(room){const state=roomGestures(room),snapshot=room.lastSnapshot;if(!snapshot)return;for(const player of room.players){const client=clients.get(player.id);if(client)send(client.ws,{type:'gesture_state',round:room.round,gestures:GestureRules.view(state,player.id,snapshot,Date.now())})}}
function sanitizeModeSnapshot(room,snapshot){if(room.mode!=='mimica')return snapshot;room.settings.commsExpanded=1;if(snapshot.cfg)snapshot.cfg.commsExpanded=1;if(snapshot.meeting){snapshot.meeting.chat=[];snapshot.meeting.chatCount=0}for(const ch of snapshot.chars||[])ch.bubble=null;GestureRules.sync(roomGestures(room),snapshot,Date.now());snapshot.gestures=roomGestures(room);snapshot.mimic=true;return snapshot}
const MAP_SABOTAGE_DATA=(()=>{const source=fs.readFileSync(HTML_FILE,'utf8'),start=source.indexOf('const MAP_LIBRARY='),end=source.indexOf('\n};\nfunction loadMapSelection',start)+3;return require('node:vm').runInNewContext(source.slice(start,end)+';MAP_LIBRARY',{},{timeout:1000})})();
const MAP_DOOR_CATALOG=Object.fromEntries(Object.entries(MAP_SABOTAGE_DATA).map(([id,map])=>[id,SabRules.catalog(map)]));
const Match=require('./server-match')({send,broadcast,clients,personalize:personalizeSnapshot,hostSnapshot:snapshotForNewHost,roomState:sendRoomState});
const NewNeutrals=require('./server-neutrals')({maps:MAP_SABOTAGE_DATA,send,broadcast,clients,personalize:personalizeSnapshot,hostSnapshot:snapshotForNewHost,roomState:sendRoomState,finish:(room,result)=>Match.lock(room,result)});
const Gemini=require('./server-gemini')({send,clients,ray:NewNeutrals.ray,maps:MAP_SABOTAGE_DATA});
const NEXUS_SENSORS=SurveillanceRules.definitions(MAP_SABOTAGE_DATA.nexus);
function roomSurveillance(room){return room.surveillance||(room.surveillance={state:SurveillanceRules.create(),watchers:new Map(),motion:new Map(),motionAt:0,motionEpoch:-1,motionSeq:-1})}
function surveillanceActor(room,id){const ch=room.lastSnapshot?.chars?.find(c=>c.id===id),motion=roomSurveillance(room).motion.get(id);return ch?{...ch,...(motion||{})}:null}
function sensorTerminalAccess(room,id){
 if(room.settings.mapId!=='nexus'||room.mode==='esconde-esconde'||room.status!=='playing'||room.lastSnapshot?.state!=='playing'||room.lastSnapshot?.over)return false;
 const ch=surveillanceActor(room,id),map=MAP_SABOTAGE_DATA.nexus,st=map.stations.find(s=>s.id==='nexus_logs'),comm=map.rooms.find(r=>r.id==='comm');
 if(!ch?.alive||ch.ghost||ch.vent||ch.ventAnim||ch.controlledBy||ch.controlTargetId||ch.killDash||ch.morphTransition||ch.minerDig||!st)return false;
 const x=Number(ch.x),y=Number(ch.y)+4,range=[48,120,220][Math.max(0,Math.min(2,Number(room.settings.actionDistance)||0))];
 if(!Number.isFinite(x)||!Number.isFinite(y)||x<comm.x*48||x>=(comm.x+comm.w)*48||y<comm.y*48||y>=(comm.y+comm.h)*48)return false;
 const ex=Math.max(st.x*48,Math.min((st.x+st.w)*48,x)),ey=Math.max(st.y*48,Math.min((st.y+st.h)*48,y));if(Math.hypot(x-ex,y-ey)>range)return false;
 // Only an unobstructed approach from inside Communications can access this console.
 const steps=Math.max(1,Math.ceil(Math.hypot(x-ex,y-ey)/8)),solids=[...map.decor,...map.stations.filter(s=>s.id!==st.id&&s.kind!=='decon')];
 for(let i=0;i<steps;i++){const px=x+(ex-x)*i/steps,py=y+(ey-y)*i/steps;if(solids.some(r=>px>=r.x*48&&px<(r.x+r.w)*48&&py>=r.y*48&&py<(r.y+r.h)*48))return false}
 return true;
}
function sendSensorHistory(room,c,blocked=false){const s=roomSurveillance(room);send(c.ws,{type:'sensor_history',code:room.code,round:room.round,version:s.state.seq,blocked,events:blocked?[]:s.state.events})}
function publishSensors(room,fresh=[]){
 const s=roomSurveillance(room),blocked=(room.lastSnapshot?.sab?.comms||0)>0;
 for(const [id,watcher]of s.watchers){const c=clients.get(id);if(!c||c.roomCode!==room.code||!sensorTerminalAccess(room,id)){s.watchers.delete(id);if(c)send(c.ws,{type:'sensor_unavailable',code:room.code,round:room.round});continue}
  if(watcher.blocked!==blocked){watcher.blocked=blocked;sendSensorHistory(room,c,blocked)}
  else if(!blocked&&fresh.length)send(c.ws,{type:'sensor_delta',code:room.code,round:room.round,version:s.state.seq,events:fresh});
 }
}
function updateSurveillance(room,motion=null){
 if(room.settings.mapId!=='nexus')return;const s=roomSurveillance(room),snapshot=room.lastSnapshot;if(!snapshot)return;const now=Date.now();
 if(motion){const epoch=room.authorityEpoch||0;if(s.motionEpoch!==epoch){s.motionEpoch=epoch;s.motionSeq=-1}const seq=Number(motion.seq);if(Number.isFinite(seq)&&seq<=s.motionSeq)return;if(Number.isFinite(seq))s.motionSeq=seq;
  for(const r of motion.chars){if(!snapshot.chars?.some(ch=>ch.id===r.id)||!Number.isFinite(r.x)||!Number.isFinite(r.y))continue;const entry={x:r.x,y:r.y};for(const key of ['alive','ghost','vent','ventAnim','teleportSeq'])if(Object.hasOwn(r,key))entry[key]=r[key];if(COLORS.includes(r.sensorColor)||r.sensorColor===SurveillanceRules.MASKED)entry.sensorColor=r.sensorColor;s.motion.set(r.id,entry)}s.motionAt=now;
 }else s.motion.clear();
 const chars=(snapshot.chars||[]).map(ch=>({...ch,...(s.motion.get(ch.id)||{})})),fresh=SurveillanceRules.sample(s.state,NEXUS_SENSORS,chars,{playing:room.status==='playing'&&snapshot.state==='playing'&&!snapshot.over&&!snapshot.meeting,masked:(room.mode==='mimica'||room.settings.commsExpanded===1)&&(snapshot.sab?.comms||0)>0,now,elapsedMs:Math.max(0,performance.now()-room.sensorStartedAt)});
 publishSensors(room,fresh);
}
function roomDoorControl(room){if(!room.doorControl||room.doorControl.mapId!==room.settings.mapId){room.doorControl=SabRules.create(room.settings.mapId);room.doorRepairs=new Map()}return room.doorControl}
function publishDoorControl(room){broadcast(room,{type:'door_state',round:room.round,control:{...roomDoorControl(room),serverNow:Date.now()}})}
function advanceRoomDoors(room){if(!classicRoom(room)||room.status!=='playing')return;const state=roomDoorControl(room),now=Date.now();if(SabRules.expire(state,now))publishDoorControl(room);if(state.main?.pending&&now-state.main.at>5000){state.main.at=now;const host=clients.get(room.hostId);if(host)send(host.ws,{type:'sabotage_commit',round:room.round,actorId:room.sabPendingActorId,sabotage:state.main.type})}}
function sabotageActor(room,c,m){const id=m.actorId&&c.id===room.hostId?String(m.actorId):c.id;return room.lastSnapshot?.chars?.find(ch=>ch.id===id&&(id===c.id||ch.isBot))}
// Only the Captain's own use/cooldown ledger lives here; ordinary meetings keep their existing flow.
function captainRecords(room){return room.captainRecords||(room.captainRecords=new Map())}
function initialCaptainRecord(room,ch){return {uses:Math.min(room.settings.emergencyUses,Math.max(0,Math.floor(Number(ch.emUses)||0))),readyAt:room.settings.captainCooldown,notBefore:(room.sensorStartedAt||performance.now())+room.settings.captainCooldown*1000}}
function sendCaptainOrder(room){const p=room.captainPending,host=clients.get(room.hostId);if(p&&host&&!room.authorityTransfer)send(host.ws,{type:'captain_order',round:room.round,epoch:room.authorityEpoch||0,id:p.id,actorId:p.actorId,uses:p.uses,readyAt:p.readyAt})}
function cancelCaptainCall(room){const p=room.captainPending;if(!p)return;captainRecords(room).set(p.actorId,{...p.before});room.captainPending=null;const ch=room.lastSnapshot?.chars?.find(c=>c.id===p.actorId);if(ch){ch.emUses=p.before.uses;ch.captainReadyAt=p.before.readyAt}send(clients.get(room.hostId)?.ws,{type:'captain_state',round:room.round,actorId:p.actorId,uses:p.before.uses,readyAt:p.before.readyAt})}
function syncCaptainSnapshot(room,snapshot){
 const pending=room.captainPending,meeting=snapshot.meeting;
 if(pending&&(snapshot.state==='meeting'||snapshot.over)){
  if(snapshot.state==='meeting'&&meeting?.captainCallId===pending.id&&meeting.callerId===pending.actorId){if(!room.captainMeetings)room.captainMeetings=new Map();room.captainMeetings.set(pending.id,pending.actorId);room.captainPending=null}
  else cancelCaptainCall(room);
 }
 if(meeting?.captainCallId&&room.captainMeetings?.get(meeting.captainCallId)!==meeting.callerId)return false;
 const records=captainRecords(room);
 for(const ch of snapshot.chars||[]){
  let record=records.get(ch.id);
  if(!record&&ch.role==='crew'&&ch.function==='captain'){record=initialCaptainRecord(room,ch);records.set(ch.id,record)}
  if(record){record.uses=Math.min(record.uses,Math.max(0,Math.floor(Number(ch.emUses)||0)));ch.emUses=record.uses;ch.captainReadyAt=record.readyAt}
 }
 return true;
}
function handleCaptainRequest(room,c,m){
 const actor=sabotageActor(room,c,m),snapshot=room.lastSnapshot,reject=()=>send(c.ws,{type:'captain_rejected',actorId:actor?.id||c.id,round:room.round});
 if(!MatchRules.eventsAllowed(room.mode,room.settings)||!classicRoom(room)||room.status!=='playing'||snapshot?.state!=='playing'||snapshot.over||snapshot.meeting||room.authorityTransfer||room.captainPending||!clients.get(room.hostId))return reject();
 if(!actor?.alive||actor.role!=='crew'||actor.function!=='captain'||actor.vent||actor.ventAnim||actor.controlledBy||actor.controlTargetId||actor.killDash||actor.minerDig||actor.morphTransition)return reject();
 advanceRoomDoors(room);const doors=roomDoorControl(room);
 if(doors.main||Object.keys(doors.locks).length||['reactor','oxygen','lights','comms','doors'].some(k=>(snapshot.sab?.[k]||0)>0))return reject();
 const gt=Number(snapshot.gt);if(!Number.isFinite(gt))return reject();const records=captainRecords(room);let record=records.get(actor.id);
 if(!record){record=initialCaptainRecord(room,actor);records.set(actor.id,record)}
 record.uses=Math.min(record.uses,Math.max(0,Math.floor(Number(actor.emUses)||0)));if(record.uses<=0||record.readyAt>gt||performance.now()<record.notBefore)return reject();
 const before={...record};record.uses--;record.readyAt=gt+room.settings.captainCooldown;record.notBefore=performance.now()+room.settings.captainCooldown*1000;actor.emUses=record.uses;actor.captainReadyAt=record.readyAt;
 room.captainPending={id:crypto.randomBytes(16).toString('hex'),actorId:actor.id,before,uses:record.uses,readyAt:record.readyAt};sendCaptainOrder(room);
}
// A shot is reserved once on Node before the existing simulation presents its result.
function sheriffRecords(room){return room.sheriffRecords||(room.sheriffRecords=new Map())}
function sendSheriffOrders(room){if(room.authorityTransfer)return;for(const r of sheriffRecords(room).values())if(!r.applied)send(clients.get(room.hostId)?.ws,{type:'sheriff_order',round:room.round,code:room.code,epoch:room.authorityEpoch||0,...r})}
function syncSheriffSnapshot(room,s){
 const previous=room.lastSnapshot,dt=Math.max(0,(Number(s.gt)||0)-(Number(previous?.gt)||0));
 for(const r of sheriffRecords(room).values()){
  if(s.sheriffShotIds?.[r.actorId]===r.id)r.applied=true;
  const ch=s.chars?.find(c=>c.id===r.actorId),before=previous?.chars?.find(c=>c.id===r.actorId);if(!ch)continue;
  if(previous?.state==='playing'&&!before?.vent&&!before?.ventAnim)r.remaining=Math.max(0,r.remaining-dt);
  r.remaining=Math.max(r.remaining,Number(ch.netSheriffCd)||0);ch.netSheriffCd=r.remaining;r.gt=Number(s.gt)||0;
 }
 for(const [key,consumed]of room.sheriffConsumed||[]){const shield=s.guardianProtections?.[key];if(shield&&shield.ownerId===consumed.ownerId&&shield.targetId===consumed.targetId&&Number(shield.until)===Number(consumed.until))delete s.guardianProtections[key]}
 if(room.sheriffConsumed)for(const ch of s.chars||[])if(ch.guardianTargetId&&!Object.values(s.guardianProtections||{}).some(pr=>pr.ownerId===ch.id))ch.guardianTargetId=null;
}
function handleSheriffRequest(room,c,m){
 const actor=sabotageActor(room,c,m),s=room.lastSnapshot,target=s?.chars?.find(ch=>ch.id===m.targetId),reject=()=>send(c.ws,{type:'sheriff_rejected',round:room.round,code:room.code,actorId:actor?.id||c.id});
 if(m.round!==undefined&&m.round!==room.round)return reject();
 const requestId=typeof m.requestId==='string'&&m.requestId.length<=96?m.requestId:null,seen=room.sheriffRequestIds?.get(actor?.id)||[];
 if(m.type==='sheriff_request'&&!requestId||requestId&&seen.includes(requestId))return reject();
 if(!classicRoom(room)||room.status!=='playing'||s?.state!=='playing'||s.over||s.meeting||room.authorityTransfer||!clients.get(room.hostId))return reject();
 if(!actor?.alive||actor.role!=='crew'||actor.function!=='sheriff'||actor.vent||actor.ventAnim||actor.controlledBy||actor.controlTargetId||s.sab?.comms>0||!target?.alive||target.id===actor.id||target.vent||target.ventAnim||target.spectralInvisible)return reject();
 const records=sheriffRecords(room),previous=records.get(actor.id);
 if((actor.netSheriffCd||0)>0||previous&&(!previous.applied||previous.remaining>0)||Math.hypot(actor.x-target.x,actor.y-target.y)>[48,120,220][room.settings.actionDistance??1]||!NewNeutrals.ray(room,actor,target,s))return reject();
 const protections=Object.entries(s.guardianProtections||{}).filter(([,pr])=>pr.targetId===target.id),blocked=target.role==='imp'&&protections.some(([,pr])=>Number(pr.until)>Number(s.gt));
 const record={id:crypto.randomBytes(16).toString('hex'),actorId:actor.id,targetId:target.id,actor:{id:actor.id,name:actor.name,color:actor.color,cosmetics:actor.cosmetics,x:actor.x,y:actor.y,alive:true,role:'crew',function:'sheriff'},outcome:blocked?'blocked':target.role==='imp'?'hit':'misfire',remaining:room.settings.sheriffCooldown,gt:Number(s.gt)||0,applied:false};
 if(requestId){room.sheriffRequestIds=room.sheriffRequestIds||new Map();room.sheriffRequestIds.set(actor.id,[...seen.slice(-63),requestId])}
 records.set(actor.id,record);actor.netSheriffCd=record.remaining;
 if(blocked){room.sheriffConsumed=room.sheriffConsumed||new Map();for(const [key,pr]of protections){room.sheriffConsumed.set(key,{...pr});delete s.guardianProtections[key]}for(const ch of s.chars)if(ch.guardianTargetId===target.id)ch.guardianTargetId=null}
 sendSheriffOrders(room);
}
function handleSabotageRequest(room,c,m){
 if(room.captainPending||!MatchRules.eventsAllowed(room.mode,room.settings))return;
 if(!classicRoom(room)||room.status!=='playing'||room.lastSnapshot?.state!=='playing')return;const actor=sabotageActor(room,c,m),state=roomDoorControl(room),now=Date.now(),cat=MAP_DOOR_CATALOG[room.settings.mapId];advanceRoomDoors(room);
 if(!actor||actor.role!=='imp'||(!actor.alive&&!actor.ghost)||actor.controlledBy||actor.killDash||actor.ninja&&actor.ninja.phase!=='away'||actor.minerDig||actor.morphTransition)return;
 if(m.sabotage==='doors'){
  const group=cat.groups.find(g=>g.id===m.roomId),ids=group?.doorIds||[];
  // Do not close a physical gate around an occupant.
  const occupied=ids.some(id=>{const d=cat.doors.find(d=>d.id===id);return d&&room.lastSnapshot.chars.some(ch=>ch.alive&&!ch.vent&&ch.x+11>d.x*48&&ch.x-11<(d.x+d.w)*48&&ch.y+6+9>d.y*48&&ch.y+6-9<(d.y+d.h)*48)});
  if(!occupied&&SabRules.lock(state,cat,m.roomId,m.doorId,now))publishDoorControl(room);
 }else if(SabRules.reserve(state,String(m.sabotage),now,Number(room.lastSnapshot.sab?.cd)||0)){
  room.sabPendingActorId=actor.id;publishDoorControl(room);const host=clients.get(room.hostId);if(host)send(host.ws,{type:'sabotage_commit',round:room.round,requestId:state.revision,actorId:actor.id,sabotage:m.sabotage});
 }
}
function handleDoorRepair(room,c,m){
 const reject=()=>send(c.ws,{type:'door_repair_rejected',round:room.round,actorId:c.id===room.hostId&&typeof m.actorId==='string'?m.actorId:c.id,doorId:m.doorId});
 if(!classicRoom(room)||room.status!=='playing'||room.settings.mapId!=='kryos'||room.lastSnapshot?.state!=='playing')return reject();
 const ch=sabotageActor(room,c,m),state=roomDoorControl(room),cat=MAP_DOOR_CATALOG.kryos,d=cat.doors.find(d=>d.id===m.doorId),range=[48,120,220][room.settings.actionDistance]||120;
 if(!state.locks[d?.id]||!SabRules.nearby(ch,d,range))return reject();
 const key=ch.id,now=Date.now();if(m.type==='door_repair_begin'){
  const target=Array.from({length:5},()=>crypto.randomInt(2)),nonce=crypto.randomBytes(12).toString('hex');room.doorRepairs.set(key,{doorId:d.id,target,nonce,at:now});send(c.ws,{type:'door_repair_ready',round:room.round,actorId:ch.id,doorId:d.id,target,nonce});
 }else{const r=room.doorRepairs.get(key);if(!r||r.doorId!==d.id||r.nonce!==m.nonce||now-r.at<1500||now-r.at>120000||!Array.isArray(m.values)||m.values.length!==5||m.values.some((v,i)=>v!==r.target[i]))return reject();
  room.doorRepairs.delete(key);SabRules.open(state,d.id,now);publishDoorControl(room);
 }
}
function syncDoorSnapshot(room,snapshot){
 if(!classicRoom(room))return;const state=roomDoorControl(room),now=Date.now();advanceRoomDoors(room);if(SabRules.sync(state,snapshot.sab,now,room.settings.sab))publishDoorControl(room);
 const map=MAP_SABOTAGE_DATA[room.settings.mapId];if(Array.isArray(snapshot.doors))map.doors.forEach((d,i)=>{if(!d.decon)snapshot.doors[i]=!!state.locks[d.id]});
 if(snapshot.sab)snapshot.sab.doors=Object.keys(state.locks).length?Math.max(1,...Object.values(state.locks).map(l=>l.until?Math.max(0,(l.until-now)/1000):1)):0;
 snapshot.doorControl={...JSON.parse(JSON.stringify(state)),serverNow:now};
}

function maxImpostorsForCount(count){const n=Math.max(4,Math.min(15,Math.round(Number(count)||4)));return n>=10?3:n>=8?2:1}
function cleanSettings(input={}, playerCount=15) {
  const out={...DEFAULT_SETTINGS};
  const mapId=String(input?.mapId||'');out.mapId=MAP_IDS.has(mapId)?mapId:'nave';
  out.hnsKillerId=typeof input.hnsKillerId==='string'?input.hnsKillerId.slice(0,80):'';
  for(const [key,[lo,hi]] of Object.entries(LIMITS)) {
    const n=Number(input[key]); if(Number.isFinite(n))out[key]=Math.min(hi,Math.max(lo,Math.round(n)));
  }
  for(const key of ['speed','impVision','crewVision','hnsKillerVision','hnsCrewVision','hnsCrewSpeed','hnsKillerSpeed','hnsKillerFinalSpeed']){const [lo,hi]=LIMITS[key];out[key]=Math.min(hi,Math.max(lo,Math.round(out[key]/5)*5))}
  out.instructorMaxDistance=Math.min(2000,Math.max(100,Math.round(out.instructorMaxDistance/100)*100));
  out.hunterTargetCooldown=Math.min(25,Math.max(5,Math.round(out.hunterTargetCooldown/5)*5));
  out.hpPassCooldown=Math.min(out.hpPassCooldown,out.hpExplosion-1);
  for(const role of NeutralRules.roles)out[role+'Chance']=out[role+'Chance']>0?100:0;
  out.childMax=Math.min(out.childMax,out.neutrals);out.shifterMax=Math.min(out.shifterMax,out.neutrals);
  out.neutrals=Math.min(out.neutrals,Math.floor(playerCount/3));out.jesterMax=Math.min(out.jesterMax,out.neutrals);out.workerMax=Math.min(out.workerMax,out.neutrals);out.pyromancerMax=Math.min(out.pyromancerMax,out.neutrals);
  out.impostors=Math.min(out.impostors,maxImpostorsForCount(playerCount));
  out.captainMax=Math.min(out.captainMax,Math.max(0,Math.min(15,playerCount)-out.impostors-out.neutrals));
  out.cleanerMax=Math.min(out.cleanerMax,out.impostors);
  out.ninjaMax=Math.min(out.ninjaMax,out.impostors,3);
  out.minerMax=Math.min(out.minerMax,out.impostors,3);
  out.morphMax=Math.min(out.morphMax,out.impostors,3);
  out.hunterMax=Math.min(out.hunterMax,out.impostors,3);
  out.parasiteMax=Math.min(out.parasiteMax,out.impostors,3);
  out.instructorMax=Math.min(out.instructorMax,Math.max(0,Math.min(15,playerCount)));
  out.guardianMax=Math.min(out.guardianMax,Math.max(0,Math.min(15,playerCount)));
  out.paramedicMax=Math.min(out.paramedicMax,Math.max(0,Math.min(15,playerCount)));
  out.seerMax=Math.min(out.seerMax,Math.max(0,Math.min(15,playerCount)));
  out.noisyMax=Math.min(out.noisyMax,Math.max(0,Math.min(15,playerCount)));
  out.judgeMax=Math.min(out.judgeMax,Math.max(0,Math.min(15,playerCount)));
  out.judgeTaskPct=Math.min(100,Math.max(0,Math.round(out.judgeTaskPct/25)*25));
  out.lazyMax=Math.min(out.lazyMax,Math.max(0,Math.min(15,playerCount)));
  out.spectralMax=Math.min(out.spectralMax,Math.max(0,Math.min(15,playerCount)));
  return out;
}
// The host simulates this mode; the server derives and broadcasts each player's result.
function hotPotatoResult(room,snapshot){
  if(!snapshot?.hp||!Array.isArray(snapshot.chars))return null;
  const ids=new Set([...room.players,...(room.botRoster||[]).slice(0,room.bots)].map(p=>p.id));
  const alive=snapshot.chars.filter(c=>c.alive&&ids.has(c.id)),holderId=snapshot.hp.holderId;
  if(!alive.length)return {winnerIds:[],endCause:'allDead'};
  if(alive.length===1&&alive[0].id===holderId)return {winnerIds:[holderId],endCause:'survivor'};
  if(!alive.some(c=>c.id===holderId))return null;
  const aliveIds=new Set(alive.map(c=>c.id)),steps=(snapshot.tasks||[]).filter(t=>!t.fake&&aliveIds.has(t.owner)).flatMap(t=>t.steps||[]);
  const done=room.settings.hpType?steps.length>0&&steps.every(s=>s.done):Number.isFinite(snapshot.hp.matchRemaining)&&snapshot.hp.matchRemaining<=0;
  return done?{winnerIds:alive.filter(c=>c.id!==holderId).map(c=>c.id),endCause:room.settings.hpType?'tasks':'time'}:null;
}
const ROOM_CODE_CHARS='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
function makeCode(){let code;do{code='';for(let i=0;i<6;i++)code+=ROOM_CODE_CHARS[crypto.randomInt(ROOM_CODE_CHARS.length)]}while(rooms.has(code));return code}
function pickColor(requested, room) {
  requested=normalizeColor(requested);
  const used = new Set(room.players.map(p=>p.color));
  if(COLORS.includes(requested) && !used.has(requested))return requested;
  return COLORS.find(c=>!used.has(c)) || COLORS[0];
}
function resetLobbyExpiry(room,maxMs=600000){room.lobbyMaxMs=Math.max(1000,Number(maxMs)||600000);room.lobbyRemainingMs=room.lobbyMaxMs;room.createdAt=Date.now();room.lobbyExpiresAt=room.createdAt+room.lobbyRemainingMs;room.lobbyWarningAt=null}
function pauseLobbyExpiry(room){if(!room||room.status!=='lobby')return;const now=Date.now();room.lobbyRemainingMs=Math.max(0,Number(room.lobbyExpiresAt||now)-now);room.lobbyExpiresAt=null}
function resumeLobbyExpiry(room){if(!room||room.status!=='lobby')return;const remain=Math.max(0,Number(room.lobbyRemainingMs??room.lobbyMaxMs??600000));room.lobbyExpiresAt=Date.now()+remain}
function roomPublic(room){ensureBotRoster(room);if(room.mode!=='esconde-esconde'||room.privacy!=='private'||![...room.players,...room.botRoster].some(p=>p.id===room.settings.hnsKillerId))room.settings.hnsKillerId='';const waiting=['lobby','countdown','loading'].includes(room.status),expires=waiting?(Number(room.lobbyExpiresAt)||null):null,remaining=expires?Math.max(0,expires-Date.now()):null;return {advancedBotIds:Gemini.botIds(room),code:room.code,hostId:room.hostId,privacy:room.privacy==='public'?'public':'private',mode:room.mode||'classic',authorityEpoch:room.authorityEpoch||0,authorityPending:!!room.authorityTransfer,size:room.size,bots:room.bots,region:cleanRoomRegion(room.region),language:cleanRoomLanguage(room.language),botRoster:room.botRoster.map(b=>({...b})),status:room.status,round:room.round,lobbyExpiresAt:expires,lobbyRemainingMs:remaining,lobbyWarningAt:room.lobbyWarningAt||null,settings:{...room.settings},lobby:room.status==='lobby'?LobbyRules.snapshot(room,Date.now()):null,players:room.players.map(p=>({id:p.id,name:p.name,color:p.color,ready:!!p.ready,cosmetics:cleanCosmetics(p.cosmetics)}))};}
function sendRoomState(room){if(room.mode==='mimica')room.settings.commsExpanded=1;const pub=roomPublic(room);for(const p of room.players){const c=clients.get(p.id);if(c)send(c.ws,{type:'room_state',room:pub,youId:p.id})}}
function roomFor(client){return client.roomCode?rooms.get(client.roomCode):null}
function error(ws,message,extra={}){send(ws,{type:'room_error',message,...extra})}
function roomListing(room){const current=room.players.length+room.bots;return {code:room.code,current,size:room.size,hostName:room.players.find(p=>p.id===room.hostId)?.name||'Host',region:cleanRoomRegion(room.region),language:cleanRoomLanguage(room.language),mode:room.mode||'classic',mapId:room.settings.mapId,impostors:room.mode==='batata-quente'?0:room.mode==='esconde-esconde'?1:room.settings.impostors,status:room.status,privacy:room.privacy==='public'?'public':'private',full:current>=room.size}}
function publicRoomCompatible(room,m){return room.privacy==='public'&&cleanRoomRegion(room.region)===String(m.region)&&cleanRoomLanguage(room.language)===String(m.language)&&(room.mode||'classic')===m.mode&&(!m.mapId||m.mapId==='all'||room.settings.mapId===m.mapId)}
function moderateSnapshotChat(snapshot){if(Array.isArray(snapshot?.meeting?.chat))for(const msg of snapshot.meeting.chat)if(msg&&typeof msg==='object')msg.text=moderateChat(String(msg.text||'').slice(0,180));return snapshot}
function snapshotAlive(room,id){const ch=room.lastSnapshot?.chars?.find(c=>String(c.id)===String(id));return ch?ch.alive!==false:true}
function ensureModeration(room){if(!(room.modVotes instanceof Map))room.modVotes=new Map();if(!(room.banned instanceof Set))room.banned=new Set();return room.modVotes}
function moderationBanKey(client){const accountId=String(client?.accountId||'').trim();if(accountId)return `account:${accountId}`;const clientKey=String(client?.clientKey||'').trim();return clientKey?`client:${clientKey}`:''}
function moderationRule(room,targetId){
  // Apenas jogadores humanos online e vivos podem votar; o alvo nunca entra no cálculo.
  // A expulsão exige maioria absoluta dos elegíveis: piso(n / 2) + 1.
  const eligible=room.players.filter(p=>p.id!==targetId&&snapshotAlive(room,p.id));
  const maxVotes=eligible.length;
  const required=Math.floor(maxVotes/2)+1;
  return {eligible:eligible.map(p=>p.id),maxVotes,required,hostRequired:false,possible:maxVotes>0};
}
function pruneModeration(room){
  const votes=ensureModeration(room),playerIds=new Set(room.players.map(p=>p.id));
  for(const [targetId,set] of [...votes.entries()]){
    if(!playerIds.has(targetId)){votes.delete(targetId);continue}
    const rule=moderationRule(room,targetId),allowed=new Set(rule.eligible);
    for(const voterId of [...set])if(!allowed.has(voterId)||voterId===targetId)set.delete(voterId);
    if(!set.size)votes.delete(targetId);
  }
}
function moderationPayload(room){
  pruneModeration(room);const votes=ensureModeration(room);
  return {meeting:room.lastSnapshot?.state==='meeting',targets:room.players.map(p=>{const rule=moderationRule(room,p.id),set=votes.get(p.id)||new Set();return {targetId:p.id,count:set.size,required:rule.required,possible:rule.possible,hostRequired:rule.hostRequired,hostVoted:set.has(room.hostId),voters:[...set]}})};
}
function broadcastModeration(room,force=false){const state=moderationPayload(room),sig=JSON.stringify(state);if(!force&&room.modStateSig===sig)return;room.modStateSig=sig;broadcast(room,{type:'moderation_state',state})}
function removePlayerByModeration(room,targetId,reason){
  const target=clients.get(targetId);if(!target||target.roomCode!==room.code)return false;
  send(target.ws,{type:'moderation_removed',reason,code:room.code});
  detachFromRoom(target,reason==='ban'?'ban':'kicked');return true;
}
function evaluateModeration(room){
  pruneModeration(room);const votes=ensureModeration(room);
  for(const [targetId,set] of [...votes.entries()]){
    const rule=moderationRule(room,targetId);if(!rule.possible)continue;
    if(set.size>=rule.required){votes.delete(targetId);removePlayerByModeration(room,targetId,'vote_kick');return true}
  }
  broadcastModeration(room);return false;
}
function invalidateCountdown(room){
  const active=room.status==='countdown'||room.status==='loading';
  if(room.countdownTimer)clearTimeout(room.countdownTimer);
  if(room.loadingTimer)clearTimeout(room.loadingTimer);
  room.countdownTimer=null;room.loadingTimer=null;
  if(active){room.countdownToken=(room.countdownToken||0)+1;room.status='lobby';room.rematchPending=false;room.countdownRoster=null;}
  return active;
}
function rosterKey(room){return room.players.map(p=>p.id).sort().join('|')+'#'+room.bots;}
function detachFromRoom(client,reason='leave'){
  const room=roomFor(client);if(!room){client.roomCode=null;return}
  const removed=room.players.find(p=>p.id===client.id);if(!removed){client.roomCode=null;return}
  const wasHost=room.hostId===client.id;
  const cancelled=invalidateCountdown(room);
  room.players=room.players.filter(p=>p.id!==client.id);if(room.rematchWaiters instanceof Set)room.rematchWaiters.delete(client.id);client.roomCode=null;client.rematchCode=null;client.rematchProfile=null;
  if(room.players.length===0){rooms.delete(room.code);send(client.ws,{type:'left'});return}
  if(wasHost){room.hostId=room.players[0].id;prepareAuthorityTransfer(room)}
  pruneModeration(room);
  sendRoomState(room);evaluateModeration(room);
  if(cancelled)broadcast(room,{type:'countdown_cancelled',reason:'Um jogador saiu. A contagem foi cancelada.'});
  if(wasHost && room.status!=='lobby' && room.lastSnapshot){const elected=clients.get(room.hostId);if(elected)sendAuthorityCheckpoint(room,elected);}
  broadcast(room,{type:'player_left',playerId:client.id,name:removed.name,reason});
  if(wasHost)broadcast(room,{type:'host_changed',hostId:room.hostId});
  send(client.ws,{type:'left'});
}
// The server alone elects the next administrator and authorizes publication of its checkpoint.
function prepareAuthorityTransfer(room){room.authorityTransfer=null;if(room.status!=='playing'||room.ending||!room.lastSnapshot)return;room.authorityEpoch=(room.authorityEpoch||0)+1;const next=clients.get(room.hostId);if(next?.checkpointProtocol)room.authorityTransfer={epoch:room.authorityEpoch,nonce:crypto.randomBytes(16).toString('hex'),seq:room.lastSnapshot.seq,at:Date.now()};room.lastAuthorityAt=Date.now()}
function sendAuthorityCheckpoint(room,client){const snapshot=snapshotForNewHost(room.lastSnapshot,room.hostId);if(room.aiCheckpoint)snapshot._handoff=room.aiCheckpoint;send(client.ws,{type:'host_snapshot',snapshot,...(room.authorityTransfer?{handoff:{...room.authorityTransfer,round:room.round,code:room.code}}:{})})}
function mergeAuthorityCheckpoint(room,snapshot){const checkpoint=snapshot._handoff;delete snapshot._handoff;if(checkpoint?.version!==1||!checkpoint.bots||typeof checkpoint.bots!=='object'){room.aiCheckpoint=null;return}const previous=checkpoint.full?{}:room.aiCheckpoint?.bots||{},bots={};for(const ch of snapshot.chars||[])if(ch.isBot&&checkpoint.bots[ch.id]&&typeof checkpoint.bots[ch.id]==='object'){bots[ch.id]={...(previous[ch.id]||{}),...checkpoint.bots[ch.id]};for(const key of checkpoint.removed?.[ch.id]||[])if(typeof key==='string')delete bots[ch.id][key]}room.aiCheckpoint={version:1,bots}}
function advanceAuthorityLease(room,now){if(room.status!=='playing'||!room.lastSnapshot||!clients.get(room.hostId)?.checkpointProtocol||now-(room.lastAuthorityAt||now)<HANDOFF_LEASE_MS)return;room.failedAuthorities=room.failedAuthorities||new Map();room.failedAuthorities.set(room.hostId,now+30000);const next=room.players.find(p=>p.id!==room.hostId&&now>=(room.failedAuthorities.get(p.id)||0)&&clients.get(p.id)?.checkpointProtocol&&clients.get(p.id)?.ws.readyState===WebSocket.OPEN&&now-(clients.get(p.id).lastSeenAt||0)<HANDOFF_LEASE_MS);if(!next)return;room.hostId=next.id;prepareAuthorityTransfer(room);sendRoomState(room);sendAuthorityCheckpoint(room,clients.get(next.id));broadcast(room,{type:'host_changed',hostId:next.id})}
function personalizeSnapshot(snapshot, recipientId){
  const {_handoff,...publicState}=snapshot;const s=JSON.parse(JSON.stringify(publicState));
  const ended=s.state==='over'||s.over;
  const recipient=s.chars?.find(c=>c.id===recipientId);
  s.sheriffShotIds=s.sheriffShotIds?.[recipientId]?{[recipientId]:s.sheriffShotIds[recipientId]}:{};
  const privateWorkers=new Set((s.chars||[]).filter(c=>c.id!==recipientId&&c.role==='neutral'&&c.function==='worker').map(c=>c.id));s.tasks=(s.tasks||[]).filter(t=>!privateWorkers.has(t.owner));
  if(s.gestures)s.gestures=GestureRules.view(s.gestures,recipientId,snapshot,Date.now());
  if(!s.hns && !ended){
    const recipientIsImp=recipient?.role==='imp';
    for(const c of s.chars||[])if(c.id!==recipientId){
      c.instructor=false;c.guardian=false;
      if(!(recipientIsImp&&c.role==='imp')){c.role='crew';c.function=null}
      for(const key of ['emUses','netKillCd','netSheriffCd','netDelayedCd','netTrackTarget','netTrackTime','netTrackCd','parasiteReady','parasiteCd','parasiteTargetId','cleanCd','cleanUses','cleanPending','paramedicCd','paramedicSpent','paramedicUses','paramedicTaskBase','seerCd','seerPending','guardianCd','guardianTargetId','hunterTargetCd','instructorCd','instructorTargetId','engVentTime','engVentCd','morphCd','minerCd','controlCd','ninjaCd','spectralCd','shiftCount','shifterTenure'])delete c[key];
      if(c.ninja)c.ninja={phase:c.ninja.phase};
    }
    // Other players' fake-task flags would identify their teams indirectly.
    s.tasks=(s.tasks||[]).filter(task=>task.owner===recipientId||!task.fake);
    for(const task of s.tasks||[])if(task.owner!==recipientId){task.fake=false;task.fakeOnly=false;delete task.lazy}
  }
  // Marcações são privadas: só o Marcador que marcou recebe seus cronômetros.
  const privateMarks={};for(const [victimId,mark] of Object.entries(s.delayedMarks||{})){if(mark&&mark.killerId===recipientId)privateMarks[victimId]={victimId, killerId:recipientId, remaining:Math.max(0,Number(mark.remaining)||0)}}s.delayedMarks=privateMarks;
  const canSeeHunterTargets=recipient?.role==='imp';if(!canSeeHunterTargets)for(const c of (s.chars||[]))c.hunterTargetId=null;
  const canSeeGuardianProtection=recipient?.alive===false||!!recipient?.guardian||(recipient?.alive!==false&&recipient?.role==='imp'&&Number(s.cfg?.guardianImpostorVisible)!==0);if(!canSeeGuardianProtection)s.guardianProtections={};
  s.parasiteInfections=recipient?.role==='imp'?(s.parasiteInfections||{}):{};if(recipient?.role!=='imp')s.parasiteWinnerId=null;s.instructorTrails=(s.instructorTrails||[]).filter(t=>String(t.targetId)===String(recipientId)||String(t.ownerId)===String(recipientId));s.selfSeerReplay=recipient?.alive!==false&&recipient?.role==='crew'&&recipient?.function==='seer'?(s.seerReplays?.[recipientId]||null):null;delete s.seerReplays;for(const b of (s.bodies||[])){delete b.killerTrace;if(!ended&&b.victimId!==recipientId)delete b.killerId}
  if(recipient){s.role=recipient.role;s.locator=recipient.function==='locator';s.sheriff=recipient.function==='sheriff';s.observer=recipient.function==='observer';s.cleaner=recipient.function==='cleaner';s.parasite=recipient.function==='parasite';s.paramedic=recipient.function==='paramedic';s.seer=recipient.function==='seer';s.lazy=recipient.function==='lazy';s.spectral=recipient.function==='spectral';s.delayed=recipient.function==='delayed';s.trackTarget=recipient.netTrackTarget||null;s.trackTime=recipient.netTrackTime||0;s.trackCd=recipient.netTrackCd||0;s.selfKillCd=recipient.netKillCd||0;s.selfSheriffCd=recipient.netSheriffCd||0;s.selfDelayedCd=recipient.netDelayedCd||0;s.selfCleanerCd=recipient.cleanCd||0;s.selfCleanerUses=recipient.cleanUses||0;s.selfParamedicCd=recipient.paramedicCd||0;s.selfParamedicSpent=recipient.paramedicSpent||0;s.selfSeerCd=recipient.seerCd||0;s.selfParasiteReady=recipient.parasiteReady!==false;s.selfGuardian=!!recipient.guardian;s.selfGuardianTargetId=recipient.guardianTargetId||null;s.selfInstructor=!!recipient.instructor;s.selfInstructorCd=recipient.instructorCd||0;s.selfInstructorTargetId=recipient.instructorTargetId||null;}
  for(const ch of s.chars||[])if(ch.id!==recipientId){delete ch.captainReadyAt;delete ch.shiftCount;delete ch.shifterTenure;}
  return s;
}
function snapshotForNewHost(snapshot, recipientId){
  const s=JSON.parse(JSON.stringify(snapshot));
  const recipient=s.chars?.find(c=>c.id===recipientId);
  if(s.gestures)s.gestures=GestureRules.view(s.gestures,recipientId,snapshot,Date.now());
  s.selfSeerReplay=s.seerReplays?.[recipientId]||null;
  if(recipient){s.role=recipient.role;s.locator=recipient.function==='locator';s.sheriff=recipient.function==='sheriff';s.observer=recipient.function==='observer';s.cleaner=recipient.function==='cleaner';s.parasite=recipient.function==='parasite';s.paramedic=recipient.function==='paramedic';s.seer=recipient.function==='seer';s.lazy=recipient.function==='lazy';s.spectral=recipient.function==='spectral';s.delayed=recipient.function==='delayed';s.trackTarget=recipient.netTrackTarget||null;s.trackTime=recipient.netTrackTime||0;s.trackCd=recipient.netTrackCd||0;s.selfKillCd=recipient.netKillCd||0;s.selfSheriffCd=recipient.netSheriffCd||0;s.selfDelayedCd=recipient.netDelayedCd||0;s.selfCleanerCd=recipient.cleanCd||0;s.selfCleanerUses=recipient.cleanUses||0;s.selfParamedicCd=recipient.paramedicCd||0;s.selfParamedicSpent=recipient.paramedicSpent||0;s.selfSeerCd=recipient.seerCd||0;s.selfParasiteReady=recipient.parasiteReady!==false;s.selfGuardian=!!recipient.guardian;s.selfGuardianTargetId=recipient.guardianTargetId||null;s.selfInstructor=!!recipient.instructor;s.selfInstructorCd=recipient.instructorCd||0;s.selfInstructorTargetId=recipient.instructorTargetId||null;}
  return s;
}
// Sensor time starts after the existing six-second role countdown, using only the server clock.
function startGameNow(room, rematch=false){
  const total=room.players.length+room.bots;
  if(total<4 && !(rematch && total===3)){error(clients.get(room.hostId)?.ws,'Adicione bots ou espere mais jogadores: uma nova partida precisa de pelo menos 4 participantes.');return false}
  if(total>room.size||total>15){error(clients.get(room.hostId)?.ws,'A quantidade total excede o limite da sala.');return false}
  if(classicRoom(room)){const cap=NeutralRules.capacity(total,room.settings);if(!cap.valid){error(clients.get(room.hostId)?.ws,'Ajuste as funções neutras: não há vagas habilitadas suficientes.',{key:'neutral.invalidCapacity',params:cap});return false}}
  if(room.countdownTimer)clearTimeout(room.countdownTimer);if(room.loadingTimer)clearTimeout(room.loadingTimer);
  if(room.neutralPlanRound!==room.round+1)NewNeutrals.prepare(room);NewNeutrals.sendPlan(room);room.sheriffRecords=new Map();room.sheriffConsumed=new Map();room.sheriffRequestIds=new Map();
  room.countdownTimer=null;room.loadingTimer=null;room.doorControl=null;room.doorRepairs=new Map();room.status='playing';room.ending=null;room.roleRevision=0;room.sensorStartedAt=performance.now()+6000;room.gestures=GestureRules.create();room.lobbyExpiresAt=null;room.round++;room.lastSnapshot=null;room.surveillance=null;room.neutralLedger=null;room.neutralViews=null;room.meetingSerial=0;room.meetingEvent=null;room.captainRecords=new Map();room.captainPending=null;room.captainMeetings=new Map();room.failedAuthorities=new Map();room.aiCheckpoint=null;room.authorityTransfer=null;room.lastAuthorityAt=Date.now();room.ghostChatHistory=[];room.winner=null;room.endReason='';room.rematchPending=false;room.rematchLobby=false;room.countdownRoster=null;
  sendRoomState(room);
  broadcast(room,{type:'game_start',room:roomPublic(room),round:room.round,rematch});
  return true;
}
function startGame(room, rematch=false, timings={}){
  const total=room.players.length+room.bots;
  if(total<4 && !(rematch && total===3)){error(clients.get(room.hostId)?.ws,'Adicione bots ou espere mais jogadores: uma nova partida precisa de pelo menos 4 participantes.');return false}
  if(total>room.size||total>15){error(clients.get(room.hostId)?.ws,'A quantidade total excede o limite da sala.');return false}
  if(classicRoom(room)){const cap=NeutralRules.capacity(total,room.settings);if(!cap.valid){error(clients.get(room.hostId)?.ws,'Ajuste as funções neutras: não há vagas habilitadas suficientes.',{key:'neutral.invalidCapacity',params:cap});return false}}
  if(room.countdownTimer)clearTimeout(room.countdownTimer);if(room.loadingTimer)clearTimeout(room.loadingTimer);
  room.countdownTimer=null;room.loadingTimer=null;room.countdownToken=(room.countdownToken||0)+1;
  const token=room.countdownToken;room.status='countdown';room.rematchPending=rematch;room.countdownRoster=rosterKey(room);
  const countdownMs=Math.max(0,Number(timings.countdownMs??5000));
  const loadingMs=Math.max(0,Number(timings.loadingMs??1200));
  sendRoomState(room);
  broadcast(room,{type:'countdown_start',seconds:Math.ceil(countdownMs/1000),rematch,room:roomPublic(room)});
  room.countdownTimer=setTimeout(()=>{
    if(rooms.get(room.code)!==room||room.countdownToken!==token||room.status!=='countdown')return;
    if(rosterKey(room)!==room.countdownRoster){const changed=invalidateCountdown(room);if(changed){sendRoomState(room);broadcast(room,{type:'countdown_cancelled',reason:'A lista de jogadores mudou. A contagem foi cancelada.'})}return}
    room.countdownTimer=null;room.status='loading';NewNeutrals.prepare(room);NewNeutrals.sendPlan(room);sendRoomState(room);
    broadcast(room,{type:'loading_start',duration:loadingMs,rematch,room:roomPublic(room)});
    room.loadingTimer=setTimeout(()=>{
      if(rooms.get(room.code)!==room||room.countdownToken!==token||room.status!=='loading')return;
      if(rosterKey(room)!==room.countdownRoster){const changed=invalidateCountdown(room);if(changed){sendRoomState(room);broadcast(room,{type:'countdown_cancelled',reason:'A lista de jogadores mudou. A partida não foi iniciada.'})}return}
      startGameNow(room,rematch);
    },loadingMs);
  },countdownMs);
  return true;
}
function activeClientForAccount(client){
  const accountId=String(client?.accountId||'');if(!accountId)return null;
  for(const other of clients.values()){
    if(!other||other.id===client.id||String(other.accountId||'')!==accountId||!other.roomCode)continue;
    const room=rooms.get(other.roomCode);if(room&&room.players.some(p=>p.id===other.id))return other;
  }
  return null;
}
function rejectDuplicateAccountSlot(client){
  if(!activeClientForAccount(client))return false;
  error(client.ws,'Esta conta já está participando de uma sala em outro dispositivo ou sessão.');
  return true;
}
function handle(ws, raw, timings={}){
  const c=ws.client;
  let m;try{m=JSON.parse(raw.toString())}catch{return error(ws,'Mensagem inválida.')}
  if(!m||typeof m.type!=='string')return;c.lastSeenAt=Date.now();
  if(m.type==='hello'){
    if(c.id)return;
    c.id='p_'+crypto.randomBytes(8).toString('hex');c.checkpointProtocol=m.checkpointProtocol===1;c.name=safeText(m.name);{const requested=normalizeColor(m.color);c.color=COLORS.includes(requested)?requested:'azul'}
    const rawKey=String(m.clientKey||'').trim();c.clientKey=/^[A-Za-z0-9_-]{12,96}$/.test(rawKey)?rawKey:c.id;clients.set(c.id,c);
    send(ws,{type:'welcome',id:c.id});return;
  }
  if(m.type==='ping'){send(ws,{type:'pong',echo:Number(m.echo)||0,t:Date.now()});return}
  if(!c.id)return error(ws,'Conecte-se primeiro ao servidor.');
  if(m.type==='create_room'){
    if(rejectDuplicateAccountSlot(c))return;
    if(c.roomCode)detachFromRoom(c);
    const size=Math.min(15,Math.max(4,Math.round(Number(m.size)||10)));
    const requestedBots=Number(m.bots);const bots=Math.min(size-1,Math.max(0,Math.round(Number.isFinite(requestedBots)?requestedBots:3)));
    const code=makeCode();
    const region=cleanRoomRegion(m.region),language=cleanRoomLanguage(m.language);
    const room={code,hostId:c.id,authorityEpoch:0,authorityTransfer:null,aiCheckpoint:null,lastAuthorityAt:0,size,bots,region,language,privacy:m.privacy==='public'?'public':'private',mode:ROOM_MODES.has(m.mode)?m.mode:'classic',status:'lobby',round:0,settings:cleanSettings(m.settings,size),players:[],lastSnapshot:null,ghostChatHistory:[],createdAt:Date.now(),lobbyMaxMs:Math.max(1000,Number(timings.lobbyMaxMs)||600000),lobbyRemainingMs:0,lobbyExpiresAt:null,countdownToken:0,countdownTimer:null,loadingTimer:null,countdownRoster:null,rematchPending:false,rematchLobby:false,rematchWaiters:new Set(),botRoster:[],botNameSeq:0,banned:new Set(),modVotes:new Map(),modStateSig:''};resetLobbyExpiry(room,room.lobbyMaxMs);
    room.players.push({id:c.id,name:safeText(m.name||c.name),color:pickColor(m.color||c.color,room),ready:false,cosmetics:cleanCosmeticsForClient(m.cosmetics,c)});
    c.name=room.players[0].name;c.color=room.players[0].color;c.roomCode=code;rooms.set(code,room);
    sendRoomState(room);return;
  }
  if(m.type==='list_rooms'){
    if(!ROOM_REGIONS.has(m.region)||!ROOM_LANGUAGES.has(m.language)||!ROOM_MODES.has(m.mode)||(m.mapId&&m.mapId!=='all'&&!MAP_IDS.has(m.mapId)))return send(ws,{type:'room_list',requestId:m.requestId,rooms:[],message:'Filtros de sala inválidos.'});
    const banKey=moderationBanKey(c);
    const available=[...rooms.values()].filter(room=>publicRoomCompatible(room,m)&&['lobby','countdown','loading'].includes(room.status)&&(!room.lobbyExpiresAt||room.lobbyExpiresAt>Date.now())&&!(banKey&&room.banned?.has(banKey))).map(roomListing);
    send(ws,{type:'room_list',requestId:m.requestId,rooms:available});return;
  }
  if(m.type==='room_info'){
    const fail=message=>error(ws,message,{request:'room_info',requestId:m.requestId});
    const code=String(m.code||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6);
    if(!/^[A-Z0-9]{6}$/.test(code))return fail('O código precisa ter 6 letras maiúsculas ou números.');
    const room=rooms.get(code);if(!room)return fail('Sala inexistente. Confira o código de 6 caracteres.');
    if(m.publicEntry===true&&!publicRoomCompatible(room,m))return fail(room.privacy!=='public'?'Esta sala ficou privada. Entre usando o código.':'Esta sala não corresponde mais aos filtros selecionados.');
    ensureModeration(room);const banKey=moderationBanKey(c);if(banKey&&room.banned.has(banKey))return fail(`Você foi banido da sala ${room.code}. Você não pode mais voltar.`);
    if(!['lobby','countdown','loading'].includes(room.status)||room.lobbyExpiresAt&&room.lobbyExpiresAt<=Date.now())return fail('Esta sala já começou ou foi encerrada.');
    send(ws,{type:'room_info',requestId:m.requestId,room:roomListing(room)});return;
  }
  if(m.type==='join_room'){
    if(c.roomCode)return error(ws,'Você já está em uma sala. Saia dela antes de entrar em outra.');
    if(rejectDuplicateAccountSlot(c))return;
    const code=String(m.code||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6);
    if(!/^[A-Z0-9]{6}$/.test(code))return error(ws,'O código precisa ter 6 letras maiúsculas ou números.');
    const room=rooms.get(code);
    if(!room)return error(ws,'Sala inexistente. Confira o código de 6 caracteres.');
    if(m.publicEntry===true&&!publicRoomCompatible(room,m))return error(ws,room.privacy!=='public'?'Esta sala ficou privada. Entre usando o código.':'Esta sala não corresponde mais aos filtros selecionados.');
    ensureModeration(room);const banKey=moderationBanKey(c);if(banKey&&room.banned.has(banKey))return error(ws,`Você foi banido da sala ${room.code}. Você não pode mais voltar.`);
    if(!['lobby','countdown','loading'].includes(room.status)||room.lobbyExpiresAt&&room.lobbyExpiresAt<=Date.now())return error(ws,'Esta sala já começou ou foi encerrada.');
    if(room.players.length+room.bots>=room.size)return error(ws,'Sala lotada. O host precisa remover bots para liberar uma vaga.');
    const cancelled=invalidateCountdown(room);
    const player={id:c.id,name:safeText(m.name||c.name),color:pickColor(m.color||c.color,room),ready:false,cosmetics:cleanCosmeticsForClient(m.cosmetics,c)};
    room.players.push(player);c.name=player.name;c.color=player.color;c.roomCode=code;c.rematchCode=null;c.rematchProfile=null;
    sendRoomState(room);
    if(cancelled)broadcast(room,{type:'countdown_cancelled',reason:'Um jogador entrou. A contagem foi cancelada.'});
    return;
  }
  // Um jogador pode apertar "Jogar de Novo" exatamente no intervalo entre o
  // host recriar a sala e o aviso de revanche chegar ao navegador. Nesse caso ele
  // já não possui roomCode, mas ainda tem uma vaga/perfil vinculados à mesma sala.
  // Aceitamos o pedido diretamente para não exigir um segundo clique.
  if(m.type==='rematch'&&!c.roomCode&&c.rematchCode){
    if(rejectDuplicateAccountSlot(c))return;
    const code=String(c.rematchCode||''),rematchRoom=rooms.get(code);
    if(!rematchRoom||rematchRoom.status!=='lobby'||!rematchRoom.rematchLobby){c.rematchCode=null;c.rematchProfile=null;return error(ws,'A nova sala não está mais disponível.')}
    if(rematchRoom.players.some(p=>p.id===c.id)){c.roomCode=code;c.rematchCode=null;c.rematchProfile=null;sendRoomState(rematchRoom);return}
    if(rematchRoom.players.length+rematchRoom.bots>=rematchRoom.size)return error(ws,'Sala lotada. O host precisa remover bots para liberar uma vaga.');
    const saved=c.rematchProfile&&typeof c.rematchProfile==='object'?c.rematchProfile:{};
    const player={id:c.id,name:safeText(saved.name||c.name),color:pickColor(saved.color||c.color,rematchRoom),ready:false,cosmetics:cleanCosmeticsForClient(saved.cosmetics,c)};
    rematchRoom.players.push(player);c.name=player.name;c.color=player.color;c.roomCode=code;c.rematchCode=null;c.rematchProfile=null;
    sendRoomState(rematchRoom);return;
  }
  const room=roomFor(c);
  if(m.type==='leave_room'){detachFromRoom(c);return}
  if(!room)return error(ws,'Você não está em uma sala.');
  const isHost=room.hostId===c.id;
  if(room.ending&&!['leave_room','ready','sensor_unsubscribe'].includes(m.type))return;
  if(NewNeutrals.handle(room,c,m)||Gemini.ack(room,c,m))return;
  if(m.type==='lobby_input'){if(room.status==='lobby')LobbyRules.input(room,c.id,m,Date.now());return}
  if(m.type==='authority_ready'){const h=room.authorityTransfer;if(isHost&&h&&m.epoch===h.epoch&&m.round===room.round&&m.nonce===h.nonce&&m.seq===h.seq){room.authorityTransfer=null;room.lastAuthorityAt=Date.now();sendRoomState(room);sendCaptainOrder(room);sendSheriffOrders(room);NewNeutrals.publish(room);Gemini.dispatch(room)}return}
  if(c.checkpointProtocol&&['state_snapshot','motion_state','game_end','meeting_chat','sabotage_ack'].includes(m.type)&&(room.authorityTransfer||Number(m.authorityEpoch)!==(room.authorityEpoch||0)||(m.round!==undefined&&m.round!==room.round)))return;
  if(m.type==='set_room_privacy'){
    if(!isHost)return error(ws,'Somente o host pode alterar a privacidade da sala.');
    if(room.status!=='lobby')return error(ws,'A privacidade só pode ser alterada na sala de espera.');
    if(!['private','public'].includes(m.privacy))return;
    room.privacy=m.privacy;sendRoomState(room);return;
  }
  if(m.type==='moderate_lobby'){
    if(!isHost)return error(ws,'Somente o host pode expulsar ou banir jogadores na sala de espera.');
    if(room.status!=='lobby')return error(ws,'A punição da sala de espera só funciona antes da partida.');
    const targetId=String(m.targetId||''),action=String(m.action||'');
    if(!['kick','ban'].includes(action))return error(ws,'Ação de punição inválida.');
    if(!targetId||targetId===c.id||targetId===room.hostId)return error(ws,'Não é possível aplicar essa ação ao host atual.');
    const target=clients.get(targetId);if(!target||target.roomCode!==room.code)return error(ws,'Jogador não encontrado nesta sala.');
    ensureModeration(room);if(action==='ban'){const key=moderationBanKey(target);if(key)room.banned.add(key)}
    const hostPlayer=room.players.find(p=>p.id===c.id),targetPlayer=room.players.find(p=>p.id===targetId);
    const notice=`${hostPlayer?.name||'Host'} ${action==='ban'?'baniu':'expulsou'} ${targetPlayer?.name||'jogador'}`;
    if(removePlayerByModeration(room,targetId,action))broadcast(room,{type:'room_chat_system',roomCode:room.code,text:notice,at:Date.now()});return;
  }
  if(m.type==='moderation_vote'){
    if(room.status!=='playing'||room.lastSnapshot?.state!=='meeting')return error(ws,'A votação de expulsão só fica disponível durante reuniões.');
    const targetId=String(m.targetId||'');if(!targetId||targetId===c.id)return error(ws,'Escolha outro jogador online.');
    if(!room.players.some(p=>p.id===targetId))return error(ws,'Esse jogador não está mais na sala.');
    if(!snapshotAlive(room,c.id))return error(ws,'Jogadores eliminados não participam da votação de punição.');
    const rule=moderationRule(room,targetId);if(!rule.possible||!rule.eligible.includes(c.id))return error(ws,'Não há jogadores suficientes para essa expulsão.');
    const votes=ensureModeration(room),set=votes.get(targetId)||new Set();set.add(c.id);votes.set(targetId,set);evaluateModeration(room);return;
  }
  if(m.type==='set_room'){
    if(!isHost)return error(ws,'Somente o host pode alterar as configurações.');
    if(room.status!=='lobby')return error(ws,'As configurações só podem ser alteradas antes da contagem regressiva.');
    if(m.size!==undefined&&Number(m.size)!==room.size)return error(ws,'O tamanho da sala é definido antes de criá-la e não pode ser alterado depois.');
    const humans=room.players.length;
    const bots=Math.min(room.size-humans,Math.max(0,Math.round(Number.isFinite(Number(m.bots))?Number(m.bots):room.bots)));
    if(humans+bots>room.size)return error(ws,'A sala não comporta essa quantidade de bots.');
    room.bots=bots;room.settings=cleanSettings({...room.settings,...(m.settings&&typeof m.settings==='object'?m.settings:{})},room.size);sendRoomState(room);return;
  }
  if(m.type==='set_color'){
    if(room.status!=='lobby')return error(ws,'A cor só pode ser alterada na sala de espera.');
    const color=normalizeColor(m.color);if(!COLORS.includes(color))return error(ws,'Cor inválida.');
    const player=room.players.find(p=>p.id===c.id);if(!player)return;
    if(room.players.some(p=>p.id!==c.id&&p.color===color))return error(ws,'Essa cor já está em uso por outro jogador.');
    player.color=color;c.color=color;sendRoomState(room);return;
  }
  if(m.type==='set_cosmetics'){
    if(room.status!=='lobby')return error(ws,'Os cosméticos só podem ser alterados na sala de espera.');
    const player=room.players.find(p=>p.id===c.id);if(!player)return;
    player.cosmetics=cleanCosmeticsForClient(m.cosmetics,c);sendRoomState(room);return;
  }
  if(m.type==='start_game'){
    if(!isHost)return error(ws,'Somente o host pode iniciar a partida.');
    if(room.status!=='lobby')return error(ws,'Esta sala não está aguardando início.');
    startGame(room,!!room.rematchLobby,timings);return;
  }
  if(m.type==='cancel_start'){
    if(!isHost)return error(ws,'Somente o host pode cancelar o início.');
    if(!['countdown','loading'].includes(room.status))return;
    if(invalidateCountdown(room)){sendRoomState(room);broadcast(room,{type:'countdown_cancelled',reason:'Início cancelado pelo host.'})}
    return;
  }
  if(m.type==='rematch'){
    // Jogar de Novo recria a sala de espera no MESMO código. Quem pedir antes do
    // host fica em espera; quem pedir depois entra novamente pela sala recriada.
    if(!isHost){
      if(room.status!=='ended')return error(ws,'A nova sala ainda não está disponível.');
      if(!(room.rematchWaiters instanceof Set))room.rematchWaiters=new Set();
      room.rematchWaiters.add(c.id);send(ws,{type:'rematch_waiting',code:room.code});return;
    }
    if(room.status!=='ended')return error(ws,'A partida ainda não terminou.');
    invalidateCountdown(room);
    const previousPlayers=room.players.map(p=>({...p,cosmetics:cleanCosmetics(p.cosmetics)}));
    const hostPlayer=previousPlayers.find(p=>p.id===room.hostId);const waiters=room.rematchWaiters instanceof Set?new Set(room.rematchWaiters):new Set();
    room.status='lobby';room.lastSnapshot=null;room.authorityTransfer=null;room.aiCheckpoint=null;room.ghostChatHistory=[];room.winner=null;room.endReason='';room.rematchPending=false;room.rematchLobby=true;room.countdownRoster=null;resetLobbyExpiry(room,room.lobbyMaxMs||timings.lobbyMaxMs||600000);
    room.modVotes=new Map();room.modStateSig='';room.players=[];
    if(hostPlayer){hostPlayer.ready=false;room.players.push(hostPlayer);const hc=clients.get(hostPlayer.id);if(hc){hc.roomCode=room.code;hc.rematchCode=null;hc.rematchProfile=null}}
    // Os demais deixam a partida encerrada. Quem já apertou Jogar de Novo é
    // reanexado imediatamente; os outros guardam uma referência temporária da
    // revanche para que um clique feito durante a transição não seja perdido.
    for(const p of previousPlayers){
      if(p.id===room.hostId)continue;const target=clients.get(p.id);if(!target)continue;target.roomCode=null;target.rematchCode=room.code;target.rematchProfile={...p,cosmetics:cleanCosmetics(p.cosmetics)};
      if(waiters.has(p.id)&&room.players.length+room.bots<room.size){p.ready=false;room.players.push(p);target.roomCode=room.code;target.rematchCode=null;target.rematchProfile=null}
      else send(target.ws,{type:'rematch_available',code:room.code});
    }
    room.rematchWaiters=new Set();sendRoomState(room);return;
  }
  if(m.type==='gesture_request'){
    if(room.mode!=='mimica'||room.status!=='playing'||!room.lastSnapshot)return;const actor=sabotageActor(room,c,m);if(!actor)return;
    if(GestureRules.apply(roomGestures(room),room.lastSnapshot,actor.id,m,Date.now(),room.settings.gestureCooldown))sendGestures(room);return;
  }
  if(m.type==='sensor_subscribe'){if(!sensorTerminalAccess(room,c.id)){send(c.ws,{type:'sensor_unavailable',code:room.code,round:room.round});return}const s=roomSurveillance(room),blocked=(room.lastSnapshot.sab?.comms||0)>0;s.watchers.set(c.id,{blocked});sendSensorHistory(room,c,blocked);return}
  if(m.type==='sensor_unsubscribe'){room.surveillance?.watchers.delete(c.id);return}
  if(m.type==='sheriff_request'){handleSheriffRequest(room,c,m);return}
  if(m.type==='captain_request'){handleCaptainRequest(room,c,m);return}
  if(m.type==='captain_ack'){if(isHost&&m.round===room.round&&m.epoch===(room.authorityEpoch||0)&&m.id===room.captainPending?.id&&m.success===false)cancelCaptainCall(room);return}
  if(m.type==='ninja_request'){
    if(!classicRoom(room)||room.status!=='playing'||room.lastSnapshot?.state!=='playing')return;
    const ch=sabotageActor(room,c,m);if(!ch||!ch.alive||ch.role!=='imp'||ch.function!=='ninja'||ch.vent&&ch.ninja?.phase!=='away'||ch.controlledBy||ch.controlTargetId||ch.killDash||ch.minerDig||ch.morphTransition||ch.ninja&&ch.ninja.phase!=='away'||!ch.ninja&&(ch.ninjaCd||0)>0)return;
    if(!room.ninjaRequests)room.ninjaRequests=new Map();const now=Date.now(),phase=ch.ninja?.phase||'idle',previous=room.ninjaRequests.get(ch.id);if(previous?.phase===phase&&now-previous.at<1500)return;room.ninjaRequests.set(ch.id,{phase,at:now});
    const host=clients.get(room.hostId);if(host)send(host.ws,{type:'host_command',command:'ninja',playerId:ch.id});return;
  }
  if(m.type==='sabotage_request'){handleSabotageRequest(room,c,m);return}
  if(m.type==='door_repair_begin'||m.type==='door_repair_finish'){handleDoorRepair(room,c,m);return}
  if(m.type==='sabotage_ack'){if(isHost&&room.doorControl?.main?.type===m.sabotage&&m.success===false){room.doorControl.main=null;room.doorControl.revision++;publishDoorControl(room)}return}
  if(m.type==='game_end'){
    if(!isHost)return;
    if(room.status!=='playing')return;
    const finalSnapshot=m.snapshot&&typeof m.snapshot==='object'&&Array.isArray(m.snapshot.chars)?m.snapshot:null;
    if(classicRoom(room)){if(!finalSnapshot||!NewNeutrals.validate(room,finalSnapshot))return;const previous=room.lastSnapshot;syncSheriffSnapshot(room,finalSnapshot);if(!syncCaptainSnapshot(room,finalSnapshot))return;if(!MatchRules.eventsAllowed(room.mode,room.settings)&&(finalSnapshot.state==='meeting'||finalSnapshot.meeting||['lights','reactor','oxygen','comms','doors'].some(k=>finalSnapshot.sab?.[k]>0)))return;room.lastSnapshot=finalSnapshot;NewNeutrals.sync(room,finalSnapshot);Match.evaluate(room,previous,m);return}
    const hpResult=room.mode==='batata-quente'?hotPotatoResult(room,finalSnapshot):null;
    if(room.mode==='batata-quente'&&!hpResult)return;
    room.status='ended';room.winner=hpResult?(hpResult.winnerIds.length?'crew':'imp'):classicRoom(room)&&m.winner==='neutral'?'neutral':m.winner==='imp'?'imp':'crew';room.endReason=safeText(m.reason,160,'A partida terminou.');
    if(hpResult){finalSnapshot.hp={...finalSnapshot.hp,...hpResult,endPending:false};finalSnapshot.over=true;finalSnapshot.state='over';finalSnapshot.winner=room.winner;finalSnapshot.endReason=room.endReason;}
    if(finalSnapshot)room.lastSnapshot=moderateSnapshotChat(sanitizeModeSnapshot(room,finalSnapshot));
    for(const p of room.players){if(p.id===c.id&&!hpResult)continue;const target=clients.get(p.id);if(target)send(target.ws,{type:'game_end',winner:room.winner,reason:room.endReason,snapshot:finalSnapshot?personalizeSnapshot(finalSnapshot,p.id):null});}
    sendRoomState(room);return;
  }
  if(m.type==='state_snapshot'){
    if(!isHost||!['loading','playing'].includes(room.status)||!m.snapshot||typeof m.snapshot!=='object')return;
    const previousSnapshot=room.lastSnapshot;
    if(c.checkpointProtocol&&previousSnapshot&&(!Number.isFinite(m.snapshot.seq)||m.snapshot.seq<=previousSnapshot.seq))return;
    if(!NewNeutrals.validate(room,m.snapshot)){NewNeutrals.resend(room);return}
    if(!MatchRules.eventsAllowed(room.mode,room.settings)&&(m.snapshot.state==='meeting'||m.snapshot.meeting||['lights','reactor','oxygen','comms','doors'].some(k=>m.snapshot.sab?.[k]>0)))return;
    syncSheriffSnapshot(room,m.snapshot);
    if(!syncCaptainSnapshot(room,m.snapshot))return;
    mergeAuthorityCheckpoint(room,m.snapshot);room.lastAuthorityAt=Date.now();
    const wasMeeting=previousSnapshot?.state==='meeting',isMeeting=m.snapshot.state==='meeting';
    const meetingStarted=!wasMeeting&&isMeeting&&m.snapshot.meeting;
    if(meetingStarted)room.meetingEvent={id:room.createdAt+':'+room.round+':'+(room.meetingSerial=(room.meetingSerial||0)+1),kind:m.snapshot.meeting.reason==='body'?'body':'emergency',callerId:m.snapshot.meeting.callerId};
    if(isMeeting&&room.meetingEvent)m.snapshot.meeting.audioEventId=room.meetingEvent.id;else if(!isMeeting)room.meetingEvent=null;
    syncDoorSnapshot(room,m.snapshot);moderateSnapshotChat(m.snapshot);sanitizeModeSnapshot(room,m.snapshot);room.lastSnapshot=m.snapshot;NewNeutrals.sync(room,m.snapshot);if(room.ending||room.status==='ended')return;if(Match.evaluate(room,previousSnapshot))return;updateSurveillance(room);Gemini.annotate(room,m.snapshot);Gemini.tick(room);
    // Quando um humano passa a morto, recebe o histórico privado do canal dos mortos.
    // Esse histórico nunca é incluído no room_state/snapshot enviado aos vivos.
    for(const p of room.players){
      const before=previousSnapshot?.chars?.find(ch=>String(ch.id)===String(p.id));
      const after=m.snapshot?.chars?.find(ch=>String(ch.id)===String(p.id));
      if(room.mode!=='mimica'&&after?.alive===false&&before?.alive!==false){const target=clients.get(p.id);if(target)send(target.ws,{type:'ghost_chat_history',messages:Array.isArray(room.ghostChatHistory)?room.ghostChatHistory:[]})}
    }
    ensureModeration(room);if(wasMeeting!==isMeeting)room.modVotes=new Map();
    if(isMeeting){if(!evaluateModeration(room)){} }else if(wasMeeting!==isMeeting)broadcastModeration(room);
    if(!clients.get(c.id)||c.roomCode!==room.code)return;
    // A transição para reunião é prioritária e nunca é descartada por backpressure.
    // Ela leva o snapshot autoritativo completo: chamador, motivo, corpo, participantes,
    // cronômetros e estado de votação. Os snapshots periódicos continuam descartáveis.
    if(meetingStarted){
      send(c.ws,{type:'meeting_event',round:room.round,code:room.code,...room.meetingEvent});
      for(const p of room.players){if(p.id===c.id)continue;const target=clients.get(p.id);if(target)send(target.ws,{type:'meeting_start',snapshot:personalizeSnapshot(m.snapshot,p.id)});}
    }
    for(const p of room.players){
      if(p.id===c.id)continue;
      const target=clients.get(p.id);
      // Evita acumular snapshots antigos em clientes com conexão lenta; o próximo
      // snapshot completo substitui o anterior, então descartar um atrasado é seguro.
      if(target && (target.ws.socket?.writableLength||0)<512*1024)send(target.ws,{type:'snapshot',snapshot:personalizeSnapshot(m.snapshot,p.id)});
    }
    return;
  }
  if(m.type==='motion_state'){
    if(!isHost||room.status!=='playing'||!m.motion||typeof m.motion!=='object'||!Array.isArray(m.motion.chars))return;
    // Ninja requests use the same most recent authoritative ability state already sent to clients.
    if(classicRoom(room))for(const record of m.motion.chars){const ch=room.lastSnapshot?.chars?.find(ch=>ch.id===record.id&&ch.function==='ninja');if(ch&&Object.hasOwn(record,'ninja')){ch.ninja=record.ninja;ch.ninjaCd=Math.max(0,Number(record.ninjaCd)||0)}}
    updateSurveillance(room,m.motion);
    // Movimento usa um canal leve e descartável. Se a fila de um cliente crescer,
    // é melhor pular um frame de movimento do que entregar posições antigas depois.
    for(const p of room.players){
      if(p.id===c.id)continue;
      const target=clients.get(p.id);
      if(target && (target.ws.socket?.writableLength||0)<128*1024)send(target.ws,{type:'motion',motion:{...m.motion,chars:m.motion.chars.map(ch=>{if(ch.id===p.id)return ch;const copy={...ch};delete copy.ninjaCd;delete copy.minerCd;if(copy.ninja)copy.ninja={phase:copy.ninja.phase};return copy})}});
    }
    return;
  }
  if(m.type==='input'){
    if(isHost||room.status!=='playing')return;
    const host=clients.get(room.hostId);if(host)send(host.ws,{type:'host_command',command:'input',playerId:c.id,x:Math.max(-1,Math.min(1,Number(m.x)||0)),y:Math.max(-1,Math.min(1,Number(m.y)||0)),inputSeq:Math.max(0,Math.floor(Number(m.inputSeq)||0))});return;
  }
  if(m.type==='action'){
    if(isHost||room.status!=='playing')return;
    const action=String(m.action||'');
    if(!MatchRules.eventsAllowed(room.mode,room.settings)&&['sabotage','report','emergency'].includes(action))return;
    if(action==='sheriff_shoot'){handleSheriffRequest(room,c,m);return}
    if(action==='sabotage'){handleSabotageRequest(room,c,m);return}
    if(action==='hp_pass'&&room.mode!=='batata-quente')return;
    if(room.mode==='esconde-esconde'&&action==='task_complete'&&room.lastSnapshot?.hns?.phase==='final')return;
    if(room.mode==='esconde-esconde'&&!new Set(['input','kill','vent_enter','vent_move','vent_exit','task_complete','decon_button']).has(action))return;if(room.mode==='batata-quente'&&!['input','hp_pass','task_complete','decon_button'].includes(action))return;const allowed=new Set(['reactor_hold','hp_pass','kill','report','emergency','locator','sheriff_shoot','delayed_mark','parasite_infect','mine_dig','mine_enter','morph','spectral_toggle','instructor_select','instructor_mark','clean_body','revive_body','seer_inspect','control','control_release','hunter_target','guardian_protect','sabotage','vent_enter','vent_move','vent_exit','task_complete','vote','chat','decon_button']);if(!allowed.has(action))return;
    if(action==='chat'){if(room.mode==='mimica')return;if(room.lastSnapshot?.state!=='meeting'||!['discuss','vote','result'].includes(room.lastSnapshot?.meeting?.phase)||!snapshotAlive(room,c.id))return;const now=Date.now();if(now-(c.lastMeetingChatAt||0)<3000)return;c.lastMeetingChatAt=now}
    const host=clients.get(room.hostId);if(!host)return;
    const allowedData={command:action,playerId:c.id};
    for(const k of ['targetId','x','y','sabotage','ventId','stationId','taskId','stepId','fix','text','claim','hpSeq'])if(m[k]!==undefined)allowedData[k]=m[k];if(action==='reactor_hold')allowedData.holding=m.holding===true;if(action==='chat')allowedData.text=moderateChat(String(m.text||'').slice(0,180));if(m.bodyId!==undefined)allowedData.bodyId=m.bodyId;
    send(host.ws,{type:'host_command',...allowedData});return;
  }
  if(m.type==='ghost_chat'){
    if(room.mode==='mimica')return;
    if(room.status!=='playing'||room.lastSnapshot?.state==='meeting')return;
    const player=room.players.find(p=>p.id===c.id);if(!player||snapshotAlive(room,c.id))return;
    const text=moderateChat(String(m.text||'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,180));if(!text)return;
    const now=Date.now();if(now-(c.lastGhostChatAt||0)<3000)return;c.lastGhostChatAt=now;
    if(!Array.isArray(room.ghostChatHistory))room.ghostChatHistory=[];
    const entry={roomCode:room.code,playerId:c.id,name:player.name,color:player.color,text,quick:m.quick===true,at:now};room.ghostChatHistory.push(entry);if(room.ghostChatHistory.length>80)room.ghostChatHistory.splice(0,room.ghostChatHistory.length-80);
    // Privacidade real do canal: o servidor envia a mensagem apenas para humanos mortos.
    for(const p of room.players){if(snapshotAlive(room,p.id))continue;const target=clients.get(p.id);if(target)send(target.ws,{type:'ghost_chat_message',...entry})}
    return;
  }
  if(m.type==='room_config_notice'){
    if(!isHost)return error(ws,'Somente o host pode anunciar alterações de configuração.');
    if(room.status!=='lobby')return;
    const text=String(m.text||'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,220);if(!text)return;
    broadcast(room,{type:'room_config_notice',roomCode:room.code,text,at:Date.now()});return;
  }
  if(m.type==='room_chat'){
    if(room.status!=='lobby')return error(ws,'O chat escrito só fica disponível na sala de espera.');
    const player=room.players.find(p=>p.id===c.id);if(!player)return;
    const text=moderateChat(String(m.text||'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,180));if(!text)return;
    const now=Date.now();if(now-(c.lastRoomChatAt||0)<3000)return;c.lastRoomChatAt=now;
    broadcast(room,{type:'room_chat_message',roomCode:room.code,playerId:c.id,name:player.name,color:player.color,text,at:now});return;
  }
  if(m.type==='meeting_chat'){
    if(room.mode==='mimica')return;
    if(!isHost||room.status!=='playing'||room.lastSnapshot?.state!=='meeting'||!['discuss','vote','result'].includes(room.lastSnapshot?.meeting?.phase)||!room.lastSnapshot?.chars?.some(ch=>ch.id===m.playerId&&ch.alive))return;
    broadcast(room,{type:'meeting_chat',playerId:String(m.playerId||''),text:moderateChat(String(m.text||'').slice(0,180))},c.id);return;
  }
  if(m.type==='ready'){
    const p=room.players.find(p=>p.id===c.id);if(p)p.ready=true;sendRoomState(room);return;
  }
}
const ACCOUNT_SESSION_COOKIE='nz_session';
const ACCOUNT_SESSION_MAX_AGE=60*60*24*30;
const ACCOUNT_ID_STYLES=[
  {a:['Cosmic','Mystic','Shadow','Neon','Silent','Golden','Solar','Lunar','Nova','Crystal','Swift','Bright','Silver','Storm','Frost','Ember','Iron','Star','Astral','Orbit'],b:['Panda','Gamer','Wolf','Tornado','Ninja','Phoenix','Falcon','Raven','Tiger','Comet','Pilot','Scout','Otter','Shark','Gecko','Lynx','Beacon','Rider','Wing','Moon']},
  {a:['Dancing','Space','Radioactive','Flying','Socks','Turbo','Bouncy','Sneaky','Jumpy','Fuzzy','Wobbly','Rocket','Pixel','Banana','Bubble','Disco','Noodle','Happy','Crazy','Tiny'],b:['Cactus','Avocado','Cat','Potato','Tiger','Chicken','Penguin','Llama','Taco','Donut','Duck','Pigeon','Pickle','Muffin','Hamster','Pancake','Toaster','Cookie','Koala','Gull']},
  {a:['Ghost','Cyber','Alpha','Dark','Eternal','Furious','Iron','Titan','Void','Omega','Storm','Blaze','Crimson','Savage','Prime','Rapid','Steel','Rogue','Ultra','Venom'],b:['Vortex','Titan','Impact','Phantom','Frost','Rex','Blade','Crusher','Strike','Hunter','Reaper','Core','Pulse','Fang','Nova','Knight','Storm','Force','Drake','Claw']},
  {a:['Digital','Sonic','Ancient','Visual','Cold','Lunar','Quantum','Electric','Velvet','Static','Hidden','Parallel','Prism','Echo','Binary','Infinite','Solar','Midnight','Crystal','Neural'],b:['Origami','Breeze','Spark','Silence','Nebula','Echo','Mirage','Dream','Signal','Horizon','Canvas','Pulse','Orbit','Paradox','Glyph','Wave','Memory','Spectrum','Whisper','Fragment']}
];
const ACCOUNT_KEY_ACTIONS=new Set(['killMark','sabotage','use','function','moveUp','moveDown','moveLeft','moveRight','increase','decrease','map','report','quickChat','back','exit']);
function jsonResponse(res,status,data,extra={}){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer',...extra});res.end(JSON.stringify(data))}
function parseCookies(req){const out={};for(const part of String(req.headers.cookie||'').split(';')){const i=part.indexOf('=');if(i<0)continue;const k=part.slice(0,i).trim(),v=part.slice(i+1).trim();if(k)out[k]=decodeURIComponent(v)}return out}
function sessionCookie(req,token,maxAge=ACCOUNT_SESSION_MAX_AGE){const secure=String(req.headers['x-forwarded-proto']||'').split(',')[0].trim()==='https'||!!req.socket?.encrypted;return `${ACCOUNT_SESSION_COOKIE}=${encodeURIComponent(token||'')}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.max(0,Math.floor(maxAge))}${secure?'; Secure':''}`}
function readJsonBody(req,maxBytes=64*1024){return new Promise((resolve,reject)=>{let total=0,parts=[];req.on('data',chunk=>{total+=chunk.length;if(total>maxBytes){reject(Object.assign(new Error('Corpo muito grande'),{status:413}));req.destroy();return}parts.push(chunk)});req.on('end',()=>{try{resolve(parts.length?JSON.parse(Buffer.concat(parts).toString('utf8')):{})}catch{reject(Object.assign(new Error('JSON inválido'),{status:400}))}});req.on('error',reject)})}
function cleanAccountKeys(input){const out={};const src=input&&typeof input==='object'?input:{};for(const key of ACCOUNT_KEY_ACTIONS){const v=src[key];if(v===null)out[key]=null;else if(typeof v==='string'&&v.length<=40&&/^[A-Za-z0-9]+$/.test(v))out[key]=v}return out}
function cleanAccountProfile(input={},protectedInput=null){const src=input&&typeof input==='object'?input:{};const protectedSrc=protectedInput&&typeof protectedInput==='object'?protectedInput:src;const personal=src.personalSettings&&typeof src.personalSettings==='object'?src.personalSettings:{};const room=src.roomSettings&&typeof src.roomSettings==='object'?src.roomSettings:{};const size=Math.min(15,Math.max(4,Math.round(Number(room.size)||10)));const bots=Math.min(size-1,Math.max(0,Math.round(Number(room.bots)||0)));const exclusiveCosmetics=cleanExclusiveCosmeticIds(protectedSrc.exclusiveCosmetics),owned=new Set(exclusiveCosmetics),cosmetics=cleanCosmetics(src.cosmetics);for(const [slot,id] of Object.entries(cosmetics))if(EXCLUSIVE_COSMETIC_BY_ID.has(id)&&!owned.has(id))cosmetics[slot]='none';return {name:safeText(src.name,12,'Você'),color:COLORS.includes(normalizeColor(src.color))?normalizeColor(src.color):'azul',cosmetics,exclusiveCosmetics,redeemedExclusiveCodes:cleanRedeemedExclusiveCodes(protectedSrc.redeemedExclusiveCodes),personalSettings:{volume:Math.min(2,Math.max(0,Number.isFinite(Number(personal.volume))?Number(personal.volume):1)),keys:cleanAccountKeys(personal.keys),streamerMode:personal.streamerMode===true,orientation:personal.orientation==='landscape'?'landscape':'portrait',uiSize:personal.uiSize!==null&&personal.uiSize!==''&&Number.isFinite(Number(personal.uiSize))?Math.min(100,Math.max(10,Math.round(Number(personal.uiSize)/5)*5)):50,language:ROOM_LANGUAGES.has(String(personal.language||''))?String(personal.language):'pt-BR'},roomSettings:{mode:ROOM_MODES.has(room.mode)?room.mode:'classic',privacy:room.privacy==='public'?'public':'private',region:ROOM_REGIONS.has(room.region)?room.region:'',language:ROOM_LANGUAGES.has(room.language)?room.language:'',mapId:MAP_IDS.has(String(room.mapId||''))?String(room.mapId):'nave',size,bots,cfg:cleanSettings(room.cfg&&typeof room.cfg==='object'?room.cfg:{},size)}}}
function createAccountService(opts={}){
  const supabaseUrl=String(opts.supabaseUrl||process.env.SUPABASE_URL||'').replace(/\/+$/,'');
  const supabaseSecretKey=String(opts.supabaseSecretKey||process.env.SUPABASE_SECRET_KEY||'').trim();
  const fetchImpl=opts.fetchImpl||globalThis.fetch;
  const attempts=new Map(),idPreviews=new Map(),redeemLocks=new Map();
  const redeemConfig=loadExclusiveRedeemCodes(opts.exclusiveRedeemCodes??process.env.NAVE_ZERO_REDEEM_CODES);
  if(!supabaseUrl||!supabaseSecretKey)console.warn('SUPABASE_URL/SUPABASE_SECRET_KEY não configurados: contas ficarão indisponíveis.');
  if(!redeemConfig.ready)console.error(`Sistema de resgate NÃO iniciado: ${redeemConfig.error}`);
  const tokenHash=token=>crypto.createHash('sha256').update(String(token||'')).digest('hex');
  const dbHeaders=(extra={})=>({'apikey':supabaseSecretKey,'content-type':'application/json','accept':'application/json',...extra});
  async function dbRequest(table,{method='GET',query='',body,prefer='return=representation'}={}){
    if(!supabaseUrl||!supabaseSecretKey||typeof fetchImpl!=='function')throw Object.assign(new Error('Banco de contas não configurado.'),{status:503});
    const url=`${supabaseUrl}/rest/v1/${table}${query?`?${query}`:''}`;
    const headers=dbHeaders(prefer?{prefer}:{});
    const res=await fetchImpl(url,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
    const text=await res.text();let data=null;try{data=text?JSON.parse(text):null}catch{data=text}
    if(!res.ok){const err=new Error(data?.message||data?.hint||`Erro do banco (${res.status}).`);err.status=res.status>=500?503:500;err.dbStatus=res.status;throw err}
    return data;
  }
  async function pruneSessions(){const nowIso=new Date().toISOString();try{await dbRequest('nzo_sessions',{method:'DELETE',query:`expires_at=lt.${encodeURIComponent(nowIso)}`,prefer:'return=minimal'})}catch(err){console.warn('Falha ao limpar sessões expiradas:',err.message)}}
  const accountFromRequest=async req=>{const token=parseCookies(req)[ACCOUNT_SESSION_COOKIE];if(!token)return null;const sessionHash=tokenHash(token);const sessions=await dbRequest('nzo_sessions',{query:`token_hash=eq.${encodeURIComponent(sessionHash)}&select=token_hash,account_id,expires_at&limit=1`});const sess=Array.isArray(sessions)?sessions[0]:null;if(!sess||new Date(sess.expires_at).getTime()<=Date.now())return null;const accounts=await dbRequest('nzo_accounts',{query:`id=eq.${encodeURIComponent(sess.account_id)}&select=id,password_hash,password_salt,profile,created_at,updated_at&limit=1`});const account=Array.isArray(accounts)?accounts[0]:null;return account?{account,sessionHash}:null};
  const createSession=async(req,accountId)=>{const token=crypto.randomBytes(32).toString('base64url'),now=Date.now(),expiresAt=new Date(now+ACCOUNT_SESSION_MAX_AGE*1000).toISOString();await dbRequest('nzo_sessions',{method:'POST',body:{token_hash:tokenHash(token),account_id:accountId,created_at:new Date(now).toISOString(),expires_at:expiresAt}});return {token,cookie:sessionCookie(req,token)}};
  const rateOk=req=>{const ip=String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'local').split(',')[0].trim();const now=Date.now(),cut=now-60_000,arr=(attempts.get(ip)||[]).filter(t=>t>cut);if(arr.length>=12){attempts.set(ip,arr);return false}arr.push(now);attempts.set(ip,arr);return true};
  const hashPassword=(password,salt)=>crypto.scryptSync(password,salt,64,{N:16384,r:8,p:1,maxmem:64*1024*1024}).toString('base64');
  const dummySalt=Buffer.alloc(16,7).toString('base64'),dummyHash=hashPassword('nave-zero-dummy-password',dummySalt);
  const passwordRecord=password=>{const salt=crypto.randomBytes(16).toString('base64');return {salt,hash:hashPassword(password,salt)}};
  const verifyPassword=(password,account)=>{const salt=account?.password_salt||dummySalt,expected=account?.password_hash||dummyHash;let actual;try{actual=hashPassword(password,salt)}catch{return false}const a=Buffer.from(actual,'base64'),b=Buffer.from(expected,'base64');return a.length===b.length&&crypto.timingSafeEqual(a,b)};
  const idAvailable=async id=>{const existing=await dbRequest('nzo_accounts',{query:`id=eq.${encodeURIComponent(id)}&select=id&limit=1`});return !Array.isArray(existing)||!existing.length};
  const randomAccountId=()=>{const style=ACCOUNT_ID_STYLES[crypto.randomInt(ACCOUNT_ID_STYLES.length)];return style.a[crypto.randomInt(style.a.length)]+style.b[crypto.randomInt(style.b.length)]+'#'+String(crypto.randomInt(10000)).padStart(4,'0')};
  const makeId=async()=>{for(let i=0;i<5000;i++){const id=randomAccountId();if(await idAvailable(id))return id}throw new Error('Não foi possível gerar um ID único')};
  const makeIdPreview=async()=>{const now=Date.now();for(const [token,item] of idPreviews)if(!item||item.expiresAt<=now)idPreviews.delete(token);const id=await makeId(),token=crypto.randomBytes(18).toString('base64url');idPreviews.set(token,{id,expiresAt:now+10*60_000});return {id,token}};
  const consumeIdPreview=token=>{const key=String(token||'');const item=idPreviews.get(key);idPreviews.delete(key);return item&&item.expiresAt>Date.now()?item.id:null};
  async function withRedeemLock(accountId,fn){const key=String(accountId||''),previous=redeemLocks.get(key)||Promise.resolve();let release;const gate=new Promise(resolve=>{release=resolve}),next=previous.then(()=>gate);redeemLocks.set(key,next);await previous;try{return await fn()}finally{release();if(redeemLocks.get(key)===next)redeemLocks.delete(key)}}
  const publicAccount=account=>{const profile=cleanAccountProfile(account.profile);delete profile.redeemedExclusiveCodes;return {id:account.id,profile,createdAt:new Date(account.created_at).getTime(),updatedAt:new Date(account.updated_at).getTime()}};
  async function handle(req,res,pathname){
    if(req.method==='OPTIONS'){res.writeHead(204,{'allow':'GET, POST, PATCH, OPTIONS','cache-control':'no-store'});res.end();return true}
    if(pathname==='/api/account/id-preview'&&req.method==='GET'){const preview=await makeIdPreview();jsonResponse(res,200,{ok:true,id:preview.id,token:preview.token});return true}
    if(pathname==='/api/account/exclusive-catalog'&&req.method==='GET'){const cosmetics=EXCLUSIVE_CONFIG.cosmetics.filter(x=>x.enabled).map(x=>({id:x.id,name:x.name,type:x.type,slot:x.slot,asset:x.asset,render:x.render}));jsonResponse(res,200,{ok:true,version:EXCLUSIVE_CONFIG.version,cosmetics});return true}
    if(pathname==='/api/account/me'&&req.method==='GET'){const auth=await accountFromRequest(req);if(!auth){jsonResponse(res,401,{ok:false,message:'Nenhuma conta conectada.'});return true}jsonResponse(res,200,{ok:true,account:publicAccount(auth.account)});return true}
    if(pathname==='/api/account/create'&&req.method==='POST'){
      if(!rateOk(req)){jsonResponse(res,429,{ok:false,message:'Muitas tentativas. Aguarde um pouco e tente novamente.'});return true}
      const body=await readJsonBody(req),password=String(body.password||'');if(password.length<8||password.length>128){jsonResponse(res,400,{ok:false,message:'A senha deve ter entre 8 e 128 caracteres.'});return true}
      const pw=passwordRecord(password),now=new Date().toISOString(),profile=cleanAccountProfile(body.profile,{exclusiveCosmetics:[],redeemedExclusiveCodes:[]});let id=consumeIdPreview(body.idPreviewToken),rows=null;
      for(let attempt=0;attempt<12;attempt++){
        if(!id||!(await idAvailable(id)))id=await makeId();
        try{rows=await dbRequest('nzo_accounts',{method:'POST',body:{id,password_hash:pw.hash,password_salt:pw.salt,profile,created_at:now,updated_at:now}});break}catch(err){if(err.dbStatus===409){id=null;continue}throw err}
      }
      if(!rows){jsonResponse(res,503,{ok:false,message:'Não foi possível gerar um ID único agora. Tente novamente.'});return true}
      const account=Array.isArray(rows)&&rows[0]?rows[0]:{id,password_hash:pw.hash,password_salt:pw.salt,profile,created_at:now,updated_at:now};const sess=await createSession(req,id);jsonResponse(res,201,{ok:true,account:publicAccount(account)},{'set-cookie':sess.cookie});return true
    }
    if(pathname==='/api/account/login'&&req.method==='POST'){
      if(!rateOk(req)){jsonResponse(res,429,{ok:false,message:'Muitas tentativas. Aguarde um pouco e tente novamente.'});return true}
      const body=await readJsonBody(req),id=String(body.id||'').trim(),password=String(body.password||'').slice(0,128);const rows=await dbRequest('nzo_accounts',{query:`id=eq.${encodeURIComponent(id)}&select=id,password_hash,password_salt,profile,created_at,updated_at&limit=1`});const account=Array.isArray(rows)?rows[0]:null;const valid=verifyPassword(password,account);if(!account||!valid){jsonResponse(res,401,{ok:false,message:'ID ou senha incorretos.'});return true}const sess=await createSession(req,account.id);jsonResponse(res,200,{ok:true,account:publicAccount(account)},{'set-cookie':sess.cookie});return true
    }
    if(pathname==='/api/account/profile'&&req.method==='PATCH'){
      const auth=await accountFromRequest(req);if(!auth){jsonResponse(res,401,{ok:false,message:'Sessão inválida ou expirada.'});return true}const body=await readJsonBody(req);
      return withRedeemLock(auth.account.id,async()=>{const fresh=await accountFromRequest(req);if(!fresh){jsonResponse(res,401,{ok:false,message:'Sessão inválida ou expirada.'});return true}
        const current=cleanAccountProfile(fresh.account.profile),next=cleanAccountProfile(body.profile,current),base=body.baseProfile&&typeof body.baseProfile==='object'?cleanAccountProfile(body.baseProfile,current):null;
        const merge=(now,before,after)=>{if(JSON.stringify(before)===JSON.stringify(after))return now;if(after&&typeof after==='object'&&!Array.isArray(after)){const out={...now};for(const k of Object.keys(after))out[k]=merge(now?.[k],before?.[k],after[k]);return out}return after};
        const profile=cleanAccountProfile(base?merge(current,base,next):next,current),updatedAt=new Date().toISOString();const rows=await dbRequest('nzo_accounts',{method:'PATCH',query:`id=eq.${encodeURIComponent(auth.account.id)}`,body:{profile,updated_at:updatedAt}});const account=Array.isArray(rows)&&rows[0]?rows[0]:{...fresh.account,profile,updated_at:updatedAt};jsonResponse(res,200,{ok:true,account:publicAccount(account)});return true})
    }
    if(pathname==='/api/account/redeem'&&req.method==='POST'){
      if(!redeemConfig.ready){jsonResponse(res,503,{ok:false,message:'Sistema de resgate indisponível.'});return true}
      const auth=await accountFromRequest(req);if(!auth){jsonResponse(res,401,{ok:false,message:'Entre em uma conta para resgatar códigos.'});return true}
      const body=await readJsonBody(req),code=String(body.code||'').trim();if(!/^[A-Za-z0-9]{10}$/.test(code)){jsonResponse(res,400,{ok:false,message:'Código inválido.'});return true}
      const codeDef=redeemConfig.codes.get(code),cosmetic=codeDef&&EXCLUSIVE_COSMETIC_BY_ID.get(codeDef.cosmeticId);if(!codeDef||!cosmetic){jsonResponse(res,400,{ok:false,message:'Código inválido.'});return true}
      return withRedeemLock(auth.account.id,async()=>{const fresh=await accountFromRequest(req);if(!fresh){jsonResponse(res,401,{ok:false,message:'Entre em uma conta para resgatar códigos.'});return true}const profile=cleanAccountProfile(fresh.account.profile),redeemed=new Set(profile.redeemedExclusiveCodes||[]);if(redeemed.has(code)){jsonResponse(res,409,{ok:false,message:'Você já resgatou este código.'});return true}
        redeemed.add(code);profile.redeemedExclusiveCodes=[...redeemed];profile.exclusiveCosmetics=cleanExclusiveCosmeticIds([...(profile.exclusiveCosmetics||[]),cosmetic.id]);
        const updatedAt=new Date().toISOString();const rows=await dbRequest('nzo_accounts',{method:'PATCH',query:`id=eq.${encodeURIComponent(fresh.account.id)}`,body:{profile,updated_at:updatedAt}});const account=Array.isArray(rows)&&rows[0]?rows[0]:{...fresh.account,profile,updated_at:updatedAt};
        for(const client of clients.values()){if(String(client?.accountId||'')!==String(fresh.account.id))continue;client.exclusiveCosmetics=new Set(profile.exclusiveCosmetics);send(client.ws,{type:'account_exclusive_updated',exclusiveCosmetics:profile.exclusiveCosmetics})}
        jsonResponse(res,200,{ok:true,message:'Cosmético desbloqueado!',cosmetic:{id:cosmetic.id,name:cosmetic.name,type:cosmetic.type,slot:cosmetic.slot,asset:cosmetic.asset,render:cosmetic.render},account:publicAccount(account)});return true})
    }
    if(pathname==='/api/account/logout'&&req.method==='POST'){
      const token=parseCookies(req)[ACCOUNT_SESSION_COOKIE];if(token){try{await dbRequest('nzo_sessions',{method:'DELETE',query:`token_hash=eq.${encodeURIComponent(tokenHash(token))}`,prefer:'return=minimal'})}catch{}}jsonResponse(res,200,{ok:true},{'set-cookie':sessionCookie(req,'',0)});return true
    }
    jsonResponse(res,404,{ok:false,message:'Rota de conta não encontrada.'});return true
  }
  if(supabaseUrl&&supabaseSecretKey)pruneSessions();
  return {handle,pruneSessions,accountFromRequest};
}

function createGameServer(opts={}){
  const port=opts.port??PORT;const host=opts.host??HOST;const accountService=createAccountService(opts);const sendStatic=createStaticSender();
  const server=http.createServer((req,res)=>{
    const pathname=new URL(req.url||'/',`http://${req.headers.host||'localhost'}`).pathname;
    if(pathname.startsWith('/api/account/')){accountService.handle(req,res,pathname).catch(err=>{if(res.headersSent)return;jsonResponse(res,err?.status||500,{ok:false,message:err?.status&&err.status<500?err.message:'Erro interno ao processar a conta.'})});return}
    if(pathname==='/health'){res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({ok:true,rooms:rooms.size,clients:clients.size}));return}
    if(pathname==='/languages.json'){void sendStatic(req,res,LANGUAGES_FILE,'application/json; charset=utf-8',500);return}
    if(pathname==='/'||pathname==='/index.html'){void sendStatic(req,res,HTML_FILE,'text/html; charset=utf-8',500);return}
    if(pathname.startsWith('/assets/')){
      let assetPath;try{assetPath=decodeURIComponent(pathname);if(assetPath.includes('\0'))throw Error('Caminho inválido')}catch{res.writeHead(400);res.end('Caminho inválido');return}
      const filePath=path.join(__dirname,assetPath);
      if(!filePath.startsWith(path.join(__dirname,'assets')+path.sep)) {res.writeHead(403);res.end('Proibido');return}
      const ext=path.extname(filePath).toLowerCase();if(['.js','.css','.json'].includes(ext)){void sendStatic(req,res,filePath,ext==='.js'?'text/javascript; charset=utf-8':ext==='.css'?'text/css; charset=utf-8':'application/json; charset=utf-8');return}
      fs.readFile(filePath,(err,data)=>{
        if(err){res.writeHead(404,{'content-type':'text/plain; charset=utf-8'});res.end('Não encontrado');return}
        const ext=path.extname(filePath).toLowerCase();
        const type=ext==='.json'?'application/json; charset=utf-8':ext==='.css'?'text/css; charset=utf-8':ext==='.js'?'text/javascript; charset=utf-8':ext==='.png'?'image/png':ext==='.jpg'||ext==='.jpeg'?'image/jpeg':ext==='.webp'?'image/webp':ext==='.woff'?'font/woff':ext==='.mp3'?'audio/mpeg':ext==='.m4a'?'audio/mp4':'application/octet-stream';
        const cacheControl=ext==='.js'||ext==='.css'||ext==='.json'?'no-cache':'public, max-age=3600';
        res.writeHead(200,{'content-type':type,'cache-control':cacheControl});res.end(data)
      });return;
    }
    res.writeHead(404,{'content-type':'text/plain; charset=utf-8'});res.end('Não encontrado');
  });
  const wss=new WebSocketServer({server,maxPayload:2*1024*1024});
  const lobbySweep=setInterval(()=>{const now=Date.now();for(const [code,room] of rooms){advanceAuthorityLease(room,now);advanceRoomDoors(room);const expires=Number(room.lobbyExpiresAt);if(room.status==='lobby'&&expires>now&&expires-now<=60000&&!room.lobbyWarningAt){room.lobbyWarningAt=now;broadcast(room,{type:'lobby_expiry_warning',code:room.code,epoch:room.createdAt})}if(!['lobby','countdown','loading'].includes(room.status)||!Number.isFinite(expires)||expires>now)continue;if(room.countdownTimer)clearTimeout(room.countdownTimer);if(room.loadingTimer)clearTimeout(room.loadingTimer);room.countdownTimer=null;room.loadingTimer=null;const message='A Sala de Espera expirou após 10 minutos sem iniciar uma partida.';for(const p of [...room.players]){const cl=clients.get(p.id);if(!cl)continue;send(cl.ws,{type:'room_expired',code,message});cl.roomCode=null;cl.rematchCode=null;cl.rematchProfile=null}rooms.delete(code)}},Math.max(100,Math.min(1000,Number(opts.lobbySweepMs)||500)));
  const lobbyMovement=setInterval(()=>{const now=Date.now();for(const room of rooms.values())if(room.status==='lobby'&&room.players.length&&LobbyRules.tick(room,now))broadcast(room,{type:'lobby_motion',code:room.code,lobby:LobbyRules.snapshot(room,now)})},66);
  wss.on('connection',(ws,req)=>{
    ws.client={id:null,roomCode:null,name:'Tripulante',color:'azul',clientKey:null,accountId:null,exclusiveCosmetics:new Set(),ws};
    const accountReady=accountService.accountFromRequest(req).then(auth=>{ws.client.accountId=auth?.account?.id||null;ws.client.exclusiveCosmetics=new Set(cleanExclusiveCosmeticIds(auth?.account?.profile?.exclusiveCosmetics))}).catch(err=>{ws.client.accountId=null;ws.client.exclusiveCosmetics=new Set();console.warn('Falha ao identificar conta no WebSocket:',err.message)});
    ws.on('message',data=>{accountReady.then(()=>handle(ws,data,{countdownMs:opts.countdownMs??5000,loadingMs:opts.loadingMs??1200,lobbyMaxMs:opts.lobbyMaxMs??600000})).catch(()=>handle(ws,data,{countdownMs:opts.countdownMs??5000,loadingMs:opts.loadingMs??1200,lobbyMaxMs:opts.lobbyMaxMs??600000}))});
    ws.on('close',()=>{const c=ws.client;if(c.id){detachFromRoom(c,'disconnect');clients.delete(c.id)}});
    ws.on('error',()=>{});
  });
  server.listen(port,host);
  server.on('close',()=>{clearInterval(lobbySweep);clearInterval(lobbyMovement);for(const c of clients.values())try{c.ws.close()}catch{};rooms.clear();clients.clear()});
  return {server,wss,rooms,clients,accountService};
}
if(require.main===module){
  const app=createGameServer();
  app.server.on('listening',()=>console.log(`Nave Zero online em http://${HOST}:${app.server.address().port} (WebSocket no mesmo endereço)`));
  const shutdown=()=>{app.server.close(()=>process.exit(0));setTimeout(()=>process.exit(1),4000).unref()};
  process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
}
module.exports={createGameServer,rooms,clients,cleanSettings,cleanCosmetics};
