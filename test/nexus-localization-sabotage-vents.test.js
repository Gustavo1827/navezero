'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
const catalog=JSON.parse(fs.readFileSync(path.join(root,'languages.json'),'utf8'));
const langs=['pt-BR','pt-PT','es','en','ru','ja'];

test('Nexus traduz salas, estações, mensagens e nomes exibidos no mapa',()=>{
  const stationKeys=Object.keys(catalog.strings['pt-BR']).filter(k=>k.startsWith('nexus.station.'));
  assert.equal(stationKeys.length,50);
  for(const lang of langs){
    for(const key of stationKeys)assert.equal(typeof catalog.strings[lang][key],'string',`${lang}:${key}`);
    for(const key of ['roomName.ship','roomName.shipCorridor','roomName.medbay','roomName.decon','roomName.vision','roomName.reactor','roomName.lab','roomName.o2','roomName.admin','roomName.electrical','roomName.comms','roomName.storage','roomName.cafeteria','roomName.balcony'])assert.equal(typeof catalog.strings[lang][key],'string',`${lang}:${key}`);
  }
  assert.equal(catalog.strings.en['nexus.station.reactor'],'Reactor core');
  assert.equal(catalog.strings.es['nexus.station.adminmap'],'Mapa de Nexus HQ');
  assert.equal(catalog.strings.ru['nexus.station.unlock'],'Управление дверями');
  assert.equal(catalog.strings.ja['nexus.station.decon_w_out'],'除染室を開く');
  assert.match(html,/function stationDisplayLabel\(st\)/);
  assert.match(html,/ROOM_DEFS\.forEach\(r=>c\.fillText\(translateRuntimeText\(r\.name\)/);
  assert.match(html,/runtime\.deconEntry/);
  assert.match(html,/runtime\.deconExit/);
  assert.match(html,/runtime\.stationNothing/);
  assert.match(html,/runtime\.stationCloser/);
});

test('configurações de funções usam chaves por campo nos seis idiomas',()=>{
  const roleFields=Object.keys(catalog.strings['pt-BR']).filter(k=>/^settings\.field\..+\.label$/.test(k));
  assert.ok(roleFields.length>=60);
  for(const lang of langs)for(const key of roleFields){
    const desc=key.replace(/\.label$/,'.desc');
    assert.equal(typeof catalog.strings[lang][key],'string',`${lang}:${key}`);
    assert.equal(typeof catalog.strings[lang][desc],'string',`${lang}:${desc}`);
  }
  assert.match(html,/fieldLabelKey=`settings\.field\.\$\{k\}\.label`/);
  assert.match(html,/fieldDescKey=`settings\.field\.\$\{k\}\.desc`/);
});

test('botão de sabotagem usa o papel real do personagem e preserva permissões e cooldown',()=>{
  assert.match(html,/const playerIsImpostor=\(\)=>!!G\.player&&\(G\.player\.role\|\|G\.role\)==='imp'/);
  assert.match(html,/imp=playerIsImpostor\(\)/);
  assert.match(html,/hv\(bs,!imp\|\|\(!p\.alive&&!ghostCanSab\(\)\)\)/);
  assert.match(html,/const S=G\.sab; if\(S\.cd>0\)return false/);
  assert.match(html,/const st=G\.sab\.cd>0\?String\(Math\.ceil\(G\.sab\.cd\)\):'Sabotar'/);
  assert.match(html,/command==='sabotage'[\s\S]*ch\.role==='imp'/);
});

test('saída do duto limpa estado residual sem alterar regras de Engenheiro e Infiltrado',()=>{
  const start=html.indexOf('function exitVent(ch){');
  const end=html.indexOf('function nearestVentFor',start);
  const body=html.slice(start,end);
  assert.match(body,/if\(!v\)\{ch\.vent=null;ch\.ventAnim=null;ch\.ventMv=0;ch\.moving=false/);
  assert.match(body,/if\(wasEngineer\)noteEngineerVentSeen\(ch,v,'exit'\);else noteVentSeen\(ch,v,'exit'\)/);
  assert.match(body,/ch\.vent=null;ch\.ventMv=0/);
  assert.match(body,/puppet\.vent=null;puppet\.ventMv=0/);
  assert.match(body,/joy\.x=joy\.y=0;resetStick\(\)/);
  assert.match(html,/const engineer=ch\.function==='engineer'&&ch\.role==='crew'/);
  assert.match(html,/!ch\.alive\|\|!\(ch\.role==='imp'\|\|engineer\)/);
  assert.match(html,/if\(engineer&&\(\(G\.sab\.comms\|\|0\)>0\|\|\(ch\.engVentCd\|\|0\)>0\)\)return false/);
  assert.match(server,/const BOT_NAMES_FALLBACK = Array\.from\(\{length:15\}/);
});
