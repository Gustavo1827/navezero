'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const match = html.match(/function checkEnd\(\)\{[\s\S]*?\n\}/);
assert.ok(match, 'checkEnd deve existir no jogo');

function runCheck(chars, matchImpIds, departedImpIds=new Set()) {
  const G={chars,over:false,winner:null,endReason:''};
  const NET={inRoom:true,isHost:true,matchImpIds:new Set(matchImpIds),departedImpIds:new Set(departedImpIds)};
  const context={G,NET,Set,progress:()=>0,endGame:(winner,reason)=>{G.over=true;G.winner=winner;G.endReason=reason}};
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
