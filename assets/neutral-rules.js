/* Bounded, server-owned ledgers for Worker tasks and Pyromancer actions. Also used offline. */
'use strict';
(function(root,factory){const rules=factory(typeof module==='object'&&module.exports?require('./match-rules'):root.NZMatchRules);if(typeof module==='object'&&module.exports)module.exports=rules;else root.NZNeutralRules=rules})(globalThis,(MatchRules)=>{
 const kinds=new Set(['worker','pyromancer','child','shifter']);
 const roles=['jester','worker','pyromancer','child','shifter'];
 function capacity(count,settings){const total=Math.max(0,Math.floor(Number(settings.neutrals)||0)),limit=Math.floor(count/3),available=roles.reduce((n,role)=>n+(Number(settings[role+'Chance'])===100?Math.max(0,Math.floor(Number(settings[role+'Max'])||0)):0),0);return{total,available,limit,valid:total<=limit&&available>=total}}
 function shuffled(values,random){const a=values.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
 function createPlan(ids,settings,random=Math.random){
  const order=shuffled([...new Set(ids)],random),check=capacity(order.length,settings),total=check.total,caps={};
  if(!check.valid)throw Object.assign(new Error('neutral_capacity'),check);
  for(const role of roles)if(Number(settings[role+'Chance'])===100)caps[role]=Math.min(total,Math.max(0,Math.floor(Number(settings[role+'Max'])||0)));
  const selected=[];while(selected.length<total){for(const role of shuffled(roles.filter(role=>caps[role]>0),random)){if(selected.length===total)break;selected.push(role);caps[role]--}}
  return{order,roles:selected};
 }
 function assignments(plan,chars){const crew=new Set(chars.filter(c=>c.role!=='imp').map(c=>c.id));return Object.fromEntries(plan.order.filter(id=>crew.has(id)).slice(0,plan.roles.length).map((id,i)=>[id,plan.roles[i]]))}

 class Ledger{
  constructor({clock=()=>Date.now(),near,ray,tasksFor,nonce=()=>{const bytes=new Uint8Array(16);crypto.getRandomValues(bytes);return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('')}}){Object.assign(this,{clock,near,ray,tasksFor,nonce});this.records=new Map();this.seen=new Set();this.meeting=0;this.inMeeting=false;this.winner=null;this.revision=0;this.deaths=new Map();this.events=[]}
  living(s,ids){return s.chars.filter(c=>c.alive&&!c.ghost&&ids.has(c.id))}
  valid(s,c,ids){return !this.winner&&s.state==='playing'&&!s.meeting&&!s.over&&ids.has(c?.id)&&c.alive&&!c.ghost&&!c.vent&&!c.ventAnim&&!c.controlledBy&&!c.controlTargetId&&!c.killDash&&!c.minerDig&&!c.morphTransition}
  sync(s,ids,settings){
   this.snapshot=s;this.ids=ids;this.settings=settings;const now=this.clock(),was=this.inMeeting;this.inMeeting=s.state==='meeting';if(this.inMeeting&&!was){this.meeting++;this.meetingStartedAt=now;this.resultSeen=false}if(this.inMeeting&&['result','eject'].includes(s.meeting?.phase))this.resultSeen=true;
   for(const c of s.chars){
    if(!this.seen.has(c.id)){this.seen.add(c.id);if(kinds.has(c.function)&&c.role==='neutral'&&ids.has(c.id)){const kind=c.function;this.records.set(c.id,{id:c.id,kind,tasks:kind==='worker'?this.tasksFor(c):[],oil:[],readyAt:kind==='shifter'?now+(settings.shifterCooldown||15)*1000:0,pause:null,pending:null,ticket:null,alert:false});this.revision++}}
    const r=this.records.get(c.id);if(r){c.role='neutral';c.function=r.kind;const paused=!!c.vent||!!c.ventAnim||s.state!=='playing';if(paused&&r.pause===null){r.pause=Math.max(0,r.readyAt-now);this.revision++}if(!paused&&r.pause!==null){r.readyAt=now+r.pause;r.pause=null;this.revision++}
     if(!c.alive||!ids.has(c.id)){if(r.pending||r.alert||r.ticket){r.pending=null;r.alert=false;r.ticket=null;this.revision++}}else if(r.kind==='worker'){const left=r.tasks.filter(t=>!t.done),steps=left.reduce((n,t)=>n+t.steps.filter(st=>!st.done).length,0),alert=left.length===1||steps===1;if(alert&&!r.alert){r.alert=true;this.revision++}}
     if(r.ticket&&(!this.valid(s,c,ids)||!this.near(c,r.ticket.station,s))){r.ticket=null;this.revision++}
    }
   }
   for(const [id,d]of this.deaths){const c=s.chars.find(c=>c.id===id);if(!c)continue;if(c.alive&&c.revivedOnce&&!d.revivedOnce){this.deaths.delete(id);continue}c.alive=false;c.ghost=true;c.vent=null;c.ventAnim=null}
   for(const r of this.records.values())if(r.kind==='worker')s.tasks=[...s.tasks.filter(t=>t.owner!==r.id),...structuredClone(r.tasks)];
   if(was&&!this.inMeeting&&s.state==='playing'&&this.resultSeen&&now-this.meetingStartedAt>=(1.9+(Number(settings.discussion)||0))*1000)this.resolve(s,ids);
   return s;
  }
  action(id,action,data={}){
   const s=this.snapshot,r=this.records.get(id),c=s?.chars.find(c=>c.id===id),ids=this.ids;if(!r||!this.valid(s,c,ids))return null;const now=this.clock();
   if(r.kind==='worker'&&['task_begin','task_finish'].includes(action)){
    const task=r.tasks.find(t=>String(t.id)===String(data.taskId)),step=task?.steps.find(st=>!st.done);if(!step||step.st!==data.stepId||!this.near(c,step.st,s))return null;
    const key=task.id+':'+step.st;
    if(action==='task_begin'){if(!r.ticket||r.ticket.key!==key)r.ticket={key,nonce:this.nonce(),at:now,station:step.st};return{type:'ticket',actorId:id,taskId:task.id,stepId:step.st,nonce:r.ticket.nonce,waitMs:Math.max(0,1500-(now-r.ticket.at))}}
    if(!r.ticket||r.ticket.key!==key||r.ticket.nonce!==data.nonce||now-r.ticket.at<1500||now-r.ticket.at>120000)return null;
    step.done=true;task.done=task.steps.every(st=>st.done);r.ticket=null;this.revision++;
    const left=r.tasks.filter(t=>!t.done),steps=left.reduce((n,t)=>n+t.steps.filter(st=>!st.done).length,0);if(left.length&& (left.length===1||steps===1))r.alert=true;
    if(r.tasks.length&&r.tasks.every(t=>t.done))this.win(id,'worker');return{type:'task_done',actorId:id,taskId:task.id,stepId:step.st};
   }
   if(r.kind==='shifter'&&action==='shift'){
    const target=this.living(s,ids).find(t=>t.id===data.targetId);
    if(r.pause!==null||r.readyAt>now||!target||Math.hypot(target.x-c.x,target.y-c.y)>[48,120,220][this.settings.actionDistance??1]||!this.ray(c,target,s))return null;
    const inherited=this.records.get(target.id);
    if(!MatchRules.shift(s,c,target,this.settings))return null;
    this.records.delete(id);this.records.delete(target.id);
    if(inherited&&inherited.kind!=='shifter'){inherited.id=id;inherited.tasks=inherited.tasks.map(t=>({...t,owner:id}));inherited.oil=inherited.oil.filter(targetId=>targetId!==id);inherited.pending=null;inherited.ticket=null;inherited.readyAt=now+(inherited.kind==='pyromancer'?(this.settings.pyromancerCooldown||15):0)*1000;inherited.pause=null;this.records.set(id,inherited)}
    this.records.set(target.id,{id:target.id,kind:'shifter',tasks:[],oil:[],readyAt:now+(this.settings.shifterCooldown||15)*1000,pause:null,pending:null,ticket:null,alert:false});
    this.revision++;this.events.push({type:'shift',id:this.nonce(),actorId:id,targetId:target.id});return{type:'shifted',actorId:id,targetId:target.id};
   }
   if(r.kind!=='pyromancer'||s.sab?.comms>0||r.pending)return null;
   const live=this.living(s,ids).filter(t=>t.id!==id);
   if(action==='douse'){
    const target=live.find(t=>t.id===data.targetId);if(r.pause!==null||r.readyAt>now||!target||target.spectralInvisible||target.vent||target.ventAnim||target.controlledBy||r.oil.includes(target.id)||Math.hypot(target.x-c.x,target.y-c.y)>[48,120,220][this.settings.actionDistance??1]||!this.ray(c,target,s))return null;
    r.oil.push(target.id);r.readyAt=now+Math.max(5,Math.min(25,this.settings.pyromancerCooldown||15))*1000;this.revision++;return{type:'doused',actorId:id,targetId:target.id};
   }
   if(action==='ignite'&&live.length&&live.every(t=>r.oil.includes(t.id))){r.pending=this.meeting+1;this.revision++;return{type:'ignited',actorId:id}}
   return null;
  }
  resolve(s,ids){
   const ready=[...this.records.values()].filter(r=>r.kind==='pyromancer'&&r.pending&&r.pending<=this.meeting&&s.chars.some(c=>c.id===r.id&&c.alive&&ids.has(c.id))),victims=new Set();
   for(const r of ready)for(const c of this.living(s,ids))if(c.id!==r.id&&r.oil.includes(c.id))victims.add(c.id);
   for(const id of victims){const c=s.chars.find(c=>c.id===id);this.deaths.set(id,{revivedOnce:!!c.revivedOnce});s.bodies=s.bodies||[];if(!s.bodies.some(b=>b.victimId===id))s.bodies.push({id:'fire_'+this.meeting+'_'+id,victimId:id,name:c.morphAppearance?.name||c.name,color:c.morphAppearance?.color||c.color,cosmetics:c.morphAppearance?.cosmetics||c.cosmetics,x:c.x,y:c.y,tKill:s.gt||0,cause:'pyromancer',killerId:ready.find(r=>r.id!==id&&r.oil.includes(id))?.id});c.alive=false;c.ghost=true;c.vent=null;c.ventAnim=null}
   const child=s.chars.find(c=>victims.has(c.id)&&c.role==='neutral'&&c.function==='child');if(child)this.win(child.id,'child');
   if(ready.length){for(const r of ready){r.pending=null;r.oil=[]}this.revision++;this.events.push({type:'burn',id:this.nonce(),victims:[...victims],bodies:(s.bodies||[]).filter(b=>victims.has(b.victimId))});for(const r of ready){const c=s.chars.find(c=>c.id===r.id);if(c?.alive&&this.living(s,ids).every(t=>t.id===r.id)){this.win(r.id,'pyromancer');break}}}
   for(const r of this.records.values())if(!s.chars.some(c=>c.id===r.id&&c.alive&&ids.has(c.id))){r.pending=null;r.alert=false;r.ticket=null}
  }
  win(id,kind){if(this.winner)return;this.winner={id,kind};this.revision++;this.events.push({type:'victory',...this.winner})}
  view(id,host=false){const s=this.snapshot,c=s?.chars.find(c=>c.id===id);const own=this.records.get(id);return{revision:this.revision,own:own?{...structuredClone(own),canIgnite:own.kind==='pyromancer'&&!own.pending&&this.living(s,this.ids).some(t=>t.id!==id)&&this.living(s,this.ids).every(t=>t.id===id||own.oil.includes(t.id))}:null,hasPendingFire:host&&[...this.records.values()].some(r=>r.pending),bots:host?[...this.records.values()].filter(r=>s.chars.some(c=>c.id===r.id&&c.isBot)).map(r=>({...structuredClone(r),canIgnite:r.kind==='pyromancer'&&!r.pending&&this.living(s,this.ids).some(t=>t.id!==r.id)&&this.living(s,this.ids).every(t=>t.id===r.id||r.oil.includes(t.id))})):[],oil:c?.alive&&own?.kind==='pyromancer'?[...own.oil]:[],alerts:c?.alive&&c.role==='imp'?[...this.records.values()].filter(r=>r.alert&&s.chars.some(c=>c.id===r.id&&c.alive&&this.ids.has(c.id))).map(r=>({id:r.id,name:s.chars.find(c=>c.id===r.id).name})):[]}}
 }
 return{Ledger,kinds:[...kinds],roles,capacity,createPlan,assignments};
});
