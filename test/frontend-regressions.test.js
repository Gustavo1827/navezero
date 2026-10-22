'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('configurações completas incluem infiltrados e distância de renderização na sala', () => {
  assert.match(html, /NET_SETTING_KEYS=\[[^\]]*'impostors'[^\]]*'renderDist'/);
  assert.match(html, /renderDist:\[500,1500\]/);
  assert.match(server, /impostors:\[1,3\][^\n]*renderDist:\[500,1500\]/);
  assert.match(server, /cleanSettings\(\{\.\.\.room\.settings,\.\.\.\(m\.settings&&typeof m\.settings==='object'\?m\.settings:\{\}\)\},room\.size\)/);
});

test('a reunião revela os votos por 5 segundos e mantém a tela de ejeção por 10 segundos', () => {
  assert.match(html, /M\.replyQ=\[\]; M\.dur=5; \$\('meetTitle'\)\.textContent='Votação'/);
  assert.match(html, /M\.dur=10; \$\('meetTitle'\)\.textContent='Ejeção'/);
  assert.match(html, /M\.phase==='result'\)\{if\(M\.t>=M\.dur\)setMeetPhase\('eject'\)\}/);
  assert.match(html, /M\.phase==='eject'\)\{if\(M\.t>=M\.dur\)endMeeting\(\)\}/);
  assert.match(html, /\$\('meet'\)\.classList\.toggle\('vote-reveal',ph==='result'\)/);
  assert.match(html, /\$\('meet'\)\.classList\.remove\('vote-reveal','space-result'\)/);
});

