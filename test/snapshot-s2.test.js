'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createGameServer,rooms}=require('../server');

const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
function onceMessage(client,predicate,timeout=2600){return new Promise((resolve,reject)=>{const start=Date.now();const timer=setInterval(()=>{const i=client.messages.findIndex(predicate);if(i>=0){clearInterval(timer);return resolve(client.messages.splice(i,1)[0])}if(Date.now()-start>timeout){clearInterval(timer);reject(new Error('Timeout aguardando mensagem'))}},10)})}
async function connect(url,name='Host'){const ws=new WebSocket(url),client={ws,messages:[]};ws.addEventListener('message',e=>{try{client.messages.push(JSON.parse(e.data))}catch{}});await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true})});ws.send(JSON.stringify({type:'hello',name,color:'azul'}));const welcome=await onceMessage(client,m=>m.type==='welcome');client.id=welcome.id;return client}
async function closeClient(c){try{c?.ws?.close()}catch{}await new Promise(r=>setTimeout(r,25))}

test('0.4b-s4 inclui streamer mode, idiomas e prévia de sala com estrutura de localização',()=>{
  assert.match(html,/Versão 0\.4b-s4/);
  assert.match(html,/id="streamerModeIn"/);assert.match(html,/Modo para Streamers/);assert.match(html,/maskedRoomCode/);assert.match(html,/navigator\.clipboard\.writeText\(code\)/);
  for(const label of ['Português (Brasil)','Português (Portugal)','Español','English','Русский','日本語'])assert.ok(html.includes(label),`idioma ausente: ${label}`);
  assert.match(html,/let I18N=/);assert.match(html,/function t\(key,vars=\{\}\)/);assert.match(html,/languages\.json/);assert.match(html,/navezero_user_preferences_v1/);
  assert.match(html,/id="btnGameLanguage"[^>]*>Idioma do jogo<\/button>/);assert.doesNotMatch(html,/id="gameLanguageValue"/);
  assert.match(html,/function applyGameLanguage\(\)/);assert.match(html,/function closeLanguageMenu\(\)/);assert.match(html,/loadLanguageCatalog\(\)\.finally/);
  assert.ok(html.includes("(selected?'✓ ':'')+label"));assert.match(html,/userToggleSwitch/);assert.match(html,/userToggleTrack:after/);
  assert.match(html,/id="createRegionIn"/);assert.match(html,/id="createLanguageIn"/);assert.match(html,/id="roomInfoOverlay"/);assert.match(html,/type:'room_info'/);assert.match(html,/roomInfoConfirming/);
});

test('servidor guarda região e idioma e consulta dados reais antes da entrada',async t=>{
  const app=createGameServer({port:0,host:'127.0.0.1'});await new Promise(resolve=>app.server.once('listening',resolve));const url=`ws://127.0.0.1:${app.server.address().port}`;const host=await connect(url,'Gustavo'),guest=await connect(url,'Visitante');t.after(async()=>{await closeClient(host);await closeClient(guest);await new Promise(r=>app.server.close(r));rooms.clear()});
  host.ws.send(JSON.stringify({type:'create_room',name:'Gustavo',color:'azul',size:8,bots:2,region:'europe',language:'pt-PT',settings:{}}));
  const created=await onceMessage(host,m=>m.type==='room_state');assert.equal(created.room.region,'europe');assert.equal(created.room.language,'pt-PT');const code=created.room.code;
  guest.ws.send(JSON.stringify({type:'room_info',code}));const info=await onceMessage(guest,m=>m.type==='room_info');assert.deepEqual(info.room,{code,current:3,size:8,hostName:'Gustavo',region:'europe',language:'pt-PT',mode:'classic',impostors:1,status:'lobby',privacy:'private',full:false});
  const room=rooms.get(code);room.bots=7;guest.ws.send(JSON.stringify({type:'room_info',code}));const full=await onceMessage(guest,m=>m.type==='room_info');assert.equal(full.room.full,true);assert.equal(full.room.current,8);
});
