'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8')+'\n'+fs.readFileSync(require('node:path').join(__dirname,'../assets/bot-ai.js'),'utf8');
const match = html.match(/function checkEnd\(\)\{[\s\S]*?\n\}/);
assert.ok(match, 'checkEnd deve existir no jogo');

function runCheck(chars, matchImpIds, departedImpIds=new Set(), options={}) {
  const G={chars,over:false,winner:null,endReason:''};
  const NET={inRoom:true,isHost:true,matchImpIds:new Set(matchImpIds),departedImpIds:new Set(departedImpIds)};
  if(options.players)NET.room={players:options.players.map(id=>({id}))};
  const context={G,NET,Set,progress:()=>options.progress||0,endGame:(winner,reason)=>{G.over=true;G.winner=winner;G.endReason=reason}};
  vm.runInNewContext(`${match[0]}\nglobalThis.checkEnd=checkEnd;`,context);
  return {ended:context.checkEnd(),G};
}

test('2 Infiltrados contra 1 Tripulante vence Infiltrados',()=>{
  const r=runCheck([{id:'i1',role:'imp',alive:true},{id:'i2',role:'imp',alive:true},{id:'c1',role:'crew',alive:true}],['i1','i2']);
  assert.equal(r.ended,true);assert.equal(r.G.winner,'imp');
});
test('1 Infiltrado contra 1 Tripulante dá vitória aos Infiltrados',()=>{
  const r=runCheck([{id:'i1',role:'imp',alive:true},{id:'c1',role:'crew',alive:true}],['i1']);
  assert.equal(r.ended,true);assert.equal(r.G.winner,'imp');
});
test('Infiltrados não vencem quando há mais Tripulantes vivos e não resta 1 contra 1',()=>{
  const r=runCheck([{id:'i1',role:'imp',alive:true},{id:'c1',role:'crew',alive:true},{id:'c2',role:'crew',alive:true}],['i1']);
  assert.equal(r.ended,false);assert.equal(r.G.over,false);
});
test('Infiltrado vence quando não há Tripulantes vivos',()=>{
  const r=runCheck([{id:'i1',role:'imp',alive:true},{id:'c1',role:'crew',alive:false}],['i1']);
  assert.equal(r.ended,true);assert.equal(r.G.winner,'imp');
});
test('Tripulantes vencem quando todos os Infiltrados saem ou são eliminados',()=>{
  const r=runCheck([{id:'c1',role:'crew',alive:true}],['i1','i2'],['i1','i2']);
  assert.equal(r.ended,true);assert.equal(r.G.winner,'crew');
});
test('Tripulantes vencem quando todos os Infiltrados restantes estão mortos',()=>{
  const r=runCheck([{id:'i1',role:'imp',alive:false},{id:'c1',role:'crew',alive:true}],['i1']);
  assert.equal(r.ended,true);assert.equal(r.G.winner,'crew');
});

test('paridade inclui todos os Neutros vivos sem conceder a vitória individual deles',()=>{
  const imps=[{id:'i1',role:'imp',alive:true},{id:'i2',role:'imp',alive:true}],crew={id:'c',role:'crew',alive:true},neutral={id:'n',role:'neutral',function:'jester',alive:true};
  assert.equal(runCheck([...imps,crew,neutral],['i1','i2']).G.winner,'imp','2 contra 1 Tripulante e 1 Neutro é paridade');
  assert.equal(runCheck([...imps,crew,neutral,{id:'c2',role:'crew',alive:true}],['i1','i2']).ended,false);
  assert.equal(runCheck([imps[0],neutral,{...neutral,id:'n2'}],['i1']).ended,false,'Neutros vivos impedem vitória prematura sem Tripulantes');
  assert.equal(runCheck([imps[0],neutral],['i1']).G.winner,'imp');
  assert.equal(runCheck([imps[0],crew,{...neutral,alive:false}],['i1']).G.winner,'imp','Neutros mortos não contam na paridade');
});

