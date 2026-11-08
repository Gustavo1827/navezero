/* One physical-access gate for keyboard, touch, direct UI and authoritative commands. */
'use strict';
(()=>{
 let viewing=null;const remember=s=>{if(s&&['task','tool'].includes(G.state)&&!$('modal').hidden)viewing=s};
 const target=a=>a?.station||(a?.type==='emergency'?TABLE:a?.type==='freecomputer'?FREEPLAY_COMPUTER:a?.step?.st?stationById[a.step.st]:a?.vent?{x:a.vent.x,y:a.vent.y,w:1,h:1}:null);
 const oldAction=actionFor;actionFor=function(s){if(!canAccessStation(G.player,s))return null;return oldAction(s)};
 const oldInteract=doInteract;doInteract=function(a){const s=target(a);if(s&&!canAccessStation(G.player,s))return;return oldInteract(a)};
 const oldTask=openTask;openTask=function(a){const s=target(a);if(s&&!canAccessStation(G.player,s))return;const r=oldTask(a);remember(s);return r};
 const oldFinish=finishStep;finishStep=function(tok){const s=stationById[G.mini?.step?.st];if(s&&!canAccessStation(G.player,s)){closeModal();return}return oldFinish(tok)};
 const oldMeeting=callMeeting;callMeeting=function(ch,reason,body,force=false){if(!force&&((reason==='emergency'&&!canAccessStation(ch,TABLE))||(reason==='body'&&body&&!interactionRayClear(ch.x,ch.y+4,body.x,body.y+4))))return false;return oldMeeting(ch,reason,body,force)};
 const oldTool=openTool;openTool=function(a){const s=target(a)||stationById[a?.tool];if(s&&!canAccessStation(G.player,s))return;const r=oldTool(a);remember(s);return r};
 const oldComputer=openFreePlayComputer;openFreePlayComputer=function(...a){if(!canAccessStation(G.player,FREEPLAY_COMPUTER))return;const r=oldComputer(...a);remember(FREEPLAY_COMPUTER);return r};
 const oldEmergency=pressEmergency;pressEmergency=function(...a){if(!canAccessStation(G.player,TABLE))return;return oldEmergency(...a)};
 const oldVent=enterVent;enterVent=function(ch,v){if(!v||!canAccessStation(ch,{x:v.x,y:v.y,w:1,h:1}))return false;return oldVent(ch,v)};
 const oldHide=HNS.hide;HNS.hide=function(ch,v){if(!v||!canAccessStation(ch,{x:v.x,y:v.y,w:1,h:1}))return false;return oldHide(ch,v)};
 const oldDecon=useDeconButton;useDeconButton=function(ch,st){if(!canAccessStation(ch,st))return false;return oldDecon(ch,st)};
 const oldUpdate=update;update=function(dt){const open=['task','tool'].includes(G.state)&&!$('modal').hidden;if(viewing&&open&&!canAccessStation(G.player,viewing))closeModal();const r=oldUpdate(dt);if(!['task','tool'].includes(G.state)||$('modal').hidden)viewing=null;return r};
 const oldHost=netHostCommand;netHostCommand=function(m){const ch=charById(m.playerId),cmd=m.command||m.action;let s=null;if(cmd==='task_complete')s=stationById[m.fix?FIX[m.fix]?.st:m.stepId];else if(cmd==='decon_button')s=stationById[m.stationId];else if(cmd==='emergency')s=TABLE;else if(cmd==='vent_enter'){const v=ventById[m.ventId];if(v)s={x:v.x,y:v.y,w:1,h:1}}if(s&&!canAccessStation(ch,s))return;return oldHost(m)};
})();
