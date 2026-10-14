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


test('movimento online usa canal leve em ~30 Hz sem aumentar a frequência do snapshot completo', () => {
  assert.match(html, /function netCaptureMotion\(\)/);
  assert.match(html, /if\(m\.type==='motion'\)\{if\(!NET\.isHost&&NET\.inRoom\)netApplyMotion\(m\.motion\);return\}/);
  assert.match(html, /NET\.motionTimer=setInterval\(\(\)=>\{/);
  assert.match(html, /type:'motion_state',motion:netCaptureMotion\(\)/);
  assert.match(html, /\},33\);\s*\/\/ Inputs também chegam ao host em ~30 Hz/);
  assert.match(server, /if\(m\.type==='motion_state'\)/);
  assert.match(server, /send\(target\.ws,\{type:'motion',motion:m\.motion\}\)/);
});
