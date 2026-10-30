const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {cleanSettings}=require('../server');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const server=fs.readFileSync(path.join(root,'server.js'),'utf8');

test('Loucura dos Infiltrados habilita todas as funções e distribui as vagas disponíveis',()=>{
  assert.match(html,/name:'Loucura dos Infiltrados'/);
  assert.match(html,/preset_loucura_infiltrados\.png/);
  assert.equal(fs.existsSync(path.join(root,'assets','presets','preset_loucura_infiltrados.png')),true);
  assert.match(html,/else if\(id==='infiltrados'\)\{for\(const role of PRESET_IMP_ROLES\)cfg\[role\.key\+'Chance'\]=100\}/);
  assert.match(html,/const infiltradosPreset=currentCfgMatchesPreset\('infiltrados'\)/);
  assert.match(html,/if\(infiltradosPreset\)\{[\s\S]*?for\(const ch of shuffle\(G\.imps\.slice\(\)\)\)[\s\S]*?ch\.function=role\.id/);
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

test('Espectral mantém velocidade normal e ignora a opção antiga de bônus',()=>{
  assert.doesNotMatch(html,/spectralIntangible/);
  assert.doesNotMatch(html,/Intangibilidade ao ativar/);
  assert.doesNotMatch(html,/spectralSpeed:/);
  assert.match(html,/function spectralIntangibilityActive\(ch\)\{return false\}/);
  assert.doesNotMatch(html,/CFG\.spectralSpeed/);
  assert.doesNotMatch(server,/spectralIntangible/);
  const s=cleanSettings({spectralSpeed:17},15);
  assert.equal(Object.hasOwn(s,'spectralSpeed'),false);
});
