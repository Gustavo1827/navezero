'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createGameServer,rooms}=require('../server');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
function onceMessage(client,predicate,timeout=2500){return new Promise((resolve,reject)=>{const start=Date.now();const timer=setInterval(()=>{const i=client.messages.findIndex(predicate);if(i>=0){clearInterval(timer);resolve(client.messages.splice(i,1)[0]);return}if(Date.now()-start>timeout){clearInterval(timer);reject(new Error('Timeout aguardando mensagem'))}},10)})}
async function connect(url,name,key,color='azul'){const ws=new WebSocket(url),client={ws,messages:[]};ws.addEventListener('message',e=>{try{client.messages.push(JSON.parse(e.data))}catch{}});await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true})});ws.send(JSON.stringify({type:'hello',name,color,clientKey:key}));client.id=(await onceMessage(client,m=>m.type==='welcome')).id;return client}
const send=(c,o)=>c.ws.send(JSON.stringify(o));
async function closeClient(c){if(!c)return;try{c.ws.close()}catch{}await new Promise(r=>setTimeout(r,20))}

test('Chat Rápido e interface incluem novas falas e controles de punição',()=>{
  for(const text of ['Encontrei o corpo de [morto] em [sala]','Vi [jogador/alguém] usar a função de [função]!','Você não tem provas','Vamos expulsar [jogador] do jogo!','Vamos expulsar [jogador] do jogo?'])assert.ok(html.includes(text),text);
  assert.match(html,/id="btnLobbyModeration"[^>]*>⚠️/);
  assert.match(html,/id="btnMeetingModeration"[^>]*>⚠️/);
  assert.match(html,/moderate_lobby/);assert.match(html,/moderation_vote/);assert.match(html,/navezero_online_client_v1/);
});

test('host pode expulsar e banir no lobby, e banimento vale enquanto a sala existir',async t=>{
  const app=createGameServer({port:0,host:'127.0.0.1',countdownMs:10,loadingMs:5});await new Promise(r=>app.server.once('listening',r));const url=`ws://127.0.0.1:${app.server.address().port}`,all=[];
  t.after(async()=>{for(const c of all)await closeClient(c);await new Promise(r=>app.server.close(r));rooms.clear()});
  const host=await connect(url,'Host','host_key_123456');all.push(host);send(host,{type:'create_room',name:'Host',size:5,bots:0});const made=await onceMessage(host,m=>m.type==='room_state');const code=made.room.code;
  const kicked=await connect(url,'Kick','kick_key_123456');all.push(kicked);send(kicked,{type:'join_room',code});await onceMessage(kicked,m=>m.type==='room_state');send(host,{type:'moderate_lobby',action:'kick',targetId:kicked.id});await onceMessage(kicked,m=>m.type==='moderation_removed'&&m.reason==='kick');
  send(kicked,{type:'join_room',code});await onceMessage(kicked,m=>m.type==='room_state'&&m.room.code===code);
  const banned=await connect(url,'Ban','ban_key_1234567');all.push(banned);send(banned,{type:'join_room',code});await onceMessage(banned,m=>m.type==='room_state');send(host,{type:'moderate_lobby',action:'ban',targetId:banned.id});await onceMessage(banned,m=>m.type==='moderation_removed'&&m.reason==='ban');
  const retry=await connect(url,'Ban de novo','ban_key_1234567');all.push(retry);send(retry,{type:'join_room',code});const err=await onceMessage(retry,m=>m.type==='room_error');assert.match(err.message,/banido/i);
});

test('votação de punição na reunião não duplica votos e exige o host quando aplicável',async t=>{
  const app=createGameServer({port:0,host:'127.0.0.1',countdownMs:10,loadingMs:5});await new Promise(r=>app.server.once('listening',r));const url=`ws://127.0.0.1:${app.server.address().port}`,all=[];
  t.after(async()=>{for(const c of all)await closeClient(c);await new Promise(r=>app.server.close(r));rooms.clear()});
  const host=await connect(url,'Host','host_vote_123456'),a=await connect(url,'A','vote_a_12345678'),b=await connect(url,'B','vote_b_12345678'),target=await connect(url,'Alvo','vote_t_12345678');all.push(host,a,b,target);
  send(host,{type:'create_room',name:'Host',size:4,bots:0});const made=await onceMessage(host,m=>m.type==='room_state');const code=made.room.code;
  for(const c of [a,b,target]){send(c,{type:'join_room',code});await onceMessage(c,m=>m.type==='room_state')}
  send(host,{type:'start_game'});for(const c of [host,a,b,target])await onceMessage(c,m=>m.type==='game_start');
  const chars=[host,a,b,target].map(c=>({id:c.id,name:c===target?'Alvo':'P',color:'azul',role:'crew',alive:true,x:100,y:100}));send(host,{type:'state_snapshot',snapshot:{seq:1,state:'meeting',chars,tasks:[],bodies:[],sab:{lights:0,reactor:0,comms:0,doors:0},doors:[],meeting:{phase:'discuss'}}});
  await onceMessage(a,m=>m.type==='moderation_state'&&m.state.meeting);
  send(a,{type:'moderation_vote',targetId:target.id});send(a,{type:'moderation_vote',targetId:target.id});send(b,{type:'moderation_vote',targetId:target.id});
  const state=await onceMessage(a,m=>m.type==='moderation_state'&&m.state.targets.some(x=>x.targetId===target.id&&x.count===2));const row=state.state.targets.find(x=>x.targetId===target.id);assert.equal(row.required,3);assert.equal(row.hostRequired,true);assert.equal(row.hostVoted,false);
  await new Promise(r=>setTimeout(r,80));assert.equal(target.messages.some(m=>m.type==='moderation_removed'),false);
  send(host,{type:'moderation_vote',targetId:target.id});const removed=await onceMessage(target,m=>m.type==='moderation_removed');assert.equal(removed.reason,'vote_kick');
});
