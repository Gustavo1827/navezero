'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8'),catalog=JSON.parse(fs.readFileSync(path.join(root,'languages.json'),'utf8'));
const langs=['pt-BR','pt-PT','es','en','ru','ja'];
function translator(lang){const ctx={I18N:catalog.strings,I18N_SOURCE_MAP:catalog.sourceMap,I18N_REVERSE_MAP:new Map(),I18N_TEMPLATE_MATCHERS:[],I18N_CATALOG_READY:true,USER_PREFS:{language:lang}};ctx.validGameLanguage=x=>x;ctx.t=(key,vars={})=>(catalog.strings[ctx.USER_PREFS.language][key]||key).replace(/\{(\w+)\}/g,(_,k)=>vars[k]??'');vm.createContext(ctx);vm.runInContext(html.slice(html.indexOf('function escRx('),html.indexOf('function i18nScopeRoot('))+'\nrebuildI18nReverse();',ctx);return ctx}
test('remaining catalog entries preserve every placeholder in all six languages',()=>{
 for(const [key,base] of Object.entries(catalog.strings['pt-BR']).filter(([k])=>k.startsWith('remaining.'))){const placeholders=x=>[...x.matchAll(/\{(\w+)\}/g)].map(m=>m[1]).sort();for(const lang of langs){const text=catalog.strings[lang][key];assert.ok(text,lang+' '+key);assert.deepEqual(placeholders(text),placeholders(base),lang+' '+key)}}
});
test('specific minigame templates win over generic category and value templates',()=>{
 const ctx=translator('en');assert.equal(ctx.translateRuntimeText('Atual: 35'),'Current: 35');assert.equal(ctx.translateRuntimeText('Receita: A3 · B2 · C4'),'Recipe: A3 · B2 · C4');assert.equal(ctx.translateRuntimeText('🧪 Amostra 2'),'🧪 Sample 2');assert.equal(ctx.translateRuntimeText('Etapa 2: Selagem'),'Stage 2: Sealing');assert.equal(ctx.translateRuntimeText('Canal 1: 50 · alvo 65'),'Channel 1: 50 · target 65');
});
test('already translated dynamic labels switch languages without changing numbers',()=>{
 const ctx=translator('ja');assert.equal(ctx.translateRuntimeText('Current: 35'),'現在: 35');ctx.USER_PREFS.language='pt-BR';assert.equal(ctx.translateRuntimeText('現在: 35'),'Atual: 35');
 for(const lang of langs){ctx.USER_PREFS.language=lang;assert.equal(ctx.translateRuntimeText('💻 Auditoria de registros'),catalog.strings[lang][catalog.sourceMap['💻 Auditoria de registros']])}
});
