/* Independent Kryos chambers share the exact Nexus entry/cleaning/exit engine. */
'use strict';
const DECONTAMINATION=(()=>{
 const defs=()=>MAP_LIBRARY[ACTIVE_MAP_ID].decons||[],get=id=>defs().find(d=>d.id===id),state=d=>(G.deconChambers||(G.deconChambers={}))[d.id]||((G.deconChambers[d.id])={phase:'idle',until:0,exitSide:null,entrySide:null});
 const inside=(ch,d)=>!!ch&&ch.x>=d.x*TILE&&ch.x<(d.x+d.w)*TILE&&ch.y+OFF_Y>=d.y*TILE&&ch.y+OFF_Y<(d.y+d.h)*TILE;
 const door=(d,side)=>doors.find(p=>p.id===(side==='w'?d.doorW:d.doorE));
 function apply(d,open){let settled=true;for(const side of ['w','e']){const p=door(d,side),close=side!==open;if(!p)continue;const occupied=G.chars.some(c=>c.alive&&!c.ghost&&!c.vent&&c.x+HALF_W>=p.x*TILE&&c.x-HALF_W<=(p.x+p.w)*TILE&&c.y+OFF_Y+HALF_H>=p.y*TILE&&c.y+OFF_Y-HALF_H<=(p.y+p.h)*TILE);if(close&&occupied){setDoorClosedById(p.id,false);settled=false}else setDoorClosedById(p.id,close)}return settled}
 const oldReady=deconButtonReady;deconButtonReady=function(ch,st){const d=get(st?.chamber);if(!d)return oldReady(ch,st);if(!ch?.alive||ch.vent||st.kind!=='decon'||state(d).phase!=='idle')return false;return st.inside?inside(ch,d)&&['w','e'].every(s=>door(d,s)?.closed):!inside(ch,d)};
 const oldUse=useDeconButton;useDeconButton=function(ch,st){const d=get(st?.chamber);if(!d)return oldUse(ch,st);if(!deconButtonReady(ch,st)||!canAccessStation(ch,st))return false;return beginDeconCycle(state(d),st.inside,st.side,side=>apply(d,side))};
 const oldUpdate=updateDecon;updateDecon=function(){oldUpdate();for(const d of defs())advanceDeconCycle(state(d),side=>apply(d,side),()=>{G.deconChambers[d.id]={phase:'idle',until:0,exitSide:null,entrySide:null};apply(d,null)})};
 const oldReset=resetDeconState;resetDeconState=function(){oldReset();G.deconChambers={};for(const d of defs()){state(d);apply(d,null)}};
 const oldNew=newGame;newGame=function(...a){G.deconChambers={};const r=oldNew(...a);for(const d of defs())state(d);return r};
 const oldCapture=netCaptureSnapshot;netCaptureSnapshot=function(){const s=oldCapture();if(defs().length)s.deconChambers=JSON.parse(JSON.stringify(G.deconChambers||{}));return s};
 const oldApply=netApplySnapshot;netApplySnapshot=function(s,...a){const valid=s&&(!Number.isFinite(+s.seq)||+s.seq>=NET.recvSeq),r=oldApply(s,...a);if(valid&&s.deconChambers)G.deconChambers=JSON.parse(JSON.stringify(s.deconChambers));return r};
 const oldNpc=npcHandleDeconWaypoint;npcHandleDeconWaypoint=function(ch,w){const p=deconDoorAtTile(Math.floor(w.x/TILE),Math.floor((w.y+OFF_Y)/TILE)),d=get(p?.chamber);if(!d||!p.closed)return oldNpc(ch,w);if(state(d).phase==='idle'){const side=p.id===d.doorW?'w':'e',st=stationById[d.id+'_'+side+(inside(ch,d)?'_in':'_out')];if(st)useDeconButton(ch,st)}ch.moving=false;ch.ai.stuck=0;ch.ai.wpT=0;return true};
 return{defs,state,inside};
})();
