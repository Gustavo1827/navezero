/* Small rules shared by the server and offline games. No rendering or transport. */
'use strict';
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.NZMatchRules=api})(globalThis,()=>{
 const classic=mode=>mode==='classic'||mode==='mimica';
 const eventsAllowed=(mode,cfg)=>!classic(mode)||cfg.allowMeetings!==0;
 const busy=c=>!c?.alive||c.ghost||c.vent||c.ventAnim||c.controlledBy||c.controlTargetId||c.killDash||c.minerDig||c.morphTransition||c.morphAppearance||c.spectralInvisible||c.ninja;
 const fields=['netKillCd','netSheriffCd','netDelayedCd','netTrackTarget','netTrackTime','netTrackCd','engVentTime','engVentCd','cleanCd','cleanUses','cleanPending','parasiteReady','parasiteCd','parasiteTargetId','paramedicCd','paramedicSpent','paramedicUses','paramedicTaskBase','seerCd','seerPending','seerReplay','noisyTriggered','judgeUsed','judgeTargetId','lazyNormalSteps','lazyDone','spectralCd','spectralTransition','spectralInvisible','spectralTime','spectralEndsAt','minerCd','morphCd','morphTime','morphAppearance','hunterTargetId','hunterTargetCd','controlCd','controlTime','controlReturn','ninja','ninjaCd','captainReadyAt','guardian','guardianTargetId','instructor','instructorTargetId'];
 function clear(c){for(const key of fields)c[key]=null;c.guardian=c.instructor=c.spectralInvisible=false;c.parasiteReady=false;c.moving=false}
 function shift(s,actor,target,cfg){
  if(s.over||s.ending||s.meeting||s.state!=='playing'||s.sab?.comms>0||actor===target||busy(actor)||busy(target)||actor?.role!=='neutral'||actor.function!=='shifter'||target.function==='shifter')return false;
  const inherited={role:target.role,function:target.function},saved=Object.fromEntries(fields.filter(k=>Object.hasOwn(target,k)).map(k=>[k,structuredClone(target[k])]));
  // Pending effects belong to their caster; they cannot survive the loss of that function.
  for(const key of ['delayedMarks','parasiteInfections'])for(const [id,effect]of Object.entries(s[key]||{}))if([actor.id,target.id].includes(effect.killerId||effect.parasiteId))delete s[key][id];
  if(!Object.keys(s.parasiteInfections||{}).length)s.parasiteWinnerId=null;
  for(const [id,effect]of Object.entries(s.guardianProtections||{}))if([actor.id,target.id].includes(effect.ownerId))delete s.guardianProtections[id];
  s.instructorTrails=(s.instructorTrails||[]).filter(e=>![actor.id,target.id].includes(e.ownerId));
  s.tasks=(s.tasks||[]).filter(t=>t.owner!==actor.id).map(t=>t.owner===target.id?{...t,owner:actor.id}:t);
  clear(actor);clear(target);Object.assign(actor,saved,inherited);Object.assign(target,{role:'neutral',function:'shifter'});
  actor.shiftCount=(actor.shiftCount||0)+1;target.shifterTenure=(target.shifterTenure||0)+1;
  actor.netTrackTarget=null;actor.netTrackTime=0;actor.seerPending=actor.seerReplay=null;actor.hunterTargetId=null;actor.judgeTargetId=null;actor.cleanPending=null;
  const cooldowns={locator:['netTrackCd','locCooldown'],sheriff:['netSheriffCd','sheriffCooldown'],engineer:['engVentCd','engCooldown'],paramedic:['paramedicCd','paramedicCooldown'],seer:['seerCd','seerCooldown'],cleaner:['cleanCd','cleanerCooldown'],parasite:['parasiteCd','kill'],delayed:['netDelayedCd','kill'],spectral:['spectralCd','spectralCooldown'],miner:['minerCd','minerCooldown'],metamorph:['morphCd','morphCooldown'],hunter:['hunterTargetCd','hunterTargetCooldown'],marionette:['controlCd','marionCooldown'],ninja:['ninjaCd','ninjaCooldown']};
  const cd=cooldowns[actor.function];if(cd)actor[cd[0]]=cfg[cd[1]];
  if(actor.role==='imp')actor.netKillCd=cfg.kill;
  if(actor.function==='captain')actor.captainReadyAt=(s.gt||0)+cfg.captainCooldown;
  s.roleRevision=(s.roleRevision||0)+1;return true;
 }
 function result(s,ids,previous=null){
  if(!s||s.ending)return null;const chars=(s.chars||[]).filter(c=>ids.has(c.id));
  const child=chars.find(c=>c.role==='neutral'&&c.function==='child'&&!c.alive&&previous?.chars?.some(p=>p.id===c.id&&p.alive)&&(s.bodies||[]).some(b=>String(b.victimId??b.id)===String(c.id)&&b.killerId&&b.killerId!==c.id&&chars.some(k=>k.id===b.killerId)&&!['sheriff_misfire','disconnect','eject'].includes(b.cause)));
  if(child)return{winner:'neutral',kind:'child',id:child.id,reason:'newNeutral.childWin'};
  if(s.state==='meeting')return null;
  const imps=(s.chars||[]).filter(c=>c.role==='imp'),alive=chars.filter(c=>c.role==='imp'&&c.alive),others=chars.filter(c=>c.alive&&c.role!=='imp'&&c.function!=='worker');
  if(imps.length&&!alive.length)return{winner:'crew',reason:'match.crewElimination'};
  if(alive.length&&alive.length>=others.length)return{winner:'imp',reason:'match.impMajority'};
  const crew=new Map(chars.filter(c=>c.role==='crew').map(c=>[c.id,c])),tasks=(s.tasks||[]).filter(t=>crew.has(t.owner)&&!t.fake&&!t.fix);
  const active=t=>{const owner=crew.get(t.owner);return owner.alive||owner.ghost&&(!owner.isPlayer||s.crewTaskGhostsActive!==false)},completed=t=>t.done||t.steps?.some(st=>st.done);
  if(tasks.some(completed)&&tasks.every(t=>!active(t)||t.done||t.steps?.length&&t.steps.every(st=>st.done)))return{winner:'crew',reason:'match.crewTasks'};
  return null;
 }
 return{classic,eventsAllowed,busy,shift,result};
});
