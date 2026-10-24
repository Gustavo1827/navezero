'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const catalog=JSON.parse(fs.readFileSync(path.join(root,'languages.json'),'utf8'));
const langs=['pt-BR','pt-PT','es','en','ru','ja'];

test('catálogo cobre funções, configurações, sabotagens e seleções nos seis idiomas',()=>{
  const baseKeys=Object.keys(catalog.strings['pt-BR']).sort();
  for(const lang of langs){
    assert.deepEqual(Object.keys(catalog.strings[lang]).sort(),baseKeys,`${lang} deve possuir o mesmo conjunto de chaves`);
    for(const key of baseKeys)assert.notEqual(String(catalog.strings[lang][key]??'').trim(),'',`${lang}:${key} não pode ficar vazio`);
  }
  const required=[
    'role.name.crew','role.name.imp','role.name.engineer','role.desc.engineer','role.desc.paramedic','role.menuDesc.engineer','role.reveal.imp','role.reveal.crew',
    'settings.roles','settings.rolesNote.engineer','config.engCooldown.label','config.engCooldown.desc','config.paramedicTasksPerUse.label',
    'sabotage.menuTitle','sabotage.menuDesc','sabotage.action.lights','sabotage.action.reactor','sabotage.action.comms','sabotage.action.doors','sabotage.status.comms','sabotage.resolved.comms','sabotage.reactorHold','sabotage.commsTuner',
    'selection.chooseRole','selection.chooseRoleMention','selection.chooseRoom','hud.shoot','hud.revive','hud.inspect','hud.trail','hud.protect','message.noSignal'
  ];
  for(const key of required)for(const lang of langs)assert.ok(catalog.strings[lang][key],`chave ausente: ${lang}:${key}`);
  assert.equal(catalog.strings.en['role.name.engineer'],'Engineer');
  assert.equal(catalog.strings.es['sabotage.menuTitle'],'Sabotaje');
  assert.equal(catalog.strings.ru['message.noSignal'],'📡 Нет сигнала');
  assert.equal(catalog.strings.ja['selection.chooseRole'],'役職を選択:');
});

test('textos prioritários são gerados pelo sistema de localização e menus abertos são atualizados',()=>{
  assert.match(html,/function roleMessageForPlayer\(p\)[\s\S]*?roleI18nDesc\(id\)/);
  assert.match(html,/function refreshRoleRevealText\(\)[\s\S]*?t\('role\.reveal\.imp'\)[\s\S]*?t\('role\.reveal\.crew'\)/);
  assert.match(html,/const roleButtons=\{btnLocatorSection:'locator'[\s\S]*?btnHunterSection:'hunter'\}/);
  assert.match(html,/ti\(`role\.menuDesc\.\$\{roleId\}`/);
  assert.match(html,/ti\(`config\.\$\{k\}\.label`,l\)/);
  assert.match(html,/ti\(`config\.\$\{k\}\.desc`,d\)/);
  assert.match(html,/showModal\(t\('sabotage\.menuTitle'\),t\('sabotage\.menuDesc'\),silent\)/);
  for(const type of ['lights','reactor','comms','doors'])assert.match(html,new RegExp("t\\(`sabotage\\.action\\.\\$\\{type\\}`\\)"));
  assert.match(html,/t\('sabotage\.status\.comms'\)/);
  assert.match(html,/const title=el\('span','mstatus',t\('selection\.chooseRole'\)\)/);
  assert.match(html,/roleI18nName\(roleId\)/);
  assert.match(html,/noSignalLabel=t\('message\.noSignal'\)/);
  assert.match(html,/t\('hud\.reviveWithUses',\{uses:pav\}\)/);
  assert.match(html,/t\('hud\.return'\)/);
  assert.match(html,/if\(G\.cfgOpen\)setCfgPage\(G\.cfgPage\)/);
  assert.match(html,/if\(G\.tool==='sab'&&!\$\('modal'\)\?\.hidden\)openSabPanel\(true\)/);
  assert.match(html,/if\(!\$\('role'\)\?\.hidden\)refreshRoleRevealText\(\)/);
});
