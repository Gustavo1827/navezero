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

test('reconciliação evita puxões contra paredes e corrige apenas deriva útil durante movimento', () => {
  assert.match(html, /function netReconcileOwnAuthoritative\(p,targetX,targetY,ack=0,hard=false\)/);
  assert.match(html, /if\(err<58\)\{NET\.reconcileX\*=\.55;NET\.reconcileY\*=\.55;return\}/);
  assert.match(html, /if\(perp>1\)\{const cap=Math\.min\(perp,28\),k=cap\/perp;NET\.reconcileX=px\*k;NET\.reconcileY=py\*k/);
  assert.match(html, /const k=Math\.min\(1,dt\*8\),cx=NET\.reconcileX\*k,cy=NET\.reconcileY\*k/);
  assert.match(html, /const ax=p\.x-ox,ay=p\.y-oy;NET\.reconcileX-=ax;NET\.reconcileY-=ay/);
  assert.match(html, /if\(Math\.abs\(cx\)>\.05&&Math\.abs\(ax\)<\.001\)NET\.reconcileX=0/);
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
