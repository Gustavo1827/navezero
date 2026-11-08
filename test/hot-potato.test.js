'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),{cleanSettings}=require('../server');
const source=fs.readFileSync(path.join(__dirname,'../assets/hot-potato.js'),'utf8');
test('Batata Quente limita os tempos e todas as categorias de tarefas têm mínimo um',()=>{const cfg=cleanSettings({hpType:99,hpDuration:999,hpExplosion:0,hpPassCooldown:0,commonTasks:0,mediumTasks:0,longTasks:0});assert.equal(cfg.hpType,1);assert.equal(cfg.hpDuration,120);assert.equal(cfg.hpExplosion,10);assert.equal(cfg.hpPassCooldown,5);for(const key of ['commonTasks','mediumTasks','longTasks'])assert.equal(cfg[key],1)});
test('passagem autoritativa rejeita seq antiga, recarga, alvo morto e distância',()=>{const from={id:'a',alive:true,x:0,y:0},to={id:'b',alive:true,x:20,y:0},G={hp:{holderId:'a',seq:3,passCd:0,previous:{}}},context={G,CFG:{hpExplosion:20,hpPassCooldown:5},active:()=>true,live:()=>true,authority:()=>true,living:()=>[from,to],dist:(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),actionDistancePx:()=>100,losClear:()=>true,Snd:{click(){}}};for(const name of ['selectHolder','transfer'])vm.runInNewContext(source.match(new RegExp(' function '+name+'\\([^\\n]+'))[0],context);assert.equal(context.transfer(from,to,2),false);G.hp.passCd=1;assert.equal(context.transfer(from,to,3),false);G.hp.passCd=0;to.alive=false;assert.equal(context.transfer(from,to,3),false);to.alive=true;to.x=200;assert.equal(context.transfer(from,to,3),false);to.x=20;assert.equal(context.transfer(from,to,3),true);assert.equal(G.hp.holderId,'b');assert.equal(G.hp.previous.b,'a');assert.equal(G.hp.remaining,20);assert.equal(G.hp.passCd,5);assert.equal(context.transfer(from,to,3),false)});
test('Batata Quente exclui o portador e eliminados, mas premia o portador como último sobrevivente',()=>{
 let alive=[{id:'a',alive:true},{id:'b',alive:true}],host=true;
 const G={hp:{holderId:'a',matchRemaining:1},over:false},context={G,CFG:{hpType:0},active:()=>true,authority:()=>host,living:()=>alive,progress:()=>1,t:k=>k,endGame(w){G.over=true;G.winner=w}};
 vm.runInNewContext(source.match(/ function endCheck\([^\n]+/)[0],context);
 assert.equal(context.endCheck(),false);G.hp.matchRemaining=0;host=false;assert.equal(context.endCheck(),false);host=true;context.endCheck();assert.deepEqual(Array.from(G.hp.winnerIds),['b']);
 G.over=false;alive=[{id:'a',alive:true}];context.endCheck();assert.deepEqual(Array.from(G.hp.winnerIds),['a']);assert.equal(G.hp.endCause,'survivor');
 G.over=false;alive=[];context.endCheck();assert.equal(G.winner,'imp');assert.deepEqual(Array.from(G.hp.winnerIds),[]);
 G.over=false;alive=[{id:'a',alive:true},{id:'b',alive:true}];context.CFG.hpType=1;context.endCheck();assert.deepEqual(Array.from(G.hp.winnerIds),['b']);assert.equal(G.hp.endCause,'tasks');
});
test('explosão preserva corpo, aparência e fantasma e rejeita morte duplicada',()=>{
 const victim={id:'a',name:'Azul',alive:true,color:'azul',cosmetics:{pet:'cube_bot',hat:'hat_cap'},x:100,y:200},G={player:victim,gt:12,bodies:[]},calls=[];
 const context={G,spawnKillSplash:(k,v)=>calls.push(['splash',v.id]),killChar:c=>{c.alive=false;c.ghost=true},cloneCosmetics:c=>({...c}),roomName:()=> 'Cafeteria',addBodyWithPet:(b,c)=>{G.bodies.push(b);calls.push(['pet',c.cosmetics.pet]);return b},closeModal:()=>calls.push(['close']),showDeathIntro:(k,v)=>calls.push(['death',v.id]),Snd:{victimSting:()=>calls.push(['sound'])}};
 vm.runInNewContext(source.slice(source.indexOf(' function explode('),source.indexOf(' function tick(')),context);
 const body=context.explode(victim);assert.equal(body.victimId,'a');assert.equal(body.cause,'hot-potato');assert.equal(body.x,100);assert.equal(body.y,200);assert.equal(body.cosmetics.pet,'cube_bot');assert.equal(victim.ghost,true);assert.equal(G.ghostMode,'free');assert.ok(calls.some(c=>c[0]==='pet'));assert.ok(calls.some(c=>c[0]==='death'));assert.equal(context.explode(victim),false);assert.equal(G.bodies.length,1);
});
test('som da passagem respeita áudio desligado e volume zero',()=>{
 const tones=[],Snd={on:true,volume:0,init(){},tone(...args){tones.push(args)}};vm.runInNewContext(source.match(/ Snd\.hpPass=function[^\n]+/)[0],{Snd});Snd.hpPass();assert.equal(tones.length,0);Snd.volume=1;Snd.on=false;Snd.hpPass();assert.equal(tones.length,0);Snd.on=true;Snd.hpPass();assert.equal(tones.length,2);assert.ok(tones.every(args=>args[3]<=.04));
});
