/* Traditional emergency, Captain call and body report reuse one confirmed event per client. */
'use strict';
const MEETING_AUDIO=(()=>{
 const paths={emergency:'assets/audio/emergencia-padrao.mp3',captain:'assets/audio/botao-nave-zero.mp3',body:'assets/audio/AudioCutter_Among Us (Dead Body Reported) Sound Effect(M4A_128K).mp3'},raw={},buffers=new Map(),heard=new Set();let localSeq=0,active=null;
 try{for(const id of JSON.parse(sessionStorage.getItem('nz_meeting_audio_seen_v1')||'[]'))heard.add(String(id))}catch{}
 function remember(id){heard.add(id);while(heard.size>64)heard.delete(heard.values().next().value);try{sessionStorage.setItem('nz_meeting_audio_seen_v1',JSON.stringify([...heard]))}catch{}}
 function preload(){for(const [kind,path]of Object.entries(paths))if(!raw[kind])raw[kind]=fetch(encodeURI(path)).then(r=>{if(!r.ok)throw Error('Meeting audio HTTP '+r.status);return r.arrayBuffer()}).catch(()=>null)}
 async function play(id,kind){
  if(!id||heard.has(id))return;remember(id);if(!Snd.on||Snd.volume<=0)return;Snd.init();if(!Snd.ctx)return;preload();const context=Snd.ctx,key=kind+'|'+context.sampleRate;
  try{let buffer=buffers.get(key);if(!buffer){const bytes=await raw[kind];if(!bytes)return;buffer=await context.decodeAudioData(bytes.slice(0));buffers.set(key,buffer)}if(!Snd.on||Snd.volume<=0||G.state!=='meeting'||G.M?.phase!=='intro'||G.M.audioEventId!==id)return;
   if(active){try{active.stop()}catch{}}const source=context.createBufferSource(),gain=context.createGain();gain.gain.value=.18;source.buffer=buffer;source.connect(gain).connect(Snd.output());source.onended=()=>{source.disconnect();gain.disconnect();if(active===source)active=null};active=source;source.start();
  }catch(error){console.warn('Áudio de reunião indisponível:',kind,error.message)}
 }
 function kind(meeting){return meeting?.reason==='body'?'body':meeting?.captainCallId?'captain':'emergency'}
 function localStarted(meeting){if(!NET.inRoom&&meeting&&!meeting.audioEventId){const id='local:'+Date.now()+':'+(++localSeq);meeting.audioEventId=id;queueMicrotask(()=>{if(G.M===meeting)play(id,kind(meeting))})}}
 const capture=netCaptureSnapshot;netCaptureSnapshot=function(){const s=capture();if(s.meeting)s.meeting.audioEventId=G.M?.audioEventId||null;return s};
 const previous=netHandleMessage;netHandleMessage=function(m){const result=previous(m);
  if(m.type==='game_start')preload();
  if(m.type==='meeting_event'&&m.code===NET.room?.code&&m.round===NET.round&&G.M?.caller?.id===m.callerId){G.M.audioEventId=m.id;play(m.id,m.kind==='body'?'body':kind(G.M))}
  if(['meeting_start','snapshot'].includes(m.type)&&NET.inRoom&&!NET.isHost&&Number(m.snapshot?.seq)===NET.recvSeq&&m.snapshot?.meeting?.audioEventId&&G.M?.caller?.id===m.snapshot.meeting.callerId&&G.state==='meeting'&&G.M?.phase==='intro'){const event=m.snapshot.meeting;G.M.audioEventId=event.audioEventId;play(event.audioEventId,kind(event))}
  return result;
 };
 const oldStart=startFreePlay;startFreePlay=function(...args){preload();return oldStart(...args)};
 return{paths,preload,localStarted,heard:()=>[...heard]};
})();
