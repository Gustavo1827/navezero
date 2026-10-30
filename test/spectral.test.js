const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const server=fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8');

test('Espectral tem configuração, aba e botão vermelhos',()=>{
  assert.match(html,/id="btnSpectral"[^>]*>👻<small>Sumir<\/small>/);
  assert.match(html,/id="btnSpectralSection"[^>]*>👻 Espectral<\/button>/);
  assert.match(html,/spectralChance:\[0,100\]/);
  assert.match(html,/spectralCooldown:\[5,20\]/);
  assert.match(html,/spectralDuration:\[10,90\]/);
  assert.doesNotMatch(html,/spectralSpeed:/);
  assert.doesNotMatch(html,/spectralIntangible/);
  assert.match(html,/\.act2\.spectral,\.spectral-tab/);
});

test('Espectral é distribuído somente entre Infiltrados sem outra função',()=>{
  assert.match(html,/spectralEligible=shuffle\(\[\.\.\.G\.imps\]\.filter\(ch=>ch\.role==='imp'&&!ch\.function\)\)/);
  assert.match(html,/ch\.function='spectral'/);
});

test('invisibilidade bloqueia eliminação, mantém velocidade normal e oculta o jogador',()=>{
  assert.match(html,/k\.spectralInvisible\|\|!v\.alive/);
  assert.doesNotMatch(html,/CFG\.spectralSpeed/);
  assert.match(html,/target\.vent\|\|target\.spectralInvisible/);
  assert.match(html,/spectralViewerAlpha/);
});

test('fumaça, som próximo, NPCs e multiplayer do Espectral estão integrados',()=>{
  assert.match(html,/spawnSpectralSmoke/);
  assert.match(html,/Vou falar na próxima reunião\./);
  assert.match(html,/Acho que vi um Espectral/);
  assert.match(html,/spectralSmokes:\(G\.spectralSmokes\|\|\[\]\)/);
  assert.match(server,/spectral_toggle/);
  assert.match(server,/spectralChance:\[0,100\]/);
});


test('Espectral usa transições de um segundo e contagem autoritativa monotônica',()=>{
  assert.match(html,/readyAt:G\.gt\+ROLE_FIXED\.spectralTransition/);
  assert.match(html,/spectralEndsAt=G\.gt\+duration/);
  assert.match(html,/function spectralRemaining\(ch\)/);
  assert.match(html,/proposed<ch\._spectralUiDeadline/);
  assert.match(html,/Voltar · \$\{Math\.max\(0,Math\.ceil\(time\)\)\}s/);
  assert.doesNotMatch(server,/spectralSpeed:/);
  assert.doesNotMatch(server,/spectralIntangible/);
  assert.doesNotMatch(server,/out\.spectralSpeed/);
});
