'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { cleanSettings } = require('../server');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('configurações do Metamorfo têm limites, padrão e quantidade limitada aos Infiltrados', () => {
  assert.deepEqual(cleanSettings({ impostors: 1, metamorphChance: 100, metamorphMax: 3, metamorphDuration: 99, metamorphCooldown: 1 }), {
    kill:25,sab:30,meet:20,speed:180,impVision:700,crewVision:520,discussion:25,voting:25,impostors:1,
    locMax:2,locChance:35,locCooldown:15,locDuration:40,sheriffCooldown:50,sheriffChance:35,sheriffMax:1,
    delayedChance:35,delayedMax:1,delayedDuration:20,metamorphChance:100,metamorphMax:1,
    metamorphDuration:30,metamorphCooldown:5,renderDist:820
  });
  assert.match(server, /metamorphChance:\[0,100\]/);
  assert.match(server, /metamorphMax:\[0,3\]/);
  assert.match(server, /metamorphDuration:\[5,30\]/);
  assert.match(server, /metamorphCooldown:\[5,60\]/);
  assert.match(server, /out\.metamorphMax=Math\.min\(out\.metamorphMax,out\.impostors\)/);
});

test('Metamorfo tem aba própria na configuração e os valores são persistidos e sincronizados', () => {
  for (const key of ['metamorphChance','metamorphMax','metamorphDuration','metamorphCooldown']) {
    assert.match(html, new RegExp("'" + key + "'"));
    assert.match(server, new RegExp(key + ':\\['));
  }
  assert.match(html, /id="btnMetamorphSection"/);
  assert.match(html, /G\.cfgFunctionTab==='metamorph'&&!isMetamorph/);
  assert.match(html, /'metamorphChance','metamorphMax','metamorphDuration','metamorphCooldown'/);
  assert.match(html, /metamorphChance:CFG\.metamorphChance,metamorphMax:CFG\.metamorphMax,metamorphDuration:CFG\.metamorphDuration,metamorphCooldown:CFG\.metamorphCooldown/);
});

test('habilidade do Metamorfo copia somente a aparência, sincroniza estado e respeita bloqueios', () => {
  assert.match(html, /function beginMetamorph\(ch,target\)/);
  assert.match(html, /ch\.disguiseTargetId=target\.id;ch\.morphTime=CFG\.metamorphDuration;ch\.morphBubble=\{remaining:2\.4,eventId:\+\+ch\.morphEventSeq,targetId:target\.id\}/);
  assert.match(html, /function endMetamorph\(ch,startCooldown=true\)/);
  assert.match(html, /ch\.morphCd=CFG\.metamorphCooldown/);
  assert.match(html, /function playerMetamorphose\(\)/);
  assert.match(html, /showModal\('Metamorfose','Escolha um jogador ou NPC vivo para copiar a aparência\.'/);
  assert.match(html, /command==='metamorphose'[\s\S]*?ch\.function==='metamorph'[\s\S]*?beginMetamorph\(ch,target\)/);
  assert.match(html, /disguiseTargetId:c\.disguiseTargetId\|\|null,morphTime:c\.morphTime\|\|0,morphCd:c\.morphCd\|\|0,morphBubble:c\.morphBubble\?\{\.\.\.c\.morphBubble\}:null/);
  assert.match(html, /disguised&&disguised\.alive\?disguised\.color:ch\.color/);
  assert.match(html, /p\.morphBubble&&p\.morphBubble\.remaining>0\)\{p\.moving=false;return\}/);
  assert.match(html, /G\.state!=='playing'\|\|G\.M\|\|G\.over\|\|!p\.alive\|\|G\.role!=='imp'\|\|p\.function!=='metamorph'/);
});

test('NPCs usam Metamorfo e só denunciam bolhas que presenciaram com distância e linha de visão', () => {
  assert.match(html, /function metamorphBotThink\(ch,dt\)/);
  assert.match(html, /dist\(ch,o\)<vr&&losClear\(ch\.x,ch\.y,o\.x,o\.y\)/);
  assert.match(html, /o\.morphBubble\.remaining<=0/);
  assert.match(html, /callMeeting\(ch,'metamorph',null\)/);
  assert.match(html, /Vi \$\{o\.name\} se metamorfando em \$\{witnessed\.targetName\}\./);
  assert.match(html, /if\(claim\.kind==='metamorph'&&T\)/);
  assert.match(html, /pickId=scored\.length&&scored\[0\]\.score>=1\.25\?scored\[0\]\.id:'skip'/);
});

test('falas de tarefas e corpos usam fatos observados, sem atribuir visão que o NPC não teve', () => {
  assert.match(html, /w\.ai\.taskWitnesses\.push\(\{id:ch\.id,name:ch\.name,task:g\.t\.name,gt:G\.gt,room:roomName\(ch\.x,ch\.y\)\}\)/);
  assert.match(html, /\$\{witnessedTask\.name\} fez \$\{witnessedTask\.task\}\./);
  assert.match(html, /Eu fiz \$\{recentTask\}/);
  assert.match(html, /Onde que mataram \$\{M\.body\.name\}\?/);
  assert.match(html, /Encontrei o corpo de \$\{M\.body\.name\} \$\{inRoom\(M\.body\.room\)\}!/);
});
