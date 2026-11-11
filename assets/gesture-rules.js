/* Gesture timing and permissions shared by the server and offline Mímica. */
'use strict';
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.NZGestureRules=api})(globalThis,()=>{
 const KINDS=['up','down','right','pointUp','pointDown','left','horns','palm','vulcan','wave'],POINT=new Set(['right','pointUp','pointDown','left']);
 const ICONS=['👍','👎','👉','👆','👇','👈','🤘','🖐','🖖','👋'];
 function create(){return{seq:0,context:null,active:{},readyAt:{}}}
 function context(s){if(s?.over)return null;if(s?.state==='meeting')return ['discuss','vote','result'].includes(s.meeting?.phase)?'meeting':null;return ['playing','task','tool'].includes(s?.state)?'world':null}
 function sync(state,s,now){const ctx=context(s);let changed=false;if(ctx!==state.context){state.context=ctx;state.active={};state.seq++;changed=true}for(const [id,g]of Object.entries(state.active))if(g.until<=now||!s.chars?.some(c=>c.id===id)){delete state.active[id];changed=true}if(changed)state.seq++;return changed}
 function apply(state,s,actorId,req,now,cooldown){sync(state,s,now);const actor=s.chars?.find(c=>c.id===actorId),ctx=context(s);if(!actor||!ctx||!KINDS.includes(req.kind)||state.readyAt[actorId]>now||ctx==='world'&&(actor.vent||actor.ventAnim||actor.spectralInvisible||actor.controlledBy||actor.killDash||actor.morphTransition||actor.minerDig))return false;
  const point=POINT.has(req.kind),angle=Number(req.angle);if(point&&!Number.isFinite(angle))return false;const target=point&&ctx==='meeting'&&s.chars.some(c=>c.id===req.targetId)?req.targetId:null;if(point&&ctx==='meeting'&&!target)return false;
  state.active[actorId]={id:++state.seq,actorId,kind:req.kind,angle:point?Math.atan2(Math.sin(angle),Math.cos(angle)):0,targetId:target,context:ctx,at:now,until:now+5000};state.readyAt[actorId]=now+Math.min(10,Math.max(5,Number(cooldown)||5))*1000;return true;
 }
 function view(state,id,s,now){const receiver=s.chars?.find(c=>c.id===id),active={},readyAt={};for(const [actorId,g]of Object.entries(state.active||{})){const actor=s.chars?.find(c=>c.id===actorId);if(g.until>now&&actor&&(actor.alive||receiver?.alive===false||g.context==='meeting'))active[actorId]={...g}}for(const [actorId,at]of Object.entries(state.readyAt||{})){const actor=s.chars?.find(c=>c.id===actorId);if(actorId===id||actor?.alive||receiver?.alive===false||context(s)==='meeting')readyAt[actorId]=at}return{seq:state.seq,context:state.context,active,readyAt,serverNow:now}}
 return{KINDS,POINT,ICONS,create,context,sync,apply,view};
});
