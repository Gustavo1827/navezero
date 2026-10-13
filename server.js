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
const COLORS = ['vermelho','azul','amarelo','verde','rosa','roxo','laranja','ciano','preto','branco','carmim','banana','caqui','coral','cinza'];
const LIMITS = {
  kill:[10,60], sab:[10,90], meet:[10,60], speed:[100,280], impVision:[260,900], crewVision:[260,900],
  discussion:[5,90], voting:[5,90], impostors:[1,3], locMax:[0,15], locChance:[0,100], locCooldown:[15,60], locDuration:[40,90], sheriffCooldown:[10,60], sheriffChance:[0,100], sheriffMax:[0,15], delayedEnabled:[0,1], delayedChance:[0,100], delayedMax:[0,3], delayedDuration:[5,40], renderDist:[500,1500]
};
const DEFAULT_SETTINGS = {kill:25,sab:30,meet:20,speed:180,impVision:700,crewVision:520,discussion:25,voting:25,impostors:1,locMax:2,locChance:35,locCooldown:15,locDuration:40,sheriffCooldown:25,sheriffChance:35,sheriffMax:1,delayedEnabled:0,delayedChance:35,delayedMax:1,delayedDuration:20,renderDist:820};
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
function cleanSettings(input={}) {
  const out={...DEFAULT_SETTINGS};
  for(const [key,[lo,hi]] of Object.entries(LIMITS)) {
    const n=Number(input[key]); if(Number.isFinite(n))out[key]=Math.min(hi,Math.max(lo,Math.round(n)));
  }
  return out;
}
const ROOM_CODE_CHARS='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
function makeCode(){let code;do{code='';for(let i=0;i<6;i++)code+=ROOM_CODE_CHARS[crypto.randomInt(ROOM_CODE_CHARS.length)]}while(rooms.has(code));return code}
function pickColor(requested, room) {
  const used = new Set(room.players.map(p=>p.color));
  if(COLORS.includes(requested) && !used.has(requested))return requested;
  return COLORS.find(c=>!used.has(c)) || COLORS[0];
}
function roomPublic(room){ensureBotRoster(room);return {code:room.code,hostId:room.hostId,size:room.size,bots:room.bots,botRoster:room.botRoster.map(b=>({...b})),status:room.status,round:room.round,settings:{...room.settings},players:room.players.map(p=>({id:p.id,name:p.name,color:p.color,ready:!!p.ready}))};}
function sendRoomState(room){const pub=roomPublic(room);for(const p of room.players){const c=clients.get(p.id);if(c)send(c.ws,{type:'room_state',room:pub,youId:p.id})}}
function roomFor(client){return client.roomCode?rooms.get(client.roomCode):null}
function error(ws,message){send(ws,{type:'room_error',message})}
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
  room.players=room.players.filter(p=>p.id!==client.id);client.roomCode=null;
  if(room.players.length===0){rooms.delete(room.code);send(client.ws,{type:'left'});return}
  if(wasHost)room.hostId=room.players[0].id;
  sendRoomState(room);
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
  if(!ended){
    const recipientIsImp=recipient?.role==='imp';
    for(const c of (s.chars||[]))if(c.id!==recipientId && !(recipientIsImp&&c.role==='imp')){c.role='crew';c.function=null}
  }
  // Marcações são privadas: só o Atrasado que marcou recebe seus cronômetros.
  const privateMarks={};for(const [victimId,mark] of Object.entries(s.delayedMarks||{})){if(mark&&mark.killerId===recipientId)privateMarks[victimId]={victimId, killerId:recipientId, remaining:Math.max(0,Number(mark.remaining)||0)}}s.delayedMarks=privateMarks;
  if(recipient){s.role=recipient.role;s.locator=recipient.function==='locator';s.sheriff=recipient.function==='sheriff';s.delayed=recipient.function==='delayed';s.trackTarget=recipient.netTrackTarget||null;s.trackTime=recipient.netTrackTime||0;s.trackCd=recipient.netTrackCd||0;s.selfKillCd=recipient.netKillCd||0;s.selfSheriffCd=recipient.netSheriffCd||0;s.selfDelayedCd=recipient.netDelayedCd||0;}
  return s;
}
function snapshotForNewHost(snapshot, recipientId){
  const s=JSON.parse(JSON.stringify(snapshot));
  const recipient=s.chars?.find(c=>c.id===recipientId);
  if(recipient){s.role=recipient.role;s.locator=recipient.function==='locator';s.sheriff=recipient.function==='sheriff';s.delayed=recipient.function==='delayed';s.trackTarget=recipient.netTrackTarget||null;s.trackTime=recipient.netTrackTime||0;s.trackCd=recipient.netTrackCd||0;s.selfKillCd=recipient.netKillCd||0;s.selfSheriffCd=recipient.netSheriffCd||0;s.selfDelayedCd=recipient.netDelayedCd||0;}
  return s;
}
function startGameNow(room, rematch=false){
  const total=room.players.length+room.bots;
  if(total<4 && !(rematch && total===3)){error(clients.get(room.hostId)?.ws,'Adicione bots ou espere mais jogadores: uma nova partida precisa de pelo menos 4 participantes.');return false}
  if(total>room.size||total>15){error(clients.get(room.hostId)?.ws,'A quantidade total excede o limite da sala.');return false}
  if(room.countdownTimer)clearTimeout(room.countdownTimer);if(room.loadingTimer)clearTimeout(room.loadingTimer);
  room.countdownTimer=null;room.loadingTimer=null;room.status='playing';room.round++;room.lastSnapshot=null;room.winner=null;room.endReason='';room.rematchPending=false;room.countdownRoster=null;
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
    c.id='p_'+crypto.randomBytes(8).toString('hex');c.name=safeText(m.name);c.color=COLORS.includes(m.color)?m.color:'azul';clients.set(c.id,c);
    send(ws,{type:'welcome',id:c.id});return;
  }
  if(!c.id)return error(ws,'Conecte-se primeiro ao servidor.');
  if(m.type==='create_room'){
    if(c.roomCode)detachFromRoom(c);
    const size=Math.min(15,Math.max(4,Math.round(Number(m.size)||10)));
    const requestedBots=Number(m.bots);const bots=Math.min(size-1,Math.max(0,Math.round(Number.isFinite(requestedBots)?requestedBots:3)));
    const code=makeCode();
    const room={code,hostId:c.id,size,bots,status:'lobby',round:0,settings:cleanSettings(m.settings),players:[],lastSnapshot:null,createdAt:Date.now(),countdownToken:0,countdownTimer:null,loadingTimer:null,countdownRoster:null,rematchPending:false,botRoster:[],botNameSeq:0};
    room.players.push({id:c.id,name:safeText(m.name||c.name),color:pickColor(m.color||c.color,room),ready:false});
    c.name=room.players[0].name;c.color=room.players[0].color;c.roomCode=code;rooms.set(code,room);
    sendRoomState(room);return;
  }
  if(m.type==='join_room'){
    if(c.roomCode)return error(ws,'Você já está em uma sala. Saia dela antes de entrar em outra.');
    const code=String(m.code||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6);
    if(!/^[A-Z0-9]{6}$/.test(code))return error(ws,'O código precisa ter 6 letras maiúsculas ou números.');
    const room=rooms.get(code);
    if(!room)return error(ws,'Sala inexistente. Confira o código de 6 caracteres.');
    if(!['lobby','countdown','loading'].includes(room.status))return error(ws,'Esta sala já começou ou foi encerrada.');
    if(room.players.length+room.bots>=room.size)return error(ws,'Sala lotada. O host precisa remover bots para liberar uma vaga.');
    const cancelled=invalidateCountdown(room);
    const player={id:c.id,name:safeText(m.name||c.name),color:pickColor(m.color||c.color,room),ready:false};
    room.players.push(player);c.name=player.name;c.color=player.color;c.roomCode=code;
    sendRoomState(room);
    if(cancelled)broadcast(room,{type:'countdown_cancelled',reason:'Um jogador entrou. A contagem foi cancelada.'});
    return;
  }
  const room=roomFor(c);
  if(m.type==='leave_room'){detachFromRoom(c);return}
  if(!room)return error(ws,'Você não está em uma sala.');
  const isHost=room.hostId===c.id;
  if(m.type==='set_room'){
    if(!isHost)return error(ws,'Somente o host pode alterar as configurações.');
    if(room.status!=='lobby')return error(ws,'As configurações só podem ser alteradas antes da contagem regressiva.');
    if(m.size!==undefined&&Number(m.size)!==room.size)return error(ws,'O tamanho da sala é definido antes de criá-la e não pode ser alterado depois.');
    const humans=room.players.length;
    const bots=Math.min(room.size-humans,Math.max(0,Math.round(Number.isFinite(Number(m.bots))?Number(m.bots):room.bots)));
    if(humans+bots>room.size)return error(ws,'A sala não comporta essa quantidade de bots.');
    room.bots=bots;room.settings=cleanSettings({...room.settings,...(m.settings&&typeof m.settings==='object'?m.settings:{})});sendRoomState(room);return;
  }
  if(m.type==='start_game'){
    if(!isHost)return error(ws,'Somente o host pode iniciar a partida.');
    if(room.status!=='lobby')return error(ws,'Esta sala não está aguardando início.');
    startGame(room,false,timings);return;
  }
  if(m.type==='rematch'){
    if(!isHost)return error(ws,'Somente o host pode reiniciar a partida.');
    if(room.status!=='ended')return error(ws,'A partida ainda não terminou.');
    startGame(room,true,timings);return;
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
    if(!isHost||room.status!=='playing'||!m.snapshot||typeof m.snapshot!=='object')return;
    room.lastSnapshot=m.snapshot;
    for(const p of room.players){
      if(p.id===c.id)continue;
      const target=clients.get(p.id);
      // Evita acumular snapshots antigos em clientes com conexão lenta; o próximo
      // snapshot completo substitui o anterior, então descartar um atrasado é seguro.
      if(target && (target.ws.socket?.writableLength||0)<512*1024)send(target.ws,{type:'snapshot',snapshot:personalizeSnapshot(m.snapshot,p.id)});
    }
    return;
  }
  if(m.type==='input'){
    if(isHost||room.status!=='playing')return;
    const host=clients.get(room.hostId);if(host)send(host.ws,{type:'host_command',command:'input',playerId:c.id,x:Math.max(-1,Math.min(1,Number(m.x)||0)),y:Math.max(-1,Math.min(1,Number(m.y)||0))});return;
  }
  if(m.type==='action'){
    if(isHost||room.status!=='playing')return;
    const action=String(m.action||'');const allowed=new Set(['kill','report','emergency','locator','sheriff_shoot','delayed_mark','sabotage','vent_enter','vent_move','vent_exit','task_complete','vote','chat']);if(!allowed.has(action))return;
    const host=clients.get(room.hostId);if(!host)return;
    const allowedData={command:action,playerId:c.id};
    for(const k of ['targetId','sabotage','ventId','taskId','stepId','fix','text','claim'])if(m[k]!==undefined)allowedData[k]=m[k];
    send(host.ws,{type:'host_command',...allowedData});return;
  }
  if(m.type==='room_chat'){
    if(room.status!=='playing')return error(ws,'O chat da sala só fica disponível durante a partida.');
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
    res.writeHead(404,{'content-type':'text/plain; charset=utf-8'});res.end('Não encontrado');
  });
  const wss=new WebSocketServer({server,maxPayload:2*1024*1024});
  wss.on('connection',ws=>{
    ws.client={id:null,roomCode:null,name:'Tripulante',color:'azul',ws};
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
module.exports={createGameServer,rooms,clients,cleanSettings};
