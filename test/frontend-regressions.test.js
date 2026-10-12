'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('configurações completas incluem infiltrados e distância de renderização na sala', () => {
  assert.match(html, /NET_SETTING_KEYS=\[[^\]]*'impostors'[^\]]*'renderDist'/);
  assert.match(html, /renderDist:\[500,1500\]/);
  assert.match(server, /impostors:\[1,3\][^\n]*renderDist:\[500,1500\]/);
  assert.match(server, /cleanSettings\(\{\.\.\.room\.settings,\.\.\.\(m\.settings&&typeof m\.settings==='object'\?m\.settings:\{\}\)\}\)/);
});

test('a reunião revela os votos por 10 segundos na mesma tela e depois passa à ejeção', () => {
  assert.match(html, /M\.replyQ=\[\]; M\.dur=10; \$\('meetTitle'\)\.textContent='Votação'/);
  assert.match(html, /M\.phase==='result'\)\{if\(M\.t>=M\.dur\)setMeetPhase\('eject'\)\}/);
  assert.match(html, /M\.phase==='eject'\)\{if\(M\.t>=M\.dur\)endMeeting\(\)\}/);
  assert.match(html, /\$\('meet'\)\.classList\.toggle\('vote-reveal',ph==='result'\)/);
  assert.match(html, /\$\('meet'\)\.classList\.remove\('vote-reveal','space-result'\)/);
});

test('bolinhas representam a cor de quem votou e desaparecem antes da ejeção', () => {
  assert.match(html, /M\.log\.forEach\(v=>\{const cd=M\.cards\[v\.target\]/);
  assert.match(html, /d\.style\.background=COLOR_BY\[voter\.color\]\?\.main\|\|chatCol\(voter\)/);
  assert.match(html, /if\(ph==='eject'\)card\.classList\.remove\('pick'\)/);
  assert.match(html, /if\(ph==='eject'\)\{[^}]*card\.dotsEl\.innerHTML=''/s);
  assert.match(html, /function netPaintMeeting\(sm\)\{[\s\S]*?\$\('voteBreakdown'\)\.textContent='';\$\('voteBreakdown'\)\.hidden=true/);
  assert.doesNotMatch(html.slice(html.indexOf('function netPaintMeeting(sm){'), html.indexOf('function netSyncCameraAndButtons()')), /sm\.voteBreakdown/);
});

test('Xerife tem configurações limitadas, aba própria e sincronização de sala', () => {
  for (const k of ['sheriffCooldown','sheriffChance','sheriffMax']) {
    assert.match(html, new RegExp("'"+k+"'"));
    assert.match(server, new RegExp(k+':\\['));
  }
  assert.match(html, /sheriffCooldown:\[10,60\]/);
  assert.match(html, /sheriffChance:\[0,100\]/);
  assert.match(html, /sheriffMax:\[0,15\]/);
  assert.match(html, /id="btnSheriffSection"/);
  assert.match(html, /if\(G\.cfgPage==='functions'&&\(\(G\.cfgFunctionTab==='sheriff'\)!==isSheriff\)\)return/);
  assert.match(html, /const sheriffEnabled=CFG\.sheriffMax>0&&CFG\.sheriffChance>0&&Math\.random\(\)\*100<CFG\.sheriffChance/);
  assert.match(html, /sheriffEligible\.slice\(0,clamp\(CFG\.sheriffMax,0,15\)\)/);
});

test('disparo do Xerife é validado pelo host e respeita alcance, linha de visão e cooldown', () => {
  assert.match(html, /command==='sheriff_shoot'[\s\S]*?activePlay&&!G\.M&&ch\.alive&&ch\.role==='crew'&&ch\.function==='sheriff'[\s\S]*?dist\(ch,target\)<=84&&losClear/);
  assert.match(server, /'sheriff_shoot'/);
  assert.match(html, /function doSheriffShot\(shooter,target\)[\s\S]*?target\.role==='imp'[\s\S]*?killChar\(shooter\);addSheriffBody\(shooter,shooter\.id,'sheriff_misfire'\)/);
  assert.match(html, /if\(shooter===G\.player\)G\.sheriffCd=CFG\.sheriffCooldown;else shooter\.netSheriffCd=CFG\.sheriffCooldown/);
});


test('frases prontas permitem alegar ou suspeitar das quatro funções', () => {
  for (const id of ['roleDeny','roleSelf','roleSight','roleGuessPlayer']) assert.match(html, new RegExp("id:'"+id+"'"));
  for (const role of ['Tripulante','Infiltrado','Xerife','Localizador']) assert.match(html, new RegExp(role));
  assert.match(html, /function renderPhraseRoles\(phraseId,targetId=null\)/);
  assert.match(html, /Vi alguém com a função de \$\{role\}/);
});

test('descrições das funções e classes usam exatamente os textos solicitados', () => {
  assert.match(html, /Rastreie um tripulante pelo seu mapa\./);
  assert.match(html, /Elimine um Infiltrado com suas habilidades\./);
  assert.match(html, /Mate a tripulação e sabote a navegação\./);
  assert.match(html, /Faça suas tarefas e descubra o\(s\) Infiltrado\(s\)\./);
});

test('cliente não marca tarefa concluída antes da confirmação autoritativa do host', () => {
  assert.match(html, /O host valida vida, posse, estação e distância antes de confirmar o passo/);
  assert.doesNotMatch(html, /if\(pending&&!q\.done\)z\.done=true/);
  assert.match(html, /stationDist\(station,ch\)>95/);
});

test('dutos de clientes são validados pelo host e a interface acompanha snapshots', () => {
  assert.match(html, /command==='vent_enter'/);
  assert.match(html, /Math\.hypot\(ch\.x-v\.px,ch\.y\+4-v\.py\)<=75/);
  assert.match(html, /command==='vent_move'\)\{if\(activePlay&&ch\.vent\)ventMove\(ch,m\.ventId\)\}/);
  assert.match(html, /if\(G\.player\.vent&&s\.state==='playing'\)/);
});

test('culling desenha camadas visuais por sala sem desativar colisões', () => {
  assert.match(html, /let STATIC=null, MM_STATIC=null, ROOM_STATIC=new Map\(\)/);
  assert.match(html, /if\(a<=\.005\)return;\s*const layer=ROOM_STATIC\.get\(r\.id\)/);
  assert.match(html, /drawRoomStaticLayers\(c,cx,cy,vw,vh,cullViewer\)/);
  assert.match(html, /const floor=new Uint8Array\(COLS\*ROWS\), block=new Uint8Array\(COLS\*ROWS\), walk=new Uint8Array\(COLS\*ROWS\)/);
});
