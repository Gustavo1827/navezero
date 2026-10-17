const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
test('menu Teclas possui mapeamento redefinível, persistência e bloqueio em mobile/texto',()=>{
 assert.match(html,/id=\"btnGameSettings\"[^>]*>Configurações de jogo/);
 assert.match(html,/id=\"gameSettingsOverlay\"[\s\S]*?id=\"btnGameKeys\"[^>]*>Teclas ⌨️/);
 assert.doesNotMatch(html,/id=\"btnKeys\"/);
 assert.match(html,/const DEFAULT_KEYS=Object\.freeze\(\{killMark:'KeyQ',sabotage:'KeyX',use:'KeyE',function:'KeyF'/);
 assert.match(html,/moveUp:'KeyW'.*moveDown:'KeyS'.*moveLeft:'KeyA'.*moveRight:'KeyD'/s);
 assert.match(html,/increase:'ArrowRight',decrease:'ArrowLeft',map:'KeyM',report:'KeyR',quickChat:'KeyC',back:'Escape',exit:'Digit0'/);
 assert.match(html,/localStorage\.setItem\('navezero_keys_v1'/);
 assert.match(html,/navezero_player_name_v1/);
 assert.match(html,/body\.touch \.desktopOnly/);
 assert.match(html,/if\(typing\(\)\)return/);
 assert.match(html,/A tecla \${keyLabel\(code\)} já é usada/);
});
