/* Shared waiting-ship geometry. This world never changes match maps or physics. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.NZLobbyRules=factory()})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const floor={x:240,y:180,w:520,h:520},items=[{id:'computer',x:320,y:300,w:80,h:45,useX:360,useY:365},{id:'wardrobe',x:600,y:300,w:80,h:45,useX:640,useY:365}],speed=165,entryMs=1500;
 const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
 function blocked(x,y){return x<floor.x+13||x>floor.x+floor.w-13||y<floor.y+18||y>floor.y+floor.h-12||items.some(r=>x+12>r.x&&x-12<r.x+r.w&&y+12>r.y&&y-10<r.y+r.h)}
 function move(p,x,y,dt){const len=Math.hypot(x,y);if(len>1){x/=len;y/=len}const steps=Math.max(1,Math.ceil(speed*dt/6));let moved=false;for(let i=0;i<steps;i++){const nx=p.x+x*speed*dt/steps,ny=p.y+y*speed*dt/steps;if(!blocked(nx,p.y)){moved=moved||nx!==p.x;p.x=nx}if(!blocked(p.x,ny)){moved=moved||ny!==p.y;p.y=ny}}if(x)p.face=x>0?1:-1;p.moving=moved;return moved}
 function seat(i){return i===14?{x:500,y:212,face:1}:{x:i%2?737:263,y:235+Math.floor(i/2)*63,face:i%2?-1:1}}
 function sync(room,now){if(!room.lobbyWorld||room.lobbyWorld.epoch!==room.createdAt)room.lobbyWorld={epoch:room.createdAt,at:now,seq:0,people:new Map()};const w=room.lobbyWorld,roster=[...room.players,...room.botRoster],ids=new Set(roster.map(p=>p.id));for(const id of w.people.keys())if(!ids.has(id))w.people.delete(id);for(const person of roster)if(!w.people.has(person.id)){const used=new Set([...w.people.values()].map(p=>p.seat)),index=Array.from({length:15},(_,i)=>i).find(i=>!used.has(i))??0,s=seat(index);w.people.set(person.id,{id:person.id,x:s.x,y:s.y,face:s.face,seat:index,entryAt:now,moving:false,inputX:0,inputY:0,inputAt:0,nextGoal:now+entryMs+index*240,bot:!room.players.some(p=>p.id===person.id)})}return w}
 function input(room,id,m,now){const p=sync(room,now).people.get(id);if(!p||p.bot||now-p.entryAt<entryMs)return;const x=Number(m.x),y=Number(m.y);if(!Number.isFinite(x)||!Number.isFinite(y)||((x||y)&&now-(p.inputAt||0)<25))return;p.inputX=clamp(x,-1,1);p.inputY=clamp(y,-1,1);p.inputAt=now}
 function tick(room,now){const w=sync(room,now),dt=clamp((now-w.at)/1000,0,.15);w.at=now;let changed=false;for(const p of w.people.values()){
  const age=now-p.entryAt;if(age<entryMs){p.moving=false;continue}if(!p.landed){const s=seat(p.seat);p.x=s.x+(p.seat===14?0:s.face*42);p.y=s.y+15;p.landed=true;changed=true}
  let x=0,y=0;if(p.bot){if(now>=p.nextGoal){p.goal={x:285+Math.random()*430,y:390+Math.random()*275};p.nextGoal=now+4000+Math.random()*4000}if(p.goal){const dx=p.goal.x-p.x,dy=p.goal.y-p.y,d=Math.hypot(dx,dy);if(d>8){x=dx/d*.55;y=dy/d*.55}else p.goal=null}}
  else if(now-p.inputAt<700){x=p.inputX;y=p.inputY}const was=p.moving;changed=move(p,x,y,dt)||was!==p.moving||changed;
 }if(changed)w.seq++;return changed}
 function snapshot(room,now){const w=sync(room,now);return{epoch:w.epoch,seq:w.seq,serverNow:now,people:[...w.people.values()].map(({id,x,y,face,seat,entryAt,moving})=>({id,x,y,face,seat,entryAt,moving}))}}
 function nearest(p){return p?items.find(r=>Math.hypot(p.x-r.useX,p.y-r.useY)<100):null}
 return{floor,items,speed,entryMs,blocked,move,seat,sync,input,tick,snapshot,nearest};
});
