const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');

test('não-host pode consultar configurações reais da sala em painel somente leitura',()=>{
  assert.match(html,/id="btnViewRoomSettings"[^>]*>Ver configurações<\/button>/);
  assert.match(html,/function renderRoomViewSettings\(\)/);
  assert.match(html,/const settings=r\.settings\|\|\{\}/);
  assert.match(html,/btnViewRoomSettings'\)\.hidden=NET\.isHost\|\|r\.status!=='lobby'/);
  assert.match(html,/id="roomViewSettingsBody"/);
  const overlay=html.match(/<div id="roomViewSettings"[\s\S]*?<\/div>\s*<\/div>\s*<div id="gameSettingsOverlay"/i)?.[0]||'';
  assert.ok(overlay,'painel de visualização deve existir');
  assert.doesNotMatch(overlay,/type="range"|fnstepper|cfgChoice|id="cfgReset"/);
});
