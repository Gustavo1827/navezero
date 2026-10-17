'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { WebSocketServer, WebSocket } = require('./websocket');

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';
const HTML_FILE = path.join(__dirname, 'index.html');
const rooms = new Map();
const clients = new Map();
const COLORS = ['vermelho','azul','amarelo','verde','rosa','roxo','laranja','marrom','ciano','preto','branco','carmim','banana','caqui','coral','cinza','azul_claro','rosado','verde_forte','oliva','lavanda','mostarda','verde_claro'];
const LEGACY_COLORS={marinho:'azul_claro'};
const normalizeColor=value=>LEGACY_COLORS[String(value||'')]||String(value||'');
const COSMETIC_ALLOWED={
  hat:new Set(['none','antenna_lunar','cap_orbital','crown_scrap','sprout_solar','halo_signal','navigator_band','hat_traveler','hat_tide','hat_nightcap','hat_signal','hat_bow','hat_cosmic','hat_colorcap','hat_nyah','hat_orbit_badge','hat_eye_pod','hat_comet_mane','hat_void_topper','hat_dune_brim','hat_solar_peak','hat_nova_fold','hat_dust_spire','hat_polar_brim','hat_winter_comet']),
  pet:new Set(['none','drone_pingo','cube_bot','comet_pup','luna_bug','beacon_orb','pet_scout','pet_mini','pet_signal_orb','pet_pocket_eye']),
  outfit:new Set(['none','tech_vest','command_jacket','utility_belt','polar_wrap','explorer_harness','outfit_cadet','outfit_orbit_collar','outfit_signal_wrap']),
  visor:new Set(['none','hud_grid','prism_strip','data_monocle','star_sticker','scan_bar','visor_eclipse','visor_scope'])
};
const DEFAULT_COSMETICS={hat:'none',pet:'none',outfit:'none',visor:'none'};
function cleanCosmetics(input={}){const src=input&&typeof input==='object'?input:{};const out={};for(const key of Object.keys(DEFAULT_COSMETICS)){const id=String(src[key]||'none');out[key]=COSMETIC_ALLOWED[key].has(id)?id:'none'}return out}
const LIMITS = {
  kill:[10,60], sab:[10,90], meet:[10,60], speed:[100,280], impVision:[260,900], crewVision:[260,900],
  discussion:[5,90], voting:[5,90], impostors:[1,3], locMax:[0,15], locChance:[0,100], locCooldown:[15,60], locDuration:[40,90], sheriffCooldown:[50,120], sheriffChance:[0,100], sheriffMax:[0,15], obsChance:[0,100], obsMax:[0,15], instructorChance:[0,100], instructorMax:[0,15], instructorCooldown:[20,60], instructorDuration:[5,15], instructorMaxDistance:[100,2000], cleanerChance:[0,100], cleanerMax:[0,15], cleanerCooldown:[10,60], cleanerUses:[1,15], parasiteChance:[0,100], parasiteMax:[0,3], spectralChance:[0,100], spectralMax:[0,15], spectralCooldown:[5,20], spectralDuration:[10,90], spectralSpeed:[0,20], spectralIntangible:[0,1], paramedicChance:[0,100], paramedicMax:[0,15], paramedicCooldown:[20,60], paramedicTasksPerUse:[1,5], paramedicMaxUses:[1,3], lazyChance:[0,100], lazyMax:[0,15], lazySlowdown:[5,20], lazyTasks:[1,3], delayedEnabled:[0,1], delayedChance:[0,100], delayedMax:[0,3], delayedDuration:[5,40], engVentDuration:[10,61], engChance:[0,100], engMax:[0,15], engCooldown:[5,25], marionCooldown:[15,60], marionDuration:[5,30], marionChance:[0,100], marionMax:[0,3], actionDistance:[0,2], commonTasks:[0,5], mediumTasks:[0,5], longTasks:[0,5], renderDist:[500,1500]
};
const DEFAULT_SETTINGS = {kill:25,sab:30,meet:20,speed:180,impVision:700,crewVision:520,discussion:25,voting:25,impostors:1,locMax:2,locChance:35,locCooldown:15,locDuration:40,sheriffCooldown:50,sheriffChance:35,sheriffMax:1,obsChance:0,obsMax:1,instructorChance:0,instructorMax:1,instructorCooldown:30,instructorDuration:8,instructorMaxDistance:2000,cleanerChance:0,cleanerMax:1,cleanerCooldown:30,cleanerUses:2,parasiteChance:0,parasiteMax:1,spectralChance:0,spectralMax:1,spectralCooldown:10,spectralDuration:25,spectralSpeed:4,spectralIntangible:0,paramedicChance:0,paramedicMax:1,paramedicCooldown:30,paramedicTasksPerUse:3,paramedicMaxUses:2,lazyChance:0,lazyMax:1,lazySlowdown:15,lazyTasks:2,delayedEnabled:0,delayedChance:35,delayedMax:1,delayedDuration:20,engVentDuration:30,engChance:25,engMax:1,engCooldown:15,marionCooldown:30,marionDuration:15,marionChance:25,marionMax:1,actionDistance:1,commonTasks:2,mediumTasks:3,longTasks:2,renderDist:820};
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
  for(const [key,[lo,hi]] of Object.entries(LIMITS)) {
    const n=Number(input[key]); if(Number.isFinite(n))out[key]=Math.min(hi,Math.max(lo,Math.round(n)));
  }
  out.spectralSpeed=Math.min(20,Math.max(0,Math.round(out.spectralSpeed/2)*2));
  out.instructorMaxDistance=Math.min(2000,Math.max(100,Math.round(out.instructorMaxDistance/100)*100));
  out.spectralIntangible=out.spectralIntangible?1:0;
  out.impostors=Math.min(out.impostors,maxImpostorsForCount(playerCount));
  out.cleanerMax=Math.min(out.cleanerMax,out.impostors);
  out.parasiteMax=Math.min(out.parasiteMax,out.impostors,3);
  out.instructorMax=Math.min(out.instructorMax,Math.max(0,Math.min(15,playerCount)));
  out.paramedicMax=Math.min(out.paramedicMax,Math.max(0,Math.min(15,playerCount)));
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
function roomPublic(room){ensureBotRoster(room);return {code:room.code,hostId:room.hostId,size:room.size,bots:room.bots,botRoster:room.botRoster.map(b=>({...b})),status:room.status,round:room.round,settings:{...room.settings},players:room.players.map(p=>({id:p.id,name:p.name,color:p.color,ready:!!p.ready,cosmetics:cleanCosmetics(p.cosmetics)}))};}
function sendRoomState(room){const pub=roomPublic(room);for(const p of room.players){const c=clients.get(p.id);if(c)send(c.ws,{type:'room_state',room:pub,youId:p.id})}}
function roomFor(client){return client.roomCode?rooms.get(client.roomCode):null}
function error(ws,message){send(ws,{type:'room_error',message})}
function snapshotAlive(room,id){const ch=room.lastSnapshot?.chars?.find(c=>String(c.id)===String(id));return ch?ch.alive!==false:true}
function ensureModeration(room){if(!(room.modVotes instanceof Map))room.modVotes=new Map();if(!(room.banned instanceof Set))room.banned=new Set();return room.modVotes}
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
  send(target.ws,{type:'moderation_removed',reason});
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
    for(const c of (s.chars||[])){if(c.id!==recipientId)c.instructor=false;if(c.id!==recipientId && !(recipientIsImp&&c.role==='imp')){c.role='crew';c.function=null}}
  }else if(!ended && recipient?.instructor){
    // Instrutores mortos não recebem as funções dos Tripulantes vivos no snapshot privado.
    for(const c of (s.chars||[])){if(c.id!==recipientId)c.instructor=false;if(c.alive&&c.role==='crew')c.function=null}
  }
  // Marcações são privadas: só o Atrasado que marcou recebe seus cronômetros.
  const privateMarks={};for(const [victimId,mark] of Object.entries(s.delayedMarks||{})){if(mark&&mark.killerId===recipientId)privateMarks[victimId]={victimId, killerId:recipientId, remaining:Math.max(0,Number(mark.remaining)||0)}}s.delayedMarks=privateMarks;
  s.parasiteInfections={};s.instructorTrails=(s.instructorTrails||[]).filter(t=>String(t.targetId)===String(recipientId)||String(t.ownerId)===String(recipientId));
  if(recipient){s.role=recipient.role;s.locator=recipient.function==='locator';s.sheriff=recipient.function==='sheriff';s.observer=recipient.function==='observer';s.cleaner=recipient.function==='cleaner';s.parasite=recipient.function==='parasite';s.paramedic=recipient.function==='paramedic';s.lazy=recipient.function==='lazy';s.spectral=recipient.function==='spectral';s.delayed=recipient.function==='delayed';s.trackTarget=recipient.netTrackTarget||null;s.trackTime=recipient.netTrackTime||0;s.trackCd=recipient.netTrackCd||0;s.selfKillCd=recipient.netKillCd||0;s.selfSheriffCd=recipient.netSheriffCd||0;s.selfDelayedCd=recipient.netDelayedCd||0;s.selfCleanerCd=recipient.cleanCd||0;s.selfCleanerUses=recipient.cleanUses||0;s.selfParamedicCd=recipient.paramedicCd||0;s.selfParamedicSpent=recipient.paramedicSpent||0;s.selfParasiteReady=recipient.parasiteReady!==false;s.selfInstructor=!!recipient.instructor;s.selfInstructorCd=recipient.instructorCd||0;s.selfInstructorTargetId=recipient.instructorTargetId||null;}
  return s;
}
function snapshotForNewHost(snapshot, recipientId){
  const s=JSON.parse(JSON.stringify(snapshot));
  const recipient=s.chars?.find(c=>c.id===recipientId);
  if(recipient){s.role=recipient.role;s.locator=recipient.function==='locator';s.sheriff=recipient.function==='sheriff';s.observer=recipient.function==='observer';s.cleaner=recipient.function==='cleaner';s.parasite=recipient.function==='parasite';s.paramedic=recipient.function==='paramedic';s.lazy=recipient.function==='lazy';s.spectral=recipient.function==='spectral';s.delayed=recipient.function==='delayed';s.trackTarget=recipient.netTrackTarget||null;s.trackTime=recipient.netTrackTime||0;s.trackCd=recipient.netTrackCd||0;s.selfKillCd=recipient.netKillCd||0;s.selfSheriffCd=recipient.netSheriffCd||0;s.selfDelayedCd=recipient.netDelayedCd||0;s.selfCleanerCd=recipient.cleanCd||0;s.selfCleanerUses=recipient.cleanUses||0;s.selfParamedicCd=recipient.paramedicCd||0;s.selfParamedicSpent=recipient.paramedicSpent||0;s.selfParasiteReady=recipient.parasiteReady!==false;s.selfInstructor=!!recipient.instructor;s.selfInstructorCd=recipient.instructorCd||0;s.selfInstructorTargetId=recipient.instructorTargetId||null;}
  return s;
}
function startGameNow(room, rematch=false){
  const total=room.players.length+room.bots;
  if(total<4 && !(rematch && total===3)){error(clients.get(room.hostId)?.ws,'Adicione bots ou espere mais jogadores: uma nova partida precisa de pelo menos 4 participantes.');return false}
  if(total>room.size||total>15){error(clients.get(room.hostId)?.ws,'A quantidade total excede o limite da sala.');return false}
  if(room.countdownTimer)clearTimeout(room.countdownTimer);if(room.loadingTimer)clearTimeout(room.loadingTimer);
  room.countdownTimer=null;room.loadingTimer=null;room.status='playing';room.round++;room.lastSnapshot=null;room.winner=null;room.endReason='';room.rematchPending=false;room.rematchLobby=false;room.countdownRoster=null;
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
    if(c.roomCode)detachFromRoom(c);
    const size=Math.min(15,Math.max(4,Math.round(Number(m.size)||10)));
    const requestedBots=Number(m.bots);const bots=Math.min(size-1,Math.max(0,Math.round(Number.isFinite(requestedBots)?requestedBots:3)));
    const code=makeCode();
    const room={code,hostId:c.id,size,bots,status:'lobby',round:0,settings:cleanSettings(m.settings,size),players:[],lastSnapshot:null,createdAt:Date.now(),countdownToken:0,countdownTimer:null,loadingTimer:null,countdownRoster:null,rematchPending:false,rematchLobby:false,rematchWaiters:new Set(),botRoster:[],botNameSeq:0,banned:new Set(),modVotes:new Map(),modStateSig:''};
    room.players.push({id:c.id,name:safeText(m.name||c.name),color:pickColor(m.color||c.color,room),ready:false,cosmetics:cleanCosmetics(m.cosmetics)});
    c.name=room.players[0].name;c.color=room.players[0].color;c.roomCode=code;rooms.set(code,room);
    sendRoomState(room);return;
  }
  if(m.type==='join_room'){
    if(c.roomCode)return error(ws,'Você já está em uma sala. Saia dela antes de entrar em outra.');
    const code=String(m.code||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6);
    if(!/^[A-Z0-9]{6}$/.test(code))return error(ws,'O código precisa ter 6 letras maiúsculas ou números.');
    const room=rooms.get(code);
    if(!room)return error(ws,'Sala inexistente. Confira o código de 6 caracteres.');
    ensureModeration(room);if(room.banned.has(c.clientKey))return error(ws,'Você foi banido desta sala.');
    if(!['lobby','countdown','loading'].includes(room.status))return error(ws,'Esta sala já começou ou foi encerrada.');
    if(room.players.length+room.bots>=room.size)return error(ws,'Sala lotada. O host precisa remover bots para liberar uma vaga.');
    const cancelled=invalidateCountdown(room);
    const player={id:c.id,name:safeText(m.name||c.name),color:pickColor(m.color||c.color,room),ready:false,cosmetics:cleanCosmetics(m.cosmetics)};
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
    const code=String(c.rematchCode||''),rematchRoom=rooms.get(code);
    if(!rematchRoom||rematchRoom.status!=='lobby'||!rematchRoom.rematchLobby){c.rematchCode=null;c.rematchProfile=null;return error(ws,'A nova sala não está mais disponível.')}
    if(rematchRoom.players.some(p=>p.id===c.id)){c.roomCode=code;c.rematchCode=null;c.rematchProfile=null;sendRoomState(rematchRoom);return}
    if(rematchRoom.players.length+rematchRoom.bots>=rematchRoom.size)return error(ws,'Sala lotada. O host precisa remover bots para liberar uma vaga.');
    const saved=c.rematchProfile&&typeof c.rematchProfile==='object'?c.rematchProfile:{};
    const player={id:c.id,name:safeText(saved.name||c.name),color:pickColor(saved.color||c.color,rematchRoom),ready:false,cosmetics:cleanCosmetics(saved.cosmetics)};
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
    ensureModeration(room);if(action==='ban')room.banned.add(target.clientKey);
    const hostPlayer=room.players.find(p=>p.id===c.id),targetPlayer=room.players.find(p=>p.id===targetId);
    broadcastSystemNotice(room,`${hostPlayer?.name||'Host'} ${action==='ban'?'baniu':'expulsou'} ${targetPlayer?.name||'jogador'}`);
    removePlayerByModeration(room,targetId,action);return;
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
    player.cosmetics=cleanCosmetics(m.cosmetics);sendRoomState(room);return;
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
    room.status='lobby';room.lastSnapshot=null;room.winner=null;room.endReason='';room.rematchPending=false;room.rematchLobby=true;room.countdownRoster=null;
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
    const wasMeeting=room.lastSnapshot?.state==='meeting',isMeeting=m.snapshot.state==='meeting';
    const meetingStarted=!wasMeeting&&isMeeting&&m.snapshot.meeting;
    room.lastSnapshot=m.snapshot;
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
    const action=String(m.action||'');const allowed=new Set(['kill','report','emergency','locator','sheriff_shoot','delayed_mark','parasite_infect','spectral_toggle','instructor_select','instructor_mark','clean_body','revive_body','control','control_release','sabotage','vent_enter','vent_move','vent_exit','task_complete','vote','chat']);if(!allowed.has(action))return;
    const host=clients.get(room.hostId);if(!host)return;
    const allowedData={command:action,playerId:c.id};
    for(const k of ['targetId','x','y','sabotage','ventId','taskId','stepId','fix','text','claim'])if(m[k]!==undefined)allowedData[k]=m[k];if(m.bodyId!==undefined)allowedData.bodyId=m.bodyId;
    send(host.ws,{type:'host_command',...allowedData});return;
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
    const now=Date.now();if(now-(c.lastRoomChatAt||0)<350)return;c.lastRoomChatAt=now;
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
function createGameServer(opts={}){
  const port=opts.port??PORT;const host=opts.host??HOST;
  const server=http.createServer((req,res)=>{
    const pathname=new URL(req.url||'/',`http://${req.headers.host||'localhost'}`).pathname;
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
  wss.on('connection',ws=>{
    ws.client={id:null,roomCode:null,name:'Tripulante',color:'azul',clientKey:null,ws};
    ws.on('message',data=>handle(ws,data,{countdownMs:opts.countdownMs??5000,loadingMs:opts.loadingMs??1200}));
    ws.on('close',()=>{const c=ws.client;if(c.id){detachFromRoom(c,'disconnect');clients.delete(c.id)}});
    ws.on('error',()=>{});
  });
  server.listen(port,host);
  server.on('close',()=>{for(const c of clients.values())try{c.ws.close()}catch{};rooms.clear();clients.clear()});
  return {server,wss,rooms,clients};
}
if(require.main===module){
  const app=createGameServer();
  app.server.on('listening',()=>console.log(`Nave Zero online em http://${HOST}:${app.server.address().port} (WebSocket no mesmo endereço)`));
  const shutdown=()=>{app.server.close(()=>process.exit(0));setTimeout(()=>process.exit(1),4000).unref()};
  process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
}
module.exports={createGameServer,rooms,clients,cleanSettings,cleanCosmetics};
