/* Confirm real completions in the background; unconfirmed progress stays unchanged. */
'use strict';
const TASK_CONFIRMATIONS=(()=>{
 const pending=new Map(),key=(task,step)=>String(task)+':'+String(step);
 function clear(){for(const entry of pending.values()){clearTimeout(entry.timer);NET.pendingTasks.delete(entry.key)}pending.clear()}
 function resolve(entry,ok){if(pending.get(entry.key)!==entry)return;clearTimeout(entry.timer);pending.delete(entry.key);NET.pendingTasks.delete(entry.key);if(ok){renderTasks();Snd.ok();const task=G.tasks.find(t=>String(t.id)===String(entry.taskId));if(task?.done&&!task.fix&&!G.ending&&!G.over)toast(t('task.completed',{name:taskDisplayName(task)}),1800)}else if(!G.over&&!G.ending)toast(t('task.confirmRetry'),2500)}
 function start(m,worker=false){const id=key(m.task.id,m.step.st);if(pending.has(id)){closeModal();return true}const entry={key:id,taskId:m.task.id,stepId:m.step.st,room:NET.room?.code,round:NET.round,worker,until:performance.now()+6500,timer:null};pending.set(id,entry);NET.pendingTasks.add(id);m.finished=true;closeModal();
  const send=()=>{if(!pending.has(id))return;if(G.ending||G.over||NET.inRoom&&(entry.room!==NET.room?.code||entry.round!==NET.round)){resolve(entry,false);return}if(performance.now()>entry.until){resolve(entry,false);return}
   if(worker){if(!G.player?.alive){resolve(entry,false);return}if(NEW_NEUTRALS.complete(G.player,m.task,m.step)){if(!pending.has(id))return;entry.timer=setTimeout(()=>resolve(entry,false),Math.max(1,entry.until-performance.now()));return}entry.timer=setTimeout(send,200)}
   else if(netSend({type:'action',action:'task_complete',taskId:m.task.id,stepId:m.step.st,fix:m.task.fix||null}))entry.timer=setTimeout(()=>resolve(entry,false),6500);else resolve(entry,false);
  };send();return true;
 }
 function confirmed(){for(const entry of pending.values()){const task=G.tasks.find(t=>String(t.id)===String(entry.taskId)),step=task?.steps.find(s=>s.st===entry.stepId);if(step?.done)resolve(entry,true)}}
 function ack(m){const entry=pending.get(key(m.taskId,m.stepId));if(!entry)return;const task=G.tasks.find(t=>String(t.id)===String(m.taskId)),step=task?.steps.find(s=>s.st===m.stepId);if(step){step.done=true;task.done=task.steps.every(s=>s.done)}resolve(entry,true)}
 const oldApply=netApplySnapshot;netApplySnapshot=function(...a){const r=oldApply(...a);confirmed();return r};
 const oldHandle=netHandleMessage;netHandleMessage=function(m){if(['game_start','left','room_expired','moderation_removed','role_swap'].includes(m.type))clear();const r=oldHandle(m);if(NET.inRoom&&m.code===NET.room?.code&&m.round===NET.round&&m.type==='neutral_ack'&&m.resultType==='task_done'&&m.actorId===G.player?.id)ack(m);if(NET.inRoom&&m.code===NET.room?.code&&m.round===NET.round&&m.type==='neutral_rejected'&&m.action==='task_finish'&&m.actorId===G.player?.id)for(const e of pending.values())if(e.worker)resolve(e,false);return r};
 const oldMenu=toMenu;toMenu=function(...a){clear();return oldMenu(...a)};
 return{start,ack,confirmed};
})();