test('desconexão elimina a participação mesmo antes de remover o personagem do snapshot',()=>{
  const chars=[{id:'i',role:'imp',alive:true},{id:'c',role:'crew',alive:true},{id:'n',role:'neutral',alive:true}];
  assert.equal(runCheck(chars,['i'],new Set(),{players:['c','n']}).G.winner,'crew');
  assert.equal(runCheck(chars,['i'],new Set(),{players:['i']}).G.winner,'imp');
  assert.equal(runCheck([...chars,{id:'b',role:'crew',alive:true,isBot:true}],['i'],new Set(),{players:['i','n']}).ended,false,'bots presentes continuam participando');
});

test('concluir todas as tarefas concede vitória aos Tripulantes antes da paridade',()=>{
  const chars=[{id:'i',role:'imp',alive:true},{id:'c',role:'crew',alive:true},{id:'n',role:'neutral',function:'jester',alive:true}];
  assert.equal(runCheck(chars,['i'],new Set(),{progress:1}).G.winner,'crew');
});

test('progresso usa somente tarefas reais de Tripulantes, incluindo fantasmas compatíveis',()=>{
  const progress=html.match(/function progress\(\)\{[\s\S]*?\n\}/)[0],G={chars:[{id:'c',role:'crew',alive:true},{id:'g',role:'crew',alive:false,ghost:true},{id:'n',role:'neutral',function:'jester',alive:true},{id:'i',role:'imp',alive:true}],tasks:[]};
  const task=(owner,done)=>({owner,steps:[{done}],done});
  const ctx={G,ghostActs:()=>true};vm.runInNewContext(progress,ctx);
  G.tasks=[task('c',true),task('g',false),task('n',false),task('i',false),task('departed',true),{...task('c',false),fake:true}];
  assert.equal(ctx.progress(),.5);G.tasks[1].steps[0].done=true;assert.equal(ctx.progress(),1);
});

test('somente o cronômetro crítico do reator causa derrota automática',()=>{
  const update=html.match(/function updateSab\(dt\)\{[\s\S]*?\n\}/)[0];
  const run=sab=>{const G={sab:{cd:0,reactor:0,lights:0,comms:0,doors:0,...sab},fixT:100};const c={G,CFG:{sab:30},endGame:w=>G.winner=w,openSabotageDoors(){},renderTasks(){},toast(){},t:x=>x,updateSabUI(){}};vm.runInNewContext(update,c);c.updateSab(1);return G};
  assert.equal(run({reactor:.5}).winner,'imp');
  for(const key of ['lights','comms','doors'])assert.equal(run({[key]:.5}).winner,undefined,key);
  assert.equal(run({reactor:0}).winner,undefined,'reator consertado não encerra a partida');
});


test('botão de emergência bloqueia qualquer sabotagem ativa exceto portas',()=>{
  const m=html.match(/const emergencySabotageBlocked=\(\)=>[^;]+;/);
  assert.ok(m,'regra de bloqueio do botão de emergência deve existir');
  const check=sab=>{
    const context={G:{sab},Object,Number};
    vm.runInNewContext(`${m[0]}\nglobalThis.result=emergencySabotageBlocked();`,context);
    return context.result;
  };
  assert.equal(check({lights:20,reactor:0,comms:0,doors:0,cd:0}),true);
  assert.equal(check({lights:0,reactor:25,comms:0,doors:0,cd:0}),true);
  assert.equal(check({lights:0,reactor:0,comms:30,doors:0,cd:0}),true);
  assert.equal(check({lights:0,reactor:0,comms:0,doors:15,cd:0}),false);
  assert.equal(check({lights:0,reactor:0,comms:0,doors:0,cd:12}),false);
  assert.equal(check({lights:0,reactor:0,comms:0,doors:20,cd:0,futureSabotage:9}),true,'sabotagens futuras também devem bloquear');
  assert.match(html,/ai=ch\.ai;if\(ch\.role!=='crew'\|\|ch\.emUses<=0\|\|G\.meetCd>0\|\|emergencySabotageBlocked\(\)/,'NPCs devem usar a mesma regra');
  assert.match(html,/ch\.emUses>0&&G\.meetCd<=0&&!emergencySabotageBlocked\(\)\)callMeeting\(ch,'emergency'\)/,'ações multiplayer devem validar a mesma regra');
});
