const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const catalog=JSON.parse(fs.readFileSync(path.join(__dirname,'..','languages.json'),'utf8'));
const langs=['pt-BR','pt-PT','es','en','ru','ja'];

test('localização desta etapa cobre partida, sabotagem, computador e Partida Livre nos seis idiomas',()=>{
  const keys=[
    'game.starting','game.exitTitle','game.playAgain','hud.tasksFake','message.noSignalText',
    'sabotage.title','sabotage.choose','sabotage.lightsAction','sabotage.alert.reactor','sabotage.bar.doors',
    'freeplay.mapTitle','freeplay.computer','freeplay.computerDesc','freeplay.killPlayer','freeplay.revivePlayer',
    'freeplay.addProtection','freeplay.removeProtection','freeplay.selectCharacter'
  ];
  for(const lang of langs){
    assert.ok(catalog.strings[lang],`idioma ausente: ${lang}`);
    for(const key of keys)assert.ok(String(catalog.strings[lang][key]||'').trim(),`${lang} sem ${key}`);
  }
});

test('seleção de região usa rótulo localizado e mantém todas as regiões nos seis idiomas',()=>{
  for(const lang of langs){
    assert.equal(Object.keys(catalog.regions[lang]||{}).length,3,`${lang} sem as três regiões`);
    for(const id of ['north-america','asia','europe'])assert.ok(catalog.regions[lang][id]);
  }
  assert.match(html,/for\(const opt of regionSelect\.querySelectorAll\('option\[value\]:not\(\[value=""\]\)'\)\)opt\.textContent=regionLabel\(opt\.value\)/);
});

test('interfaces de partida entram no escopo de localização sem alterar a lógica do jogo',()=>{
  for(const id of ['#hud','#modal','#meetingIntro','#meet','#confirmExit','#role','#end','#mpWaitOverlay'])assert.ok(html.includes(id),`escopo ausente: ${id}`);
  assert.match(html,/showModal\(t\('sabotage\.title'\),t\('sabotage\.choose'\)\)/);
  assert.match(html,/showModal\(t\('freeplay\.computer'\),t\('freeplay\.computerDesc'\)\)/);
  assert.match(html,/c\.fillText\(t\('message\.noSignalText'\)/);
});
