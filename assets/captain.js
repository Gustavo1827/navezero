/* Captain uses the existing emergency, ability button and authoritative checkpoint paths. */
'use strict';
const CAPTAIN=(()=>{
 const pending=new Map(),classic=()=>!G.hns&&!G.hp&&(!NET.inRoom||['classic','mimica'].includes(NET.room?.mode));
 const remaining=ch=>Math.max(0,(Number(ch?.captainReadyAt)||0)-(G.gt||0));
 const blocked=()=>sabotageActive();
 function available(ch){return classic()&&CFG.allowMeetings!==0&&!G.over&&!G.M&&['playing','task','tool'].includes(G.state)&&ch?.alive&&ch.role==='crew'&&ch.function==='captain'&&!ch.vent&&!ch.ventAnim&&!ch.controlledBy&&!ch.controlTargetId&&!ch.killDash&&!ch.minerDig&&!ch.morphTransition&&(ch.emUses||0)>0&&remaining(ch)<=0&&!blocked()}
 function meet(ch,id,uses,readyAt){
  if(G.M?.captainCallId===id)return true;
  if(!available(ch))return false;
  ch.emUses=uses;ch.captainReadyAt=readyAt;callMeeting(ch,'emergency',null,true);
  if(!G.M)return false;G.M.captainCallId=id;renderMeetingIntro();return true;
 }
 function request(ch=G.player){
  if(!available(ch)||(pending.get(ch.id)||0)>performance.now())return false;
  if(NET.inRoom){if(ch!==G.player&&!(NET.isHost&&ch.isBot))return false;const ok=netSend({type:'captain_request',actorId:ch.id});if(ok)pending.set(ch.id,performance.now()+1500);return ok}
  return meet(ch,'local_'+ch.id+'_'+G.gt,Math.max(0,ch.emUses-1),G.gt+CFG.captainCooldown);
 }
 const button=el('button','act2 paramedic');button.id='btnCaptain';button.type='button';button.hidden=true;$('btnLocator').before(button);button.addEventListener('click',()=>request());
 const tab=$('btnCaptainSection');tab.addEventListener('click',()=>{G.cfgFunctionTab='captain';setCfgPage('functions');Snd.click()});
 function labels(){tab.textContent='📣 '+roleLabelByFunction('captain');button.setAttribute('aria-label',t('captain.call'))}
 const oldNew=newGame;newGame=function(...args){const result=oldNew(...args);for(const ch of G.chars)if(ch.role==='crew'&&ch.function==='captain')ch.captainReadyAt=CFG.captainCooldown;return result};
 const oldButtons=updateButtons;updateButtons=function(){const r=oldButtons(),p=G.player;if(!p)return r;button.hidden=!(classic()&&G.state==='playing'&&p.alive&&p.role==='crew'&&p.function==='captain');if(button.hidden)return r;
  const cd=remaining(p),signal=(G.sab.comms||0)>0;button.disabled=!available(p)||uiBusy()||(pending.get(p.id)||0)>performance.now();setCls(button,'ready',!button.disabled);setCls(button,'cooldown-label',signal||cd>0);setCls(button,'no-signal',signal);
  if(signal){const label=translateRuntimeText('📡 Sem sinal').replace(/^📡\s*/u,'');if(button.dataset.caption!=='signal:'+label){button.replaceChildren(el('span','signalIcon','📡'),el('small','',label));button.dataset.caption='signal:'+label}}
  else{const label=cd>0?String(Math.ceil(cd)):t('captain.call'),key=USER_PREFS.language+'|'+label;if(button.dataset.caption!==key){if(cd>0)button.textContent=label;else setAbilityCaption(button,'📣',label);button.dataset.caption=key}}
  button.title=roleLabelByFunction('captain')+' · '+t('captain.uses',{count:Math.max(0,p.emUses||0)})+' · '+keyLabel(KEY_BINDINGS.function);return r;
 };
 const oldKey=triggerFunctionKey;triggerFunctionKey=function(){if(G.player?.function==='captain'&&G.player.alive){if(G.state==='playing'&&!uiBusy())request();return}return oldKey()};
 const oldNpc=updateNPC;updateNPC=function(ch,dt){if(ch.function==='captain'&&ch.ai&&available(ch)&&G.gt>=(ch.ai.captainThinkAt||0)){ch.ai.captainThinkAt=G.gt+2;if(wantsEmergency(ch)&&request(ch)){ch.ai.nextEm=G.gt+rand(40,70);ch.moving=false;return}}return oldNpc(ch,dt)};
 const oldCapture=netCaptureSnapshot;netCaptureSnapshot=function(){const s=oldCapture();for(const record of s.chars)record.captainReadyAt=charById(record.id)?.captainReadyAt||0;if(s.meeting)s.meeting.captainCallId=G.M?.captainCallId||null;return s};
 const oldHandle=netHandleMessage;netHandleMessage=function(m){
  if(m.type==='captain_order'){
   if(!NET.inRoom||!NET.isHost||m.round!==NET.round||m.epoch!==(NET.room?.authorityEpoch||0))return;
   const ch=charById(m.actorId);if(ch)pending.delete(ch.id);
   // A migrated checkpoint can already contain the reserved use and cooldown.
   const already=G.M?.captainCallId===m.id,oldUses=ch?.emUses,oldReady=ch?.captainReadyAt;
   if(ch&&!already){ch.emUses=m.uses+1;ch.captainReadyAt=0}
   const ok=already||meet(ch,m.id,m.uses,m.readyAt);
   if(!ok&&ch){ch.emUses=oldUses;ch.captainReadyAt=oldReady}
   if(already)netSyncHostAfterAuthorityChange();else if(!ok)netSend({type:'captain_ack',id:m.id,round:m.round,epoch:m.epoch,success:false});return;
  }
  if(m.type==='captain_state'&&m.round===NET.round){const ch=charById(m.actorId);if(ch){ch.emUses=m.uses;ch.captainReadyAt=m.readyAt;pending.delete(ch.id)}return}
  if(m.type==='captain_rejected'){pending.delete(m.actorId);return}
  if(m.type==='game_start'||m.type==='left'||m.type==='room_expired')pending.clear();return oldHandle(m);
 };
 function cleanReveal(){const fn=G.player?.function,key=ROLE_I18N_KEYS[fn];if(!key)return;const label=t('role.'+key),button=fn==='captain'?$('btnCaptainSection'):$(('btn'+fn+'Section')),first=value=>{const text=String(value||'');if(typeof Intl.Segmenter==='function')return [...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(text)].find(s=>/[\p{Extended_Pictographic}\p{Emoji_Presentation}]/u.test(s.segment))?.segment||'';return text.match(/(?:\p{Extended_Pictographic}|\p{Emoji_Presentation})[\uFE0E\uFE0F]?\p{Emoji_Modifier}?(?:\u200D(?:\p{Extended_Pictographic}|\p{Emoji_Presentation})[\uFE0E\uFE0F]?\p{Emoji_Modifier}?)*/u)?.[0]||''},icon=first(label)||first(button?.textContent)||(typeof NEW_NEUTRALS!=='undefined'?NEW_NEUTRALS.icon(fn):''),node=$('roleMsg'),raw=node.textContent;
  const name=roleLabelByFunction(fn),header=raw.match(/^(.*?)\s+([-—–])\s+([\s\S]*)$/),body=header&&plainRoleName(header[1])===name?header[3]:raw.startsWith(name)&&plainRoleName(raw)===name?'':raw,separator=header&&plainRoleName(header[1])===name?' '+header[2]+' ':' - ';
  node.replaceChildren();if(icon){const span=el('span','nativeEmoji',icon);span.setAttribute('aria-hidden','true');node.append(span,document.createTextNode(' '))}node.append(document.createTextNode(name+(body?separator+body:'')));
 }

 const oldReveal=showLocalRoleReveal;showLocalRoleReveal=function(...args){const r=oldReveal(...args);cleanReveal();return r};
 const oldLanguage=applyGameLanguage;applyGameLanguage=function(){const r=oldLanguage();labels();if(G.state==='role')cleanReveal();return r};
 function drawWhistle(c,ch){const col=COLOR_BY[ch.color]||COLOR_BY.azul;c.save();c.translate(35,-8);c.rotate(-.22);c.strokeStyle='#10122a';c.lineWidth=3;c.fillStyle=col.main;c.beginPath();c.moveTo(-13,-12);c.lineTo(5,-12);c.lineTo(15,-20);c.lineTo(26,-20);c.lineTo(26,-8);c.lineTo(13,-2);c.bezierCurveTo(13,17,-14,20,-18,4);c.quadraticCurveTo(-22,-6,-13,-12);c.closePath();c.fill();c.stroke();c.fillStyle=col.dark||'#334057';c.beginPath();c.arc(-4,2,6,0,Math.PI*2);c.fill();c.stroke();c.strokeStyle='rgba(255,255,255,.65)';c.lineWidth=2;c.beginPath();c.moveTo(12,-12);c.lineTo(22,-16);c.stroke();c.strokeStyle='#10122a';c.beginPath();c.ellipse(-19,7,4,6,.4,0,Math.PI*2);c.stroke();c.restore()}
 labels();return{available,remaining,request,drawWhistle,cleanReveal};
})();
