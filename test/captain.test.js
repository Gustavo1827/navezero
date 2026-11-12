'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{createGameServer}=require('../server');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function receive(c,p){for(let i=0;i<180;i++){const at=c.messages.findIndex(p);if(at>=0)return c.messages.splice(at,1)[0];await delay(10)}throw Error('Captain protocol message missing')}
async function connect(url,name){const ws=new WebSocket(url),c={ws,messages:[]};ws.onmessage=e=>c.messages.push(JSON.parse(e.data));await new Promise(r=>ws.onopen=r);send(c,{type:'hello',name,checkpointProtocol:1});c.id=(await receive(c,m=>m.type==='welcome')).id;return c}
const send=(c,m)=>c.ws.send(JSON.stringify(m));
test('Captain validates uses, cooldown, sabotage, reservations and host transfer on the server',async t=>{
 const app=createGameServer({host:'127.0.0.1',port:0,countdownMs:0,loadingMs:0}),all=[];await new Promise(r=>app.server.once('listening',r));t.after(async()=>{for(const c of all)c.ws.close();await delay(50);await new Promise(r=>app.server.close(r))});const url='ws://127.0.0.1:'+app.server.address().port;
 const host=await connect(url,'Host');let captain=await connect(url,'Captain'),other=await connect(url,'Other');all.push(host,captain,other);
 send(host,{type:'create_room',size:7,bots:2,settings:{emergencyUses:3,captainChance:100,captainMax:15,captainCooldown:10,locChance:0,sheriffChance:0,engChance:0}});const created=await receive(host,m=>m.type==='room_state'),code=created.room.code;assert.equal(created.room.settings.captainMax,6);for(const c of [captain,other]){send(c,{type:'join_room',code});await receive(c,m=>m.type==='room_state')}
 // Keep the next human administrator a Captain in this handoff fixture.
 const originalRandom=Math.random;try{Math.random=()=>.2;send(host,{type:'start_game'});await receive(host,m=>m.type==='game_start')}finally{Math.random=originalRandom}const room=app.rooms.get(code);if(room.initialRoles[captain.id].function!=='captain')[captain,other]=[other,captain];const bot=room.botRoster.find(b=>room.initialRoles[b.id].function==='captain');assert(bot);assert.equal(room.initialRoles[captain.id].function,'captain');let authority=host,epoch=0,seq=0;
 const state={state:'playing',gt:0,meetCd:999,chars:[...room.players.map(p=>({...p,...room.initialRoles[p.id],alive:true,emUses:3})),...room.botRoster.map(p=>({...p,...room.initialRoles[p.id],alive:true,isBot:true,emUses:3}))],tasks:[],bodies:[],sab:{reactor:0,oxygen:0,lights:0,comms:0,doors:0},doors:[],cfg:room.settings,meeting:null};
 async function publish(){send(authority,{type:'state_snapshot',authorityEpoch:epoch,snapshot:{...structuredClone(state),seq:++seq}});return receive(other,m=>m.type==='snapshot'&&m.snapshot.seq===seq)}
 async function rejected(c=captain,data={}){send(c,{type:'captain_request',...data});await receive(c,m=>m.type==='captain_rejected')}
 await publish();await rejected(other,{actorId:captain.id});
 assert.equal(room.captainRecords.get(captain.id).readyAt,10);assert.equal(room.captainRecords.get(bot.id).readyAt,10);
 await rejected();send(host,{type:'captain_request',actorId:bot.id});await receive(host,m=>m.type==='captain_rejected');assert.equal(room.captainRecords.get(captain.id).uses,3);assert.equal(room.captainRecords.get(bot.id).uses,3);
 // Client-supplied time and cooldown cannot bypass the server's initial deadline.
 state.gt=999;state.chars.find(ch=>ch.id===captain.id).captainReadyAt=0;await publish();await rejected();
 for(const record of room.captainRecords.values())record.notBefore=performance.now()-1;
 state.gt=9.9;await publish();await rejected();assert.equal(room.captainRecords.get(captain.id).uses,3);
 state.gt=12;await publish();
 // A valid call is independent of the physical emergency button's cooldown.
 send(captain,{type:'captain_request'});const first=await receive(host,m=>m.type==='captain_order');assert.equal(first.uses,2);assert.equal(first.readyAt,22);await rejected();assert.equal(room.captainRecords.get(captain.id).uses,2);
 state.state='meeting';state.meeting={phase:'intro',callerId:captain.id,reason:'emergency',captainCallId:first.id,chat:[]};const meeting=await publish();assert.equal(room.captainPending,null);assert.equal(meeting.snapshot.meeting.captainCallId,first.id);assert.equal(meeting.snapshot.chars.find(c=>c.id===captain.id).captainReadyAt,undefined,'private cooldown is hidden from other players');
 room.captainRecords.get(captain.id).notBefore=performance.now()-1;state.state='playing';state.meeting=null;state.gt=13;await publish();await rejected();assert.equal(room.lastSnapshot.chars.find(c=>c.id===captain.id).emUses,2,'a stale client cannot refill emergency uses');
 state.gt=23;await publish();for(const kind of ['reactor','oxygen','lights','comms','doors']){room.lastSnapshot.sab[kind]=10;await rejected();assert.equal(room.captainRecords.get(captain.id).uses,2);room.lastSnapshot.sab[kind]=0}
 room.doorControl.locks.example={roomId:'cafe',until:0};await rejected();delete room.doorControl.locks.example;
 for(const phase of ['role','meeting','over']){room.lastSnapshot.state=phase;await rejected()}room.lastSnapshot.state='playing';
 send(captain,{type:'captain_request'});const cancelled=await receive(host,m=>m.type==='captain_order');send(host,{type:'captain_ack',id:cancelled.id,round:room.round,epoch,success:false});await receive(host,m=>m.type==='captain_state');assert.equal(room.captainRecords.get(captain.id).uses,2);assert.equal(room.captainRecords.get(captain.id).readyAt,22,'rejection restores the exact previous cooldown');
 send(captain,{type:'captain_request'});const pending=await receive(host,m=>m.type==='captain_order');host.ws.close();const takeover=await receive(captain,m=>m.type==='host_snapshot');epoch=takeover.handoff.epoch;authority=captain;assert.equal(takeover.snapshot.chars.find(c=>c.id===captain.id).emUses,1);send(captain,{type:'authority_ready',...takeover.handoff});const replay=await receive(captain,m=>m.type==='captain_order');assert.equal(replay.id,pending.id);assert.equal(replay.uses,1);
 seq=Math.max(seq,takeover.snapshot.seq);state.state='meeting';state.meeting={phase:'intro',callerId:captain.id,reason:'emergency',captainCallId:replay.id,chat:[]};await publish();assert.equal(room.captainRecords.get(captain.id).uses,1);assert.equal(room.captainPending,null);
 state.state='playing';state.meeting=null;state.gt=34;await publish();send(captain,{type:'captain_request',actorId:bot.id});const botCall=await receive(captain,m=>m.type==='captain_order');assert.equal(botCall.actorId,bot.id);assert.equal(botCall.uses,2);assert.equal(room.captainRecords.get(captain.id).uses,1,'the bot spends its own personal use');
});
