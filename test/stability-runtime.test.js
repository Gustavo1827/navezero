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
 const panel={hidden:false};const player={vent:'removed',ventAnim:{kind:'in'}};let recovered=false;
 run('refreshVentPanel',{G:{player},$:()=>panel,ventById:{},VENT_ADJ:{},exitVent:p=>{recovered=true;p.vent=null}})();
 assert.equal(recovered,true);assert.equal(player.ventAnim,null);assert.equal(player.vent,null);
 run('refreshVentPanel',{G:{player},$:()=>panel})();assert.equal(panel.hidden,true);
 const move=run('ventMove',{ventById:{destination:{}},VENT_ADJ:{}});
 assert.equal(move({vent:'removed',ventMv:0},'destination'),false);
});
