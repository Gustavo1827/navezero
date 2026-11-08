'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createGameServer,rooms}=require('../server');
const send=(c,m)=>c.ws.send(JSON.stringify(m));
async function message(c,predicate){const until=Date.now()+2500;while(Date.now()<until){const i=c.messages.findIndex(predicate);if(i>=0)return c.messages.splice(i,1)[0];await new Promise(r=>setTimeout(r,10))}throw Error('Mensagem não recebida')}
async function connect(url,name){const ws=new WebSocket(url),c={ws,messages:[]};ws.addEventListener('message',e=>c.messages.push(JSON.parse(e.data)));await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true})});send(c,{type:'hello',name});c.id=(await message(c,m=>m.type==='welcome')).id;return c}

test('servidor restringe Assassino manual à sala privada e a participantes presentes',async t=>{
 const app=createGameServer({port:0,host:'127.0.0.1',countdownMs:25,loadingMs:15}),clients=[];
 await new Promise(r=>app.server.once('listening',r));
 t.after(async()=>{for(const c of clients)c.ws.close();await new Promise(r=>setTimeout(r,50));await new Promise(r=>app.server.close(r));rooms.clear()});
 const url=`ws://127.0.0.1:${app.server.address().port}`,h=await connect(url,'Host'),g=await connect(url,'Azul');clients.push(h,g);
 send(h,{type:'create_room',mode:'esconde-esconde',size:6,bots:2,settings:{hnsKillerId:'inexistente'}});
 const created=(await message(h,m=>m.type==='room_state')).room,code=created.code;assert.equal(created.settings.hnsKillerId,'');
 send(g,{type:'join_room',code});await message(g,m=>m.type==='room_state');
 send(g,{type:'set_room',settings:{hnsKillerId:g.id}});await message(g,m=>m.type==='room_error');assert.equal(rooms.get(code).settings.hnsKillerId,'');
 send(h,{type:'set_room',settings:{hnsKillerId:g.id}});await message(g,m=>m.type==='room_state'&&m.room.settings.hnsKillerId===g.id);
 send(g,{type:'leave_room'});await message(g,m=>m.type==='left');await message(h,m=>m.type==='room_state'&&m.room.players.length===1&&m.room.settings.hnsKillerId==='');
 send(g,{type:'join_room',code});await message(g,m=>m.type==='room_state');
 const bot=rooms.get(code).botRoster[1].id;
 send(h,{type:'set_room',settings:{hnsKillerId:bot}});await message(g,m=>m.type==='room_state'&&m.room.settings.hnsKillerId===bot);
 send(h,{type:'set_room',bots:1});await message(g,m=>m.type==='room_state'&&m.room.bots===1&&m.room.settings.hnsKillerId==='');
 send(h,{type:'set_room',bots:2,settings:{hnsKillerId:g.id}});await message(g,m=>m.type==='room_state'&&m.room.bots===2&&m.room.settings.hnsKillerId===g.id);
 send(h,{type:'set_room_privacy',privacy:'public'});await message(g,m=>m.type==='room_state'&&m.room.privacy==='public'&&m.room.settings.hnsKillerId==='');
 send(h,{type:'set_room',settings:{hnsKillerId:h.id}});await message(h,m=>m.type==='room_state'&&m.room.privacy==='public'&&m.room.settings.hnsKillerId==='');assert.equal(rooms.get(code).settings.hnsKillerId,'');
 send(h,{type:'set_room_privacy',privacy:'private'});await message(g,m=>m.type==='room_state'&&m.room.privacy==='private'&&m.room.settings.hnsKillerId==='');
 send(h,{type:'set_room',settings:{hnsKillerId:g.id}});await message(g,m=>m.type==='room_state'&&m.room.privacy==='private'&&m.room.settings.hnsKillerId===g.id);
 send(h,{type:'start_game'});const started=await message(g,m=>m.type==='game_start');assert.equal(started.room.settings.hnsKillerId,g.id);
});
