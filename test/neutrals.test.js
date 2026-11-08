'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {cleanSettings}=require('../server');
const source=fs.readFileSync(path.join(__dirname,'../assets/neutrals.js'),'utf8');
test('Neutros respeitam um terço, não substituem Infiltrados e sempre possuem função',()=>{
 const assign=source.match(/ function assign\(\)\{[\s\S]*?\n \}/)[0];
 for(const total of [4,6,9,15]){const G={freePlay:false,chars:Array.from({length:total},(_,id)=>({id,role:id===0?'imp':'crew',function:null}))};G.player=G.chars[1];let classic=true;
  const context={G,roles:[{id:'jester',maxKey:'jesterMax',chanceKey:'jesterChance'}],CFG:{neutrals:5,jesterMax:5,jesterChance:100},classic:()=>classic,shuffle:x=>x};vm.runInNewContext(assign,context);context.assign();assert.equal(G.chars.filter(c=>c.role==='imp').length,1);assert.equal(G.chars.filter(c=>c.role==='neutral').length,Math.floor(total/3));assert.ok(G.chars.filter(c=>c.role==='neutral').every(c=>c.function==='jester'));
  for(const c of G.chars)if(c.role==='neutral'){c.role='crew';c.function=null}context.CFG.jesterChance=0;context.assign();assert.ok(!G.chars.some(c=>c.role==='neutral'));context.CFG.jesterChance=100;classic=false;context.assign();assert.ok(!G.chars.some(c=>c.role==='neutral'),'isolado do Esconde-Esconde');
 }
});
test('servidor limita configurações neutras e mantém chances independentes',()=>{
 for(const total of [4,6,9,15]){const cfg=cleanSettings({neutrals:99,jesterMax:99,jesterChance:100,impostors:1},total);assert.equal(cfg.neutrals,Math.floor(total/3));assert.equal(cfg.jesterMax,cfg.neutrals);assert.equal(cfg.impostors,1);assert.equal(cfg.jesterChance,100)}assert.equal(cleanSettings({neutrals:3,jesterMax:1},9).jesterMax,3);assert.equal(cleanSettings({neutrals:0,jesterMax:5}).jesterMax,0);
});

test('Hora dos Neutros copia Todos ajudam e muda apenas os parâmetros das funções neutras',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 const a=html.indexOf('const CFG_DEF='),b=html.indexOf('\n',a),defs=vm.runInNewContext('('+html.slice(a+'const CFG_DEF='.length,b).replace(/;$/,'')+')');
 const base={...defs,neutrals:0,jesterMax:5,jesterChance:100};
 const wrapper=source.match(/ const oldPreset=presetConfig;presetConfig=function\(id\)\{[\s\S]*?\n \};/)[0];
 for(const quantity of [1,2,3,5]){
  const roles=[{id:'jester',maxKey:'jesterMax',chanceKey:'jesterChance'}],context={roles,limit:()=>quantity,presetConfig:id=>({...base,locChance:id==='help'?100:0})};vm.runInNewContext(wrapper,context);
  for(const id of ['basic','chaos','help','infiltrados','dead']){const other=context.presetConfig(id);assert.equal(other.neutrals,0);assert.equal(other.jesterMax,0);assert.equal(other.jesterChance,0)}
  const help=context.presetConfig('help'),preset=context.presetConfig('neutrals');
  assert.equal(preset.neutrals,quantity);assert.equal(preset.jesterMax,quantity);assert.equal(preset.jesterChance,100);
  for(const key of Object.keys(help))if(!['neutrals','jesterMax','jesterChance'].includes(key))assert.equal(preset[key],help[key],key);
 }
});

test('funções neutras registradas dividem as vagas respeitando chance e máximo',()=>{
 const assign=source.match(/ function assign\(\)\{[\s\S]*?\n \}/)[0],G={freePlay:false,chars:Array.from({length:15},(_,id)=>({id,role:id===0?'imp':'crew',function:null}))};G.player=G.chars[1];
 const roles=[{id:'jester',maxKey:'jesterMax',chanceKey:'jesterChance'},{id:'future',maxKey:'futureMax',chanceKey:'futureChance'}],context={G,roles,CFG:{neutrals:5,jesterMax:2,jesterChance:100,futureMax:3,futureChance:100},classic:()=>true,shuffle:x=>x};vm.runInNewContext(assign,context);context.assign();
 assert.equal(G.chars.filter(c=>c.function==='jester').length,2);assert.equal(G.chars.filter(c=>c.function==='future').length,3);assert.equal(G.chars.filter(c=>c.role==='imp').length,1);
});


test('a soma das vagas neutras nunca fica abaixo da quantidade configurada',()=>{
 const helper=source.match(/ function ensureCapacity\(config=CFG\)\{[\s\S]*?\n \}/)[0],roles=[{maxKey:'jesterMax'},{maxKey:'secondMax'},{maxKey:'thirdMax'},{maxKey:'offMax'}],context={roles};vm.runInNewContext(helper,context);
 const mixed={neutrals:5,jesterMax:1,secondMax:2,thirdMax:3,offMax:0};context.ensureCapacity(mixed);assert.deepEqual(mixed,{neutrals:5,jesterMax:1,secondMax:2,thirdMax:3,offMax:0});
 const insufficient={neutrals:5,jesterMax:1,secondMax:1,thirdMax:0,offMax:0};context.ensureCapacity(insufficient);assert.equal(insufficient.jesterMax+insufficient.secondMax,5);assert.equal(insufficient.thirdMax,0);assert.equal(insufficient.offMax,0);
 const only={neutrals:5,jesterMax:0};const single={roles:[roles[0]]};vm.runInNewContext(helper,single);single.ensureCapacity(only);assert.equal(only.jesterMax,5);
});
