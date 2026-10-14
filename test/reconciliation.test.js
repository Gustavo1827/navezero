const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

test('cliente não-host usa previsão local em vez de bloquear updatePlayer', () => {
  assert.match(html, /const clientPredicted=NET\.inRoom&&!NET\.isHost;\s*netOriginalUpdatePlayer\(dt\)/);
  assert.doesNotMatch(html, /updatePlayer=function\(dt\)\{if\(NET\.inRoom&&!NET\.isHost\)return;/);
});

test('inputs têm sequência e o host devolve ACK nos snapshots', () => {
  assert.match(html, /const inputSeq=\+\+NET\.inputSeq;netSend\(\{type:'input',x:v\.x,y:v\.y,inputSeq\}\)/);
  assert.match(server, /inputSeq:Math\.max\(0,Math\.floor\(Number\(m\.inputSeq\)\|\|0\)\)/);
  assert.match(html, /ch\.netInputAck=Math\.max\(ch\.netInputAck\|\|0,inputSeq\)/);
  assert.match(html, /netInputAck:c\.netInputAck\|\|0/);
});

test('reconciliação evita puxar o jogador para trás por snapshot atrasado', () => {
  assert.match(html, /const along=Math\.max\(0,dot\)/);
  assert.match(html, /NET\.reconcileX\+=px\+ux\*along\*\.35/);
  assert.match(html, /const k=Math\.min\(1,dt\*8\)/);
});

test('Marionetista não-host prevê localmente o corpo controlado', () => {
  assert.match(html, /G\.player\?\.controlTargetId===ch\.id/);
  assert.match(html, /if\(p\.controlTargetId\)\{const target=charById\(p\.controlTargetId\);if\(target&&target\.alive\)\{target\.x=p\.x;target\.y=p\.y;target\.moving=p\.moving;target\.walk=p\.walk;target\.face=p\.face\}\}/);
});
