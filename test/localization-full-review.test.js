const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8');const lang=JSON.parse(fs.readFileSync('languages.json','utf8'));
const languages=['pt-BR','pt-PT','es','en','ru','ja'];
test('revisão completa conecta exemplos visuais ao sistema de idiomas',()=>{
  const keys=['help.moveLine','tool.shipMap','common.alive','common.dead','freeplay.computer','freeplay.addProtection','freeplay.livingPrompt','vent.current','room.cafeteria','room.centralCorridor','cosmetic.hat.hat_winter_comet','cosmetic.hat.hat_signal_balloon'];
  for(const code of languages)for(const key of keys)assert.equal(typeof lang.strings[code]?.[key],'string',`${code}:${key}`);
  assert.match(html,/toolI18nLabel\(s\.id\)/);
  assert.match(html,/cosmeticItemName\(COSMETIC_TAB,item\.id\)/);
  assert.match(html,/t\('vent\.current'/);
  assert.match(html,/roomI18nName\(ROOM_BY_ID/);
  assert.match(html,/fillText\(roomI18nName\(r\.name\)/);
  assert.match(html,/t\('freeplay\.livingPrompt'\)/);
});
test('cosméticos reportados não ficam em português fora dos idiomas portugueses',()=>{
  assert.equal(lang.strings.en['cosmetic.hat.hat_winter_comet'],'Comet Beanie');
  assert.equal(lang.strings.en['cosmetic.hat.hat_signal_balloon'],'Signal Balloon');
  assert.notEqual(lang.strings.ru['cosmetic.hat.hat_winter_comet'],'Gorro de Cometa');
  assert.notEqual(lang.strings.ja['cosmetic.hat.hat_signal_balloon'],'Balão de Sinal');
});
