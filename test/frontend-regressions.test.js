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
  assert.match(html, /const showAll=!G\.player\.alive\|\|\(observerAlive&&!commsDown\)/);
  assert.match(html, /const showChars=!\(observerAlive&&commsDown\)/);
  assert.match(html, /const observerMapLock=!!\(G\.mapOpen&&p\.alive&&p\.role==='crew'&&p\.function==='observer'\)/);
  assert.match(html, /body\.observer-map-lock #stick\{[^}]*transform:translateY\(88px\)[^}]*pointer-events:none/);
  assert.match(html, /document\.body\.classList\.add\('observer-map-lock'\)/);
  assert.match(html, /document\.body\.classList\.remove\('observer-map-lock'\)/);
  assert.match(server, /s\.observer=recipient\.function==='observer'/);
});
test('disparo do Xerife é validado pelo host e respeita alcance, linha de visão e cooldown', () => {
  assert.match(html, /command==='sheriff_shoot'[\s\S]*?activePlay&&!G\.M&&ch\.alive&&ch\.role==='crew'&&ch\.function==='sheriff'[\s\S]*?dist\(ch,target\)<=84&&losClear/);
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
  assert.match(html, /Atrasado — Mate suas vítimas lentamente\./);
  assert.match(html, /Observador - Veja a Tripulação no seu mapa a qualquer momento\./);
});

test('cliente não marca tarefa concluída antes da confirmação autoritativa do host', () => {
  assert.match(html, /O host valida vida, posse, estação e distância antes de confirmar o passo/);
  assert.doesNotMatch(html, /if\(pending&&!q\.done\)z\.done=true/);
  assert.match(html, /stationDist\(station,ch\)>95/);
});

test('dutos de clientes são validados pelo host e a interface acompanha snapshots', () => {
  assert.match(html, /command==='vent_enter'/);
  assert.match(html, /Math\.hypot\(ch\.x-v\.px,ch\.y\+4-v\.py\)<=75/);
  assert.match(html, /command==='vent_move'\)\{if\(activePlay&&ch\.vent\)ventMove\(ch,m\.ventId\)\}/);
  assert.match(html, /if\(G\.player\.vent&&s\.state==='playing'\)/);
});

test('culling desenha camadas visuais por sala sem desativar colisões', () => {
  assert.match(html, /let STATIC=null, MM_STATIC=null, ROOM_STATIC=new Map\(\)/);
  assert.match(html, /if\(a<=\.005\)return;\s*const layer=ROOM_STATIC\.get\(r\.id\)/);
  assert.match(html, /drawRoomStaticLayers\(c,cx,cy,vw,vh,cullViewer\)/);
  assert.match(html, /const floor=new Uint8Array\(COLS\*ROWS\), block=new Uint8Array\(COLS\*ROWS\), walk=new Uint8Array\(COLS\*ROWS\)/);
});


