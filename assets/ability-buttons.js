/* Presentation only. Existing buttons retain their handlers, permissions and timers. */
'use strict';
const ABILITY_BUTTONS=(()=>{
 const saved=new WeakMap(),clean=value=>plainRoleName(String(value||'')).trim();
 const definitions={btnKill:['🔪','Matar'],btnSab:['🚨','Sabotar'],btnReport:['📢','Reportar'],btnSheriff:['🔫','Atirar'],btnDelayed:['⏱️','Marcar'],btnCleaner:['🧹','Limpar'],btnParasite:['🦠','Infectar'],btnSpectral:['👻','Sumir'],btnMorph:['🎭',()=>t('morph.button')],btnMiner:['⛏️',()=>t('miner.dig')],btnNinja:['⚔️',()=>roleLabelByFunction('ninja')],btnHunter:['🎯','Definir alvo'],btnParamedic:['⛑️',()=>translateRuntimeText('Reviver')+' ('+Math.max(0,G.player?.paramedicUses||0)+')'],btnSeer:['🔮','Inspecionar'],btnLocator:['🧭','Rastrear'],btnInstructor:['↔️','Trilhar'],btnGuardian:['🪽','Proteger'],btnEngineerVent:['🔧','Dutar'],btnControl:['✋','Controlar'],btnCaptain:['📣',()=>t('captain.call')],btnDouse:['🛢',()=>t('newNeutral.douse')],btnIgnite:['🔥',()=>t('newNeutral.ignite')],btnShift:['🧬',()=>t('newNeutral.shift')],btnGestures:['👋',()=>t('mimic.gestures')],btnPotatoPass:['🥔',()=>t('hp.pass')]};
 function present(button,definition){
  if(button.hidden)return;const last=saved.get(button),same=last&&button.firstElementChild===last.icon&&button.children[1]===last.name&&button.children[2]===last.detail&&button.childElementCount===3;
  let icon=definition[0],base=clean(typeof definition[1]==='function'?definition[1]():translateRuntimeText(definition[1]));
  const hiding=button.classList.contains('hnsHide');if(hiding){icon='🕳';base=t(G.player?.vent?'hns.leave':'hns.hide')}
  let name,detail;
  if(same){name=last.language===USER_PREFS.language?last.name.textContent:translateRuntimeText(last.name.textContent);detail=last.detail.textContent}
  else{
   const parts=[...button.querySelectorAll('small')].map(n=>clean(n.textContent)),text=clean(button.textContent);
   if(parts.length>1){name=parts[0];detail=parts.slice(1).join(' · ')}else{name=text;detail=''}
   if(!name||/^(?:\d+(?:[.,]\d+)?\s*s?|\d+\s*\/\s*\d+|…|∞)$/u.test(name)){detail=name;name=base}
   else{const timed=name.match(/^(.*?)\s*(?:[·•]\s*|\s+)(\d+\s*s)$/u);if(timed){name=timed[1];detail=timed[2]}}
  }
  const signal=button.classList.contains('no-signal');if(signal){icon='📡';name=t('message.noSignalText')}
  if(button.id==='btnParamedic'&&!signal&&/^\d/.test(detail))name=base;
  const key=[USER_PREFS.language,icon,name,detail,hiding,signal].join('|');
  button.classList.add('abilityButton');
  if(same&&last.key===key){last.detail.hidden=!detail;return}
  const emoji=el('span','abilityIcon nativeEmoji'+(button.id==='btnMorph'?' morphIcon':'')+(signal?' signalIcon':''),icon),label=el('small','abilityCaption abilityName',name),status=el('small','abilityDetail'+(hiding?' hnsVentInfo':''),detail);
  emoji.setAttribute('aria-hidden','true');status.hidden=!detail;button.replaceChildren(emoji,label,status);
  button.setAttribute('aria-label',[icon,name,detail].filter(Boolean).join(' · '));saved.set(button,{key,icon:emoji,name:label,detail:status,language:USER_PREFS.language});
 }
 function refresh(){for(const [id,definition]of Object.entries(definitions)){const button=$(id);if(button)present(button,definition)}for(const button of document.querySelectorAll('.judgeVoteBtn'))if(!button.closest('[hidden]'))present(button,['👨‍⚖️',()=>roleLabelByFunction('judge')])}
 const oldButtons=updateButtons;updateButtons=function(){const result=oldButtons();refresh();return result};
 return{refresh};
})();
