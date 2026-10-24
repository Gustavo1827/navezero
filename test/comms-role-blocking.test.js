'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');

test('Comunicações bloqueia e padroniza botões das funções solicitadas',()=>{
  assert.match(html,/function roleAbilityBlockedByComms\(\)\{return \(G\.sab\.comms\|\|0\)>0\}/);
  for(const id of ['btnSheriff','btnSeer','btnLocator','btnInstructor','btnGuardian','btnEngineerVent'])assert.match(html,new RegExp(`id="${id}"`));
  assert.match(html,/noSignalLabel=t\('message\.noSignal'\)/,'o texto padronizado deve vir do catálogo de idiomas');
  assert.match(html,/const sht=commsAbilityDown\?noSignalLabel/);
  assert.match(html,/const selab=commsAbilityDown\?noSignalLabel/);
  assert.match(html,/const lt=commsAbilityDown\?noSignalLabel/);
  assert.match(html,/lab=commsAbilityDown\?noSignalLabel/);
  assert.match(html,/const ventLabel=commsAbilityDown\?noSignalLabel/);
});

test('Comunicações impede ativação por UI, IA e validação multiplayer sem gastar estado',()=>{
  assert.match(html,/function doSheriffShot\(shooter,target\)\{if\(roleAbilityBlockedByComms\(\)\)return false/);
  assert.match(html,/function sheriffBotThink\(ch,dt\)\{[\s\S]*?roleAbilityBlockedByComms\(\)/);
  assert.match(html,/function inspectBody\(seer,body\)\{[\s\S]*?roleAbilityBlockedByComms\(\)/);
  assert.match(html,/function seerBotThink\(ch,dt\)\{[\s\S]*?roleAbilityBlockedByComms\(\)/);
  assert.match(html,/function protectWithGuardian\(owner,target\)\{[\s\S]*?roleAbilityBlockedByComms\(\)/);
  assert.match(html,/function guardianNpcThink\(ch,dt\)\{[\s\S]*?roleAbilityBlockedByComms\(\)/);
  assert.match(html,/function startLocator\(\)\{[\s\S]*?roleAbilityBlockedByComms\(\)/);
  assert.match(html,/function playerEngineerVent\(\)\{[\s\S]*?roleAbilityBlockedByComms\(\)/);
  assert.match(html,/command==='sheriff_shoot'[\s\S]*?if\(!roleAbilityBlockedByComms\(\)\)doSheriffShot/);
  assert.match(html,/command==='guardian_protect'[\s\S]*?!roleAbilityBlockedByComms\(\)/);
  assert.match(html,/command==='seer_inspect'[\s\S]*?!roleAbilityBlockedByComms\(\)/);
  assert.match(html,/command==='locator'[\s\S]*?!roleAbilityBlockedByComms\(\)/);
  assert.match(html,/command==='vent_enter'[\s\S]*?G\.sab\.comms<=0/);
  assert.match(html,/command==='instructor_select'[\s\S]*?G\.sab\.comms\|\|0\)<=0/);
  assert.match(html,/command==='instructor_mark'[\s\S]*?G\.sab\.comms\|\|0\)<=0/);
});
