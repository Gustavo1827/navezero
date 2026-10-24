'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const languages=JSON.parse(fs.readFileSync(path.join(root,'languages.json'),'utf8'));

test('jogadores não-host têm botão e menu somente leitura para ver configurações da sala',()=>{
  assert.match(html,/id="guestRoomConfig"[^>]*hidden/);
  assert.match(html,/id="btnViewRoomSettings"[^>]*>Ver configurações</);
  assert.match(html,/id="roomSettingsViewOverlay"/);
  assert.match(html,/function openRoomSettingsView\(\)\{if\(!NET\.inRoom\|\|NET\.isHost\|\|NET\.room\?\.status!=='lobby'\)return/);
  assert.match(html,/guestCfg\.hidden=NET\.isHost\|\|r\.status!=='lobby'/);
  assert.match(html,/for\(const \[key,label\] of CFG_ROWS\)\{if\(!NET_SETTING_KEYS\.includes\(key\)\|\|st\[key\]===undefined\)continue/);
  assert.doesNotMatch(html,/roomSettingsViewList[\s\S]{0,1000}input type="range"/);
});

test('visualização de configurações usa dados atuais da sala e acompanha idioma',()=>{
  assert.match(html,/const r=NET\.room,st=r\?\.settings\|\|\{\}/);
  assert.match(html,/if\(!\$\('roomSettingsViewOverlay'\)\?\.hidden\)renderRoomSettingsView\(\)/);
  assert.match(html,/ti\(`config\.\$\{key\}\.label`,label\)/);
  for(const lang of ['pt-BR','pt-PT','es','en','ru','ja']){
    assert.ok(languages.strings[lang]['lobby.viewSettings']);
    assert.ok(languages.strings[lang]['roomSettings.title']);
    assert.ok(languages.strings[lang]['settings.distance.medium']);
  }
});
