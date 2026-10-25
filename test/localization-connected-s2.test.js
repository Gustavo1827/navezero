const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
const catalog=JSON.parse(fs.readFileSync(path.join(root,'languages.json'),'utf8'));
const langs=['pt-BR','pt-PT','es','en','ru','ja'];

test('localização conectada mantém catálogo completo e simétrico nos seis idiomas',()=>{
  const keys=Object.keys(catalog.strings['pt-BR']).sort();
  assert.ok(keys.length>1300);
  for(const lang of langs){
    assert.deepEqual(Object.keys(catalog.strings[lang]).sort(),keys);
    for(const key of keys)assert.equal(typeof catalog.strings[lang][key],'string',`${lang}:${key}`);
  }
});

test('cosméticos, tarefas, bots e etapas de tarefa têm tradução conectada',()=>{
  assert.match(html,/function cosmeticDisplayName\(/);
  assert.match(html,/function taskDisplayName\(/);
  assert.match(html,/function taskDisplayStep\(/);
  assert.match(html,/localizedBotNamesFor\(/);
  assert.deepEqual(catalog.botNames.en.slice(0,3),['Blue','Yellow','Red']);
  assert.deepEqual(catalog.botNames['pt-BR'].slice(0,3),['Azul','Amarelo','Vermelho']);
  assert.deepEqual(catalog.botNames.ru.slice(0,3),['Синий','Жёлтый','Красный']);
  assert.notEqual(catalog.strings.en['task.stepLabel.abastecer_o_reator'],catalog.strings['pt-BR']['task.stepLabel.abastecer_o_reator']);
});

test('mensagens automáticas e frases prontas passam pela localização sem traduzir chat digitado',()=>{
  assert.match(html,/#roomChatMessages,#ghostChatMessages/);
  assert.match(html,/roomSystemDisplayText\(/);
  assert.match(html,/roomConfigNoticeDisplayText\(/);
  assert.match(html,/clean\.quick\?translateRuntimeText\(clean\.text\):clean\.text/);
  assert.match(html,/netSend\(\{type:'ghost_chat',text,quick\}\)/);
  assert.match(server,/quick:m\.quick===true/);
  assert.equal(catalog.sourceMap['Aguarde 3 segundos antes de falar de novo.'],'chat.cooldown');
  assert.equal(catalog.sourceMap['Protegi {name}.'],'ghost.protected');
});

test('reunião, NPCs, canvas e textos dinâmicos usam resolvedores de idioma',()=>{
  assert.match(html,/meetingDisplayText\(from,text\)/);
  assert.match(html,/npcSpeechDisplayText\(ch,ch\.bubble\.text\)/);
  assert.match(html,/roleLabelByFunction\(ch\.function\)/);
  assert.equal(catalog.sourceMap['Você está no duto: {room}'],'runtime.inVentAt');
  assert.equal(catalog.sourceMap['Preparando a partida para todos os jogadores.'],'loading.prepareAll');
  assert.equal(catalog.sourceMap['🗺️ Mapa da partida'],'freeplay.mapTitle');
});
