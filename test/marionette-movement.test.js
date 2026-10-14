'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const helper = html.match(/function moveRemoteWithInput\(target,inp,dt,canMove\)\{[\s\S]*?\n\}/);
const match = html.match(/function netUpdateRemote\(dt\)\{[\s\S]*?\n\}/);
assert.ok(helper, 'moveRemoteWithInput deve existir');
assert.ok(match, 'netUpdateRemote deve existir');

function runRemoteTick({ order = 'controller-first', input = { x: 1, y: 0, at: 10000 }, victimInput = { x: 0, y: 0, at: 10000 }, controlled = true, speed = 100, dt = 0.1, ticks = 1 } = {}) {
  const controller = { id: 'marion', isRemoteHuman: true, x: 10, y: 20, face: 1, walk: 0, moving: false, alive: true, ghost: false, vent: null, controlTargetId: controlled ? 'victim' : null, netKillCd: 0, netSheriffCd: 0, netTrackCd: 0, netTrackTime: 0 };
  const victim = { id: 'victim', isRemoteHuman: true, x: 10, y: 20, face: 1, walk: 0, moving: false, alive: true, ghost: false, vent: null, controlledBy: controlled ? 'marion' : null, netKillCd: 1, netSheriffCd: 0, netTrackCd: 0, netTrackTime: 0 };
  const G = { chars: order === 'controller-first' ? [controller, victim] : [victim, controller], state: 'playing' };
  const calls = [];
  const stopped = [];
  const NET = { remoteInputs: new Map([['marion', input], ['victim', victimInput]]) };
  const CFG = { speed, locCooldown: 15 };
  const charById = id => G.chars.find(c => c.id === id);
  const moveChar = (ch, dx, dy) => {
    calls.push({ id: ch.id, dx, dy });
    ch.x += dx; ch.y += dy;
    return Math.abs(dx) + Math.abs(dy) > 0;
  };
  const stopControl = ch => {
    stopped.push(ch.id);
    const v = charById(ch.controlTargetId);
    if (v) v.controlledBy = null;
    ch.controlTargetId = null; ch.controlTime = 0; ch.controlCd = 30; ch.controlReturn = null;
    ch.moving = false;
  };
  const context = { G, NET, CFG, Date: { now: () => 10000 }, Math, charById, moveChar, stopControl };
  vm.runInNewContext(`${helper[0]}\n${match[0]}\nglobalThis.tick=netUpdateRemote;`, context, { timeout: 1000 });
  for (let i = 0; i < ticks; i++) context.tick(dt);
  return { controller, victim, G, calls, stopped };
}

test('Marionetista aplica o movimento uma única vez no corpo controlado', () => {
  const r = runRemoteTick();
  assert.equal(r.calls.length, 1);
  assert.equal(r.calls[0].id, 'victim');
  assert.equal(r.victim.x, 20);
  assert.equal(r.controller.x, r.victim.x);
  assert.equal(r.controller.y, r.victim.y);
  assert.equal(r.controller.moving, true);
  assert.equal(r.victim.moving, true);
});

test('movimento da vítima controlada independe da ordem dos personagens', () => {
  for (const order of ['controller-first', 'victim-first']) {
    const r = runRemoteTick({ order });
    assert.equal(r.calls.length, 1, `${order}: deve haver um único movimento por frame`);
    assert.equal(r.victim.x, 20);
    assert.equal(r.controller.x, 20);
    assert.equal(r.victim.moving, true);
    assert.equal(r.controller.moving, true);
  }
});

test('soltar o joystick zera movimento e animação na mesma atualização', () => {
  const r = runRemoteTick({ input: { x: 0, y: 0, at: 10000 } });
  assert.equal(r.calls.length, 0);
  assert.equal(r.victim.x, 10);
  assert.equal(r.controller.x, 10);
  assert.equal(r.victim.moving, false);
  assert.equal(r.controller.moving, false);
});

test('input de controle expirado não mantém movimento residual', () => {
  const r = runRemoteTick({ input: { x: 1, y: 0, at: 9499 } });
  assert.equal(r.calls.length, 0);
  assert.equal(r.victim.x, 10);
  assert.equal(r.victim.moving, false);
  assert.equal(r.controller.moving, false);
});

