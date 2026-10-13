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
  assert.match(server, /cleanSettings\(\{\.\.\.room\.settings,\.\.\.\(m\.settings&&typeof m\.settings==='object'\?m\.settings:\{\}\)\}\)/);
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

test('disparo do Xerife é validado pelo host e respeita alcance, linha de visão e cooldown', () => {
  assert.match(html, /command==='sheriff_shoot'[\s\S]*?activePlay&&!G\.M&&ch\.alive&&ch\.role==='crew'&&ch\.function==='sheriff'[\s\S]*?dist\(ch,target\)<=84&&losClear/);
  assert.match(server, /'sheriff_shoot'/);
  assert.match(html, /function doSheriffShot\(shooter,target\)[\s\S]*?target\.role==='imp'[\s\S]*?killChar\(target\);addSheriffBody\(target,shooter\.id,'sheriff_hit'\)/);
  const shotBody=html.slice(html.indexOf('function doSheriffShot(shooter,target)'),html.indexOf('function playerSheriffShot()'));
  assert.doesNotMatch(shotBody.slice(shotBody.indexOf("if(target.role==='imp')"),shotBody.indexOf('}else{')), /killChar\(shooter\)/, 'o Xerife sobrevive ao acertar um Infiltrado');
  assert.match(shotBody, /killChar\(shooter\);addSheriffBody\(shooter,shooter\.id,'sheriff_misfire'\)/, 'ao errar, somente o Xerife morre');
  assert.match(html, /if\(shooter===G\.player\)G\.sheriffCd=CFG\.sheriffCooldown;else shooter\.netSheriffCd=CFG\.sheriffCooldown/);
});


test('frases prontas permitem alegar ou suspeitar das quatro funções', () => {
  for (const id of ['roleDeny','roleSelf','roleSight','roleGuessPlayer']) assert.match(html, new RegExp("id:'"+id+"'"));
  for (const role of ['Tripulante','Infiltrado','Xerife','Localizador']) assert.match(html, new RegExp(role));
  assert.match(html, /function renderPhraseRoles\(phraseId,targetId=null\)/);
  assert.match(html, /Vi alguém com a função de \$\{role\}/);
});

test('descrições das funções e classes usam exatamente os textos solicitados', () => {
  assert.match(html, /Localizador — Rastreie um Tripulante com seu mapa\./);
  assert.match(html, /Xerife — Elimine o Infiltrado\. Se você errar, será eliminado\./);
  assert.match(html, /Mate a tripulação e sabote a nave\./);
  assert.match(html, /Faça suas tarefas e encontre o Infiltrado\./);
  assert.match(html, /Atrasado — Mate suas vítimas lentamente\./);
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
  assert.match(html, /id="btnDelayedSection"[^>]*>◷ Atrasado/);
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

test('ícone do Xerife é uma arma e Atrasado não recebe eliminação direta', () => {
  assert.match(html, /id="btnSheriff"[\s\S]*?sheriffGunIcon[\s\S]*?<path d="M2 4H21L24 7H34V12H24L21 17H14V23H8V15H3Z"/);
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
  assert.match(html, /G\.meetCd=CFG\.meet; G\.killCd=CFG\.kill; G\.sheriffCd=CFG\.sheriffCooldown; G\.delayedCd=CFG\.kill/);
  assert.match(html, /G\.sab\.cd=CFG\.sab/);
  assert.match(html, /c\.netKillCd=CFG\.kill;c\.netSheriffCd=CFG\.sheriffCooldown;c\.netDelayedCd=CFG\.kill;c\.netTrackTarget=null;c\.netTrackTime=0;c\.netTrackCd=CFG\.locCooldown;c\.ventCd=VENT_CD/);
});

test('NPCs consideram causas ligadas a funções especiais ao discutir um corpo', () => {
  assert.match(html, /cause==='delayed'[\s\S]*?causada por um Atrasado/);
  assert.match(html, /cause==='sheriff_misfire'[\s\S]*?Xerife tenha errado o disparo/);
  assert.match(html, /um Infiltrado, um Atrasado ou até um disparo de Xerife/);
});
