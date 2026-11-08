'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../assets/hide-seek.js'),'utf8');
function rules(){
 const killer={id:'killer',role:'imp',alive:true},crew={id:'crew',role:'crew',alive:true},bot={id:'bot',role:'crew',alive:true,isBot:true};
 const G={chars:[killer,crew,bot],hns:{phase:'start',remaining:10},over:false},NET={inRoom:true,isHost:true,room:{players:[{id:killer.id},{id:crew.id}]}};
 const context={G,NET,killer:()=>killer,active:()=>true,authority:()=>NET.isHost,t:x=>x,endGame(winner){G.over=true;G.winner=winner}};
 const participating=source.match(/ const participating=.*?;\n/)[0],living=source.match(/ const livingCrew=.*?;\n/)[0],end=source.match(/ function endCheck\(\).*?\n/)[0];
 vm.runInNewContext(participating+living+end+'\nthis.api={livingCrew,endCheck}',context);return{...context,k:killer,crew,bot,api:context.api};
}
test('Esconde-Esconde conta apenas Tripulantes vivos presentes, incluindo bots',()=>{
 const {G,NET,crew,bot,api}=rules();assert.equal(api.livingCrew().length,2);assert.equal(api.endCheck(),false,'não usa paridade do Clássico');
 crew.alive=false;assert.equal(api.livingCrew().length,1);assert.equal(api.endCheck(),false);bot.alive=false;assert.equal(api.endCheck(),true);assert.equal(G.winner,'imp');
 const departed=rules();departed.bot.alive=false;departed.NET.room.players=departed.NET.room.players.filter(p=>p.id!==departed.crew.id);assert.equal(departed.api.endCheck(),true);assert.equal(departed.G.winner,'imp','abandonar não deixa sobrevivente fantasma');
});
test('um sobrevivente vence no fim do Esconderijo Final e só o host decide',()=>{
 const {G,NET,crew,api}=rules();crew.alive=false;G.hns.phase='final';G.hns.remaining=.1;assert.equal(api.endCheck(),false);G.hns.remaining=0;NET.isHost=false;assert.equal(api.endCheck(),false);NET.isHost=true;assert.equal(api.endCheck(),true);assert.equal(G.winner,'crew');
 const empty=rules();empty.G.hns.phase='final';empty.G.hns.remaining=0;empty.crew.alive=empty.bot.alive=false;empty.api.endCheck();assert.equal(empty.G.winner,'imp','sem sobreviventes, o término do tempo não dá vitória à tripulação');
});
test('proteção do esconderijo termina na saída e rejeita ataques locais ou remotos',()=>{
 const declaration=source.match(/ const oldKill=doKill;doKill=function\(k,v\).*?\n/)[0];let hits=0,on=true;
 const G={player:{id:'local'},killCd:0},context={G,active:()=>on,doKill(){hits++;return true},locked:()=>false,live:()=>true,withRules:fn=>fn(),toast(){},t:x=>x,updateCrewCount(){}};
 vm.runInNewContext(declaration,context);
 for(const killer of [G.player,{id:'remote',netKillCd:0}]){
  G.killCd=0;killer.netKillCd=0;const victim={vent:'vent1'};assert.equal(context.doKill(killer,victim),false);assert.equal(hits,0);victim.vent=null;assert.equal(context.doKill(killer,victim),true);hits=0;
 }
 on=false;assert.equal(context.doKill({},{}),true,'Clássico continua delegado à implementação original');
});

test('escolha manual do Assassino funciona só na sala privada e delega os outros sorteios',()=>{
 const NET={inRoom:true,room:{mode:'esconde-esconde',privacy:'private',players:[{id:'h',name:'Host'},{id:'g',name:'Convidado'}],bots:1,botRoster:[{id:'b',name:'Bot'}]}},CFG={hnsKillerId:'g'},G={freePlay:false};let draws=0;
 const ctx={NET,CFG,G,MODE:'esconde-esconde',drawImpostors:participants=>{draws++;return participants.slice(0,1)}};
 for(const name of ['killerOptions','validKillerId'])vm.runInNewContext(source.match(new RegExp(' const '+name+'=.*?;\\n'))[0],ctx);
 vm.runInNewContext(source.match(/ const oldDrawImpostors=drawImpostors;drawImpostors=.*?;\n/)[0],ctx);
 const participants=[{id:'h'},{id:'g'},{id:'b'}];
 assert.equal(ctx.drawImpostors(participants,1)[0].id,'g');assert.equal(draws,0);
 CFG.hnsKillerId='b';assert.equal(ctx.drawImpostors(participants,1)[0].id,'b');
 NET.room.privacy='public';assert.equal(ctx.drawImpostors(participants,1)[0].id,'h');
 NET.room.privacy='private';NET.room.mode='classic';ctx.drawImpostors(participants,1);
 NET.room.mode='esconde-esconde';CFG.hnsKillerId='gone';ctx.drawImpostors(participants,1);
 CFG.hnsKillerId='g';G.freePlay=true;ctx.drawImpostors(participants,1);assert.equal(draws,4);
});
