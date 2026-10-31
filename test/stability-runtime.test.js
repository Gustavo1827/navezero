'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
function run(name,context){const start=html.indexOf('function '+name+'('),end=html.indexOf('\nfunction ',start+1);return vm.runInNewContext(html.slice(start,end)+'\n'+name+';',context)}
test('fake station actions still translate when no pending task exists',()=>{
 const context={FIX_KEYS:[],G:{role:'imp',player:{alive:true,id:'p'}},pendingAt:()=>null,FAKE_GAME:{station:{game:'wires'}},TOOLS:{},t:key=>key};
 const action=run('actionFor',context)({id:'station'});
 assert.equal(action.fake,undefined);assert.equal(action.task.fake,true);assert.equal(action.label,'task.fakeAction');
});
test('all active sabotages render their status without shadowing translation',()=>{
 const bar={};const G={sab:{reactor:12,lights:1,comms:1,doors:4},state:'playing'};
 const update=run('updateSabUI',{G,$:()=>bar,t:key=>key});update();
 for(const type of ['reactor','lights','comms','doors'])assert.ok(bar.innerHTML.includes('sabotage.bar.'+type));
 G.sab={};update();assert.equal(bar.hidden,true);
});
test('sabotage panel builds four working actions and respects cooldown',()=>{
 const nodes={mbody:{children:[],appendChild(n){this.children.push(n)}}};let chosen;
 const G={sab:{cd:0},player:{}};
 const context={G,$:id=>nodes[id],showModal:()=>{},t:key=>key,closeModal:()=>{},Snd:{err:()=>{}},startSabotage:type=>{chosen=type;return true},el:(tag,cls,text)=>({text,style:{},children:[],appendChild(n){this.children.push(n)},addEventListener(_,fn){this.click=fn}})};
 const open=run('openSabPanel',context);open();const buttons=nodes.mbody.children[0].children;
 assert.equal(buttons.length,4);
 for(const [i,type] of ['lights','reactor','comms','doors'].entries()){assert.equal(buttons[i].disabled,false);buttons[i].click();assert.equal(chosen,type)}
 nodes.mbody.children=[];G.sab.cd=5;open();assert.ok(nodes.mbody.children[0].children.every(b=>b.disabled));
});
test('stale vent panels recover and invalid vent routes are refused',()=>{
 const panel={hidden:false,classList:{toggle(){}}};const player={vent:'removed',ventAnim:{kind:'in'}};let recovered=false;
 run('refreshVentPanel',{isMinerHoleId:()=>false,G:{player},$:()=>panel,ventById:{},VENT_ADJ:{},exitVent:p=>{recovered=true;p.vent=null}})();
 assert.equal(recovered,true);assert.equal(player.ventAnim,null);assert.equal(player.vent,null);
 run('refreshVentPanel',{G:{player},$:()=>panel})();assert.equal(panel.hidden,true);
 const move=run('ventMove',{isMinerHoleId:()=>false,ventById:{destination:{}},VENT_ADJ:{}});
 assert.equal(move({vent:'removed',ventMv:0},'destination'),false);
});

function minerHarness(){
 const actor={id:'owner',alive:true,role:'imp',function:'miner',x:0,y:0},other={id:'other',alive:true,role:'imp',function:'miner',x:0,y:0};
 const G={state:'playing',over:false,chars:[actor,other],gt:0,minerHoles:[]},CFG={minerHoles:5,minerCooldown:5};
 const context={G,CFG,NET:{inRoom:false},OFF_Y:6,roomAtPx:()=>({id:'room'}),boxBlocked:()=>false,dist:(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),actionDistancePx:()=>100,nearestWalkablePosition:(x,y)=>({x,y})};
 const start=html.indexOf('function isMinerHoleId('),end=html.indexOf('\nfunction morphLook(',start);
 vm.runInNewContext(html.slice(start,end),context);return {context,G,CFG,actor,other};
}
test('Minerador conclui escavação em 1 segundo e respeita limite ou infinito',()=>{
 const {context:c,G,CFG,actor}=minerHarness();
 assert.equal(c.beginMinerDig(actor),true);c.updateMinerDigs(.5);assert.equal(G.minerHoles.length,0);c.updateMinerDigs(.5);assert.equal(G.minerHoles.length,1);assert.equal(actor.minerDig,null);assert.equal(actor.minerCd,5);assert.equal(c.beginMinerDig(actor),false);
 for(let i=1;i<5;i++){actor.x=i*60;c.updateMinerDigs(5);assert.equal(c.beginMinerDig(actor),true);c.updateMinerDigs(1)}
 actor.x=360;assert.equal(c.beginMinerDig(actor),false);assert.equal(G.minerHoles.length,5);
 CFG.minerHoles=16;c.updateMinerDigs(5);assert.equal(c.beginMinerDig(actor),true);c.updateMinerDigs(1);assert.equal(G.minerHoles.length,6);
});
test('Minerador recusa buracos alheios e conexões com dutos normais',()=>{
 const {context:c,G,actor,other}=minerHarness();c.beginMinerDig(actor);c.updateMinerDigs(1);const first=G.minerHoles[0];
 assert.equal(c.minerEnter(other,first.id),false);assert.equal(c.minerEnter(actor,first.id),true);actor.ventAnim=null;
 assert.equal(c.minerTravel(actor,first.id),false);assert.equal(c.minerTravel(actor,'v_cafe'),false);c.minerExit(actor);actor.ventAnim=null;actor.ventCd=0;
 actor.x=60;c.updateMinerDigs(5);c.beginMinerDig(actor);c.updateMinerDigs(1);other.x=120;c.beginMinerDig(other);c.updateMinerDigs(1);actor.x=first.x;
 assert.equal(c.minerEnter(actor,first.id),true);actor.ventAnim=null;
 assert.equal(c.minerTravel(actor,G.minerHoles[2].id),false);assert.equal(c.minerTravel(actor,G.minerHoles[1].id),true);assert.equal(actor.x,60);
 const count=G.minerHoles.length;G.M={};c.updateMinerDigs(0);assert.equal(actor.vent,null);assert.equal(G.minerHoles.length,count);
});
