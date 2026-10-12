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

test('resultado da votação dura 10 segundos e avança para uma fase de ejeção separada', () => {
  assert.match(html, /M\.replyQ=\[\]; M\.dur=10; \$\('meetTitle'\)\.textContent='Resultado da votação'/);
  assert.match(html, /M\.phase==='result'\)\{if\(M\.t>=M\.dur\)setMeetPhase\('eject'\)\}/);
  assert.match(html, /M\.phase==='eject'\)\{if\(M\.t>=M\.dur\)endMeeting\(\)\}/);
});

test('votos são exibidos pela cor de quem votou e removidos na ejeção', () => {
  assert.match(html, /M\.log\.forEach\(v=>\{const cd=M\.cards\[v\.target\]/);
  assert.match(html, /d\.style\.background=chatCol\(charById\(v\.voter\)\|\|G\.player\)/);
  assert.match(html, /if\(ph==='eject'\)card\.classList\.remove\('pick'\)/);
  assert.match(html, /#meet\.space-eject #voteBreakdown/);
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
