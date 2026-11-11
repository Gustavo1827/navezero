/* Seven categories reuse the existing message transport and contextual selectors. */
'use strict';
const QUICK_CHAT=(()=>{
 const categories=[['accuse','👉'],['defend','🛡'],['location','📍'],['tasks','📋'],['question','🤔'],['role','⚒️'],['other','❗️']];
 const ids={accuse:['suspicion','accuse','bodyNear','sawKill','sawVent','suspectTarget','roomChange','lie','voteTarget','expelTargetBang','expelTargetAsk','killDoubt','protectedFrom'],defend:['alibiTarget','defend','tasks','roleCrew','noProof','notSuspect','protectedGeneric'],location:['targetRoom','roomSight','askRoom','roomTask','roomCheck','sabotageRoom','roomBody','whoPassedRoom','foundBodyExact','trailRoom','trailPlayer','playerOnly','where','follow'],tasks:['fakeTask','taskCheck','tasksDone'],question:['bodyWhere','ventAsk','voteWho','deadHelp','whyMeeting'],role:['roleDeny','roleSelf','roleSight','roleGuessPlayer','locatorAsk','sawRoleUse','roleUsedSelf','roleUsedTarget'],other:['caution','skip','yes','no','truth','good','praiseTarget','voteCareful','lossWarning','meetingBecause']};
 const additions=[
  ['thinkWas','accuse','accuse','target'],['actingSuspicious','accuse','suspicion','target'],['voteNow','accuse','accuse','target'],
  ['notMe','defend','self'],['innocent','defend','self'],['canConfirm','defend','defend','target'],['noProofAgainst','defend','caution','target'],['proveInnocence','defend','self'],
  ['wasIn','location','alibi','room'],['bodyIn','location','bodyReport','room'],['followMe','location','ask'],
  ['tasksNow','tasks','alibi'],['tasksLeft','tasks','other'],['visibleTask','tasks','other'],['whoTasks','tasks','ask'],['finishTasks','tasks','caution'],
  ['whoWas','question','ask'],['whereShort','question','ask'],['whyShort','question','ask'],['sawAnyone','question','ask'],['anyEvidence','question','ask'],
  ['askRole','role','ask'],['thinkRole','role','suspicion','target','roleChoice'],['hasRole','role','ask','roleChoice'],['usedAbility','role','roleUseSelf'],['proveByRole','role','self'],['classCaution','role','suspicion','target','classChoice'],
  ['agree','other','confirm'],['disagree','other','deny'],['dontKnow','other','caution'],['careful','other','caution'],['fewKills','other','caution'],['actFast','other','caution'],['notEnoughInfo','other','caution']
 ];
 for(const[id,category,kind,...fields]of additions)if(!PRESET_PHRASES.some(p=>p.id===id))PRESET_PHRASES.push({id,category,kind,key:'quick.msg.'+id,...Object.fromEntries(fields.map(k=>[k,true]))});
 const suspect=PRESET_PHRASES.find(p=>p.id==='suspectTarget');suspect.key='quick.msg.suspectTarget';suspect.kind='accuse';
 const slots=()=>({name:t('quick.slot.player'),room:t('quick.slot.room'),role:t('quick.slot.role'),class:t('quick.slot.class')});
 const label=p=>{const text=p.key?t(p.key,slots()):translateRuntimeText(p.label);return text.replace(/\[(?:jogador\/alguém|player\/someone)\]/gi,t('quick.slot.someone')).replace(/\[(?:jogador|player|jugador|игрок)\]/gi,t('quick.slot.player')).replace(/\[(?:morto|dead player|dead|muerto)\]/gi,t('quick.slot.dead')).replace(/\[(?:sala|local|room|place)\]/gi,t('quick.slot.room')).replace(/\[(?:função|función|role)\]/gi,t('quick.slot.role'))};
 const category=p=>p.category||categories.find(([id])=>ids[id].includes(p.id))?.[0]||(p.roleChoice||p.classChoice?'role':p.room?'location':'other');
 let chosen='accuse',meeting=null;
 renderQuickPhrases=function(){const box=$('sayChips');box.replaceChildren();if(!G.M||!G.player?.alive||!meetingChatReadable()||NET.inRoom&&NET.room?.mode==='mimica'||typeof MIMIC!=='undefined'&&MIMIC.active())return;if(meeting!==G.M){meeting=G.M;chosen='accuse'}
  const tabs=el('div','quickCategories');tabs.setAttribute('role','group');tabs.setAttribute('aria-label',t('quick.categories'));
  for(const[id,icon]of categories){const b=el('button','chip');b.append(el('span','nativeEmoji',icon),document.createTextNode(' '),el('span','',t('quick.'+id)));b.type='button';b.dataset.category=id;b.setAttribute('aria-pressed',String(chosen===id));b.addEventListener('click',()=>{chosen=id;renderQuickPhrases()});tabs.append(b)}box.append(tabs);
  for(const p of PRESET_PHRASES.filter(p=>!p.hiddenMain&&category(p)===chosen)){const b=el('button','chip phrase'+(p.target?' target':''),label(p));b.type='button';b.dataset.phraseId=p.id;b.addEventListener('click',()=>choosePresetPhrase(p.id));box.append(b)}
 };

 function send(def,target,room,selection){if(!G.M||!G.player?.alive||!meetingChatReadable()||NET.room?.mode==='mimica')return false;if(def.target&&(!target||!target.alive||target.id===G.player.id))return false;if(def.room&&(!room||!ROOM_DEFS.some(r=>r.name===room)))return false;if(def.roleChoice&&!Object.hasOwn(ROLE_I18N_KEYS,selection)&&!['crew','imp'].includes(selection))return false;if(def.classChoice&&!['crew','imp','neutral'].includes(selection))return false;
  const role=selection==='crew'?t('role.teamCrew'):selection==='imp'?t('role.teamImp'):roleLabelByFunction(selection),text=t(def.classChoice?'quick.classWarning.'+selection:def.key,{name:target?.name||'',room:room?translateKnownText(room):'',role}),claim={from:G.player.id,kind:def.kind||'other',target:target?.id||null,room:room||undefined,role:def.roleChoice||def.classChoice?selection:undefined,time:G.M.gt0,strong:false};
  if(sendSay(text,claim)){renderQuickPhrases();return true}return false;
 }
 // New messages remain available to existing callers that consume phrase labels.
 function refreshLabels(){for(const p of PRESET_PHRASES)if(p.key)p.label=label(p)}
 const oldLanguage=applyGameLanguage;applyGameLanguage=function(...a){const r=oldLanguage(...a);refreshLabels();if(G.M&&meetingChatReadable())renderQuickPhrases();return r};refreshLabels();
 return{categories,category,label,send};
})();
