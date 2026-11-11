/* Data-driven help. Adding a category does not modify either mode's rules. */
'use strict';
const HOW_TO_PLAY=(()=>{
 const dataUrl='assets/how-to-play-i18n.json?v=fdc9c227af5c85a4';
 let catalog=null,pending=null,category='classic',previousFocus=null;
 const button=el('button','chip');button.type='button';button.id='btnHowToPlay';$('btnFreePlay').parentElement.append(button);
 const overlay=el('div');overlay.id='howToPlay';overlay.hidden=true;overlay.setAttribute('data-i18n-skip','');
 overlay.innerHTML='<div class="card guideCard" role="dialog" aria-modal="true" aria-labelledby="guideTitle"><header class="guideHeader"><h2 id="guideTitle"></h2><button class="chip" id="guideClose" type="button"></button></header><p id="guideStatus" class="guideStatus" role="status"></p><nav id="guideTabs" class="guideTabs"></nav><article id="guideArticle" class="guideArticle" tabindex="0" aria-labelledby="guideArticleTitle"></article></div>';
 document.body.append(overlay);
 function label(key){const value=t('guide.'+key);if(value!=='guide.'+key)return value;return {title:'Como jogar',close:'Fechar',loading:'Carregando instruções…',error:'Não foi possível carregar as instruções.'}[key]}
 function strings(){return catalog?.strings[USER_PREFS.language]||catalog?.strings['pt-BR']}
 function render(){
  button.textContent=label('title');$('guideTitle').textContent=label('title');$('guideClose').textContent=label('close');$('guideTabs').setAttribute('aria-label',label('title'));
  if(overlay.hidden)return;
  if(!catalog){$('guideStatus').textContent=label(pending?'loading':'error');return}
  $('guideStatus').textContent='';const data=strings(),tabs=$('guideTabs');
  if(!catalog.categories.includes(category))category=catalog.categories[0];
  for(const id of catalog.categories){let b=tabs.querySelector('[data-guide-category="'+id+'"]');if(!b){b=el('button','chip');b.type='button';b.dataset.guideCategory=id;b.setAttribute('aria-controls','guideArticle');b.addEventListener('click',()=>{category=id;renderArticle();updateTabs();Snd.click()});tabs.append(b)}b.textContent=data[id].label||data[id].title;b.setAttribute('aria-pressed',String(category===id))}
  renderArticle();
 }
 function updateTabs(){for(const b of $('guideTabs').children)b.setAttribute('aria-pressed',String(b.dataset.guideCategory===category))}
 function renderArticle(){
  const data=strings()?.[category];if(!data)return;const article=$('guideArticle');article.replaceChildren();const h=el('h3','',data.title);h.id='guideArticleTitle';article.append(h);
  for(const paragraph of data.paragraphs)article.append(el('p','',paragraph));
  if(category==='maps'){const gallery=el('div','guideMaps');for(const map of Object.values(MAP_LIBRARY)){const figure=el('figure'),img=document.createElement('img');img.src=map.icon;img.alt=translateRuntimeText(map.name);img.loading='lazy';img.style.cssText='width:100%;height:auto;max-height:180px;object-fit:contain';figure.append(img,el('figcaption','',translateRuntimeText(map.name)+' — '+translateRuntimeText(map.subtitle)));gallery.append(figure)}article.append(gallery)}
  if(category==='roles'){
   for(const [team,ids] of [['crew',['captain','locator','sheriff','observer','engineer','paramedic','seer','noisy','judge','lazy','instructor','guardian']],['neutral',['jester','worker','pyromancer','child','shifter']],['imp',['delayed','cleaner','parasite','spectral','marionette','hunter','metamorph','miner','ninja']]]){
    article.append(el('h3','',t(team==='neutral'?'neutral.category':team==='crew'?'role.teamCrew':'role.teamImp')));const list=el('ul','guideRoles');for(const id of ids){const key='settings.roleDetails.'+id;const text=hasI18nKey(key)?t(key):roleLabelByFunction(id);const item=el('li','',text);item.dataset.guideRole=id;list.append(item)}article.append(list);
   }
  }
  if(category==='controls'){const list=el('dl','guideKeys');for(const [id,name] of KEY_ACTIONS){const r=el('div');r.append(el('dt','',translateRuntimeText(name)),el('dd','',translateRuntimeText(keyLabel(KEY_BINDINGS[id]))));list.append(r)}article.append(list)}
 }
 async function load(){
  if(catalog)return catalog;if(pending)return pending;
  pending=fetch(dataUrl,{cache:'no-store'}).then(async response=>{if(!response.ok)throw Error('Guide HTTP '+response.status);const data=await response.json();if(!Array.isArray(data.categories)||!data.strings)throw Error('Invalid guide catalog');catalog=data;return catalog}).catch(error=>{console.error('Como jogar:',error);return null}).finally(()=>{pending=null;render()});return pending;
 }
 async function open(){if(G.state!=='menu'||NET.inRoom||!overlay.hidden)return;previousFocus=document.activeElement;if(previousFocus===document.body||overlay.contains(previousFocus))previousFocus=button;overlay.hidden=false;const request=load();render();$('guideClose').focus();Snd.init();Snd.open();await request}
 function close(){if(overlay.hidden)return;overlay.hidden=true;if(previousFocus?.isConnected)previousFocus.focus();Snd.click()}
 button.addEventListener('click',open);$('guideClose').addEventListener('click',close);overlay.addEventListener('pointerdown',event=>{if(event.target===overlay)close()});
 document.addEventListener('keydown',event=>{if(!overlay.hidden&&(event.code==='Escape'||event.code===KEY_BINDINGS.back)){event.preventDefault();event.stopImmediatePropagation();close()}},true);
 const oldLanguage=applyGameLanguage;applyGameLanguage=function(){const result=oldLanguage();render();return result};
 render();return {open,close,render,categories:()=>catalog?.categories.slice()||[]};
})();
