'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createGameServer, rooms, cleanSettings } = require('../server');

function onceMessage(client, predicate, timeout=2500){
  return new Promise((resolve,reject)=>{
    const start=Date.now();
    const timer=setInterval(()=>{const i=client.messages.findIndex(predicate);if(i>=0){clearInterval(timer);resolve(client.messages.splice(i,1)[0]);return}if(Date.now()-start>timeout){clearInterval(timer);reject(new Error('Timeout aguardando mensagem do servidor'))}},10);
  });
}
async function connect(url,name,color='azul'){
  const ws=new WebSocket(url);const client={ws,messages:[]};
  ws.addEventListener('message',e=>{try{client.messages.push(JSON.parse(e.data))}catch{}});
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true})});
  ws.send(JSON.stringify({type:'hello',name,color}));
  const welcome=await onceMessage(client,m=>m.type==='welcome');client.id=welcome.id;return client;
}
function send(client,o){client.ws.send(JSON.stringify(o))}
async function closeClient(client){if(!client)return;try{client.ws.close()}catch{}await new Promise(r=>setTimeout(r,30))}

test('salas, códigos, limite por bots, isolamento de configurações, início e transferência de host', async t=>{
  const app=createGameServer({port:0,host:'127.0.0.1',countdownMs:25,loadingMs:15});
  await new Promise(resolve=>app.server.once('listening',resolve));
  const port=app.server.address().port,url=`ws://127.0.0.1:${port}`;const all=[];
  t.after(async()=>{for(const c of all)await closeClient(c);await new Promise(r=>app.server.close(r));rooms.clear()});

  const host=await connect(url,'Host','azul');all.push(host);
  send(host,{type:'create_room',name:'Host',color:'azul',size:4,bots:3,settings:{speed:210,kill:20,crewVision:440,impostors:2,renderDist:950,sheriffCooldown:50,sheriffChance:70,sheriffMax:4,delayedEnabled:1,delayedChance:82,delayedMax:3,delayedDuration:40,metamorphChance:100,metamorphMax:3,metamorphDuration:25,metamorphCooldown:55}});
  const created=await onceMessage(host,m=>m.type==='room_state');
  const code=created.room.code;
  assert.match(code,/^[A-Z0-9]{6}$/);assert.equal(created.room.size,4);assert.equal(created.room.bots,3);assert.equal(created.room.players.length+created.room.bots,4);
  assert.equal(created.room.settings.speed,210);assert.equal(created.room.settings.impostors,2);assert.equal(created.room.settings.renderDist,950);assert.equal(created.room.settings.sheriffCooldown,50);assert.equal(created.room.settings.sheriffChance,70);assert.equal(created.room.settings.sheriffMax,4);assert.equal(created.room.settings.delayedEnabled,1);assert.equal(created.room.settings.delayedChance,82);assert.equal(created.room.settings.delayedMax,3);assert.equal(created.room.settings.delayedDuration,40);assert.equal(created.room.settings.metamorphChance,100);assert.equal(created.room.settings.metamorphMax,2);assert.equal(created.room.settings.metamorphDuration,25);assert.equal(created.room.settings.metamorphCooldown,55);
  assert.equal(created.room.botRoster.length,3);
  const norm=n=>String(n||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const allNames=[...created.room.players.map(p=>p.name),...created.room.botRoster.map(b=>b.name)];
  assert.equal(new Set(allNames.map(norm)).size,allNames.length,'nomes de humanos e bots precisam ser únicos por sala');

  const blocked=await connect(url,'Visitante','verde');all.push(blocked);
  send(blocked,{type:'join_room',code});
  const full=await onceMessage(blocked,m=>m.type==='room_error');assert.match(full.message,/lotada/i);
  send(blocked,{type:'join_room',code:'000000'});
  const missing=await onceMessage(blocked,m=>m.type==='room_error');assert.match(missing.message,/inexistente/i);

  send(host,{type:'start_game'});
  const started=await onceMessage(host,m=>m.type==='game_start');assert.equal(started.room.status,'playing');assert.equal(started.room.players.length+started.room.bots,4);

  const host2=await connect(url,'Host Dois','vermelho');all.push(host2);
  send(host2,{type:'create_room',name:'Host Dois',color:'vermelho',size:5,bots:1,settings:{speed:130,kill:40,crewVision:800,impostors:3,renderDist:1000}});
  const created2=await onceMessage(host2,m=>m.type==='room_state');
  assert.notEqual(created2.room.code,code);assert.equal(created2.room.settings.speed,130);
  const visitor=await connect(url,'Visita','verde');all.push(visitor);
  send(visitor,{type:'join_room',code:created2.room.code});
  const joined=await onceMessage(visitor,m=>m.type==='room_state');assert.equal(joined.room.players.length,2);
  assert.equal(joined.room.hostId,host2.id);

  // O tamanho da sala é imutável depois da criação; bots podem ser removidos para liberar vagas.
  send(host2,{type:'set_room',size:6,bots:0,settings:{speed:130,kill:40,crewVision:800}});
  const sizeError=await onceMessage(host2,m=>m.type==='room_error');assert.match(sizeError.message,/não pode ser alterado/i);
  assert.equal(rooms.get(created2.room.code).size,5);
  send(host2,{type:'set_room',bots:0,settings:{speed:130,kill:40,crewVision:800}});
  await onceMessage(visitor,m=>m.type==='room_state'&&m.room.bots===0);
  assert.equal(rooms.get(created2.room.code).settings.speed,130);assert.equal(rooms.get(created2.room.code).settings.impostors,3,'configurações não enviadas em uma atualização parcial devem ser preservadas');assert.equal(rooms.get(created2.room.code).settings.renderDist,1000);assert.equal(rooms.get(created2.room.code).settings.sheriffCooldown,50);assert.equal(rooms.get(created2.room.code).settings.sheriffChance,35);assert.equal(rooms.get(created2.room.code).settings.sheriffMax,1);
  assert.equal(rooms.get(code).settings.speed,210,'as configurações de outra sala não devem mudar');

  const third=await connect(url,'Terceiro','amarelo');all.push(third);
  send(third,{type:'join_room',code:created2.room.code});
  const joined3=await onceMessage(third,m=>m.type==='room_state');assert.equal(joined3.room.players.length,3);
  send(host2,{type:'leave_room'});
  const transferred=await onceMessage(visitor,m=>m.type==='room_state'&&m.room.hostId===visitor.id);
  assert.equal(transferred.room.players.length,2);
  await onceMessage(visitor,m=>m.type==='player_left'&&m.playerId===host2.id);
  send(visitor,{type:'leave_room'});
  await new Promise(r=>setTimeout(r,60));
  send(third,{type:'leave_room'});
  await new Promise(r=>setTimeout(r,100));
  assert.equal(rooms.has(created2.room.code),false,'o código deve ser invalidado quando todos saem');
});

test('transferência de host preserva o snapshot completo e permite reiniciar a mesma sala', async t=>{
  const app=createGameServer({port:0,host:'127.0.0.1',countdownMs:25,loadingMs:15});
  await new Promise(resolve=>app.server.once('listening',resolve));
  const url=`ws://127.0.0.1:${app.server.address().port}`;const all=[];
  t.after(async()=>{for(const c of all)await closeClient(c);await new Promise(r=>app.server.close(r));rooms.clear()});
  const host=await connect(url,'Host','azul');all.push(host);
  send(host,{type:'create_room',name:'Host',color:'azul',size:6,bots:3,settings:{speed:180,impostors:2,renderDist:950,sheriffCooldown:50,sheriffChance:85,sheriffMax:2}});
  const made=await onceMessage(host,m=>m.type==='room_state');const code=made.room.code;
  const botRosterBefore=made.room.botRoster.map(b=>({...b}));
  assert.equal(new Set(botRosterBefore.map(b=>b.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase())).size,botRosterBefore.length);
  const guest=await connect(url,'Convidado','verde');all.push(guest);
  send(guest,{type:'join_room',code});await onceMessage(guest,m=>m.type==='room_state');
  const peer=await connect(url,'Segundo convidado','rosa');all.push(peer);send(peer,{type:'join_room',code});await onceMessage(peer,m=>m.type==='room_state');
  send(host,{type:'start_game'});await onceMessage(host,m=>m.type==='game_start');await onceMessage(guest,m=>m.type==='game_start');await onceMessage(peer,m=>m.type==='game_start');
  // A match cannot accept late joiners.
  const late=await connect(url,'Atrasado','rosa');all.push(late);send(late,{type:'join_room',code});
  const lateError=await onceMessage(late,m=>m.type==='room_error');assert.match(lateError.message,/começou|encerrada/i);
  const authoritative={seq:23,state:'playing',gt:12,chars:[
    {id:host.id,name:'Host',color:'azul',role:'imp',function:null,x:100,y:100,alive:true,netKillCd:5},
    {id:guest.id,name:'Convidado',color:'verde',role:'crew',function:'locator',x:140,y:100,alive:true,netKillCd:0},
    {id:peer.id,name:'Segundo convidado',color:'rosa',role:'imp',function:'delayed',x:160,y:100,alive:true,netKillCd:0,netDelayedCd:0},
    {id:'bot-id',name:'Bot',color:'amarelo',role:'imp',function:null,x:180,y:100,alive:true,netKillCd:0}
  ],tasks:[],bodies:[],delayedMarks:{[guest.id]:{victimId:guest.id,killerId:peer.id,remaining:12}},sab:{lights:0,reactor:0,comms:0,doors:0,cd:20},doors:[],cfg:{speed:180},killCd:5,trackTarget:null,trackTime:0,trackCd:0,meetCd:20,fixT:0,meeting:null,over:false,winner:null,endReason:'',role:'imp',locator:false,cam:{x:0,y:0},walkVer:0};
  send(host,{type:'state_snapshot',snapshot:authoritative});
  const guestSnapshot=await onceMessage(guest,m=>m.type==='snapshot'&&m.snapshot.seq===23);
  const peerSnapshot=await onceMessage(peer,m=>m.type==='snapshot'&&m.snapshot.seq===23);
  assert.equal(guestSnapshot.snapshot.chars.find(c=>c.id===host.id).role,'crew','o snapshot público esconde o papel de outro jogador');
  assert.equal(peerSnapshot.snapshot.chars.find(c=>c.id===host.id).role,'imp','Infiltrados ainda veem o papel do colega de equipe');
  assert.deepEqual(guestSnapshot.snapshot.delayedMarks,{},'a vítima não recebe o cronômetro privado');
  assert.equal(peerSnapshot.snapshot.delayedMarks[guest.id].remaining,12,'somente o Atrasado que marcou recebe o cronômetro');
  send(host,{type:'leave_room'});
  const transferred=await onceMessage(guest,m=>m.type==='room_state'&&m.room.hostId===guest.id);
  assert.equal(transferred.room.status,'playing');
  const takeover=await onceMessage(guest,m=>m.type==='host_snapshot'&&m.snapshot.seq===23);
  assert.equal(takeover.snapshot.chars.find(c=>c.id===host.id).role,'imp','o novo host recebe a versão autoritativa com papéis completos');
  assert.equal(takeover.snapshot.chars.find(c=>c.id===guest.id).function,'locator');
  assert.equal(takeover.snapshot.delayedMarks[guest.id].remaining,12,'novo host recebe snapshot completo para assumir a autoridade');
  await onceMessage(guest,m=>m.type==='player_left'&&m.playerId===host.id);
  await onceMessage(peer,m=>m.type==='player_left'&&m.playerId===host.id);
  const finalSnapshot={...authoritative,seq:24,state:'over',over:true,winner:'crew',endReason:'Fim de teste'};
  send(guest,{type:'game_end',winner:'crew',reason:'Fim de teste',snapshot:finalSnapshot});
  const result=await onceMessage(peer,m=>m.type==='game_end');
  assert.equal(result.snapshot.state,'over');
  assert.equal(result.snapshot.chars.find(c=>c.id===host.id).role,'imp','o resultado revela os papéis finais para todos');
  const ended=await onceMessage(guest,m=>m.type==='room_state'&&m.room.status==='ended');
  await onceMessage(peer,m=>m.type==='room_state'&&m.room.status==='ended');
  assert.equal(ended.room.hostId,guest.id);
  send(guest,{type:'rematch'});
  const restarted=await onceMessage(guest,m=>m.type==='game_start'&&m.rematch===true);
  await onceMessage(peer,m=>m.type==='game_start'&&m.rematch===true);
  assert.equal(restarted.room.code,code,'a revanche reutiliza o mesmo código de sala');
  assert.equal(restarted.room.round,2);assert.equal(restarted.room.bots,3,'a quantidade de bots deve sobreviver à revanche');assert.equal(restarted.room.settings.impostors,2);assert.equal(restarted.room.settings.renderDist,950);assert.equal(restarted.room.settings.sheriffCooldown,50);assert.equal(restarted.room.settings.sheriffChance,85);assert.equal(restarted.room.settings.sheriffMax,2);
  assert.deepEqual(restarted.room.botRoster,botRosterBefore,'nomes e IDs dos bots devem permanecer estáveis ao reiniciar');
});

test('revanche continua quando a saída do host deixa exatamente três participantes', async t=>{
  const app=createGameServer({port:0,host:'127.0.0.1',countdownMs:25,loadingMs:15});
  await new Promise(resolve=>app.server.once('listening',resolve));
  const url=`ws://127.0.0.1:${app.server.address().port}`;const all=[];
  t.after(async()=>{for(const c of all)await closeClient(c);await new Promise(r=>app.server.close(r));rooms.clear()});
  const host=await connect(url,'Host','azul');all.push(host);
  send(host,{type:'create_room',name:'Host',color:'azul',size:4,bots:2,settings:{speed:180}});
  const made=await onceMessage(host,m=>m.type==='room_state');const code=made.room.code;
  const guest=await connect(url,'Convidado','verde');all.push(guest);send(guest,{type:'join_room',code});await onceMessage(guest,m=>m.type==='room_state');
  send(host,{type:'start_game'});await onceMessage(host,m=>m.type==='game_start');await onceMessage(guest,m=>m.type==='game_start');
  const snapshot={seq:4,state:'playing',over:false,chars:[{id:host.id,name:'Host',color:'azul',role:'imp',function:null},{id:guest.id,name:'Convidado',color:'verde',role:'crew',function:null},{id:'bot1',name:'Bot 1',color:'amarelo',role:'crew',function:null},{id:'bot2',name:'Bot 2',color:'rosa',role:'crew',function:null}],tasks:[],bodies:[],sab:{lights:0,reactor:0,comms:0,doors:0,cd:20},doors:[],cfg:{speed:180},meetCd:20,fixT:0,meeting:null,winner:null,endReason:'',cam:{x:0,y:0},walkVer:0};
  send(host,{type:'state_snapshot',snapshot});await onceMessage(guest,m=>m.type==='snapshot'&&m.snapshot.seq===4);
  send(host,{type:'leave_room'});await onceMessage(guest,m=>m.type==='room_state'&&m.room.hostId===guest.id);await onceMessage(guest,m=>m.type==='host_snapshot');await onceMessage(guest,m=>m.type==='player_left'&&m.playerId===host.id);
  send(guest,{type:'game_end',winner:'crew',reason:'Fim',snapshot:{...snapshot,seq:5,state:'over',over:true,winner:'crew',endReason:'Fim'}});
  await onceMessage(guest,m=>m.type==='room_state'&&m.room.status==='ended');
  send(guest,{type:'rematch'});
  const restarted=await onceMessage(guest,m=>m.type==='game_start'&&m.rematch===true);
  assert.equal(restarted.room.players.length+restarted.room.bots,3);
  assert.equal(restarted.room.code,code);
});

test('último humano saindo invalida a sala mesmo que ainda existam bots', async t=>{
  const app=createGameServer({port:0,host:'127.0.0.1',countdownMs:25,loadingMs:15});
  await new Promise(resolve=>app.server.once('listening',resolve));
  const url=`ws://127.0.0.1:${app.server.address().port}`;const all=[];
  t.after(async()=>{for(const c of all)await closeClient(c);await new Promise(r=>app.server.close(r));rooms.clear()});
  const host=await connect(url,'Host','azul');all.push(host);
  send(host,{type:'create_room',name:'Host',color:'azul',size:4,bots:3});
  const made=await onceMessage(host,m=>m.type==='room_state');const code=made.room.code;
  assert.equal(made.room.players.length+made.room.bots,4);
  send(host,{type:'leave_room'});
  await onceMessage(host,m=>m.type==='left');
  assert.equal(rooms.has(code),false);
  const visitor=await connect(url,'Visitante','verde');all.push(visitor);
  send(visitor,{type:'join_room',code});
  const err=await onceMessage(visitor,m=>m.type==='room_error');assert.match(err.message,/inexistente/i);
});

test('servidor publica o HTML e responde ao health check', async t=>{
  const app=createGameServer({port:0,host:'127.0.0.1',countdownMs:25,loadingMs:15});
  await new Promise(resolve=>app.server.once('listening',resolve));
  t.after(async()=>{await new Promise(r=>app.server.close(r));rooms.clear()});
  const base=`http://127.0.0.1:${app.server.address().port}`;
  const page=await fetch(base);assert.equal(page.status,200);
  const html=await page.text();assert.match(html,/Criar sala/i);assert.match(html,/Entrar na sala/i);
  const health=await fetch(base+'/health');assert.equal(health.status,200);assert.equal((await health.json()).ok,true);
});


test('código alfanumérico maiúsculo, tamanho fixo e cancelamento da contagem ao entrar/sair alguém', async t=>{
  const app=createGameServer({port:0,host:'127.0.0.1',countdownMs:450,loadingMs:25});
  await new Promise(resolve=>app.server.once('listening',resolve));
  const url=`ws://127.0.0.1:${app.server.address().port}`;const all=[];
  t.after(async()=>{for(const c of all)await closeClient(c);await new Promise(r=>app.server.close(r));rooms.clear()});
  const host=await connect(url,'Host','azul');all.push(host);
  send(host,{type:'create_room',name:'Host',color:'azul',size:6,bots:3,settings:{speed:215,impostors:2,renderDist:1000}});
  const created=await onceMessage(host,m=>m.type==='room_state');const code=created.room.code;
  assert.match(code,/^[A-Z0-9]{6}$/);assert.equal(created.room.size,6);
  send(host,{type:'set_room',size:7,bots:3});
  const sizeError=await onceMessage(host,m=>m.type==='room_error');assert.match(sizeError.message,/não pode ser alterado/i);
  send(host,{type:'start_game'});
  await onceMessage(host,m=>m.type==='countdown_start');
  const guest=await connect(url,'Convidado','verde');all.push(guest);
  send(guest,{type:'join_room',code:code.toLowerCase()});
  await onceMessage(guest,m=>m.type==='room_state'&&m.room.players.length===2);
  await onceMessage(host,m=>m.type==='room_state'&&m.room.status==='lobby'&&m.room.players.length===2);
  await onceMessage(host,m=>m.type==='countdown_cancelled');
  assert.equal(rooms.get(code).status,'lobby');
  send(host,{type:'set_room',bots:2});
  await onceMessage(host,m=>m.type==='room_state'&&m.room.bots===2);
  send(host,{type:'start_game'});
  await onceMessage(host,m=>m.type==='countdown_start');
  send(guest,{type:'leave_room'});
  await onceMessage(host,m=>m.type==='room_state'&&m.room.status==='lobby'&&m.room.players.length===1);
  await onceMessage(host,m=>m.type==='countdown_cancelled');
  assert.equal(rooms.get(code).status,'lobby');assert.equal(rooms.get(code).settings.speed,215);assert.equal(rooms.get(code).settings.impostors,2);assert.equal(rooms.get(code).settings.renderDist,1000,'atualizar somente bots não deve zerar outras configurações');
});


test('configurações do Atrasado respeitam limites e valores padrão', () => {
  const settings=cleanSettings({delayedEnabled:7,delayedChance:140,delayedMax:99,delayedDuration:99});
  assert.equal(settings.delayedEnabled,1);
  assert.equal(settings.delayedChance,100);
  assert.equal(settings.delayedMax,3);
  assert.equal(settings.delayedDuration,40);
  const low=cleanSettings({delayedEnabled:-2,delayedChance:-3,delayedMax:-4,delayedDuration:1});
  assert.equal(low.delayedEnabled,0);
  assert.equal(low.delayedChance,0);
  assert.equal(low.delayedMax,0);
  assert.equal(low.delayedDuration,5);
  const defaults=cleanSettings({});
  assert.equal(defaults.delayedEnabled,0);
  assert.equal(defaults.delayedChance,35);
  assert.equal(defaults.delayedMax,1);
  assert.equal(defaults.delayedDuration,20);
});


test('chat escrito funciona na sala de espera e só é retransmitido aos participantes da própria sala', async t=>{
  const app=createGameServer({port:0,host:'127.0.0.1',countdownMs:15,loadingMs:10});
  await new Promise(resolve=>app.server.once('listening',resolve));
  const url=`ws://127.0.0.1:${app.server.address().port}`;const all=[];
  t.after(async()=>{for(const c of all)await closeClient(c);await new Promise(r=>app.server.close(r));rooms.clear()});
  const hostA=await connect(url,'Host A','azul');all.push(hostA);
  send(hostA,{type:'create_room',name:'Host A',color:'azul',size:6,bots:3});
  const roomA=await onceMessage(hostA,m=>m.type==='room_state');
  const guestA=await connect(url,'Visitante A','verde');all.push(guestA);
  send(guestA,{type:'join_room',code:roomA.room.code});await onceMessage(guestA,m=>m.type==='room_state');
  const hostB=await connect(url,'Host B','vermelho');all.push(hostB);
  send(hostB,{type:'create_room',name:'Host B',color:'vermelho',size:4,bots:3});
  const roomB=await onceMessage(hostB,m=>m.type==='room_state');
  send(guestA,{type:'room_chat',text:'Olá, sala A!'});
  const [echoA,echoGuest]=await Promise.all([
    onceMessage(hostA,m=>m.type==='room_chat_message'),
    onceMessage(guestA,m=>m.type==='room_chat_message')
  ]);
  assert.equal(echoA.roomCode,roomA.room.code);assert.equal(echoGuest.roomCode,roomA.room.code);
  assert.equal(echoA.text,'Olá, sala A!');assert.equal(echoGuest.name,'Visitante A');
  await new Promise(r=>setTimeout(r,100));
  assert.equal(hostB.messages.some(m=>m.type==='room_chat_message'),false,`a sala ${roomB.room.code} não deve receber mensagens da sala ${roomA.room.code}`);
  send(hostA,{type:'start_game'});await onceMessage(hostA,m=>m.type==='game_start');await onceMessage(guestA,m=>m.type==='game_start');
  send(guestA,{type:'room_chat',text:'Esta mensagem não deve passar durante a partida'});
  const denied=await onceMessage(guestA,m=>m.type==='room_error');assert.match(denied.message,/sala de espera/i);
});


test('servidor encaminha pedidos de metamorfose ao host da sala', async t=>{
  const app=createGameServer({port:0,host:'127.0.0.1',countdownMs:25,loadingMs:15});
  await new Promise(resolve=>app.server.once('listening',resolve));
  const url=`ws://127.0.0.1:${app.server.address().port}`, all=[];
  t.after(async()=>{for(const c of all)await closeClient(c);await new Promise(r=>app.server.close(r));rooms.clear()});
  const host=await connect(url,'Host Meta','azul');all.push(host);
  send(host,{type:'create_room',name:'Host Meta',color:'azul',size:4,bots:2,settings:{impostors:2,metamorphChance:100,metamorphMax:2,metamorphDuration:15,metamorphCooldown:20}});
  const created=await onceMessage(host,m=>m.type==='room_state');
  assert.equal(created.room.settings.metamorphMax,2);
  const guest=await connect(url,'Convidado Meta','verde');all.push(guest);
  send(guest,{type:'join_room',code:created.room.code});
  await onceMessage(guest,m=>m.type==='room_state');
  send(host,{type:'start_game'});await onceMessage(host,m=>m.type==='game_start');await onceMessage(guest,m=>m.type==='game_start');
  send(guest,{type:'action',action:'metamorphose',targetId:'bot_test_target'});
  const command=await onceMessage(host,m=>m.type==='host_command'&&m.command==='metamorphose');
  assert.equal(command.playerId,guest.id);assert.equal(command.targetId,'bot_test_target');
});
