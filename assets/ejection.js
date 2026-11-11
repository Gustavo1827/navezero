/* Map-specific ejection presentation. Voting, timers, elimination and winners remain in the meeting system. */
'use strict';
const EJECTION=(()=>{
 const root=$('meet'),panel=root.querySelector('.meetp'),canvas=document.createElement('canvas'),c=canvas.getContext('2d');canvas.id='ejectionScene';canvas.hidden=true;canvas.setAttribute('aria-hidden','true');root.prepend(canvas);
 let current=null,lastPaint=-Infinity,lastSize='',anchorAt=0,anchorTime=0;
 const unit=v=>clamp(v,0,1),lerp=(a,b,t)=>a+(b-a)*t,ease=v=>{v=unit(v);return v*v*(3-2*v)},seed=n=>{const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v)};
 function polygon(points,fill,stroke='#101a30',line=3){c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fillStyle=fill;c.fill();if(stroke){c.lineWidth=line;c.strokeStyle=stroke;c.stroke()}}
 function box(x,y,w,h,fill,stroke='#101a30',r=8){c.fillStyle=fill;rr(c,x,y,w,h,r);c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=3;c.stroke()}}
 function ellipse(x,y,rx,ry,fill,stroke=null){c.beginPath();c.ellipse(x,y,Math.max(.1,rx),Math.max(.1,ry),0,0,Math.PI*2);c.fillStyle=fill;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=2;c.stroke()}}
 function gradient(top,bottom,w,h){const g=c.createLinearGradient(0,0,0,h);g.addColorStop(0,top);g.addColorStop(1,bottom);c.fillStyle=g;c.fillRect(0,0,w,h)}
 function stars(w,h,t,count=70){for(let i=0;i<count;i++){const x=(seed(i+1)*w+t*(3+seed(i+7)*8))%w,y=seed(i+92)*h,r=.7+seed(i+3)*1.3;c.globalAlpha=.25+seed(i+61)*.6;ellipse(x,y,r,r,'#e5f5ff')}c.globalAlpha=1}
 function actor(ch,x,y,scale,angle=0,alpha=1){if(!ch||alpha<=0)return;c.save();c.translate(x,y);c.rotate(angle);c.scale(scale,scale);c.globalAlpha=alpha;drawChar(c,{id:'ejection_actor',x:0,y:0,face:1,walk:0,moving:false,alive:true,ghost:false,color:ch.color,cosmetics:cloneCosmetics(ch.cosmetics)},false,{portrait:true,ejection:true});c.restore()}
 function ship(w,h,stage,p,t,ch,size){
  gradient('#030817','#182d50',w,h);stars(w,h,t);
  const planet=c.createRadialGradient(w*.8,h*1.35,h*.15,w*.8,h*1.35,h*.8);planet.addColorStop(0,'#334c8a');planet.addColorStop(.7,'#17345f');planet.addColorStop(.76,'#4a92b9');planet.addColorStop(.78,'#0b172d');planet.addColorStop(1,'rgba(2,9,23,0)');c.fillStyle=planet;c.fillRect(0,stage*.6,w,h);
  const y=stage*.52,doorW=Math.max(38,w*.065),doorH=size*75,hull=Math.max(66,w*.15);
  polygon([[0,stage*.13],[hull*.67,stage*.13],[hull,y-doorH*.68],[hull,y+doorH*.76],[hull*.65,stage*.96],[0,stage*.96]],'#313f60','#111a32',4);
  box(-18,y-doorH*.7,hull+22,doorH*1.43,'#758899','#111a32',14);box(hull-doorW,y-doorH*.48,doorW+7,doorH,'#102035','#091123',8);
  for(let i=0;i<4;i++)box(10+i*(hull-24)/4,y-doorH*.63,Math.max(7,(hull-34)/5),7,i%2?'#77cfe4':'#284761',null,2);
  const opening=ch?ease((p-.05)/.13):0;box(hull-doorW+6,y-doorH*.44,Math.max(2,(doorW-6)*(1-opening)),doorH*.92,'#4a6782','#13233c',3);
  c.strokeStyle='#9adced';c.lineWidth=3;c.beginPath();c.moveTo(hull+5,y-doorH*.45);c.lineTo(hull+5,y+doorH*.45);c.stroke();
  if(ch){const drift=unit((p-.14)/.6),x=lerp(hull+size*19,w+size*90,drift),cy=y+Math.sin(drift*Math.PI)*stage*.09;actor(ch,x,cy,size*(1-drift*.28),-.15+drift*4.6,unit((1-drift)*5));if(p>.14&&p<.32){c.globalAlpha=unit(1-(p-.14)/.18)*.38;c.strokeStyle='#b4e8ff';c.lineWidth=2;for(let i=0;i<6;i++){c.beginPath();c.moveTo(hull+10,y+(i-2.5)*9);c.lineTo(hull+42+i*8,y+(i-2.5)*15);c.stroke()}c.globalAlpha=1}}
 }
 function nexus(w,h,stage,p,t,ch,size){
  gradient('#496897','#abd2e3',w,h);
  const fall=ch?unit((p-.14)/.65):0,descent=ease(fall),ledge=Math.max(stage*.27,size*75+10),edge=w*.44;
  // Original cloud silhouettes overlap in three planes; nearer banks move faster during the fall.
  function cloud(x,y,r,fill){c.fillStyle=fill;c.beginPath();c.moveTo(x-r,y+r*.3);c.bezierCurveTo(x-r*1.65,y-r*.08,x-r*1.1,y-r*.7,x-r*.62,y-r*.55);c.bezierCurveTo(x-r*.7,y-r*1.3,x+r*.32,y-r*1.4,x+r*.52,y-r*.68);c.bezierCurveTo(x+r*1.3,y-r*.85,x+r*1.7,y+r*.2,x+r,y+r*.42);c.bezierCurveTo(x+r*.38,y+r*.68,x-r*.6,y+r*.63,x-r,y+r*.3);c.fill()}
  for(let i=0;i<7;i++)cloud((i-1)*w*.23+Math.sin(t*.08+i)*w*.014,stage*(.43+seed(i+80)*.25)-descent*stage*.055,Math.max(25,w*.085),'#a9c4da');
  for(let i=0;i<5;i++){const x=w*(.52+i*.14),y=stage*.48-descent*stage*.1;polygon([[x,y+stage*.13],[x+w*.025,y],[x+w*.055,y],[x+w*.08,y+stage*.13]],'#819ebd',null)}
  c.save();c.translate(-descent*w*.06,-descent*stage*.23);
  // A red, faceted research tower, cantilevered launch deck and illuminated antenna array.
  polygon([[0,stage*.12],[edge*.73,stage*.12],[edge,stage*.23],[edge,ledge+stage*.45],[0,ledge+stage*.61]],'#a43b58','#392d48',4);
  polygon([[edge*.73,stage*.12],[edge,stage*.23],[edge,ledge+stage*.45],[edge*.73,ledge+stage*.37]],'#722c4b','#392d48',3);
  polygon([[0,stage*.12],[edge*.73,stage*.12],[edge,stage*.23],[edge*.24,stage*.23]],'#e47579','#392d48',3);
  for(let row=0;row<4;row++)for(let col=0;col<4;col++){const x=edge*(.04+col*.17),y=stage*.28+row*stage*.105;box(x,y,edge*.11,Math.max(5,stage*.047),'#203a56','#462b47',3);c.fillStyle=(row+col)%3?'#83e6ed':'#d6f6f3';c.fillRect(x+2,y+2,edge*.11-4,Math.max(2,stage*.018))}
  c.strokeStyle='#e17a81';c.lineWidth=3;for(let i=0;i<3;i++){c.beginPath();c.moveTo(edge*.79,stage*(.32+i*.16));c.lineTo(edge*.95,stage*(.36+i*.16));c.stroke()}
  const antennaX=edge*.5;c.strokeStyle='#28394f';c.lineWidth=4;c.beginPath();c.moveTo(antennaX,stage*.13);c.lineTo(antennaX,stage*.025);c.moveTo(antennaX-edge*.1,stage*.07);c.lineTo(antennaX+edge*.1,stage*.07);c.stroke();ellipse(antennaX,stage*.026,3,3,Math.sin(t*4)>0?'#ffdcb1':'#f68c92');
  box(edge*.09,stage*.065,edge*.2,stage*.05,'#cd6775','#392d48',3);c.fillStyle='#a5f4ef';c.fillRect(edge*.12,stage*.078,edge*.14,3);
  polygon([[edge*.7,ledge-8],[edge+w*.1,ledge-8],[edge+w*.12,ledge+5],[edge*.7,ledge+14]],'#a9bac9','#2a354d',3);
  polygon([[edge*.82,ledge+14],[edge+w*.07,ledge+12],[edge*.9,ledge+stage*.16]],'#536783','#2a354d',3);
  c.strokeStyle='#7ce9e8';c.lineWidth=3;c.beginPath();c.moveTo(edge*.72,ledge-3);c.lineTo(edge+w*.09,ledge-3);c.stroke();
  c.restore();
  for(let i=0;i<6;i++)cloud((i-.5)*w*.24+Math.sin(t*.12+i)*w*.02,stage*(.86+seed(i+50)*.16)-descent*stage*.12,Math.max(34,w*.13),'#c7deec');
  if(ch){const x=lerp(edge+w*.11,w*.63,descent),y=lerp(ledge-2,stage*1.13,fall*fall);actor(ch,x,y,size*(1-descent*.25),-.1+fall*1.3,1-ease((fall-.78)/.22))}
  for(let i=0;i<5;i++){const x=(i-.4)*w*.3+Math.sin(t*.15+i)*w*.025,y=stage*(1.12+seed(i+32)*.13)-descent*stage*.2,r=Math.max(36,w*.16);cloud(x,y,r,'#dfedf5');cloud(x-r*.13,y-r*.08,r*.65,'#edf7fb')}
  if(ch&&fall>.2&&fall<.9){c.strokeStyle='rgba(239,250,255,.35)';c.lineWidth=2;for(let i=0;i<5;i++){const x=w*(.55+i*.08),y=stage*((seed(i+10)+t*.3)%1);c.beginPath();c.moveTo(x,y);c.lineTo(x,y+stage*.055);c.stroke()}}
 }
 function kryos(w,h,stage,p,t,ch,size){
  gradient('#101e40','#315a70',w,h);const surface=stage*.81;
  c.globalAlpha=.24;c.strokeStyle='#77d6df';c.lineWidth=Math.max(10,stage*.08);c.beginPath();c.moveTo(-30,stage*.15);c.bezierCurveTo(w*.3,stage*.02,w*.65,stage*.3,w+30,stage*.08);c.stroke();c.globalAlpha=1;
  for(let i=0;i<6;i++){const x=(i-1)*w*.26,peak=stage*(.3+seed(i+22)*.16);polygon([[x-w*.2,surface],[x,peak],[x+w*.3,surface]],i%2?'#546d92':'#354e76','#263f65',2);polygon([[x-w*.048,peak+stage*.12],[x,peak],[x+w*.078,peak+stage*.16],[x+w*.01,peak+stage*.12]],'#bddeed',null)}
  const water=c.createLinearGradient(0,surface,0,h);water.addColorStop(0,'#1b738d');water.addColorStop(1,'#061e39');c.fillStyle=water;c.fillRect(0,surface,w,h-surface);
  const cliff=w*.25;polygon([[0,surface-stage*.25],[cliff,surface-stage*.25],[cliff+14,surface-stage*.2],[cliff-8,surface+stage*.1],[0,surface+stage*.18]],'#688fa8','#294a69',4);polygon([[0,surface-stage*.27],[cliff-6,surface-stage*.27],[cliff+17,surface-stage*.21],[cliff-18,surface-stage*.19],[0,surface-stage*.2]],'#def3f6','#78bcd1',3);
  for(let i=0;i<6;i++){const x=cliff*(i+.3)/6,y=surface-stage*.2;polygon([[x,y],[x+8,y],[x+4,y+stage*(.05+seed(i+66)*.09)]],'#b2e6ed','#689cb8',1.5)}
  const drop=unit((p-.15)/.35),impact=.5,x=lerp(cliff+size*15,w*.56,ease(drop)),waterline=surface;
  if(ch&&p<impact){const y=lerp(surface-stage*.39,waterline-size*9,drop*drop);actor(ch,x,y,size,drop*.7)}
  if(ch&&p>=impact&&p<.8){const sink=unit((p-impact)/.3);c.save();c.beginPath();c.rect(0,surface,w,h-surface);c.clip();actor(ch,w*.56,waterline+sink*size*70,size,.7+sink*.35,(1-sink)*.58);c.restore()}
  for(let i=0;i<6;i++){const y=surface+8+i*13;c.strokeStyle='rgba(138,223,236,'+(.3-i*.035)+')';c.lineWidth=1.6;c.beginPath();for(let x=0;x<=w;x+=10){const yy=y+Math.sin(x*.035+t*1.7+i)*3;x?c.lineTo(x,yy):c.moveTo(x,yy)}c.stroke()}
  if(ch&&p>=impact&&p<.77){const k=unit((p-impact)/.27),xx=w*.56;c.strokeStyle='rgba(191,249,255,'+(1-k)+')';c.lineWidth=3;for(let i=0;i<3;i++){c.beginPath();c.ellipse(xx,surface+3,(15+k*(85+i*22)),4+k*(10+i*2),0,0,Math.PI*2);c.stroke()}for(let i=0;i<10;i++){const a=-Math.PI*.85+i*Math.PI*.075,r=size*(12+seed(i+20)*27)*Math.sin(k*Math.PI);ellipse(xx+Math.cos(a)*r,surface+Math.sin(a)*r,2+seed(i+8)*3,3+seed(i+9)*4,'rgba(207,252,255,'+(1-k)+')')}}
  polygon([[0,h*.87],[w*.19,h*.82],[w*.33,h],[0,h]],'#b4d8e5','#4e86a0',3);polygon([[w*.78,h],[w*.88,h*.84],[w,h*.88],[w,h]],'#8dbccf','#37677f',3);
  for(let i=0;i<40;i++){const x=(seed(i+70)*w+t*(6+seed(i)*9))%w,y=(seed(i+190)*h+t*(5+seed(i+10)*9))%h;c.globalAlpha=.25+seed(i+44)*.6;ellipse(x,y,1.1+seed(i+1),1.1+seed(i+1),'#e5f9ff')}c.globalAlpha=1;
 }
 const scenes={nave:ship,nexus,kryos};
 function refresh(serverTime=null){
  const M=G.M,on=G.state==='meeting'&&M?.phase==='eject'&&!G.over;
  if(!on){if(current){document.body.classList.remove('mapEjectionActive');delete root.dataset.ejectionMap;canvas.hidden=true;current=null;lastSize=''}return}
  const map=scenes[ACTIVE_MAP_ID]?ACTIVE_MAP_ID:'nave',now=performance.now(),changed=!current||current.meeting!==M||current.map!==map||current.actorId!==(M.result?.eject?.id||null);
  if(changed){current={meeting:M,map,actorId:M.result?.eject?.id||null};anchorAt=now;anchorTime=M.t||0;lastPaint=-Infinity;document.body.classList.add('mapEjectionActive');root.dataset.ejectionMap=map;canvas.hidden=false}
  if(Number.isFinite(serverTime)){anchorAt=now;anchorTime=serverTime}
  const w=Math.max(1,innerWidth),h=Math.max(1,innerHeight),dpr=Math.min(2,devicePixelRatio||1),signature=[w,h,dpr].join(':');if(now-lastPaint<1000/30&&signature===lastSize)return;lastPaint=now;
  if(lastSize!==signature){lastSize=signature;canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr)}c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,w,h);
  const elapsed=NET.inRoom&&!NET.isHost?anchorTime+(now-anchorAt)/1000:M.t||0,progress=unit(elapsed/Math.max(.01,M.dur||5)),stage=Math.max(100,Math.min(h-70,panel.getBoundingClientRect().top-20)),size=clamp(Math.min(w/250,stage/220)*1.2,.55,2.6);
  // The shared meeting clock is now five seconds; time-driven scenery also runs at 2×.
  scenes[map](w,h,stage,progress,elapsed*2,M.result?.eject||null,size);
  const shade=c.createLinearGradient(0,Math.max(0,stage-20),0,h);shade.addColorStop(0,'rgba(2,7,20,0)');shade.addColorStop(1,'rgba(2,7,20,.7)');c.fillStyle=shade;c.fillRect(0,stage-20,w,h-stage+20);
 }
 const oldUpdate=update;update=function(dt){const r=oldUpdate(dt);refresh();return r};
 const oldApply=netApplySnapshot;netApplySnapshot=function(s,...args){const accepted=s&&(!Number.isFinite(+s.seq)||+s.seq>=NET.recvSeq),r=oldApply(s,...args);if(accepted)refresh(s?.state==='meeting'&&s.meeting?.phase==='eject'?Number(s.meeting.t):null);return r};
 return{refresh,canvas};
})();
