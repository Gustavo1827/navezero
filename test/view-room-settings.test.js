'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

test('não-host pode abrir configurações da sala em modo somente leitura',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  assert.match(html,/id=\"btnViewRoomConfig\"[^>]*>Ver configurações<\/button>/);
  assert.match(html,/id=\"roomSettingsView\"/);
  assert.match(html,/function openRoomSettingsView\(\)\{if\(!NET\.inRoom\|\|NET\.isHost\|\|NET\.room\?\.status!==\'lobby\'\)return/);
  assert.match(html,/const st=r\.settings\|\|\{\}/);
  assert.match(html,/ROOM_ROLE_CONFIG_KEYS/);
  assert.doesNotMatch(html,/id=\"roomSettingsViewContent\"[\s\S]{0,300}<input/);
  assert.match(html,/btnViewRoomConfig'\)\.hidden=NET\.isHost\|\|r\.status!==\'lobby\'/);
  assert.match(html,/else if\(!\$\('roomSettingsView'\)\.hidden\)renderRoomSettingsView\(\)/);
});
