'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { WebSocketServer, WebSocket } = require('./websocket');

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';
const HTML_FILE = path.join(__dirname, 'index.html');
const EXCLUSIVE_COSMETICS_FILE = path.join(__dirname, 'exclusive-cosmetics.json');
const rooms = new Map();
const clients = new Map();
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
const LIMITS = {
  kill:[10,60], sab:[10,90], meet:[10,60], emergencyUses:[0,10], speed:[100,280], impVision:[260,900], crewVision:[260,900],
  discussion:[5,90], voting:[5,90], impostors:[1,3], locMax:[0,15], locChance:[0,100], locCooldown:[15,60], locDuration:[40,90], sheriffCooldown:[50,120], sheriffChance:[0,100], sheriffMax:[0,15], obsChance:[0,100], obsMax:[0,15], instructorChance:[0,100], instructorMax:[0,15], instructorCooldown:[20,60], instructorDuration:[5,15], instructorMaxDistance:[100,2000], guardianCooldown:[35,60], guardianDuration:[10,30], guardianChance:[0,100], guardianMax:[0,15], guardianImpostorVisible:[0,1], cleanerChance:[0,100], cleanerMax:[0,15], cleanerCooldown:[10,60], cleanerDelay:[1,5], cleanerUses:[1,15], parasiteChance:[0,100], parasiteMax:[0,3], spectralChance:[0,100], spectralMax:[0,15], spectralCooldown:[5,20], spectralDuration:[10,90], spectralSpeed:[0,10], paramedicChance:[0,100], paramedicMax:[0,15], paramedicCooldown:[5,25], paramedicTasksPerUse:[1,5], paramedicMaxUses:[1,3], seerChance:[0,100], seerMax:[0,15], seerCooldown:[10,45], seerDelay:[0,5], seerDuration:[5,10], noisyDuration:[5,15], noisyChance:[0,100], noisyMax:[0,15], noisyImpostorVisible:[0,1], judgeChance:[0,100], judgeMax:[0,15], judgeTaskPct:[0,100], lazyChance:[0,100], lazyMax:[0,15], lazySlowdown:[5,20], lazyTasks:[1,3], delayedEnabled:[0,1], delayedChance:[0,100], delayedMax:[0,3], delayedDuration:[5,40], engVentDuration:[10,61], engChance:[0,100], engMax:[0,15], engCooldown:[5,25], marionCooldown:[15,60], marionDuration:[5,30], marionChance:[0,100], marionMax:[0,3], hunterChance:[0,100], hunterMax:[0,3], hunterTargetCooldown:[5,25], actionDistance:[0,2], commonTasks:[0,5], mediumTasks:[0,5], longTasks:[0,5], renderDist:[500,1500]
};
const MAP_IDS=new Set(['nave','nexus']);
const DEFAULT_SETTINGS = {mapId:'nave',kill:25,sab:30,meet:20,emergencyUses:1,speed:180,impVision:700,crewVision:520,discussion:25,voting:25,impostors:1,locMax:2,locChance:35,locCooldown:15,locDuration:40,sheriffCooldown:50,sheriffChance:35,sheriffMax:1,obsChance:0,obsMax:1,instructorChance:0,instructorMax:1,instructorCooldown:30,instructorDuration:8,instructorMaxDistance:2000,guardianCooldown:35,guardianDuration:18,guardianChance:0,guardianMax:1,guardianImpostorVisible:1,cleanerChance:0,cleanerMax:1,cleanerCooldown:30,cleanerDelay:2,cleanerUses:2,parasiteChance:0,parasiteMax:1,spectralChance:0,spectralMax:1,spectralCooldown:10,spectralDuration:25,spectralSpeed:4,paramedicChance:0,paramedicMax:1,paramedicCooldown:20,paramedicTasksPerUse:3,paramedicMaxUses:2,seerChance:0,seerMax:1,seerCooldown:25,seerDelay:2,seerDuration:7,noisyDuration:8,noisyChance:0,noisyMax:1,noisyImpostorVisible:1,judgeChance:0,judgeMax:1,judgeTaskPct:50,lazyChance:0,lazyMax:1,lazySlowdown:15,lazyTasks:2,delayedEnabled:0,delayedChance:35,delayedMax:1,delayedDuration:20,engVentDuration:30,engChance:25,engMax:1,engCooldown:15,marionCooldown:30,marionDuration:15,marionChance:25,marionMax:1,hunterChance:0,hunterMax:1,hunterTargetCooldown:10,actionDistance:1,commonTasks:2,mediumTasks:3,longTasks:2,renderDist:820};
const BOT_NAMES = ['João','Duda','Lia','Maria','Fernando','Caio','Aurora','Bruno','Iris','Mateus','Nina','Ravi','Bia','Theo','Yasmin','Gael','Luna','Cecília','Miguel','Helena','Enzo','Rafa','Alice','Pedro','Sofia','Lucas','Maya','Noah','Lara','Vitor'];
const nameKey = value => String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').replace(/[^a-z0-9]/g,'');
function ensureBotRoster(room){
  if(!room.botRoster)room.botRoster=[];if(!Number.isFinite(room.botNameSeq))room.botNameSeq=0;
  const used=new Set((room.players||[]).map(p=>nameKey(p.name)));
  const makeName=()=>{
    for(let tries=0;tries<500;tries++){const n=room.botNameSeq++,base=BOT_NAMES[n%BOT_NAMES.length],cycle=Math.floor(n/BOT_NAMES.length);let candidate=cycle?`${base} ${cycle+1}`:base;if(candidate.length>12)candidate=`Bot ${n+1}`;if(!used.has(nameKey(candidate))){used.add(nameKey(candidate));return candidate}}
    let n=1,candidate;do{candidate=`Bot ${n++}`}while(used.has(nameKey(candidate)));used.add(nameKey(candidate));return candidate;
  };
  for(let i=0;i<room.bots;i++){
    const current=room.botRoster[i];const currentName=current&&String(current.name||'').trim();
    if(!currentName||used.has(nameKey(currentName))){room.botRoster[i]={id:`bot_${room.code}_${i+1}`,name:makeName()};}
    else{room.botRoster[i]={id:`bot_${room.code}_${i+1}`,name:safeText(currentName,12,'Bot')};used.add(nameKey(room.botRoster[i].name));}
  }
  room.botRoster.length=room.bots;return room.botRoster;
}
const safeText = (v, max=12, fallback='Tripulante') => String(v ?? '').replace(/[<>\u0000-\u001f]/g,'').trim().slice(0,max) || fallback;
const send = (ws, obj) => { if(ws && ws.readyState===WebSocket.OPEN) ws.send(JSON.stringify(obj)); };
const broadcast = (room, obj, exceptId=null) => { for(const p of room.players){ if(p.id===exceptId)continue; const c=clients.get(p.id); if(c)send(c.ws,obj); } };
const broadcastSystemNotice=(room,text)=>broadcast(room,{type:'system_notice',text:String(text||'').slice(0,160)});
function maxImpostorsForCount(count){const n=Math.max(4,Math.min(15,Math.round(Number(count)||4)));return n>=10?3:n>=8?2:1}
function cleanSettings(input={}, playerCount=15) {
  const out={...DEFAULT_SETTINGS};
  const mapId=String(input?.mapId||'');out.mapId=MAP_IDS.has(mapId)?mapId:'nave';
  for(const [key,[lo,hi]] of Object.entries(LIMITS)) {
    const n=Number(input[key]); if(Number.isFinite(n))out[key]=Math.min(hi,Math.max(lo,Math.round(n)));
  }
  out.spectralSpeed=Math.min(10,Math.max(0,Math.round(out.spectralSpeed/2)*2));
  out.instructorMaxDistance=Math.min(2000,Math.max(100,Math.round(out.instructorMaxDistance/100)*100));
  out.hunterTargetCooldown=Math.min(25,Math.max(5,Math.round(out.hunterTargetCooldown/5)*5));
  out.impostors=Math.min(out.impostors,maxImpostorsForCount(playerCount));
  out.cleanerMax=Math.min(out.cleanerMax,out.impostors);
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
const ROOM_CODE_CHARS='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
function makeCode(){let code;do{code='';for(let i=0;i<6;i++)code+=ROOM_CODE_CHARS[crypto.randomInt(ROOM_CODE_CHARS.length)]}while(rooms.has(code));return code}
function pickColor(requested, room) {
  requested=normalizeColor(requested);
  const used = new Set(room.players.map(p=>p.color));
  if(COLORS.includes(requested) && !used.has(requested))return requested;
  return COLORS.find(c=>!used.has(c)) || COLORS[0];
}
function resetLobbyExpiry(room,maxMs=600000){room.lobbyMaxMs=Math.max(1000,Number(maxMs)||600000);room.lobbyRemainingMs=room.lobbyMaxMs;room.createdAt=Date.now();room.lobbyExpiresAt=room.createdAt+room.lobbyRemainingMs}
function pauseLobbyExpiry(room){if(!room||room.status!=='lobby')return;const now=Date.now();room.lobbyRemainingMs=Math.max(0,Number(room.lobbyExpiresAt||now)-now);room.lobbyExpiresAt=null}
function resumeLobbyExpiry(room){if(!room||room.status!=='lobby')return;const remain=Math.max(0,Number(room.lobbyRemainingMs??room.lobbyMaxMs??600000));room.lobbyExpiresAt=Date.now()+remain}
function roomPublic(room){ensureBotRoster(room);const waiting=['lobby','countdown','loading'].includes(room.status),expires=waiting?(Number(room.lobbyExpiresAt)||null):null,remaining=expires?Math.max(0,expires-Date.now()):null;return {code:room.code,hostId:room.hostId,size:room.size,bots:room.bots,botRoster:room.botRoster.map(b=>({...b})),status:room.status,round:room.round,lobbyExpiresAt:expires,lobbyRemainingMs:remaining,settings:{...room.settings},players:room.players.map(p=>({id:p.id,name:p.name,color:p.color,ready:!!p.ready,cosmetics:cleanCosmetics(p.cosmetics)}))};}
function sendRoomState(room){const pub=roomPublic(room);for(const p of room.players){const c=clients.get(p.id);if(c)send(c.ws,{type:'room_state',room:pub,youId:p.id})}}
function roomFor(client){return client.roomCode?rooms.get(client.roomCode):null}
function error(ws,message){send(ws,{type:'room_error',message})}
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
  if(wasHost)room.hostId=room.players[0].id;
  pruneModeration(room);
  sendRoomState(room);evaluateModeration(room);
  if(cancelled)broadcast(room,{type:'countdown_cancelled',reason:'Um jogador saiu. A contagem foi cancelada.'});
  if(wasHost && room.status!=='lobby' && room.lastSnapshot){const elected=clients.get(room.hostId);if(elected)send(elected.ws,{type:'host_snapshot',snapshot:snapshotForNewHost(room.lastSnapshot,room.hostId)});}
  broadcast(room,{type:'player_left',playerId:client.id,name:removed.name,reason});
  if(wasHost)broadcast(room,{type:'host_changed',hostId:room.hostId});
  send(client.ws,{type:'left'});
}
function personalizeSnapshot(snapshot, recipientId){
  const s=JSON.parse(JSON.stringify(snapshot));
  const ended=s.state==='over'||s.over;
  const recipient=s.chars?.find(c=>c.id===recipientId);
  if(!ended && recipient?.alive!==false){
    const recipientIsImp=recipient?.role==='imp';
    for(const c of (s.chars||[])){if(c.id!==recipientId){c.instructor=false;c.guardian=false}if(c.id!==recipientId && !(recipientIsImp&&c.role==='imp')){c.role='crew';c.function=null}}
  }else if(!ended && (recipient?.instructor||recipient?.guardian)){
    // Funções de fantasma ajudam sem receber as funções secretas dos Tripulantes vivos.
    for(const c of (s.chars||[])){if(c.id!==recipientId){c.instructor=false;c.guardian=false}if(c.alive&&c.role==='crew')c.function=null}
  }
  // Marcações são privadas: só o Temporizador que marcou recebe seus cronômetros.
  const privateMarks={};for(const [victimId,mark] of Object.entries(s.delayedMarks||{})){if(mark&&mark.killerId===recipientId)privateMarks[victimId]={victimId, killerId:recipientId, remaining:Math.max(0,Number(mark.remaining)||0)}}s.delayedMarks=privateMarks;
  const canSeeHunterTargets=recipient?.alive===false||recipient?.role==='imp';if(!canSeeHunterTargets)for(const c of (s.chars||[]))c.hunterTargetId=null;
  const canSeeGuardianProtection=recipient?.alive===false||!!recipient?.guardian||(recipient?.alive!==false&&recipient?.role==='imp'&&Number(s.cfg?.guardianImpostorVisible)!==0);if(!canSeeGuardianProtection)s.guardianProtections={};
  s.parasiteInfections={};s.instructorTrails=(s.instructorTrails||[]).filter(t=>String(t.targetId)===String(recipientId)||String(t.ownerId)===String(recipientId));s.selfSeerReplay=recipient?.alive!==false&&recipient?.role==='crew'&&recipient?.function==='seer'?(s.seerReplays?.[recipientId]||null):null;delete s.seerReplays;for(const b of (s.bodies||[]))delete b.killerTrace;
  if(recipient){s.role=recipient.role;s.locator=recipient.function==='locator';s.sheriff=recipient.function==='sheriff';s.observer=recipient.function==='observer';s.cleaner=recipient.function==='cleaner';s.parasite=recipient.function==='parasite';s.paramedic=recipient.function==='paramedic';s.seer=recipient.function==='seer';s.lazy=recipient.function==='lazy';s.spectral=recipient.function==='spectral';s.delayed=recipient.function==='delayed';s.trackTarget=recipient.netTrackTarget||null;s.trackTime=recipient.netTrackTime||0;s.trackCd=recipient.netTrackCd||0;s.selfKillCd=recipient.netKillCd||0;s.selfSheriffCd=recipient.netSheriffCd||0;s.selfDelayedCd=recipient.netDelayedCd||0;s.selfCleanerCd=recipient.cleanCd||0;s.selfCleanerUses=recipient.cleanUses||0;s.selfParamedicCd=recipient.paramedicCd||0;s.selfParamedicSpent=recipient.paramedicSpent||0;s.selfSeerCd=recipient.seerCd||0;s.selfParasiteReady=recipient.parasiteReady!==false;s.selfGuardian=!!recipient.guardian;s.selfGuardianTargetId=recipient.guardianTargetId||null;s.selfInstructor=!!recipient.instructor;s.selfInstructorCd=recipient.instructorCd||0;s.selfInstructorTargetId=recipient.instructorTargetId||null;}
  return s;
}
function snapshotForNewHost(snapshot, recipientId){
  const s=JSON.parse(JSON.stringify(snapshot));
  const recipient=s.chars?.find(c=>c.id===recipientId);
  s.selfSeerReplay=s.seerReplays?.[recipientId]||null;
  if(recipient){s.role=recipient.role;s.locator=recipient.function==='locator';s.sheriff=recipient.function==='sheriff';s.observer=recipient.function==='observer';s.cleaner=recipient.function==='cleaner';s.parasite=recipient.function==='parasite';s.paramedic=recipient.function==='paramedic';s.seer=recipient.function==='seer';s.lazy=recipient.function==='lazy';s.spectral=recipient.function==='spectral';s.delayed=recipient.function==='delayed';s.trackTarget=recipient.netTrackTarget||null;s.trackTime=recipient.netTrackTime||0;s.trackCd=recipient.netTrackCd||0;s.selfKillCd=recipient.netKillCd||0;s.selfSheriffCd=recipient.netSheriffCd||0;s.selfDelayedCd=recipient.netDelayedCd||0;s.selfCleanerCd=recipient.cleanCd||0;s.selfCleanerUses=recipient.cleanUses||0;s.selfParamedicCd=recipient.paramedicCd||0;s.selfParamedicSpent=recipient.paramedicSpent||0;s.selfSeerCd=recipient.seerCd||0;s.selfParasiteReady=recipient.parasiteReady!==false;s.selfGuardian=!!recipient.guardian;s.selfGuardianTargetId=recipient.guardianTargetId||null;s.selfInstructor=!!recipient.instructor;s.selfInstructorCd=recipient.instructorCd||0;s.selfInstructorTargetId=recipient.instructorTargetId||null;}
  return s;
}
function startGameNow(room, rematch=false){
  const total=room.players.length+room.bots;
  if(total<4 && !(rematch && total===3)){error(clients.get(room.hostId)?.ws,'Adicione bots ou espere mais jogadores: uma nova partida precisa de pelo menos 4 participantes.');return false}
  if(total>room.size||total>15){error(clients.get(room.hostId)?.ws,'A quantidade total excede o limite da sala.');return false}
  if(room.countdownTimer)clearTimeout(room.countdownTimer);if(room.loadingTimer)clearTimeout(room.loadingTimer);
  room.countdownTimer=null;room.loadingTimer=null;room.status='playing';room.lobbyExpiresAt=null;room.round++;room.lastSnapshot=null;room.ghostChatHistory=[];room.winner=null;room.endReason='';room.rematchPending=false;room.rematchLobby=false;room.countdownRoster=null;
  sendRoomState(room);
  broadcast(room,{type:'game_start',room:roomPublic(room),round:room.round,rematch});
  return true;
}
function startGame(room, rematch=false, timings={}){
  const total=room.players.length+room.bots;
  if(total<4 && !(rematch && total===3)){error(clients.get(room.hostId)?.ws,'Adicione bots ou espere mais jogadores: uma nova partida precisa de pelo menos 4 participantes.');return false}
  if(total>room.size||total>15){error(clients.get(room.hostId)?.ws,'A quantidade total excede o limite da sala.');return false}
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
    room.countdownTimer=null;room.status='loading';sendRoomState(room);
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
  if(!m||typeof m.type!=='string')return;
  if(m.type==='hello'){
    if(c.id)return;
    c.id='p_'+crypto.randomBytes(8).toString('hex');c.name=safeText(m.name);{const requested=normalizeColor(m.color);c.color=COLORS.includes(requested)?requested:'azul'}
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
    const room={code,hostId:c.id,size,bots,status:'lobby',round:0,settings:cleanSettings(m.settings,size),players:[],lastSnapshot:null,ghostChatHistory:[],createdAt:Date.now(),lobbyMaxMs:Math.max(1000,Number(timings.lobbyMaxMs)||600000),lobbyRemainingMs:0,lobbyExpiresAt:null,countdownToken:0,countdownTimer:null,loadingTimer:null,countdownRoster:null,rematchPending:false,rematchLobby:false,rematchWaiters:new Set(),botRoster:[],botNameSeq:0,banned:new Set(),modVotes:new Map(),modStateSig:''};resetLobbyExpiry(room,room.lobbyMaxMs);
    room.players.push({id:c.id,name:safeText(m.name||c.name),color:pickColor(m.color||c.color,room),ready:false,cosmetics:cleanCosmeticsForClient(m.cosmetics,c)});
    c.name=room.players[0].name;c.color=room.players[0].color;c.roomCode=code;rooms.set(code,room);
    sendRoomState(room);return;
  }
  if(m.type==='join_room'){
    if(c.roomCode)return error(ws,'Você já está em uma sala. Saia dela antes de entrar em outra.');
    if(rejectDuplicateAccountSlot(c))return;
    const code=String(m.code||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6);
    if(!/^[A-Z0-9]{6}$/.test(code))return error(ws,'O código precisa ter 6 letras maiúsculas ou números.');
    const room=rooms.get(code);
    if(!room)return error(ws,'Sala inexistente. Confira o código de 6 caracteres.');
    ensureModeration(room);const banKey=moderationBanKey(c);if(banKey&&room.banned.has(banKey))return error(ws,`Você foi banido da sala ${room.code}. Você não pode mais voltar.`);
    if(!['lobby','countdown','loading'].includes(room.status))return error(ws,'Esta sala já começou ou foi encerrada.');
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
    room.status='lobby';room.lastSnapshot=null;room.ghostChatHistory=[];room.winner=null;room.endReason='';room.rematchPending=false;room.rematchLobby=true;room.countdownRoster=null;resetLobbyExpiry(room,room.lobbyMaxMs||timings.lobbyMaxMs||600000);
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
  if(m.type==='game_end'){
    if(!isHost)return;
    if(room.status!=='playing')return;
    room.status='ended';room.winner=m.winner==='imp'?'imp':'crew';room.endReason=safeText(m.reason,160,'A partida terminou.');
    const finalSnapshot=m.snapshot&&typeof m.snapshot==='object'&&Array.isArray(m.snapshot.chars)?m.snapshot:null;
    if(finalSnapshot)room.lastSnapshot=finalSnapshot;
    for(const p of room.players){if(p.id===c.id)continue;const target=clients.get(p.id);if(target)send(target.ws,{type:'game_end',winner:room.winner,reason:room.endReason,snapshot:finalSnapshot?personalizeSnapshot(finalSnapshot,p.id):null});}
    sendRoomState(room);return;
  }
  if(m.type==='state_snapshot'){
    if(!isHost||!['loading','playing'].includes(room.status)||!m.snapshot||typeof m.snapshot!=='object')return;
    const previousSnapshot=room.lastSnapshot;
    const wasMeeting=previousSnapshot?.state==='meeting',isMeeting=m.snapshot.state==='meeting';
    const meetingStarted=!wasMeeting&&isMeeting&&m.snapshot.meeting;
    room.lastSnapshot=m.snapshot;
    // Quando um humano passa a morto, recebe o histórico privado do canal dos mortos.
    // Esse histórico nunca é incluído no room_state/snapshot enviado aos vivos.
    for(const p of room.players){
      const before=previousSnapshot?.chars?.find(ch=>String(ch.id)===String(p.id));
      const after=m.snapshot?.chars?.find(ch=>String(ch.id)===String(p.id));
      if(after?.alive===false&&before?.alive!==false){const target=clients.get(p.id);if(target)send(target.ws,{type:'ghost_chat_history',messages:Array.isArray(room.ghostChatHistory)?room.ghostChatHistory:[]})}
    }
    ensureModeration(room);if(wasMeeting!==isMeeting)room.modVotes=new Map();
    if(isMeeting){if(!evaluateModeration(room)){} }else if(wasMeeting!==isMeeting)broadcastModeration(room);
    if(!clients.get(c.id)||c.roomCode!==room.code)return;
    // A transição para reunião é prioritária e nunca é descartada por backpressure.
    // Ela leva o snapshot autoritativo completo: chamador, motivo, corpo, participantes,
    // cronômetros e estado de votação. Os snapshots periódicos continuam descartáveis.
    if(meetingStarted){
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
    // Movimento usa um canal leve e descartável. Se a fila de um cliente crescer,
    // é melhor pular um frame de movimento do que entregar posições antigas depois.
    for(const p of room.players){
      if(p.id===c.id)continue;
      const target=clients.get(p.id);
      if(target && (target.ws.socket?.writableLength||0)<128*1024)send(target.ws,{type:'motion',motion:m.motion});
    }
    return;
  }
  if(m.type==='input'){
    if(isHost||room.status!=='playing')return;
    const host=clients.get(room.hostId);if(host)send(host.ws,{type:'host_command',command:'input',playerId:c.id,x:Math.max(-1,Math.min(1,Number(m.x)||0)),y:Math.max(-1,Math.min(1,Number(m.y)||0)),inputSeq:Math.max(0,Math.floor(Number(m.inputSeq)||0))});return;
  }
  if(m.type==='action'){
    if(isHost||room.status!=='playing')return;
    const action=String(m.action||'');const allowed=new Set(['kill','report','emergency','locator','sheriff_shoot','delayed_mark','parasite_infect','spectral_toggle','instructor_select','instructor_mark','clean_body','revive_body','seer_inspect','control','control_release','hunter_target','guardian_protect','sabotage','vent_enter','vent_move','vent_exit','task_complete','vote','chat','decon_button']);if(!allowed.has(action))return;
    if(action==='chat'){const now=Date.now();if(now-(c.lastMeetingChatAt||0)<3000)return;c.lastMeetingChatAt=now}
    const host=clients.get(room.hostId);if(!host)return;
    const allowedData={command:action,playerId:c.id};
    for(const k of ['targetId','x','y','sabotage','ventId','stationId','taskId','stepId','fix','text','claim'])if(m[k]!==undefined)allowedData[k]=m[k];if(m.bodyId!==undefined)allowedData.bodyId=m.bodyId;
    send(host.ws,{type:'host_command',...allowedData});return;
  }
  if(m.type==='ghost_chat'){
    if(room.status!=='playing')return;
    const player=room.players.find(p=>p.id===c.id);if(!player||snapshotAlive(room,c.id))return;
    const text=String(m.text||'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,180);if(!text)return;
    const now=Date.now();if(now-(c.lastGhostChatAt||0)<3000)return;c.lastGhostChatAt=now;
    if(!Array.isArray(room.ghostChatHistory))room.ghostChatHistory=[];
    const entry={roomCode:room.code,playerId:c.id,name:player.name,color:player.color,text,at:now};room.ghostChatHistory.push(entry);if(room.ghostChatHistory.length>80)room.ghostChatHistory.splice(0,room.ghostChatHistory.length-80);
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
    const text=String(m.text||'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,180);if(!text)return;
    const now=Date.now();if(now-(c.lastRoomChatAt||0)<3000)return;c.lastRoomChatAt=now;
    broadcast(room,{type:'room_chat_message',roomCode:room.code,playerId:c.id,name:player.name,color:player.color,text,at:now});return;
  }
  if(m.type==='meeting_chat'){
    if(!isHost)return;
    broadcast(room,{type:'meeting_chat',playerId:String(m.playerId||''),text:String(m.text||'').slice(0,180)},c.id);return;
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
function cleanAccountProfile(input={},protectedInput=null){const src=input&&typeof input==='object'?input:{};const protectedSrc=protectedInput&&typeof protectedInput==='object'?protectedInput:src;const personal=src.personalSettings&&typeof src.personalSettings==='object'?src.personalSettings:{};const room=src.roomSettings&&typeof src.roomSettings==='object'?src.roomSettings:{};const size=Math.min(15,Math.max(4,Math.round(Number(room.size)||10)));const bots=Math.min(size-1,Math.max(0,Math.round(Number(room.bots)||0)));const exclusiveCosmetics=cleanExclusiveCosmeticIds(protectedSrc.exclusiveCosmetics),owned=new Set(exclusiveCosmetics),cosmetics=cleanCosmetics(src.cosmetics);for(const [slot,id] of Object.entries(cosmetics))if(EXCLUSIVE_COSMETIC_BY_ID.has(id)&&!owned.has(id))cosmetics[slot]='none';return {name:safeText(src.name,12,'Você'),color:COLORS.includes(normalizeColor(src.color))?normalizeColor(src.color):'azul',cosmetics,exclusiveCosmetics,redeemedExclusiveCodes:cleanRedeemedExclusiveCodes(protectedSrc.redeemedExclusiveCodes),personalSettings:{volume:Math.min(2,Math.max(0,Number.isFinite(Number(personal.volume))?Number(personal.volume):1)),keys:cleanAccountKeys(personal.keys)},roomSettings:{mapId:MAP_IDS.has(String(room.mapId||''))?String(room.mapId):'nave',size,bots,cfg:cleanSettings(room.cfg&&typeof room.cfg==='object'?room.cfg:{},size)}}}
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
      const auth=await accountFromRequest(req);if(!auth){jsonResponse(res,401,{ok:false,message:'Sessão inválida ou expirada.'});return true}const body=await readJsonBody(req),profile=cleanAccountProfile(body.profile,auth.account.profile),updatedAt=new Date().toISOString();const rows=await dbRequest('nzo_accounts',{method:'PATCH',query:`id=eq.${encodeURIComponent(auth.account.id)}`,body:{profile,updated_at:updatedAt}});const account=Array.isArray(rows)&&rows[0]?rows[0]:{...auth.account,profile,updated_at:updatedAt};jsonResponse(res,200,{ok:true,account:publicAccount(account)});return true
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
  const port=opts.port??PORT;const host=opts.host??HOST;const accountService=createAccountService(opts);
  const server=http.createServer((req,res)=>{
    const pathname=new URL(req.url||'/',`http://${req.headers.host||'localhost'}`).pathname;
    if(pathname.startsWith('/api/account/')){accountService.handle(req,res,pathname).catch(err=>{if(res.headersSent)return;jsonResponse(res,err?.status||500,{ok:false,message:err?.status&&err.status<500?err.message:'Erro interno ao processar a conta.'})});return}
    if(pathname==='/health'){res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({ok:true,rooms:rooms.size,clients:clients.size}));return}
    if(pathname==='/'||pathname==='/index.html'){
      fs.readFile(HTML_FILE,(err,data)=>{if(err){res.writeHead(500);res.end('Não foi possível abrir index.html');return}res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-cache'});res.end(data)});return;
    }
    if(pathname.startsWith('/assets/')){
      const filePath=path.join(__dirname,pathname);
      if(!filePath.startsWith(path.join(__dirname,'assets'))) {res.writeHead(403);res.end('Proibido');return}
      fs.readFile(filePath,(err,data)=>{
        if(err){res.writeHead(404,{'content-type':'text/plain; charset=utf-8'});res.end('Não encontrado');return}
        const ext=path.extname(filePath).toLowerCase();
        const type=ext==='.png'?'image/png':ext==='.jpg'||ext==='.jpeg'?'image/jpeg':ext==='.webp'?'image/webp':'application/octet-stream';
        res.writeHead(200,{'content-type':type,'cache-control':'public, max-age=3600'});res.end(data)
      });return;
    }
    res.writeHead(404,{'content-type':'text/plain; charset=utf-8'});res.end('Não encontrado');
  });
  const wss=new WebSocketServer({server,maxPayload:2*1024*1024});
  const lobbySweep=setInterval(()=>{const now=Date.now();for(const [code,room] of rooms){if(!['lobby','countdown','loading'].includes(room.status)||!Number.isFinite(Number(room.lobbyExpiresAt))||Number(room.lobbyExpiresAt)>now)continue;if(room.countdownTimer)clearTimeout(room.countdownTimer);if(room.loadingTimer)clearTimeout(room.loadingTimer);room.countdownTimer=null;room.loadingTimer=null;const message='A Sala de Espera expirou após 10 minutos sem iniciar uma partida.';for(const p of [...room.players]){const cl=clients.get(p.id);if(!cl)continue;send(cl.ws,{type:'room_expired',code,message});cl.roomCode=null;cl.rematchCode=null;cl.rematchProfile=null}rooms.delete(code)}},Math.max(100,Math.min(1000,Number(opts.lobbySweepMs)||500)));
  wss.on('connection',(ws,req)=>{
    ws.client={id:null,roomCode:null,name:'Tripulante',color:'azul',clientKey:null,accountId:null,exclusiveCosmetics:new Set(),ws};
    const accountReady=accountService.accountFromRequest(req).then(auth=>{ws.client.accountId=auth?.account?.id||null;ws.client.exclusiveCosmetics=new Set(cleanExclusiveCosmeticIds(auth?.account?.profile?.exclusiveCosmetics))}).catch(err=>{ws.client.accountId=null;ws.client.exclusiveCosmetics=new Set();console.warn('Falha ao identificar conta no WebSocket:',err.message)});
    ws.on('message',data=>{accountReady.then(()=>handle(ws,data,{countdownMs:opts.countdownMs??5000,loadingMs:opts.loadingMs??1200,lobbyMaxMs:opts.lobbyMaxMs??600000})).catch(()=>handle(ws,data,{countdownMs:opts.countdownMs??5000,loadingMs:opts.loadingMs??1200,lobbyMaxMs:opts.lobbyMaxMs??600000}))});
    ws.on('close',()=>{const c=ws.client;if(c.id){detachFromRoom(c,'disconnect');clients.delete(c.id)}});
    ws.on('error',()=>{});
  });
  server.listen(port,host);
  server.on('close',()=>{clearInterval(lobbySweep);for(const c of clients.values())try{c.ws.close()}catch{};rooms.clear();clients.clear()});
  return {server,wss,rooms,clients,accountService};
}
if(require.main===module){
  const app=createGameServer();
  app.server.on('listening',()=>console.log(`Nave Zero online em http://${HOST}:${app.server.address().port} (WebSocket no mesmo endereço)`));
  const shutdown=()=>{app.server.close(()=>process.exit(0));setTimeout(()=>process.exit(1),4000).unref()};
  process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
}
module.exports={createGameServer,rooms,clients,cleanSettings,cleanCosmetics};
