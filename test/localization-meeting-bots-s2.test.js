'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'languages.json'), 'utf8'));

const langs=['pt-BR','pt-PT','es','en','ru','ja'];
test('reuniões e títulos internos têm as mesmas chaves nos seis idiomas',()=>{
  const keys=['meeting.bodyReported','meeting.emergencyTitle','meeting.bodyFound','meeting.discussion','meeting.discussionDesc','meeting.voting','meeting.votingDesc','meeting.ejection','meeting.noneEjected','meeting.confirmVote','meeting.cancelVote','meeting.selected','meeting.voteSkipped','meeting.votedFor','meeting.skippedVotes','meeting.ejected','meeting.wasImp','meeting.wasNotImp','meeting.impsRemaining'];
  for(const lang of langs)for(const key of keys)assert.equal(typeof catalog.strings[lang][key],'string',`${lang}:${key}`);
  assert.match(html,/t\('meeting\.bodyReported'\)/);
  assert.match(html,/t\('meeting\.discussionDesc'\)/);
  assert.match(html,/t\('meeting\.votingDesc'\)/);
});

test('bots usam padrão numerado traduzido por idioma',()=>{
  for(const lang of langs){assert.ok(Array.isArray(catalog.botNames[lang]));assert.equal(catalog.botNames[lang].length,15)}
  assert.deepEqual(catalog.botNames['pt-BR'].slice(0,3),['Azul','Amarelo','Vermelho']);
  assert.deepEqual(catalog.botNames.en.slice(0,3),['Blue','Yellow','Red']);
  assert.deepEqual(catalog.botNames.es.slice(0,3),['Azul','Amarillo','Rojo']);
  assert.deepEqual(catalog.botNames.ru.slice(0,3),['Синий','Жёлтый','Красный']);
  assert.deepEqual(catalog.botNames.ja.slice(0,3),['青','黄','赤']);
  assert.match(html,/function localizedBotNames\(\)/);
  assert.match(server,/function botNamesForRoom\(room\)/);
  assert.match(server,/cleanRoomLanguage\(room\?\.language\)/);
});
