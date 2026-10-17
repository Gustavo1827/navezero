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
  assert.match(html,/spectralSpeed:\[0,10\]/);
  assert.doesNotMatch(html,/spectralIntangible/);
  assert.match(html,/\.act2\.spectral,\.spectral-tab/);
});

test('Espectral é distribuído somente entre Infiltrados sem outra função',()=>{
  assert.match(html,/spectralEligible=shuffle\(\[\.\.\.G\.imps\]\.filter\(ch=>ch\.role==='imp'&&!ch\.function\)\)/);
  assert.match(html,/ch\.function='spectral'/);
});

test('invisibilidade bloqueia eliminação, acelera e some do mapa do Observador',()=>{
  assert.match(html,/k\.spectralInvisible\|\|!v\.alive/);
  assert.match(html,/1\+CFG\.spectralSpeed\/10/);
  assert.match(html,/observerReveal&&ch\.spectralInvisible\)return/);
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


test('velocidade do Espectral usa passos de 0,2x e contagem autoritativa monotônica',()=>{
  assert.match(html,/if\(k==='spectralSpeed'\)\{wireRepeat\(minus,-2\);wireRepeat\(plus,2\)\}/);
  assert.match(html,/spectralEndsAt=G\.gt\+duration/);
  assert.match(html,/function spectralRemaining\(ch\)/);
  assert.match(html,/proposed<ch\._spectralUiDeadline/);
  assert.match(html,/Voltar · \$\{Math\.max\(0,Math\.ceil\(time\)\)\}s/);
  assert.match(server,/spectralSpeed:\[0,10\]/);
  assert.doesNotMatch(server,/spectralIntangible/);
  assert.match(server,/Math\.round\(out\.spectralSpeed\/2\)\*2/);
});