test('Atrasado tem aba vermelha, ativação, duração limitada e marcação autoritativa', () => {
  assert.match(html, /id="btnDelayedSection"[^>]*>🕓 Atrasado/);
  assert.match(html, /id="btnDelayed"/);
  assert.match(html, /delayedEnabled:\[0,1\]/);
  assert.match(html, /delayedDuration:\[5,40\]/);
  assert.match(html, /Tempo para marcar/);
  assert.match(html, /Usa o mesmo cooldown configurado em/);
  assert.match(html, /if\(CFG\.delayedChance>0&&CFG\.delayedMax>0&&Math\.random\(\)\*100<CFG\.delayedChance\)/);
  assert.doesNotMatch(html, /\['delayedEnabled','Ativar função Atrasado'/);
  assert.doesNotMatch(html, /if\(CFG\.delayedEnabled&&CFG\.delayedChance>0/);
  assert.match(html, /function doDelayedMark\(shooter,target\)/);
  assert.match(html, /remaining:CFG\.delayedDuration/);
  assert.match(html, /if\(G\.M\|\|G\.state==='meeting'/);
  assert.match(html, /command==='delayed_mark'[\s\S]*?dist\(ch,target\)<=84&&losClear/);
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
  assert.doesNotMatch(html, /\['delayedEnabled','Ativar função Atrasado'/);
});

test('ícones das funções usam os emojis definidos e Atrasado não recebe eliminação direta', () => {
  assert.match(html, /id="btnSheriff"[^>]*>🔫/);
  assert.match(html, /id="btnDelayed"[^>]*>🕓/);
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

test('revanche usa a mesma sala e é autorizada somente pelo host', () => {
  assert.match(server, /if\(m\.type==='rematch'\)\{[\s\S]*?if\(!isHost\)return error\(ws,'Somente o host pode reiniciar a partida\.'\);[\s\S]*?startGame\(room,true,timings\)/);
  assert.match(server, /broadcast\(room,\{type:'game_start',room:roomPublic\(room\),round:room\.round,rematch\}/);
  assert.match(html, /NET\.room\?\.code===m\.room\?\.code/);
});

test('falas novas dos bots são condicionadas a corpo, tarefa ou evidência', () => {
  assert.match(html, /if\(M\.body&&Math\.random\(\)<\.12\)return \{from:ch,text:pickLine\(\['Onde foi o corpo\?'\]\)/);
  assert.match(html, /Estava fazendo \$\{recentTask\}/);
  assert.match(html, /Não vi \$\{unseenTarget\.name\}/);
  assert.match(html, /Alguém viu \$\{unseenTarget\.name\}/);
  assert.match(html, /\$\{suspect\.name\} é suspeito\./);
});


test('após a reunião, todos os cooldowns de habilidades voltam à recarga completa', () => {
  assert.match(html, /G\.meetCd=CFG\.meet; G\.killCd=CFG\.kill; G\.sheriffCd=CFG\.sheriffCooldown; G\.delayedCd=CFG\.kill; G\.cleanerCd=CFG\.cleanerCooldown/);
  assert.match(html, /G\.sab\.cd=CFG\.sab/);
  assert.match(html, /c\.netKillCd=CFG\.kill;c\.netSheriffCd=CFG\.sheriffCooldown;c\.netDelayedCd=CFG\.kill;if\(c\.function==='cleaner'\)c\.cleanCd=CFG\.cleanerCooldown;c\.netTrackTarget=null;c\.netTrackTime=0;c\.netTrackCd=CFG\.locCooldown;c\.ventCd=VENT_CD/);
  assert.match(html, /c\.engVentCd=CFG\.engCooldown/);
});

test('NPCs consideram causas ligadas a funções especiais ao discutir um corpo', () => {
  assert.match(html, /cause==='delayed'[\s\S]*?causada por um Atrasado/);
  assert.match(html, /cause==='sheriff_misfire'[\s\S]*?Xerife tenha errado o disparo/);
  assert.match(html, /um Infiltrado, um Atrasado ou até um disparo de Xerife/);
});

test('Faxineiro tem configuração, atribuição, limpeza autoritativa e memória dos NPCs', () => {
  for (const key of ['cleanerChance','cleanerMax','cleanerCooldown','cleanerUses']) {
    assert.match(html, new RegExp("'"+key+"'"));
    assert.match(server, new RegExp(key+':\\['));
  }
  assert.match(html, /cleanerCooldown:\[10,60\]/);
  assert.match(html, /cleanerUses:\[1,15\]/);
  assert.match(html, /id="btnCleanerSection"[^>]*>🧹 Faxineiro/);
  assert.match(html, /id="btnCleaner"[^>]*>🧹/);
  assert.match(html, /Faxineiro - Limpe corpos e suma com as evidências\./);
  assert.match(html, /const cleanerEnabled|CFG\.cleanerChance>0&&CFG\.cleanerMax>0/);
  assert.match(html, /function cleanBody\(cleaner,body\)[\s\S]*?G\.bodies=G\.bodies\.filter\(b=>b!==body\)/);
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
  assert.match(html, /Pelo mapa de Observador, vi \$\{seen\.name\}/);
});

test('Engenheiro tem configuração, atribuição e sincronização multiplayer', () => {
  for (const key of ['engVentDuration','engChance','engMax','engCooldown']) {
    assert.match(html, new RegExp("'"+key+"'"));
    assert.match(server, new RegExp(key+':\\['));
  }
  assert.match(html, /engVentDuration:\[10,61\]/);
  assert.match(html, /engCooldown:\[5,25\]/);
  assert.match(html, /id="btnEngineerSection"[^>]*>🔧 Engenheiro/);
  assert.match(html, /Engenheiro - Pode usar os sustos/);
  assert.match(html, /function noteEngineerVentSeen\(ch,v,act\)[\s\S]*?addSusp\(o,ch\.id,-1\.2,'clear'/);
  assert.match(html, /ai\.engineerSaw&&G\.gt-ai\.engineerSaw\.gt<45/);
  assert.match(html, /\(ai\.vents\|\|\[\]\)\.some\(v=>v\.id===t\.id&&!v\.engineer\)/);
});

test('NPCs usam falas contextuais e jogadores mortos veem funções sem revelar aos vivos', () => {
  assert.match(html, /Onde que mataram \${M\.body\.name}\?/);
  assert.match(html, /Encontrei o corpo de \${M\.body\.name} em \${M\.body\.room}!/);
  for (const phrase of ['Sim.','Não.','Concordo.','Discordo.','Isso é verdade.','Mentira!','Eu vi!','Não vi','Faltam poucas tarefas, vamos!','Vamos fazer tarefas para vencer!','Mortos, façam as suas tarefas!','Cuidado! Vamos resolver ']) {
    assert.ok(html.includes(phrase), 'fala contextual ausente: '+phrase);
  }
  assert.match(html, /\(\(!G\.player\?\.alive\|\|G\.role==='imp'\)&&ch\.role==='imp'\?'#ff6b7e'/);
  assert.match(html, /if\(!G\.player\.alive\)\{const fl=\{sheriff:'Xerife'.*const roleLine=el\('small','pfunction',fl\+' — '\+ch\.name\)/s);
  assert.match(html, /if\(!G\.player\.alive&&ch\.role==='imp'\)pn\.style\.color='#ff6b7e'/);
  assert.match(html, /if\(ai\.ventSaw&&G\.gt-ai\.ventSaw\.gt<45/);
  assert.match(html, /\.pc\.dead\{filter:none;border-color/);
  assert.match(html, /\.pc\.dead canvas\{filter:grayscale\(1\);opacity:/);
  assert.match(html, /lastSab&&G\.sab\[lastSab\.type\]>0/);
});

test('cosméticos têm catálogo, categorias, renderização centralizada e sincronização no snapshot', () => {
  assert.match(html, /id="btnCosmetics"[^>]*>Cosméticos</);
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
  assert.match(html, /id="btnFreePlay"[^>]*>Partida Livre<\/button><button class="chip" id="btnCosmetics"[^>]*>Cosméticos<\/button>/, 'Cosméticos deve usar o mesmo estilo compacto de Partida Livre no menu');
  assert.doesNotMatch(html, /roomActions[^\n]*id="btnCosmetics"/, 'o botão não deve permanecer na janela do lobby');
  assert.match(html, /function openCosmetics\(\)\{if\(NET\.inRoom\)\{toast\('A aparência é escolhida na tela inicial/, 'catálogo deve ser aberto antes de entrar na sala');
  assert.match(html, /id="lobbyColorSwatches"/, 'catálogo deve manter o seletor de cor');
  assert.match(html, /netSend\(\{type:'set_color',color:color\.id\}\)/, 'a proteção de cor única continua disponível para estado de lobby sincronizado');
  assert.match(html, /filter\(p=>p\.id!==NET\.id\)\.map\(p=>p\.color\)/, 'cores usadas por outros jogadores continuam detectadas');
  assert.match(html, /\{id:'banana',name:'Banana',main:'#fff2a8',dark:'#d9be58'\}/, 'banana deve usar uma tonalidade mais clara');
});

test('pets somem em dutos, ficam tristes no corpo e persistem depois de reuniões', () => {
  assert.match(html, /pet==='none'\|\|ch\.alive===false\|\|ch\.ghost\|\|ch\.vent\|\|\(ch\.ventAnim&&ch\.ventAnim\.kind==='in'\)/, 'seguidor deve ser suspenso ao morrer ou entrar no duto');
  assert.match(html, /worldPetVisible=ch\.alive!==false&&!ch\.ghost&&!ch\.vent/, 'pet não deve ser desenhado acompanhando morto ou jogador dentro do duto');
  assert.match(html, /function parkPetAtBody\(body,ch\)/);
  assert.match(html, /drawPetShape\(c,p\.pet,p\.x,p\.y,p\.phase\|\|0,\{sad:true\}\)/, 'pet estacionado deve usar estado triste');
  assert.match(html, /addBodyWithPet\(body,v\)/, 'morte comum deve estacionar o pet junto do corpo');
  assert.match(html, /const deadPets=\(G\.deadPets\|\|\[\]\)\.map/, 'pets deixados no mapa precisam viajar no snapshot multiplayer');
  assert.match(html, /G\.deadPets=Array\.isArray\(s\.deadPets\)\?s\.deadPets\.map/, 'clientes precisam restaurar pets persistentes do snapshot');
  const endMeeting=html.slice(html.indexOf('function endMeeting(){'),html.indexOf('function appendMeetingMsgVisual'));
  assert.doesNotMatch(endMeeting,/deadPets\s*=\s*\[\]/, 'fim da reunião não pode apagar os pets que ficaram no mapa');
});


test('Faxineiro é exclusivamente Infiltrado, usa identidade vermelha e respeita limite de Infiltrados', () => {
  assert.match(html, /\.act2\.delayed,\.act2\.cleaner,\.delayed-tab,\.cleaner-tab/);
  assert.match(html, /class="big alt cleaner-tab" id="btnCleanerSection"/);
  assert.match(html, /if\(key==='cleanerMax'\)return \[0,Math\.max\(0,Math\.min\(CFG\.impostors,CFG_LIM\.cleanerMax\[1\]\)\)\]/);
  assert.match(html, /if\(k==='impostors'&&CFG\.cleanerMax>CFG\.impostors\)\{CFG\.cleanerMax=CFG\.impostors/);
  assert.match(html, /cleanerEligible=shuffle\(\[\.\.\.G\.imps\]\.filter\(ch=>ch\.role==='imp'&&!ch\.function\)\)/);
  assert.match(html, /cleanerLimit=Math\.min\(clamp\(CFG\.cleanerMax,0,CFG\.impostors\),G\.imps\.length,cleanerEligible\.length\)/);
  assert.match(html, /const crewFns=\['locator','sheriff','observer','engineer'\], impFns=\['delayed','cleaner','marionette'\]/);
  assert.match(html, /cleaner=G\.role==='imp'&&p\.function==='cleaner'/);
  assert.match(server, /out\.cleanerMax=Math\.min\(out\.cleanerMax,out\.impostors\)/);
});

test('Parasita é função de Infiltrado com infecção adiada até o fim da reunião', () => {
  assert.match(html, /class="act2 parasite" id="btnParasite"[\s\S]*?🦠<small>Infectar<\/small>/);
  assert.match(html, /class="big alt parasite-tab" id="btnParasiteSection"[\s\S]*?🦠 Parasita/);
  assert.match(html, /parasiteChance:\[0,100\]/);
  assert.match(html, /parasiteMax:\[0,3\]/);
  assert.match(html, /parasiteEligible=shuffle\(\[\.\.\.G\.imps\]\.filter\(ch=>ch\.role==='imp'&&!ch\.function\)\)/);
  assert.match(html, /function infectTarget\(parasite,target\)[\s\S]*?G\.parasiteInfections\[target\.id\][\s\S]*?parasite\.parasiteReady=false/);
  assert.match(html, /function resolveParasiteInfections\(\)[\s\S]*?t&&t\.alive&&t\.role==='crew'\)convertToImpostor\(t\)[\s\S]*?parasiteReady=true/);
  assert.match(html, /if\(ej\)killChar\(ej\);\s*resolveParasiteInfections\(\);\s*G\.bodies=\[\]/);
  assert.match(html, /target\.role='imp';target\.function=null/);
  assert.match(html, /G\.tasks\.filter\(t=>t\.owner===target\.id\)\.forEach\(t=>t\.fake=true\)/);
  assert.match(html, /parasiteBotThink\(ch,dt\)/);
  assert.match(html, /action:'parasite_infect'/);
  assert.match(server, /'parasite_infect'/);
});

test('Instrutor é secreto até a morte, cria trilhas privadas e respeita Comunicações', () => {
  assert.match(html, /class="act2 instructor" id="btnInstructor"[\s\S]*?↔️<small>Trilhar<\/small>/);
  assert.match(html, /instructorChance:\[0,100\]/);
  assert.match(html, /instructorMax:\[0,15\]/);
  assert.match(html, /instructorCooldown:\[20,60\]/);
  assert.match(html, /instructorDuration:\[5,15\]/);
  assert.match(html, /function maybeActivateInstructor\(ch\)[\s\S]*?ch\.alive[\s\S]*?ch\.role!=='crew'[\s\S]*?ch\.instructor=true/);
  assert.match(html, /function killChar\(c\)[\s\S]*?maybeActivateInstructor\(c\)/);
  assert.match(html, /function createInstructorTrail\(owner,target,x,y\)[\s\S]*?targetId:target\.id[\s\S]*?CFG\.instructorDuration/);
  assert.match(html, /if\(type==='comms'\)\{G\.instructorTrails\.length=0/);
  assert.match(html, /function instructorNpcThink\(ch,dt\)/);
  assert.match(html, /action:'instructor_mark'/);
  assert.match(server, /'instructor_mark'/);
  assert.match(server, /s\.instructorTrails=\(s\.instructorTrails\|\|\[\]\)\.filter\(t=>String\(t\.targetId\)===String\(recipientId\)\)/);
  assert.match(server, /recipient\?\.instructor[\s\S]*?c\.alive&&c\.role==='crew'\)c\.function=null/);
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