test('vetor diagonal é normalizado e mantém a mesma velocidade máxima', () => {
  const r = runRemoteTick({ input: { x: 1, y: 1, at: 10000 } });
  assert.equal(r.calls.length, 1);
  const dx = r.victim.x - 10, dy = r.victim.y - 20;
  assert.ok(Math.abs(Math.hypot(dx, dy) - 10) < 1e-9);
  assert.ok(Math.abs(dx - dy) < 1e-9);
});

test('cooldown da vítima continua avançando durante a posse', () => {
  const r = runRemoteTick();
  assert.ok(Math.abs(r.victim.netKillCd - 0.9) < 1e-9);
});

test('movimento normal de outros jogadores continua com uma única aplicação do vetor', () => {
  const r = runRemoteTick({ controlled: false, input: { x: 3, y: 4, at: 10000 } });
  assert.equal(r.calls.length, 1);
  assert.equal(r.calls[0].id, 'marion');
  const dx = r.controller.x - 10, dy = r.controller.y - 20;
  assert.ok(Math.abs(Math.hypot(dx, dy) - 10) < 1e-9);
  assert.equal(r.controller.moving, true);
});


test('todas as oito direções mantêm rumo e velocidade máximos consistentes', () => {
  const directions = [
    { x: 1, y: 0, sx: 1, sy: 0 }, { x: 1, y: 1, sx: 1, sy: 1 },
    { x: 0, y: 1, sx: 0, sy: 1 }, { x: -1, y: 1, sx: -1, sy: 1 },
    { x: -1, y: 0, sx: -1, sy: 0 }, { x: -1, y: -1, sx: -1, sy: -1 },
    { x: 0, y: -1, sx: 0, sy: -1 }, { x: 1, y: -1, sx: 1, sy: -1 },
  ];
  for (const d of directions) {
    const r = runRemoteTick({ input: { x: d.x, y: d.y, at: 10000 } });
    const dx = r.victim.x - 10, dy = r.victim.y - 20;
    assert.equal(Math.sign(dx), d.sx, `direção x incorreta para (${d.x}, ${d.y})`);
    assert.equal(Math.sign(dy), d.sy, `direção y incorreta para (${d.x}, ${d.y})`);
    assert.ok(Math.abs(Math.hypot(dx, dy) - 10) < 1e-9, `velocidade diferente para (${d.x}, ${d.y})`);
  }
});

test('input contínuo gera passos regulares, sem multiplicar a distância por frame', () => {
  const r = runRemoteTick({ ticks: 5 });
  assert.equal(r.calls.length, 5);
  assert.equal(r.victim.x, 60);
  assert.equal(r.controller.x, 60);
});

test('frequência existente de input e snapshots permanece inalterada', () => {
  assert.match(html, /NET\.snapshotTimer=setInterval\([\s\S]*?\},150\)/);
  assert.match(html, /NET\.inputTimer=setInterval\(\(\)=>\{if\(NET\.inRoom&&!NET\.isHost\)netUpdateInput\(\)\},50\)/);
});

test('relação de posse alterada impede interpolar posições de identidades diferentes', () => {
  assert.match(html, /oldControlTargetId=c\.controlTargetId\|\|null,oldControlledBy=c\.controlledBy\|\|null/);
  assert.match(html, /controlRelationUnchanged=oldControlTargetId===\(r\.controlTargetId\|\|null\)&&oldControlledBy===\(r\.controlledBy\|\|null\)/);
  assert.match(html, /&&controlRelationUnchanged/);
});

test('joystick é zerado em pointerup, pointercancel, perda de captura e blur', () => {
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    assert.match(html, new RegExp(`stick\\.addEventListener\\('${event}',endStick\\)`));
  }
  assert.match(html, /addEventListener\('blur',\(\)=>resetStick\(\)\)/);
  assert.match(html, /function resetStick\(pointerId=null\)[\s\S]*?joy\.x=0;joy\.y=0/);
  assert.match(html, /if\(m\/R<\.25\)\{joy\.x=0;joy\.y=0\}/);
});

test('aba do Marionetista reutiliza o vermelho do Atrasado em todos os estados', () => {
  assert.match(html, /class="big alt marionette-tab" id="btnMarionetteSection"/);
  assert.match(html, /\.act2\.delayed,\.delayed-tab,\.marionette-tab\{background:rgba\(255,53,78,\.58\)!important;color:#fff!important;box-shadow:0 5px 0 #a91f39,0 7px 0 #10122a!important\}/);
});
