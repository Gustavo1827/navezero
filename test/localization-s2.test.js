'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createGameServer}=require('../server');

test('0.4b-s2 centraliza localização em languages.json e mantém seis idiomas completos',()=>{
  const root=path.join(__dirname,'..');
  const catalog=JSON.parse(fs.readFileSync(path.join(root,'languages.json'),'utf8'));
  const langs=['pt-BR','pt-PT','es','en','ru','ja'];
  assert.deepEqual(Object.keys(catalog.strings),langs);
  const baseKeys=Object.keys(catalog.strings['pt-BR']);
  assert.ok(baseKeys.length>=430,'catálogo deve manter as traduções existentes e cobrir completamente as cinco áreas atuais');
  for(const lang of langs){
    assert.deepEqual(Object.keys(catalog.strings[lang]).sort(),baseKeys.slice().sort(),`chaves incompletas em ${lang}`);
    for(const key of baseKeys)assert.equal(typeof catalog.strings[lang][key],'string',`${lang}:${key}`);
  }
  assert.equal(catalog.strings.en['settings.language'],'Game language');
  assert.equal(catalog.strings.ja['message.noSignal'],'📡 圏外');
  for(const key of ['menu.create','cosmetics.previewCharacter','account.login','lobby.viewSettings','settings.general.kill.name','settings.general.actionDistance.desc','settings.distance.medium'])assert.ok(catalog.strings.en[key]&&catalog.strings.ja[key],`tradução crítica ausente: ${key}`);
});

test('cliente limita a tradução às áreas escolhidas e preserva campos digitados e partida',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  assert.match(html,/fetch\('\/languages\.json'/);
  assert.match(html,/function localizeDom\(/);
  assert.match(html,/MutationObserver/);
  assert.match(html,/input,textarea,\[contenteditable="true"\]/);
  assert.match(html,/function translateRuntimeText\(/);
  assert.match(html,/I18N_SCOPE_SELECTOR/);
  for(const id of ['#menu','#cosmeticsOverlay','#accountOverlay','#roomLobby','#roomViewSettings','#roomInfoOverlay','#gameSettingsOverlay','#languageOverlay','#keysOverlay','#settings'])assert.match(html,new RegExp(id.replace('#','\#')));
  assert.doesNotMatch(html,/patchCanvasI18n/);
  assert.doesNotMatch(html,/CanvasRenderingContext2D\.prototype\[(?:method|['"]fillText)/);
  assert.doesNotMatch(html,/localizeDom\(document\.body\)/);
  assert.match(html,/G\.cfgPage==='functions'/);
  assert.match(html,/data-i18n-skip/);
  assert.doesNotMatch(html,/const I18N=\{/);
});


test('script principal permanece sintaticamente válido após a localização',()=>{
  const vm=require('node:vm');
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
  assert.ok(scripts.length>0,'script principal não encontrado');
  for(const code of scripts)assert.doesNotThrow(()=>new vm.Script(code));
});

test('servidor publica languages.json como JSON',async t=>{
  const app=createGameServer({port:0,host:'127.0.0.1'});
  await new Promise(resolve=>app.server.once('listening',resolve));
  t.after(()=>new Promise(resolve=>app.server.close(resolve)));
  const res=await fetch(`http://127.0.0.1:${app.server.address().port}/languages.json`);
  assert.equal(res.status,200);
  assert.match(res.headers.get('content-type')||'',/application\/json/);
  const body=await res.json();
  assert.equal(body.defaultLanguage,'pt-BR');
  assert.ok(body.strings.en['account.login']);
});
