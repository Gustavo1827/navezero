/* Mobile-only UI sizing; the game canvas, world coordinates and camera are untouched. */
'use strict';
const INTERFACE_SCALE=(()=>{
 let frame=0,lastLayoutKey='';const row=$('uiSizeRow'),input=$('uiSizeIn');
 const managed=[['actions',['max-width']],['tasksPanel',['max-height']],['topRight',['max-height','overflow-y']]];
 function clearLayout(){for(const [id,props] of managed)for(const prop of props)$(id)?.style.removeProperty(prop)}
 function fit(){frame=0;if(!document.body.dataset.uiScale)return;clearLayout();const scale=interfaceScale(),stick=$('stick'),actions=$('actions'),tasks=$('tasksPanel'),top=$('topRight');
  if(!G.player||$('hud').hidden)return;const sr=stick.getBoundingClientRect(),ar=actions.getBoundingClientRect();
  if(sr.width>0){const available=Math.max(70,innerWidth-sr.right-(innerWidth-ar.right)-12);actions.style.maxWidth=(available/scale)+'px'}
  const controls=actions.getBoundingClientRect(),limit=Math.min(controls.top,sr.width?sr.top:innerHeight)-14;
  tasks.style.maxHeight=(Math.max(70,Math.min(innerHeight*.46,limit-tasks.getBoundingClientRect().top))/scale)+'px';
  top.style.maxHeight=(Math.max(70,controls.top-top.getBoundingClientRect().top-14)/scale)+'px';top.style.overflowY='auto';

 }
 function schedule(){if(!frame)frame=requestAnimationFrame(fit)}
 function apply(){const mobile=mobileOrientationDevice(),value=normalizeInterfaceSize(USER_PREFS.uiSize);row.hidden=!mobile;input.value=value;$('uiSizeValue').textContent=value+'%';$('uiSizeLabel').textContent=t('settings.uiSize');$('uiSizeHelp').textContent=t('settings.uiSizeHelp');input.setAttribute('aria-label',t('settings.uiSize'));
  lastLayoutKey='';clearLayout();if(mobile&&value!==50){const scale=value<50?1-(50-value)*.005:1+(value-50)*.006;document.body.dataset.uiScale=String(scale);document.body.style.setProperty('--ui-scale',scale);schedule()}else{delete document.body.dataset.uiScale;document.body.style.removeProperty('--ui-scale')}
 }
 input.addEventListener('input',()=>{USER_PREFS.uiSize=normalizeInterfaceSize(input.value);saveUserPrefs();resetStick();apply();requestAnimationFrame(()=>input.scrollIntoView({block:'nearest'}))});
 const oldSync=syncGameSettingsUI;syncGameSettingsUI=function(){const r=oldSync();apply();return r};
 const oldOrientation=syncOrientationUI;syncOrientationUI=function(){const r=oldOrientation();apply();return r};
 const oldLanguage=applyGameLanguage;applyGameLanguage=function(){const r=oldLanguage();apply();return r};
 const oldButtons=updateButtons;updateButtons=function(){const r=oldButtons();if(document.body.dataset.uiScale){const key=[innerWidth,innerHeight,G.state,G.hns?.phase,G.player?.function,G.player?.alive,...[...$('actions').querySelectorAll('button')].filter(b=>!b.hidden).map(b=>b.id)].join('|');if(key!==lastLayoutKey){lastLayoutKey=key;schedule()}}return r};
 apply();return{apply};
})();
