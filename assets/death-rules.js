/* Immutable elimination identity; the Seer receives only the permitted reconstruction. */
'use strict';
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.NZDeathRules=api})(globalThis,()=>{
 const causes=new Set(['kill','ninja','delayed','sheriff_hit','sheriff_misfire','sheriff_recoil','pyromancer','hot-potato','ejection','disconnect','unknown']);
 function context(actor,chars,cause='kill'){
  const executor=actor?.controlTargetId&&chars.find(c=>c.id===actor.controlTargetId)||actor,controller=executor?.controlledBy||executor!==actor&&actor?.id||null;
  return{executorId:executor?.id||null,controllerId:controller,cause:causes.has(cause)?cause:'unknown',face:executor?.face<0?-1:1};
 }
 const key=body=>String(body.victimId??body.id)+'|'+String(body.id)+'|'+(Number(body.tKill)||0);
 function replay(record,gt,duration){return{bodyId:String(record.bodyId),victimName:record.victimName,trace:structuredClone(record.trace),cause:record.cause,controlled:!!record.controllerId,face:record.face<0?-1:1,startedAt:gt,until:gt+duration,duration,hasExecutor:!!record.executorId}}
 return{causes,context,key,replay};
});
