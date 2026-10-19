'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createGameServer,rooms,cleanSettings}=require('../server');

const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const serverSrc=fs.readFileSync(path.join(root,'server.js'),'utf8');

function onceMessage(client,predicate,timeout=2600){
  return new Promise((resolve,reject)=>{
    const start=Date.now();
    const timer=setInterval(()=>{
      const i=client.messages.findIndex(predicate);
      if(i>=0){clearInterval(timer);return resolve(client.messages.splice(i,1)[0])}
      if(Date.now()-start>timeout){clearInterval(timer);reject(new Error('Timeout aguardando mensagem'))}
    },10);
  });
}
async function connect(url,name='Host'){
  const ws=new WebSocket(url),client={ws,messages:[]};
  ws.addEventListener('message',e=>{try{client.messages.push(JSON.parse(e.data))}catch{}});
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true})});
  ws.send(JSON.stringify({type:'hello',name,color:'azul'}));
  const welcome=await onceMessage(client,m=>m.type==='welcome');client.id=welcome.id;return client;
}

async function closeClient(client){try{client?.ws?.close()}catch{}await new Promise(r=>setTimeout(r,25))}

test('Snapshot 75 integra votação automática, Anjo Guardião e Ascensão dos Mortos',()=>{
  assert.match(html,/Versão 0\.3b-s75/);
  assert.match(html,/const everyoneVoted=voters\.every\(c=>M\.votes\[c\.id\]!==undefined\)/);
  assert.match(html,/id="btnGuardian"[\s\S]*?🪽<small>Proteger<\/small>/);
  assert.match(html,/guardianDuration:\[10,30\]/);
  assert.match(html,/guardianChance:\[0,100\]/);
  assert.match(html,/guardianMax:\[0,15\]/);
  assert.match(html,/guardianImpostorVisible:\[0,1\]/);
  assert.match(html,/consumeGuardianProtection\(v,'kill'\)/);
  assert.match(html,/consumeGuardianProtection\(victim,'delayed'\)/);
  assert.match(html,/consumeGuardianProtection\(target,'parasite'\)/);
  assert.match(html,/consumeGuardianProtection\(target,'control'\)/);
  assert.match(html,/name:'Ascensão dos Mortos'/);
  assert.match(html,/if\(id==='dead'\)[\s\S]*?const help=presetConfig\('help'\)[\s\S]*?cfg\[role\.chanceKey\]=100[\s\S]*?Math\.min\(5,configuredPlayerCount\(\),15\)/);
  assert.match(serverSrc,/canSeeGuardianProtection[\s\S]*?guardianImpostorVisible/);
  const s=cleanSettings({guardianDuration:99,guardianChance:120,guardianMax:99,guardianImpostorVisible:0},8);
  assert.equal(s.guardianDuration,30);assert.equal(s.guardianChance,100);assert.equal(s.guardianMax,8);assert.equal(s.guardianImpostorVisible,0);
});

test('Sala de Espera expira mesmo durante a contagem se nenhuma partida iniciou',async t=>{
  const app=createGameServer({port:0,host:'127.0.0.1',countdownMs:1600,loadingMs:100,lobbyMaxMs:1050,lobbySweepMs:25});
  await new Promise(resolve=>app.server.once('listening',resolve));
  const url=`ws://127.0.0.1:${app.server.address().port}`;
  const host=await connect(url);
  t.after(async()=>{await closeClient(host);await new Promise(r=>app.server.close(r));rooms.clear()});
  host.ws.send(JSON.stringify({type:'create_room',name:'Host',color:'azul',size:4,bots:3,settings:{}}));
  const made=await onceMessage(host,m=>m.type==='room_state'&&m.room?.status==='lobby');
  assert.ok(made.room.lobbyRemainingMs>0&&made.room.lobbyRemainingMs<=1050);
  host.ws.send(JSON.stringify({type:'start_game'}));
  await onceMessage(host,m=>m.type==='countdown_start');
  const expired=await onceMessage(host,m=>m.type==='room_expired',2300);
  assert.match(expired.message,/10 minutos/i);
  assert.equal(rooms.has(made.room.code),false);
  assert.equal(host.messages.some(m=>m.type==='game_start'),false);
});
