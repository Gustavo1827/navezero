/* Measures RTT to the configured game WebSocket; connection probes stay independent. */
'use strict';
const PING_METER=(()=>{
 const node=document.createElement('span');node.id='pingMeter';node.setAttribute('aria-live','off');document.body.append(node);
 const pending=new Map();let socket=null,last=0,value=null,sequence=0,wasInRoom=false;
 function paint(){const online=NET.ws?.readyState===WebSocket.OPEN;if(NET.inRoom)wasInRoom=true;else if(online)wasInRoom=false;const lobby=NET.inRoom&&NET.room?.status==='lobby'&&!$('roomLobby').hidden,playing=['playing','task','tool','meeting'].includes(G.state)&&$('role').hidden&&$('mpWaitOverlay').hidden&&(NET.room?.status==='playing'||wasInRoom&&!online);node.hidden=!(lobby||playing)||!NET.inRoom&&!(wasInRoom&&!online);node.dataset.latency=!online?'disconnected':value===null?'pending':value<=80?'good':value<=150?'medium':'bad';setTxt(node,!online?t('network.disconnected'):value===null?t('network.pingPending'):t('network.ping',{ms:value}))}
 const previous=netHandleMessage;netHandleMessage=function(m){if(m.type==='pong'&&pending.has(m.echo)){value=Math.max(0,Math.round(performance.now()-pending.get(m.echo)));pending.delete(m.echo);paint()}return previous(m)};
 function tick(){if(socket!==NET.ws){socket=NET.ws;pending.clear();value=null;last=0}paint();if(!NET.inRoom||NET.ws?.readyState!==WebSocket.OPEN){pending.clear();return}const now=performance.now();if(now-last<2000)return;last=now;for(const [key,at]of pending)if(now-at>8000)pending.delete(key);const echo=-(++sequence);pending.set(echo,now);if(!netSend({type:'ping',echo}))pending.delete(echo)}
 setInterval(tick,250);return{paint};
})();
