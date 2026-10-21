const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {cleanSettings}=require('../server');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const server=fs.readFileSync(path.join(root,'server.js'),'utf8');

test('Loucura dos Infiltrados é a quarta predefinição e garante Parasitas iniciais',()=>{
  assert.match(html,/name:'Loucura dos Infiltrados'/);
  assert.match(html,/preset_loucura_infiltrados\.png/);
  assert.equal(fs.existsSync(path.join(root,'assets','presets','preset_loucura_infiltrados.png')),true);
  assert.match(html,/if\(id==='infiltrados'\)\{cfg\.impostors=Math\.min\(3,maxImpostorsForPlayers\(configuredPlayerCount\(\)\)\);cfg\.delayedChance=25;cfg\.cleanerChance=25;cfg\.spectralChance=25;cfg\.marionChance=25;cfg\.hunterChance=25;cfg\.parasiteChance=100;cfg\.parasiteMax=Math\.min\(3,cfg\.impostors\);\}/);
  assert.match(html,/const infiltradosPreset=currentCfgMatchesPreset\('infiltrados'\)/);
  assert.match(html,/if\(infiltradosPreset\)\{for\(const ch of G\.imps\)\{ch\.function='parasite'/);
});

test('Instrutor cria percurso caminhável a partir do jogador e limita distância em passos de 100 px',()=>{
  assert.match(html,/instructorMaxDistance:\[100,2000\]/);
  assert.match(html,/Distância máxima do jogador até o caminho/);
  assert.match(html,/if\(k==='instructorMaxDistance'\)\{wireRepeat\(minus,-100\);wireRepeat\(plus,100\)\}/);
  assert.match(html,/function instructorPathPoints\(target,x,y\)[\s\S]*?nearestWalkablePosition\(target\.x,target\.y\)[\s\S]*?findPath\(a\.x,a\.y/);
  assert.match(html,/const points=instructorPathPoints\(target,x,y\)/);
  assert.match(html,/instructorTrailLength\(points\)[\s\S]*?CFG\.instructorMaxDistance/);
  assert.match(html,/String\(t\.targetId\)!==String\(G\.player\.id\)&&String\(t\.ownerId\)!==String\(G\.player\.id\)/);
  assert.match(server,/String\(t\.targetId\)===String\(recipientId\)\|\|String\(t\.ownerId\)===String\(recipientId\)/);
  const s=cleanSettings({instructorMaxDistance:1549},15);
  assert.equal(s.instructorMaxDistance,1500);
});

test('Espectral não possui mais Intangibilidade e usa bônus de velocidade de 0,0x a 1,0x',()=>{
  assert.doesNotMatch(html,/spectralIntangible/);
  assert.doesNotMatch(html,/Intangibilidade ao ativar/);
  assert.match(html,/spectralSpeed:\[0,10\]/);
  assert.match(html,/function spectralIntangibilityActive\(ch\)\{return false\}/);
  assert.match(html,/spectralInvisible\?\(1\+CFG\.spectralSpeed\/10\):1/);
  assert.doesNotMatch(server,/spectralIntangible/);
  const s=cleanSettings({spectralSpeed:17},15);
  assert.equal(s.spectralSpeed,10);
});