test('bolinhas representam a cor de quem votou e desaparecem antes da ejeção', () => {
  assert.match(html, /M\.log\.forEach\(v=>\{const cd=M\.cards\[v\.target\]/);
  assert.match(html, /function renderSkipVoteDots\(log\)/);
  assert.match(html, /filter\(v=>v\.target==='skip'\)/);
  assert.match(html, /id="skipVoteDots"/);
  assert.match(html, /d\.style\.background=COLOR_BY\[voter\.color\]\?\.main\|\|chatCol\(voter\)/);
  assert.match(html, /if\(ph==='eject'\)card\.classList\.remove\('pick'\)/);
  assert.match(html, /if\(ph==='eject'\)\{[^}]*card\.dotsEl\.innerHTML=''/s);
  assert.match(html, /function netPaintMeeting\(sm\)\{[\s\S]*?\$\('voteBreakdown'\)\.textContent='';\$\('voteBreakdown'\)\.hidden=true/);
  assert.doesNotMatch(html.slice(html.indexOf('function netPaintMeeting(sm){'), html.indexOf('function netSyncCameraAndButtons()')), /sm\.voteBreakdown/);
});

test('Xerife tem configurações limitadas, aba própria e sincronização de sala', () => {
  for (const k of ['sheriffCooldown','sheriffChance','sheriffMax']) {
    assert.match(html, new RegExp("'"+k+"'"));
    assert.match(server, new RegExp(k+':\\['));
  }
  assert.match(html, /sheriffCooldown:\[50,120\]/);
  assert.match(server, /sheriffCooldown:\[50,120\]/);
  assert.match(html, /'sheriffCooldown','Tempo para atirar'/);
  assert.match(html, /sheriffChance:\[0,100\]/);
  assert.match(html, /sheriffMax:\[0,15\]/);
  assert.match(html, /id="btnSheriffSection"/);
  assert.match(html, /G\.cfgFunctionTab==='sheriff'&&!isSheriff/);
  assert.match(html, /const sheriffEnabled=CFG\.sheriffMax>0&&CFG\.sheriffChance>0&&Math\.random\(\)\*100<CFG\.sheriffChance/);
  assert.match(html, /sheriffEligible\.slice\(0,clamp\(CFG\.sheriffMax,0,15\)\)/);
});



test('Observador usa o mapa dos vivos, some em Comunicações e bloqueia movimento enquanto consulta', () => {
  assert.match(html, /obsChance:\[0,100\]/);
  assert.match(html, /obsMax:\[0,15\]/);
  assert.match(server, /obsChance:\[0,100\]/);
  assert.match(server, /obsMax:\[0,15\]/);
  assert.match(html, /const observerEnabled=CFG\.obsMax>0&&CFG\.obsChance>0&&Math\.random\(\)\*100<CFG\.obsChance/);
  assert.match(html, /observerEligible\.slice\(0,clamp\(CFG\.obsMax,0,15\)\)/);
  assert.match(html, /const observerAlive=!!\(G\.player\?\.alive&&G\.player\?\.role==='crew'&&G\.player\?\.function==='observer'\)/);
  assert.match(html, /const commsDown=\(G\.sab\.comms\|\|0\)>0/);
  assert.match(html, /const showAll=observerAlive&&!commsDown/);
  assert.match(html, /const ownGhost=personalMap&&ch\.isPlayer&&!ch\.alive/);
  assert.match(html, /const showChars=!\(observerAlive&&commsDown\)/);
  assert.match(html, /const observerMapLock=!!\(G\.mapOpen&&p\.alive&&p\.role==='crew'&&p\.function==='observer'\)/);
  assert.match(html, /body\.observer-map-lock #stick\{[^}]*transform:translateY\(88px\)[^}]*pointer-events:none/);
  assert.match(html, /document\.body\.classList\.add\('observer-map-lock'\)/);
  assert.match(html, /document\.body\.classList\.remove\('observer-map-lock'\)/);
  assert.match(server, /s\.observer=recipient\.function==='observer'/);
});
test('disparo do Xerife é validado pelo host e respeita alcance, linha de visão e cooldown', () => {
  assert.match(html, /command==='sheriff_shoot'[\s\S]*?activePlay&&!G\.M&&ch\.alive&&ch\.role==='crew'&&ch\.function==='sheriff'[\s\S]*?dist\(ch,target\)<=actionDistancePx\('sheriff'\)&&losClear/);
  assert.match(server, /'sheriff_shoot'/);
  assert.match(html, /function doSheriffShot\(shooter,target\)[\s\S]*?target\.role==='imp'[\s\S]*?killChar\(target\);parkPetAtBody/);
  assert.doesNotMatch(html.slice(html.indexOf('function doSheriffShot(shooter,target)'),html.indexOf('function playerSheriffShot()')), /addSheriffBody\(/, 'disparos do Xerife não criam corpo físico');
  const shotBody=html.slice(html.indexOf('function doSheriffShot(shooter,target)'),html.indexOf('function playerSheriffShot()'));
  assert.doesNotMatch(shotBody.slice(shotBody.indexOf("if(target.role==='imp')"),shotBody.indexOf('}else{')), /killChar\(shooter\)/, 'o Xerife sobrevive ao acertar um Infiltrado');
  assert.match(shotBody, /killChar\(shooter\);parkPetAtBody/, 'ao errar, somente o Xerife morre e não deixa corpo físico');
  assert.match(html, /if\(shooter===G\.player\)G\.sheriffCd=CFG\.sheriffCooldown;else shooter\.netSheriffCd=CFG\.sheriffCooldown/);
});


test('frases prontas permitem alegar ou suspeitar das funções de tripulante', () => {
  for (const id of ['roleDeny','roleSelf','roleSight','roleGuessPlayer']) assert.match(html, new RegExp("id:'"+id+"'"));
  for (const role of ['Tripulante','Infiltrado','Xerife','Localizador','Observador']) assert.match(html, new RegExp(role));
  assert.match(html, /function renderPhraseRoles\(phraseId,targetId=null\)/);
  assert.match(html, /Vi alguém com a função de \$\{role\}/);
});

test('descrições das funções e classes usam exatamente os textos solicitados', () => {
  assert.match(html, /Localizador — Rastreie um Tripulante com seu mapa\./);
  assert.match(html, /Xerife — Elimine o Infiltrado\. Se você errar, será eliminado\./);
  assert.match(html, /Mate a tripulação e sabote a nave\./);
  assert.match(html, /Faça suas tarefas e encontre o Infiltrado\./);
  assert.match(html, /Temporizador — Mate suas vítimas lentamente\./);
  assert.match(html, /Observador - Veja a Tripulação no seu mapa a qualquer momento\./);
});

test('cliente não marca tarefa concluída antes da confirmação autoritativa do host', () => {
  assert.match(html, /O host valida vida, posse, estação e distância antes de confirmar o passo/);
  assert.doesNotMatch(html, /if\(pending&&!q\.done\)z\.done=true/);
  assert.match(html, /stationDist\(station,ch\)>actionDistancePx\('object'\)/);
});

test('dutos de clientes são validados pelo host e a interface acompanha snapshots', () => {
  assert.match(html, /command==='vent_enter'/);
  assert.match(html, /Math\.hypot\(ch\.x-v\.px,ch\.y\+4-v\.py\)<=actionDistancePx\('vent'\)/);
  assert.match(html, /command==='vent_move'\)\{if\(activePlay&&ch\.vent\)ventMove\(ch,m\.ventId\)\}/);
  assert.match(html, /if\(G\.player\.vent&&s\.state==='playing'\)/);
});

test('culling desenha camadas visuais por sala sem desativar colisões', () => {
  assert.match(html, /let STATIC=null, MM_STATIC=null, ROOM_STATIC=new Map\(\)/);
  assert.match(html, /if\(a<=\.005\)return;\s*const layer=ROOM_STATIC\.get\(r\.id\)/);
  assert.match(html, /drawRoomStaticLayers\(c,cx,cy,vw,vh,cullViewer\)/);
  assert.match(html, /const floor=new Uint8Array\(COLS\*ROWS\), block=new Uint8Array\(COLS\*ROWS\), walk=new Uint8Array\(COLS\*ROWS\)/);
});


test('Temporizador tem aba vermelha, ativação, duração limitada e marcação autoritativa', () => {
  assert.match(html, /id="btnDelayedSection"[^>]*>⏱️ Temporizador/);
  assert.match(html, /id="btnDelayed"/);
  assert.match(html, /delayedEnabled:\[0,1\]/);
  assert.match(html, /delayedDuration:\[5,40\]/);
  assert.match(html, /Tempo para marcar/);
  assert.match(html, /Usa o mesmo cooldown configurado em/);
  assert.match(html, /if\(CFG\.delayedChance>0&&CFG\.delayedMax>0&&Math\.random\(\)\*100<CFG\.delayedChance\)/);
  assert.doesNotMatch(html, /\['delayedEnabled','Ativar função Temporizador'/);
  assert.doesNotMatch(html, /if\(CFG\.delayedEnabled&&CFG\.delayedChance>0/);
  assert.match(html, /function doDelayedMark\(shooter,target\)/);
  assert.match(html, /remaining:CFG\.delayedDuration/);
  assert.match(html, /delayedPendingFor\(shooter\)/);
  assert.match(html, /resolveDelayedMark\(id,mark\)/);
  assert.match(html, /A recarga só começa quando esta marca for resolvida/);
  assert.match(html, /if\(G\.M\|\|G\.state==='meeting'/);
  assert.match(html, /command==='delayed_mark'[\s\S]*?dist\(ch,target\)<=actionDistancePx\('delayed'\)&&losClear/);
  assert.match(html, /delayedMarks:\{\.\.\.G\.delayedMarks\}/);
  assert.match(html, /delayedChance:\[0,100\]/);
  assert.match(html, /delayedMax:\[0,3\]/);
  assert.match(server, /delayedEnabled:\[0,1\]/);
  assert.match(server, /delayedChance:\[0,100\]/);
  assert.match(server, /delayedMax:\[0,3\]/);
  assert.match(server, /delayedDuration:\[5,40\]/);
  assert.match(server, /mark\.killerId===recipientId/);
  assert.match(html, /privateMark\.killerId===G\.player\.id/);
  assert.match(html, /k\.function==='delayed'/);
  assert.match(html, /G\.player\.function==='delayed'\|\|!G\.killT/);
  assert.match(server, /'delayed_mark'/);
});


test('ajustes atuais: cooldowns maiores e uniformes, votos pulados identificados, OK menor e stepper contínuo', () => {
  assert.match(html, /\.act2\.cooldown-label\{font-size:22px!important/);
  assert.match(html, /\.act2\.cooldown-label small,\.act2\.cooldown-label \.sheriffButtonLabel\{font-size:22px!important/);
  assert.match(html, /el\('span','skip-vote-label','Votos Pulados:'\)/);
  assert.match(html, /dot\.style\.background=COLOR_BY\[voter\.color\]\?\.main\|\|chatCol\(voter\)/);
  assert.match(html, /#roomBotsOk\{[^}]*font:800 20px/);
  assert.match(html, /wireRepeat\(minus,-1\);wireRepeat\(plus,1\)/);
  assert.match(html, /repeatTimer=setInterval\(\(\)=>\{if\(!canStep\(\)\)\{stop\(\);return\}change\(delta,true\)\},70\)/);
  assert.doesNotMatch(html, /\['delayedEnabled','Ativar função Temporizador'/);
});

test('ícones das funções usam os emojis definidos e Temporizador não recebe eliminação direta', () => {
  assert.match(html, /id="btnSheriff"[^>]*>🔫/);
  assert.match(html, /id="btnDelayed"[^>]*>⏱️/);
  assert.match(html, /id="btnLocator"[^>]*>🧭/);
  assert.match(html, /id="btnObserverSection"[^>]*>👀 Observador/);
  assert.match(html, /const p=G\.player, can=[^;]*directKill=imp&&p\.function!=='delayed'/);
  assert.match(html, /function playerKill\(\)[\s\S]*?G\.player\.function==='delayed'/);
  assert.match(html, /k\.role!=='imp'\|\|k\.function==='delayed'/);
  assert.match(html, /ch\.function!=='delayed'&&!ch\.vent/);
});

test('chat escrito de sala tem UI, sanitização, limitação e filtragem por código de sala', () => {
  assert.match(html, /id="roomChatPanel"/);
  assert.match(html, /id="btnRoomChatLobby"/);
  assert.match(html, /r\.status!=='lobby'\)closeRoomChat\(\)/);
  assert.match(html, /NET\.room\?\.status!=='lobby'.*O chat escrito só funciona na sala de espera/s);
  assert.match(html, /id="roomChatInput" maxlength="180"/);
  assert.match(html, /type:'room_chat',text/);
  assert.match(html, /m\.roomCode===NET\.room\.code/);
  assert.match(html, /textContent|el\('span','',String\(m\.text/);
  assert.match(server, /m\.type==='room_chat'/);
  assert.match(server, /broadcast\(room,\{type:'room_chat_message',roomCode:room\.code/);
  assert.match(server, /slice\(0,180\)/);
});

test('nomes de bots são baseados no cadastro persistente da sala e persistem no offline', () => {
  assert.match(server, /function ensureBotRoster\(room\)/);
  assert.match(server, /botRoster:room\.botRoster\.map\(b=>\(\{\.\.\.b\}\)\)/);
  assert.match(html, /NET\.room\.botRoster/);
  assert.match(html, /function offlineBotNames\(owner\)/);
  assert.match(html, /const names=online\?fallbackNames:offlineBotNames\(G\.cfg\.name\)/);
});

test('revanche recria a mesma sala e permite reentrada dos jogadores anteriores', () => {
  assert.match(server, /if\(m\.type==='rematch'\)\{[\s\S]*?room\.status='lobby'[\s\S]*?room\.rematchLobby=true/);
  assert.match(server, /send\(target\.ws,\{type:'rematch_available',code:room\.code\}\)/);
  assert.match(server, /startGame\(room,!!room\.rematchLobby,timings\)/);
  assert.match(html, /rematchReadyCode/);
  assert.match(html, /type:'join_room',code:NET\.rematchReadyCode/);
});

test('falas novas dos bots são condicionadas a corpo, tarefa ou evidência', () => {
  assert.match(html, /if\(M\.body&&Math\.random\(\)<\.12\)return \{from:ch,text:pickLine\(\['Onde foi o corpo\?'\]\)/);
  assert.match(html, /Estava fazendo \$\{recentTask\}/);
  assert.match(html, /Não vi \$\{unseenTarget\.name\}/);
  assert.match(html, /Alguém viu \$\{unseenTarget\.name\}/);
  assert.match(html, /\$\{suspect\.name\} é suspeito\./);
});


test('após a reunião, ações e habilidades voltam à recarga completa sem reiniciar sabotagem', () => {
  const endMeeting=html.slice(html.indexOf('function endMeeting(){'),html.indexOf('function appendMeetingMsgVisual'));
  assert.match(endMeeting, /G\.meetCd=CFG\.meet;G\.killCd=CFG\.kill;G\.sheriffCd=CFG\.sheriffCooldown;G\.delayedCd=CFG\.kill;G\.cleanerCd=CFG\.cleanerCooldown;G\.paramedicCd=CFG\.paramedicCooldown/);
  assert.match(endMeeting, /c\.netKillCd=CFG\.kill;c\.netSheriffCd=CFG\.sheriffCooldown;c\.netDelayedCd=CFG\.kill;c\.netTrackTarget=null;c\.netTrackTime=0;c\.netTrackCd=CFG\.locCooldown/);
  assert.match(endMeeting, /c\.engVentTime=0;c\.engVentCd=CFG\.engCooldown/);
  assert.match(endMeeting, /c\.function==='spectral'[\s\S]*?c\.spectralCd=CFG\.spectralCooldown/);
  assert.match(endMeeting, /c\.function==='hunter'[\s\S]*?c\.hunterTargetCd=CFG\.hunterTargetCooldown/);
  assert.match(endMeeting, /c\.guardian[\s\S]*?c\.guardianCd=CFG\.guardianCooldown/);
  assert.match(endMeeting, /c\.instructor[\s\S]*?c\.instructorCd=CFG\.instructorCooldown/);
  assert.doesNotMatch(endMeeting, /G\.sab\.cd=CFG\.sab|ai\.sabT=CFG\.sab/, 'reunião não deve alterar a recarga de sabotagem');
});

test('NPCs não usam a causa interna do corpo para descobrir funções', () => {
  const statement=html.slice(html.indexOf('function npcStatement(ch,M){'),html.indexOf('function meetingNPCs(){'));
  assert.doesNotMatch(statement, /M\.body\.cause|const cause=/, 'NPC não pode ler a causa interna do corpo durante a reunião');
  assert.match(statement, /Não usa `body\.cause`: NPCs só discutem o que poderiam observar ou ouvir/);
  assert.match(statement, /Não sei qual habilidade causou isso; precisamos de testemunhas/);
});

test('Faxineiro tem configuração, atribuição, limpeza autoritativa e memória dos NPCs', () => {
  for (const key of ['cleanerChance','cleanerMax','cleanerCooldown','cleanerUses']) {
    assert.match(html, new RegExp("'"+key+"'"));
    assert.match(server, new RegExp(key+':\\['));
  }
  assert.match(html, /cleanerCooldown:\[10,60\]/);
  assert.match(html, /cleanerDelay:\[1,5\]/);
  assert.match(html, /cleanerUses:\[1,15\]/);
  assert.match(html, /id="btnCleanerSection"[^>]*>🧹 Faxineiro/);
  assert.match(html, /id="btnCleaner"[^>]*>🧹/);
  assert.match(html, /Faxineiro - Limpe corpos e suma com as evidências\./);
  assert.match(html, /const cleanerEnabled|CFG\.cleanerChance>0&&CFG\.cleanerMax>0/);
  assert.match(html, /function cleanBody\(cleaner,body\)[\s\S]*?cleaner\.cleanPending=\{bodyId:body\.id,remaining:CFG\.cleanerDelay\}/);
  assert.match(html, /function finishCleanBody\(cleaner,body\)[\s\S]*?G\.bodies=G\.bodies\.filter\(b=>b!==body\)/);
  assert.match(html, /cleaner\.cleanUses=Math\.max\(0,\(cleaner\.cleanUses\|\|0\)-1\)/);
  assert.match(html, /cleaner\.cleanCd=CFG\.cleanerCooldown/);
  assert.match(html, /command==='clean_body'[\s\S]*?cleanBody\(ch,body\)/);
  assert.match(server, /'clean_body'/);
  assert.match(server, /s\.cleaner=recipient\.function==='cleaner'/);
  assert.match(html, /ai\.cleanSaw/);
  assert.match(html, /Pode existir um Faxineiro|parece trabalho de Faxineiro|parece coisa de Faxineiro/);
});

test('NPC Observador usa posições do mapa e Comunicações interrompe novas leituras', () => {
  assert.match(html, /ch\.function==='observer'&&\(G\.sab\.comms\|\|0\)<=0/);
  assert.match(html, /ai\.observerMap\[o\.id\]=\{room:rm,t:G\.gt\}/);
  assert.match(html, /No mapa de observação, observei que \$\{seen\.name\} foi para \$\{r\.room\}/);
});

test('Engenheiro tem configuração, atribuição e sincronização multiplayer', () => {
  for (const key of ['engVentDuration','engChance','engMax','engCooldown']) {
    assert.match(html, new RegExp("'"+key+"'"));
    assert.match(server, new RegExp(key+':\\['));
  }
  assert.match(html, /engVentDuration:\[10,61\]/);
  assert.match(html, /engCooldown:\[5,25\]/);
  assert.match(html, /id="btnEngineerSection"[^>]*>🔧 Engenheiro/);
  assert.match(html, /Engenheiro - Pode usar os dutos/);
  assert.match(html, /function noteEngineerVentSeen\(ch,v,act\)[\s\S]*?addSusp\(o,ch\.id,-1\.2,'clear'/);
  assert.match(html, /ai\.engineerSaw&&G\.gt-ai\.engineerSaw\.gt<45/);
  assert.match(html, /\(ai\.vents\|\|\[\]\)\.some\(v=>v\.id===t\.id&&!v\.engineer\)/);
  assert.match(html, /const finiteEngineerVent=p\.vent&&p\.function==='engineer'/);
  assert.match(html, /be\.innerHTML='🔧<small>'\+ventLabel\+'<\/small>'/);
  assert.match(html, /if\(G\.freePlay\)return;[\s\S]*?const locked=inGame\(\)/);
});

test('NPCs usam falas contextuais e jogadores mortos veem funções sem revelar aos vivos', () => {
  assert.match(html, /Onde que mataram \${M\.body\.name}\?/);
  assert.match(html, /Encontrei o corpo de \${M\.body\.name} em \${M\.body\.room}!/);
  for (const phrase of ['Sim.','Não.','Concordo.','Discordo.','Isso é verdade.','Mentira!','Eu vi!','Não vi','Faltam poucas tarefas, vamos!','Vamos fazer tarefas para vencer!','Mortos, façam as suas tarefas!','Cuidado! Vamos resolver ']) {
    assert.ok(html.includes(phrase), 'fala contextual ausente: '+phrase);
  }
  assert.match(html, /\(\(!G\.player\?\.alive\|\|G\.role==='imp'\)&&ch\.role==='imp'\?'#ff6b7e'/);
  assert.match(html, /if\(!G\.player\.alive\)\{const fl=\{sheriff:'Xerife'.*const roleLine=el\('small','pfunction',fl\);/s);
  assert.match(html, /if\(!G\.player\.alive&&ch\.role==='imp'\)pn\.style\.color='#ff6b7e'/);
  assert.match(html, /if\(ai\.ventSaw&&G\.gt-ai\.ventSaw\.gt<45/);
  assert.match(html, /\.pc\.dead\{filter:none;border-color/);
  assert.match(html, /\.pc\.dead canvas\{filter:grayscale\(1\);opacity:/);
  assert.match(html, /lastSab&&G\.sab\[lastSab\.type\]>0/);
});

test('cosméticos têm catálogo, categorias, renderização centralizada e sincronização no snapshot', () => {
  assert.match(html, /id="btnCosmetics"[^>]*>Inventário</);
  for (const label of ['Chapéus','Pets','Roupas','Visores']) assert.match(html, new RegExp(label));
  assert.match(html, /const DEFAULT_COSMETICS=Object\.freeze\(\{hat:COSMETIC_NONE,pet:COSMETIC_NONE,outfit:COSMETIC_NONE,visor:COSMETIC_NONE\}\)/);
  assert.match(html, /drawOutfitCosmetic\(c,cosmetics\.outfit\);drawVisorCosmetic\(c,cosmetics\.visor\);drawHatCosmetic\(c,cosmetics\.hat\)/);
  assert.match(html, /drawPetShape\(c,cosmetics\.pet/);
  assert.match(html, /function updateCosmeticPets\(dt\)/);
  assert.match(html, /1-Math\.exp\(-Math\.max\(0,dt\)\*7\)/, 'pet deve seguir com atraso suave');
  assert.match(html, /c\.cosmetics=randomCosmetics\(\)/, 'NPCs recebem cosméticos uma vez na criação da partida');
  assert.match(html, /cosmetics:cloneCosmetics\(c\.cosmetics\)/, 'cosméticos precisam viajar no snapshot autoritativo');
  assert.match(html, /drawChar\(c,\{x:0,y:0,color:ch\.color[^}]*cosmetics:ch\.cosmetics/s, 'reuniões devem reutilizar o renderizador principal');
  assert.match(html, /drawChar\(c,\{x:-35,y:0,color:caller\.color[^}]*cosmetics:caller\.cosmetics/s, 'introdução de reunião deve manter cosméticos');
  assert.match(html, /drawBody\(c,\{x:48,y:17,color:v\.color,cosmetics:v\.cosmetics\}\)/, 'morte deve preservar a parte visual aplicável');
  assert.doesNotMatch(html, /HALF_W[^\n]*cosmetic|boxBlocked[^\n]*cosmetic|CFG\.speed[^\n]*cosmetic/i, 'cosméticos não podem entrar em colisão ou velocidade');
});

test('catálogo de cosméticos fica no menu inicial e preserva a regra de cores únicas online', () => {
  assert.match(html, /id="btnFreePlay"[^>]*>Partida Livre<\/button><button class="chip" id="btnCosmetics"[^>]*>Inventário<\/button>/, 'Inventário deve usar o mesmo estilo compacto de Partida Livre no menu');
  assert.doesNotMatch(html, /roomActions[^\n]*id="btnCosmetics"/, 'o botão não deve permanecer na janela do lobby');
  assert.match(html, /function openCosmetics\(\)\{if\(NET\.inRoom\)\{toast\('O Inventário é usado na tela inicial/, 'Inventário deve ser aberto antes de entrar na sala');
  assert.match(html, /id="lobbyColorSwatches"/, 'catálogo deve manter o seletor de cor');
  assert.match(html, /netSend\(\{type:'set_color',color:color\.id\}\)/, 'a proteção de cor única continua disponível para estado de lobby sincronizado');
  assert.match(html, /filter\(p=>p\.id!==NET\.id\)\.map\(p=>p\.color\)/, 'cores usadas por outros jogadores continuam detectadas');
  assert.match(html, /\{id:'banana',name:'Banana',main:'#fff2a8',dark:'#d9be58'\}/, 'banana deve usar uma tonalidade mais clara');
});

test('pets somem em dutos, ficam tristes no corpo e estados visuais antigos são limpos após reuniões', () => {
  assert.match(html, /pet==='none'\|\|ch\.alive===false\|\|ch\.ghost\|\|ch\.vent\|\|\(ch\.ventAnim&&ch\.ventAnim\.kind==='in'\)/, 'seguidor deve ser suspenso ao morrer ou entrar no duto');
  assert.match(html, /worldPetVisible=ch\.alive!==false&&!ch\.ghost&&!ch\.vent/, 'pet não deve ser desenhado acompanhando morto ou jogador dentro do duto');
  assert.match(html, /function parkPetAtBody\(body,ch\)/);
  assert.match(html, /drawPetShape\(c,p\.pet,p\.x,p\.y,p\.phase\|\|0,\{sad:true\}\)/, 'pet estacionado deve usar estado triste');
  assert.match(html, /addBodyWithPet\(body,v\)/, 'morte comum deve estacionar o pet junto do corpo');
  assert.match(html, /const deadPets=\(G\.deadPets\|\|\[\]\)\.map/, 'pets deixados no mapa precisam viajar no snapshot multiplayer');
  assert.match(html, /G\.deadPets=Array\.isArray\(s\.deadPets\)\?s\.deadPets\.map/, 'clientes precisam restaurar pets persistentes do snapshot');
  const endMeeting=html.slice(html.indexOf('function endMeeting(){'),html.indexOf('function appendMeetingMsgVisual'));
  assert.match(endMeeting,/G\.deadPets=\[\]/, 'retorno da reunião deve limpar pets/visuais antigos deixados na rodada anterior');
});


test('Faxineiro é exclusivamente Infiltrado, usa identidade vermelha e respeita limite de Infiltrados', () => {
  assert.match(html, /\.act2\.delayed,\.act2\.cleaner,\.delayed-tab,\.cleaner-tab/);
  assert.match(html, /class="big alt cleaner-tab" id="btnCleanerSection"/);
  assert.match(html, /if\(key==='cleanerMax'\)return \[0,Math\.max\(0,Math\.min\(CFG\.impostors,CFG_LIM\.cleanerMax\[1\]\)\)\]/);
  assert.match(html, /if\(k==='impostors'&&CFG\.cleanerMax>CFG\.impostors\)\{CFG\.cleanerMax=CFG\.impostors/);
  assert.match(html, /cleanerEligible=shuffle\(\[\.\.\.G\.imps\]\.filter\(ch=>ch\.role==='imp'&&!ch\.function\)\)/);
  assert.match(html, /cleanerLimit=Math\.min\(clamp\(CFG\.cleanerMax,0,CFG\.impostors\),G\.imps\.length,cleanerEligible\.length\)/);
  assert.match(html, /const crewFns=\['locator','sheriff','observer','engineer','lazy','seer','noisy','judge'\], impFns=\['delayed','cleaner','marionette','hunter'\]/);
  assert.match(html, /cleaner=G\.role==='imp'&&p\.function==='cleaner'/);
  assert.match(server, /out\.cleanerMax=Math\.min\(out\.cleanerMax,out\.impostors\)/);
});

test('Parasita é função de Infiltrado com infecção adiada até o fim da reunião', () => {
  assert.match(html, /class="act2 parasite" id="btnParasite"[\s\S]*?🦠<small>Infectar<\/small>/);
  assert.match(html, /class="big alt parasite-tab" id="btnParasiteSection"[\s\S]*?🦠 Parasita/);
  assert.match(html, /parasiteChance:\[0,100\]/);
  assert.match(html, /parasiteMax:\[0,3\]/);
  assert.match(html, /parasiteEligible=shuffle\(\[\.\.\.G\.imps\]\.filter\(ch=>ch\.role==='imp'&&!ch\.function\)\)/);
  assert.match(html, /function infectTarget\(parasite,target\)[\s\S]*?G\.parasiteWinnerId=parasite\.id[\s\S]*?G\.parasiteInfections\[target\.id\][\s\S]*?c\.parasiteReady=false/);
  assert.match(html, /function resolveParasiteInfections\(\)[\s\S]*?t&&t\.alive&&t\.role==='crew'[\s\S]*?consumeGuardianProtection\(t,'parasite'\)[\s\S]*?convertToImpostor\(t\)[\s\S]*?parasiteReady=false/);
  const endMeeting=html.slice(html.indexOf('function endMeeting(){'),html.indexOf('function appendMeetingMsgVisual'));
  assert.ok(endMeeting.indexOf('G.guardianBreakFx=[]')<endMeeting.indexOf('resolveParasiteInfections()'), 'efeitos antigos devem ser limpos antes de mostrar uma quebra nova do escudo do Parasita');
  assert.match(endMeeting, /resolveParasiteInfections\(\);[\s\S]*?guardianProtections/, 'infecção pendente deve ser resolvida no fim da reunião antes de limpar proteções restantes');
  assert.match(html, /target\.role='imp';target\.function=null/);
  assert.match(html, /G\.tasks\.filter\(t=>t\.owner===target\.id\)\.forEach\(t=>t\.fake=true\)/);
  assert.match(html, /parasiteBotThink\(ch,dt\)/);
  assert.match(html, /action:'parasite_infect'/);
  assert.match(server, /'parasite_infect'/);
});

test('Vidente inspeciona corpos com reconstituição privada e pistas factuais para NPCs', () => {
  assert.match(html, /id="btnSeer"[^>]*>🔮<small>Inspecionar<\/small>/);
  assert.match(html, /seerChance:\[0,100\]/);
  assert.match(html, /seerMax:\[0,15\]/);
  assert.match(html, /seerCooldown:\[10,45\]/);
  assert.match(html, /seerDelay:\[0,5\]/);
  assert.match(html, /seerDuration:\[5,10\]/);
  assert.match(html, /function inspectBody\(seer,body\)/);
  assert.match(html, /function drawSeerReplay\(c\)[\s\S]*?fillStyle='#050509'/);
  assert.match(html, /const fadeIn=clamp\(elapsed\/.45,0,1\),fadeOut=clamp\(\(duration-elapsed\)\/.55,0,1\)/);
  assert.doesNotMatch(html, /function drawSeerReplay\(c\)[\s\S]*?strokeStyle='rgba\(6,7,13,\.72\)'/);
  assert.match(html, /\['marionette','✋ Marionetista'\]/);
  assert.match(html, /\['engineer','🔧 Engenheiro'\]/);
  assert.match(html, /Vi a silhueta de quem matou \$\{q\.victimName\}, entrou em um duto!/);
  assert.match(html, /Vi a silhueta de quem matou \$\{q\.victimName\}, foi para \$\{q\.room\}/);
  assert.match(server, /s\.selfSeerReplay=recipient\?\.alive!==false&&recipient\?\.role==='crew'&&recipient\?\.function==='seer'\?\(s\.seerReplays\?\.\[recipientId\]\|\|null\):null;delete s\.seerReplays;for\(const b of \(s\.bodies\|\|\[\]\)\)delete b\.killerTrace/);
  assert.match(server, /'seer_inspect'/);
});

test('Instrutor é secreto até a morte, cria trilhas privadas e respeita Comunicações', () => {
  assert.match(html, /class="act2 instructor" id="btnInstructor"[\s\S]*?↔️<small>Trilhar<\/small>/);
  assert.match(html, /instructorChance:\[0,100\]/);
  assert.match(html, /instructorMax:\[0,15\]/);
  assert.match(html, /instructorCooldown:\[20,60\]/);
  assert.match(html, /instructorDuration:\[5,15\]/);
  assert.match(html, /function activateInstructor\(ch\)[\s\S]*?ch\.alive[\s\S]*?ch\.role!=='crew'[\s\S]*?ch\.instructor=true/);
  assert.match(html, /function killChar\(c\)[\s\S]*?maybeActivateGhostRole\(c\)/);
  assert.match(html, /function createInstructorTrail\(owner,target,x,y\)[\s\S]*?targetId:target\.id[\s\S]*?CFG\.instructorDuration/);
  assert.match(html, /if\(type==='comms'\)\{G\.instructorTrails\.length=0/);
  assert.match(html, /function instructorNpcThink\(ch,dt\)/);
  assert.match(html, /action:'instructor_mark'/);
  assert.match(server, /'instructor_mark'/);
  assert.match(server, /s\.instructorTrails=\(s\.instructorTrails\|\|\[\]\)\.filter\(t=>String\(t\.targetId\)===String\(recipientId\)\|\|String\(t\.ownerId\)===String\(recipientId\)\)/);
  assert.match(server, /recipient\?\.instructor\|\|recipient\?\.guardian[\s\S]*?c\.alive&&c\.role==='crew'\)c\.function=null/);
});

test('Instrutor só pode selecionar jogadores vivos dentro da Distância para ações', () => {
  assert.match(html, /function instructorSelectableTargets\(owner,range=actionDistancePx\('instructor'\)\)[\s\S]*?c\.alive[\s\S]*?!c\.vent[\s\S]*?dist\(owner,c\)<=range[\s\S]*?losClear/);
  assert.match(html, /function openInstructorPicker\(\)[\s\S]*?const nearby=instructorSelectableTargets\(p\)[\s\S]*?Chegue perto de um jogador vivo/);
  assert.match(html, /action:'instructor_select'/);
  assert.match(html, /command==='instructor_select'[\s\S]*?const instructorRange=actionDistancePx\('instructor'\)[\s\S]*?dist\(ch,c\)<=instructorRange[\s\S]*?ch\.instructorTargetId=target\.id/);
  assert.match(html, /command==='instructor_mark'[\s\S]*?String\(ch\.instructorTargetId\)===String\(target\.id\)/);
  assert.match(server, /'instructor_select'/);
});

test('Instrutor online tolera previsão de posição sem ampliar o alcance global e aceita null autoritativo do alvo', () => {
  assert.match(html, /const INSTRUCTOR_NET_POINT_TOLERANCE=120/);
  assert.doesNotMatch(html, /INSTRUCTOR_NET_RANGE_TOLERANCE/);
  assert.match(html, /action:'instructor_select',targetId:ch\.id,x:p\.x,y:p\.y/);
  assert.match(html, /clientDrift<=INSTRUCTOR_NET_POINT_TOLERANCE[\s\S]*?Math\.hypot\(sx-target\.x,sy-target\.y\)<=range/);
  assert.match(html, /drift<=INSTRUCTOR_NET_POINT_TOLERANCE\?rx:ch\.x/);
  assert.match(html, /hasOwnProperty\.call\(s,'selfInstructorTargetId'\)\?s\.selfInstructorTargetId/);
  assert.match(server, /\['targetId','x','y','sabotage'/);
});

test('habilidades especiais possuem efeitos sonoros e visuais leves personalizados', () => {
  assert.match(html, /roleFx\(kind,phase='use'\)/);
  assert.match(html, /const ROLE_FX=\[\]/);
  assert.match(html, /function emitRoleFx\(/);
  assert.match(html, /function drawRoleFx\(/);
  for (const role of ['locator','sheriff','delayed','observer','cleaner','parasite','engineer','marionette','instructor']) {
    assert.match(html, new RegExp(`roleFx\\('${role}'`));
  }
});

test('Instrutor pode ser aplicado e removido pelo computador da Partida Livre', () => {
  assert.match(html, /\['instructor','↔️ Instrutor'\]/, 'Instrutor deve aparecer no seletor de funções de Tripulante');
  assert.match(html, /if\(fn==='instructor'\)[\s\S]*?ch\.instructor=true[\s\S]*?if\(ch\.alive\)killChar\(ch\)/, 'adicionar Instrutor deve matar o personagem imediatamente');
  assert.match(html, /if\(ch\.instructor\)[\s\S]*?ch\.instructor=false[\s\S]*?ch\.alive=true;ch\.ghost=false/, 'remover Instrutor deve reviver o personagem');
  assert.match(html, /return ch\.instructor\?`\$\{base\} \+ Instrutor ↔️`:/, 'o computador deve indicar Instrutor sem apagar a função-base do Tripulante');
});


test('fantasmas veem apenas a função acima do nome, eliminações têm respingo e novos cosméticos são aceitos', () => {
  assert.match(html, /c\.strokeText\(fn,ch\.x,ch\.y-74\)/);
  assert.doesNotMatch(html, /const label=fn\+' — '\+ch\.name/);
  assert.match(html, /function spawnKillSplash\(k,v\)/);
  assert.match(html, /drawKillSplashes\(c\)/);
  assert.match(html, /spawnKillSplash\(k,v\);killChar\(v\)/);
  assert.match(html, /killSplashes:\(G\.killSplashes\|\|\[\]\)\.map/);
  for (const id of ['hat_traveler','hat_tide','hat_nightcap','hat_signal','hat_bow','hat_cosmic','hat_colorcap','hat_nyah','pet_scout','pet_mini','outfit_cadet']) {
    assert.ok(html.includes(id), 'cosmético novo ausente no cliente: '+id);
    assert.ok(server.includes(id), 'cosmético novo ausente no servidor: '+id);
  }
  assert.match(html, /const PROVIDED_COSMETIC_SRC=\{/);
});

test('distância para ações oferece Curta, Média e Longa e sincroniza no multiplayer', () => {
  assert.match(html, /actionDistance:\[0,2\]/);
  assert.match(html, /const ACTION_DISTANCE_LABELS=\['Curta','Média','Longa'\]/);
  assert.match(html, /function actionDistancePx\(kind='default'\)/);
  assert.match(html, /const ACTION_DISTANCE_VALUES=\[100,130,160\]/);
  assert.match(html, /return ACTION_DISTANCE_VALUES\[lv\]/);
  assert.doesNotMatch(html, /const maps=\{kill:/, 'ações não devem manter tabelas de alcance separadas');
  assert.match(html, /\['actionDistance','Distância para ações'/);
  assert.match(html, /'actionDistance','commonTasks','mediumTasks','longTasks','renderDist'/);
  assert.match(server, /actionDistance:\[0,2\]/);
  assert.match(server, /actionDistance:1/);
});

test('configurações de funções mostram descrição no topo de cada função', () => {
  assert.match(html, /const descriptions=\{locator:/);
  for (const role of ['Localizador','Xerife','Temporizador','Observador','Instrutor','Faxineiro','Parasita','Engenheiro','Marionetista']) assert.match(html,new RegExp(role));
  assert.match(html, /box\.appendChild\(info\)/);
});

test('texto da função para fantasmas é maior e portas sabotadas são redesenhadas por cima da névoa', () => {
  assert.match(html, /\.pfunction\{[^}]*font-size:14px/);
  assert.match(html, /c\.font='800 16px/);
  assert.match(html, /Durante a sabotagem de portas, as portas fechadas permanecem legíveis sobre a névoa/);
  assert.match(html, /if\(\(G\.sab\.doors\|\|0\)>0\)[\s\S]*?for\(const d of doors\)\{if\(!d\.closed\)continue/);
});

test('portas sabotadas bloqueiam a iluminação como paredes e liberam visão ao reabrir', () => {
  assert.match(html, /!isFloor\(tx,ty\)\|\|doorClosedAt\(tx,ty\)/);
  assert.match(html, /function doorClosedAt\(tx,ty\)\{return doors\.some\(d=>d\.closed/);
});


test('tarefas usam categorias configuráveis, comuns compartilhadas e sorteio individual para médias/longas', () => {
  for (const key of ['commonTasks','mediumTasks','longTasks']) {
    assert.match(html, new RegExp(key+':\\[0,5\\]'));
    assert.match(server, new RegExp(key+':\\[0,5\\]'));
  }
  assert.match(html, /Tarefas Comuns/);
  assert.match(html, /Tarefas Médias/);
  assert.match(html, /Tarefas Longas/);
  assert.match(html, /category:'common'/);
  assert.match(html, /category:'medium'/);
  assert.match(html, /category:'long'/);
  assert.match(html, /name:'Baixar dados da nave'/);
  assert.match(html, /const commonTaskTemplates=taskTemplateSelection\(TASK_POOLS\.common,CFG\.commonTasks\)/);
  assert.match(html, /normalTemplates=\[\.\.\.commonTaskTemplates,\.\.\.taskTemplateSelection\(TASK_POOLS\.medium,CFG\.mediumTasks\),\.\.\.taskTemplateSelection\(TASK_POOLS\.long,CFG\.longTasks\)\]/);
  assert.match(html, /c\.function==='lazy'\)\?createLazyTasksFor\(c\.id\):normalTemplates\.map/);
});

test('novas falas dos NPCs dependem de corpo, memória, função observada ou suspeita', () => {
  assert.match(html, /`Corpo de \$\{M\.body\.name\} em \$\{M\.body\.room\}\.`/);
  assert.match(html, /`Vamos votar em \$\{suspect\.name\}\.`/);
  assert.match(html, /Mortos, nos ajudem!/);
  assert.match(html, /é Marionetista!!!/);
  assert.match(html, /Pode ser Engenheiro ou Infiltrado/);
  assert.doesNotMatch(html, /é Engenheiro!!!/);
  assert.match(html, /é Faxineiro!!!/);
  assert.match(html, /Não acho que \$\{T\.name\} seja/);
  assert.match(html, /pick\(\['Concordo\.','Sim\.'/);
  assert.match(html, /pick\(\['Discordo\.','Não\.'/);
  assert.match(html, /'Verdade\.'/);
  assert.match(html, /'Mentira\.'/);
});

test('Paramédico libera usos por tarefas, revive uma única vez e sincroniza o corpo exato', () => {
  assert.match(html, /id="btnParamedic"[^>]*>⛑️<small>Reviver<\/small>/);
  assert.match(html, /id="btnParamedicSection"[^>]*>⛑️ Paramédico/);
  for (const key of ['paramedicChance','paramedicMax','paramedicCooldown','paramedicTasksPerUse','paramedicMaxUses']) {
    assert.match(html, new RegExp(key+':\\['));
    assert.match(server, new RegExp(key+':\\['));
  }
  assert.match(html, /Paramédico - Reviva Tripulantes por meio de seus corpos\./);
  assert.match(html, /paramedicEligible=shuffle\(G\.chars\.filter\(c=>c\.role==='crew'&&!c\.function\)\)/);
  assert.match(html, /Math\.floor\(completedRealTasksFor\(ch\)\/Math\.max\(1,CFG\.paramedicTasksPerUse\)\)/);
  assert.match(html, /victim&&victim!==medic&&!victim\.alive&&victim\.role==='crew'&&!victim\.revivedOnce/);
  assert.match(html, /clearRevivedFunctionState\(victim\);victim\.role='crew';victim\.alive=true;victim\.ghost=false;victim\.revivedOnce=true/);
  assert.match(html, /victim\.x=body\.x;victim\.y=body\.y/);
  assert.match(html, /G\.bodies=G\.bodies\.filter\(b=>b!==body\)/);
  assert.match(html, /medic\.paramedicSpent=Math\.max\(0,medic\.paramedicSpent\|\|0\)\+1;medic\.paramedicCd=CFG\.paramedicCooldown/);
  assert.match(html, /command==='revive_body'[\s\S]*?m\.bodyId[\s\S]*?reviveBody\(ch,body\)/);
  assert.match(html, /action:'revive_body',bodyId:b\.id/);
  assert.match(server, /'revive_body'/);
  assert.match(server, /if\(m\.bodyId!==undefined\)allowedData\.bodyId=m\.bodyId/);
  assert.match(html, /paramedicBotThink\(ch,dt\)/);
  assert.match(html, /\['paramedic','⛑️ Paramédico'\]/);
});

test('conversão do Parasita apaga toda função anterior e vira Infiltrado comum', () => {
  assert.match(html, /function clearConvertedCrewFunctionState\(target\)[\s\S]*?target\.function=null/);
  assert.match(html, /clearConvertedCrewFunctionState\(target\);\s*target\.role='imp';target\.function=null/);
  assert.match(html, /G\.tasks\.filter\(t=>t\.owner===target\.id\)\.forEach\(t=>t\.fake=true\)/);
  assert.match(html, /if\(G\.parasiteInfections&&Object\.prototype\.hasOwnProperty\.call\(G\.parasiteInfections,c\.id\)\)delete G\.parasiteInfections\[c\.id\]/);
});

test('reportar, limpar e reviver corpos online usam o ID exato para resolver corridas no host', () => {
  assert.match(html, /action:'report',bodyId:b\.id/);
  assert.match(html, /command==='report'[\s\S]*?m\.bodyId!=null\?G\.bodies\.find\(b=>String\(b\.id\)===String\(m\.bodyId\)/);
  assert.match(html, /action:'clean_body',bodyId:b\.id/);
  assert.match(html, /action:'revive_body',bodyId:b\.id/);
});

test('configurações da sala do host persistem localmente ao fechar/salvar o menu', () => {
  assert.match(html, /function saveCfg\(force=false\)\{if\(!force&&typeof NET!=='undefined'&&NET\.inRoom\)return/);
  assert.match(html, /localStorage\.setItem\('nz_cfg'/);
  assert.match(html, /function netSaveRoomSettings\(\)[\s\S]*?netApplySettings\(cfg\.settings\);saveCfg\(true\);netSend/);
  assert.match(html, /const netOriginalCloseCfg=closeCfg;closeCfg=function\(\)\{const shouldSave=NET\.inRoom&&NET\.isHost&&NET\.room\?\.status==='lobby';if\(shouldSave\)netSaveRoomSettings\(\)/);
});

test('paleta ampliada mantém Oliva e remove Musgo redundante', () => {
  for (const [id,name] of [['azul_claro','Azul-claro'],['lavanda','Lavanda'],['mostarda','Mostarda'],['verde_claro','Verde-claro'],['rosado','Rosado'],['verde_forte','Verde Forte'],['oliva','Oliva']]) {
    assert.match(html, new RegExp("\\{id:'"+id+"',name:'"+name+"'"));
    assert.match(server, new RegExp("'"+id+"'"));
  }
});

test('novos cosméticos inspirados são vetoriais, catalogados e aceitos pelo servidor', () => {
  for (const id of ['hat_orbit_badge','hat_eye_pod','hat_comet_mane','hat_void_topper','hat_dune_brim','hat_solar_peak','hat_nova_fold','hat_dust_spire','hat_polar_brim','hat_winter_comet','pet_signal_orb','pet_pocket_eye','outfit_orbit_collar','outfit_signal_wrap','visor_eclipse','visor_scope']) {
    assert.match(html, new RegExp(id));
    assert.match(server, new RegExp(id));
  }
  assert.match(html, /outfit_orbit_collar:\['#304b45','#5cd2ae'\]/);
  assert.match(html, /outfit_signal_wrap:\['#6873bb','#80d8e8'\]/);
});


test('Inventário concentra a seleção de cor e substitui o nome Cosméticos no menu', () => {
  assert.match(html, /id="btnCosmetics"[^>]*>Inventário<\/button>/);
  assert.match(html, /id="cosmeticsTitle">Inventário<\/h2>/);
  assert.doesNotMatch(html, /id="swatches"/);
  assert.match(html, /id="lobbyColorSwatches"/);
});

test('Partida Livre não reposiciona bots na Cafeteria após reunião', () => {
  const endMeeting=html.slice(html.indexOf('function endMeeting(){'),html.indexOf('function appendMeetingMsgVisual'));
  assert.match(endMeeting, /if\(G\.freePlay\)[\s\S]*const alivePlayer=G\.player&&G\.player\.alive\?G\.player:null[\s\S]*if\(alivePlayer\)[\s\S]*placeChar\(alivePlayer,pt\)/);
});


test('fantasma usa barbixo ondulado em vez do rabo antigo', () => {
  assert.match(html, /Fantasma mantém o corpo normal e troca as pernas por um “barbixo” ondulado/);
  assert.match(html, /Três ondas curtas na parte inferior; sem rabo lateral/);
  assert.match(html, /quadraticCurveTo\(10,20,6,15\)/);
  assert.doesNotMatch(html, /sem pernas e com rabinho/);
});

test('sorteio de Infiltrados usa todos os participantes igualmente', () => {
  assert.match(html, /function drawImpostors\(participants,count\)[\s\S]*?Host, humanos remotos e NPCs entram exatamente no mesmo embaralhamento[\s\S]*?return shuffle\(participants\.slice\(\)\)\.slice/);
  assert.match(html, /drawImpostors\(G\.chars,normalImpCount\)/);
  assert.doesNotMatch(html, /filter\([^\n]*isPlayer[^\n]*\).*drawImpostors/);
});

test('Chat Rápido contém as novas frases e reutiliza seletores de salas e jogadores', () => {
  for (const id of ['whoPassedRoom','yes','no','lie','truth','voteWho','voteTarget','playerOnly']) assert.match(html,new RegExp("id:'"+id+"'"));
  assert.match(html, /\{id:'whoPassedRoom',label:'Quem passou para \[local\]\?',room:true\}/);
  assert.match(html, /\{id:'voteTarget',label:'Vamos votar em \[jogador\]',target:true\}/);
  assert.match(html, /\{id:'playerOnly',label:'\[jogador\]',target:true\}/);
  assert.match(html, /case 'whoPassedRoom':[\s\S]*?Quem passou para \$\{rm\}\?/);
  assert.match(html, /case 'voteTarget':[\s\S]*?Vamos votar em \$\{T\.name\}/);
});

test('Preguiçoso é Tripulante vivo com tarefas reduzidas e peso normal na barra', () => {
  assert.match(html, /id="btnLazySection"[^>]*>🍕 Preguiçoso/);
  assert.match(html, /Preguiçoso - Suas tarefas são fáceis, complete elas e ajude a Tripulação\./);
  for (const key of ['lazyChance','lazyMax','lazySlowdown','lazyTasks']) {
    assert.match(html,new RegExp(key+':\\['));
    assert.match(server,new RegExp(key+':\\['));
  }
  assert.match(html, /lazyEligible=shuffle\(G\.chars\.filter\(c=>c\.role==='crew'&&!c\.function\)\)/);
  assert.match(html, /function createLazyTasksFor\(owner\)[\s\S]*?slice\(0,count\)[\s\S]*?task\.lazy=true/);
  assert.match(html, /lazyNormalSteps=normalTemplates\.reduce/);
  assert.match(html, /if\(allDone\)\{d\+=weight;t\+=weight\}/);
  assert.match(html, /function moveSpeedFor\(ch,base=CFG\.speed\)/);
  assert.match(html, /const p=G\.player, sp=moveSpeedFor\(p,CFG\.speed\)\*dt/);
  assert.match(html, /moveSpeedFor\(target,CFG\.speed\)\*dt/);
  assert.match(server, /out\.lazyMax=Math\.min\(out\.lazyMax,Math\.max\(0,Math\.min\(15,playerCount\)\)\)/);
});

test('NPCs formam suspeitas de funções por evidência e não leem função alheia em reuniões', () => {
  const statement=html.slice(html.indexOf('function npcStatement(ch,M){'),html.indexOf('function meetingNPCs(){'));
  assert.match(statement, /controlVictimSaw/);
  assert.match(statement, /reviveSaw/);
  assert.match(statement, /cleanSaw/);
  assert.match(statement, /engineerSaw/);
  assert.doesNotMatch(statement, /seen\.function|T\.function|target\.function/);
  assert.doesNotMatch(statement, /G\.imps\.includes/);
});


test('Marrom faz parte da paleta do cliente e da lista aceita pelo servidor', () => {
  assert.match(html, /\{id:'marrom',name:'Marrom',main:'#8a5a3b',dark:'#573724'\}/);
  assert.match(server, /'marrom'/);
});

test('NPC Preguiçoso conclui a função e recebe a mesma lentidão dos jogadores', () => {
  assert.match(html, /function lazyTasksDone\(ch\)[\s\S]*?if\(ch\.lazyDone===true\)return true/);
  assert.match(html, /if\(!g\.t\.fake\)\{ai\.lastTaskName=g\.t\.name;ai\.lastTaskAt=G\.gt;if\(ch\.function==='lazy'\)lazyTasksDone\(ch\)/);
  assert.match(html, /const st=Math\.min\(d,moveSpeedFor\(ch,ai\.speed\)\*dt\)/);
  assert.match(html, /lazyDone:!!c\.lazyDone/);
});

test('otimização agrupa tarefas do Preguiçoso para a barra de progresso', () => {
  assert.match(html, /charsById=new Map\(G\.chars\.map/);
  assert.match(html, /lazyByOwner=new Map\(\)/);
  assert.match(html, /lazyByOwner\.get\(o\.id\)\|\|\[\]/);
});

test('NPCs usam campo de visão real e sofrem Sabotagem de Luzes em todas as evidências visuais', () => {
  assert.match(html, /function npcVisionRange\(ch\)[\s\S]*?ch\.role==='crew'&&\(G\.sab\.lights\|\|0\)>0\?Math\.max\(110,base\*\.34\):base/);
  assert.match(html, /function npcCanSeePoint\(ch,x,y\)[\s\S]*?npcVisionRange\(ch\)[\s\S]*?losClear/);
  assert.match(html, /function npcCanSeeChar\(ch,target\)[\s\S]*?target\.spectralInvisible/);
  assert.match(html, /noteSpectralSmokeEvidence[\s\S]*?!npcCanSeePoint\(o,x,y\)/);
  assert.match(html, /function ventWitnesses\(v,who\)[\s\S]*?npcCanSeePoint\(o,v\.px,v\.py\)/);
  assert.match(html, /function doKill\(k,v\)[\s\S]*?npcCanSeePoint\(o,v\.x,v\.y\)&&npcCanSeeChar\(o,k\)/);
  assert.match(html, /function noteCleanerEvidence[\s\S]*?const sawBody=npcCanSeePoint[\s\S]*?sawCleaner=npcCanSeeChar/);
  assert.match(html, /function noteParamedicEvidence[\s\S]*?npcCanSeePoint\(o,body\.x,body\.y\)&&npcCanSeeChar\(o,medic\)/);
});

test('conta tem prioridade no boot e armazenamento local só é aplicado sem sessão válida', () => {
  assert.match(html, /let ACCOUNT_STORAGE_READ_ALLOWED=false/);
  assert.match(html, /function loadPlayerName\(\)\{if\(!ACCOUNT_STORAGE_READ_ALLOWED\)return'Você'/);
  assert.match(html, /function loadPlayerColor\(\)\{if\(!ACCOUNT_STORAGE_READ_ALLOWED\)return'azul'/);
  assert.match(html, /function loadMapSelection\(\)\{if\(!ACCOUNT_STORAGE_READ_ALLOWED\)return'nave'/);
  assert.match(html, /function loadPlayerCosmetics\(\)\{if\(!ACCOUNT_STORAGE_READ_ALLOWED\)return cloneCosmetics\(DEFAULT_COSMETICS\)/);
  assert.match(html, /function loadKeyBindings\(\)\{if\(!ACCOUNT_STORAGE_READ_ALLOWED\)return \{\.\.\.DEFAULT_KEYS\}/);
  assert.match(html, /function loadGameVolume\(\)\{if\(!ACCOUNT_STORAGE_READ_ALLOWED\)return 1/);
  assert.match(html, /async function accountRestoreSession\(\)[\s\S]*?\/api\/account\/me[\s\S]*?await accountAcceptLogin\(data\)[\s\S]*?accountApplyProfile\(accountGuestProfile\(\)\)/);
});

test('modais de conta no celular não fecham por toque no fundo ou perda de foco', () => {
  assert.doesNotMatch(html, /\$\('accountOverlay'\)\.addEventListener\('pointerdown'/);
  assert.match(html, /\$\('btnAccountClose'\)\.addEventListener\('click',closeAccount\)/);
  assert.match(html, /btnAccountCreateCancel/);
  assert.match(html, /btnAccountLoginCancel/);
  assert.match(html, /btnAccountRedeemCancel/);
});

test('botão de emergência bloqueia toda sabotagem principal e permite apenas portas', () => {
  assert.match(html, /const emergencySabotageBlocked=\(\)=>!!\(G\.sab&&Object\.entries\(G\.sab\)\.some\(\(\[type,value\]\)=>type!=='doors'&&type!=='cd'&&Number\(value\)>0\)\)/);
  assert.match(html, /Portas são a única exceção/);
  assert.match(html, /reason==='emergency'[\s\S]*?emergencySabotageBlocked\(\)/);
  assert.match(html, /command==='emergency'[\s\S]*?!emergencySabotageBlocked\(\)/);
});
