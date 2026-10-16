'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const server=fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8');

test('início de reunião online usa evento prioritário com snapshot autoritativo',()=>{
  assert.match(server,/meetingStarted=!wasMeeting&&isMeeting&&m\.snapshot\.meeting/);
  assert.match(server,/type:'meeting_start',snapshot:personalizeSnapshot\(m\.snapshot,p\.id\)/);
  assert.match(html,/m\.type==='meeting_start'.*netApplySnapshot\(m\.snapshot,true\)/s);
  assert.match(html,/callMeeting\(caller,sm\.reason,body,true\)/);
});

test('host publica o estado da reunião imediatamente ao convocá-la',()=>{
  assert.match(html,/queueMicrotask\(\(\)=>netSyncHostAfterAuthorityChange\(\)\)/);
});

test('botão Modo Tarefas foi removido e punições do lobby geram mensagem sincronizada',()=>{
  assert.doesNotMatch(html,/id="btnGhost"|Modo: Tarefas/);
  assert.match(server,/broadcastSystemNotice\(room,`\$\{hostPlayer\?\.name\|\|'Host'\} \$\{action==='ban'\?'baniu':'expulsou'\} \$\{targetPlayer\?\.name\|\|'jogador'\}`\)/);
  assert.match(html,/m\.type==='system_notice'/);
});
