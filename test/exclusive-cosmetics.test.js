'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createGameServer,rooms}=require('../server');

function mockSupabase(){
  const accounts=new Map(),sessions=new Map();
  const json=(status,data)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
  return async function fetchImpl(input,init={}){
    const url=new URL(input),table=url.pathname.split('/').pop(),method=String(init.method||'GET').toUpperCase(),body=init.body?JSON.parse(init.body):null;
    const eq=name=>{const raw=url.searchParams.get(name)||'';return raw.startsWith('eq.')?decodeURIComponent(raw.slice(3)):null};
    if(table==='nzo_accounts'){
      if(method==='GET'){const id=eq('id'),row=id?accounts.get(id):null;return json(200,row?[structuredClone(row)]:[])}
      if(method==='POST'){if(accounts.has(body.id))return json(409,{message:'duplicate key'});accounts.set(body.id,structuredClone(body));return json(201,[structuredClone(body)])}
      if(method==='PATCH'){const id=eq('id'),prev=accounts.get(id);if(!prev)return json(200,[]);const row={...prev,...structuredClone(body)};accounts.set(id,row);return json(200,[structuredClone(row)])}
    }
    if(table==='nzo_sessions'){
      if(method==='GET'){const hash=eq('token_hash'),row=hash?sessions.get(hash):null;return json(200,row?[structuredClone(row)]:[])}
      if(method==='POST'){sessions.set(body.token_hash,structuredClone(body));return json(201,[structuredClone(body)])}
      if(method==='DELETE'){const hash=eq('token_hash');if(hash)sessions.delete(hash);return new Response(null,{status:204})}
    }
    return json(404,{message:'not found'});
  };
}
const TEST_CODES={TESTCODE01:'carrinho_orbital_roupa',TESTCODE02:'mini_explorador_pet',TESTCODE03:'coroa_toxica_chapeu',TESTCODE04:'rubor_cosmico_rosto',TESTCODE05:'fios_rebeldes_chapeu',TESTCODE06:'visor_67_rosto'};
async function start(extra={}){const app=createGameServer({port:0,host:'127.0.0.1',supabaseUrl:'http://127.0.0.1',supabaseSecretKey:'test-key',fetchImpl:mockSupabase(),exclusiveRedeemCodes:JSON.stringify(TEST_CODES),...extra});await new Promise(resolve=>app.server.once('listening',resolve));return {app,base:`http://127.0.0.1:${app.server.address().port}`}}
function cookiePair(response){return String(response.headers.get('set-cookie')||'').split(';')[0]}
async function close(app){await new Promise(resolve=>app.server.close(resolve));rooms.clear()}
async function createAccount(base,name='Piloto',profileExtra={}){
  const preview=await (await fetch(base+'/api/account/id-preview')).json();
  const profile={name,color:'azul',cosmetics:{hat:'none',pet:'none',outfit:'none',visor:'none'},personalSettings:{volume:1,keys:{}},roomSettings:{mapId:'nave',size:10,bots:3,cfg:{}},...profileExtra};
  const res=await fetch(base+'/api/account/create',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:'SenhaSegura-123!',idPreviewToken:preview.token,profile})});
  assert.equal(res.status,201);return {cookie:cookiePair(res),body:await res.json()};
}

test('catálogo exclusivo mantém IDs estáveis, sem códigos públicos, e assets separados',()=>{
  const root=path.join(__dirname,'..'),cfg=JSON.parse(fs.readFileSync(path.join(root,'exclusive-cosmetics.json'),'utf8'));
  const expected=['carrinho_orbital_roupa','mini_explorador_pet','coroa_toxica_chapeu','rubor_cosmico_rosto','fios_rebeldes_chapeu','visor_67_rosto'];
  assert.deepEqual(cfg.cosmetics.map(x=>x.id),expected);
  assert.equal(Object.hasOwn(cfg,'codes'),false,'catálogo público não pode conter códigos de resgate');
  for(const item of cfg.cosmetics){assert.match(item.id,/^[a-z0-9_]+$/);assert.ok(fs.statSync(path.join(root,item.asset)).size>100,'asset vazio: '+item.asset)}
  const explosive=cfg.cosmetics.find(x=>x.id==='mini_explorador_pet');assert.equal(explosive.name,'O Explosivo','o ID do pet deve permanecer estável, mudando apenas o nome');
  const byId=new Map(cfg.cosmetics.map(item=>[item.id,item]));
  assert.deepEqual(byId.get('fios_rebeldes_chapeu').render,{x:0,y:-28,width:28,height:19},'Fios Rebeldes deve apoiar corretamente na cabeça');
  assert.deepEqual(byId.get('coroa_toxica_chapeu').render,{x:0,y:-31,width:38,height:31});
  assert.deepEqual(byId.get('rubor_cosmico_rosto').render,{x:0,y:-9,width:24,height:14});
  assert.deepEqual(byId.get('visor_67_rosto').render,{x:10,y:-13,width:22,height:14});
  assert.deepEqual(byId.get('carrinho_orbital_roupa').render,{x:-1,y:7,width:72,height:56});
  assert.deepEqual(byId.get('mini_explorador_pet').render,{x:0,y:0,width:22,height:30});
});

test('resgate é servidor-side, uma vez por conta, reutilizável em outra conta e não aceita falsificação',async t=>{
  const {app,base}=await start();t.after(async()=>{try{await close(app)}catch{}});
  const noAccount=await fetch(base+'/api/account/redeem',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code:'TESTCODE02'})});
  assert.equal(noAccount.status,401);

  const first=await createAccount(base,'Piloto',{cosmetics:{hat:'none',pet:'none',outfit:'carrinho_orbital_roupa',visor:'none'},exclusiveCosmetics:['carrinho_orbital_roupa'],redeemedExclusiveCodes:['TESTCODE01']});
  assert.deepEqual(first.body.account.profile.exclusiveCosmetics,[],'criação não pode forjar propriedade exclusiva');
  assert.equal(first.body.account.profile.cosmetics.outfit,'none','criação não pode equipar exclusivo não possuído');
  assert.equal(Object.hasOwn(first.body.account.profile,'redeemedExclusiveCodes'),false,'códigos resgatados não são enviados ao cliente');

  const catalogRes=await fetch(base+'/api/account/exclusive-catalog'),catalogText=await catalogRes.text();
  assert.equal(catalogRes.status,200);assert.doesNotMatch(catalogText,/TESTCODE01|TESTCODE02/,'endpoint público não expõe códigos');
  const rawConfig=await fetch(base+'/exclusive-cosmetics.json');assert.equal(rawConfig.status,404,'arquivo administrativo não deve ser servido pelo jogo');
  const assetRes=await fetch(base+'/assets/exclusive/mini_explorador_pet.png');assert.equal(assetRes.status,200);assert.equal(assetRes.headers.get('content-type'),'image/png');
  const invalid=await fetch(base+'/api/account/redeem',{method:'POST',headers:{'content-type':'application/json',cookie:first.cookie},body:JSON.stringify({code:'XXXXXXXXXX'})});
  assert.equal(invalid.status,400);assert.equal((await invalid.json()).message,'Código inválido.');

  const concurrent=await Promise.all([1,2].map(()=>fetch(base+'/api/account/redeem',{method:'POST',headers:{'content-type':'application/json',cookie:first.cookie},body:JSON.stringify({code:'TESTCODE02'})})));
  assert.deepEqual(concurrent.map(r=>r.status).sort((a,b)=>a-b),[200,409]);
  const success=concurrent.find(r=>r.status===200),again=concurrent.find(r=>r.status===409);
  const successBody=await success.json();assert.equal(successBody.message,'Cosmético desbloqueado!');assert.equal(successBody.cosmetic.id,'mini_explorador_pet');
  assert.equal((await again.json()).message,'Você já resgatou este código.');

  const me=await fetch(base+'/api/account/me',{headers:{cookie:first.cookie}}),meBody=await me.json();
  assert.deepEqual(meBody.account.profile.exclusiveCosmetics,['mini_explorador_pet']);assert.equal(Object.hasOwn(meBody.account.profile,'redeemedExclusiveCodes'),false);

  const forged=await fetch(base+'/api/account/profile',{method:'PATCH',headers:{'content-type':'application/json',cookie:first.cookie},body:JSON.stringify({profile:{name:'Piloto',color:'azul',cosmetics:{hat:'coroa_toxica_chapeu',pet:'mini_explorador_pet',outfit:'none',visor:'none'},exclusiveCosmetics:['coroa_toxica_chapeu'],redeemedExclusiveCodes:['TESTCODE03'],personalSettings:{volume:1,keys:{}},roomSettings:{mapId:'nave',size:10,bots:3,cfg:{}}}})});
  assert.equal(forged.status,200);const forgedBody=await forged.json();
  assert.deepEqual(forgedBody.account.profile.exclusiveCosmetics,['mini_explorador_pet']);
  assert.equal(forgedBody.account.profile.cosmetics.hat,'none');
  assert.equal(forgedBody.account.profile.cosmetics.pet,'mini_explorador_pet','exclusivo realmente obtido pode ser equipado');

  const second=await createAccount(base,'Outro');
  const sameGlobalCode=await fetch(base+'/api/account/redeem',{method:'POST',headers:{'content-type':'application/json',cookie:second.cookie},body:JSON.stringify({code:'TESTCODE02'})});
  assert.equal(sameGlobalCode.status,200,'o mesmo código pode ser usado por outra conta');
});

test('sistema de resgate recusa operar sem configuração privada',async t=>{
  const {app,base}=await start({exclusiveRedeemCodes:''});t.after(async()=>{try{await close(app)}catch{}});
  const res=await fetch(base+'/api/account/redeem',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code:'TESTCODE02'})});
  assert.equal(res.status,503);assert.equal((await res.json()).message,'Sistema de resgate indisponível.');
});

test('interface tem resgate, estrela exclusiva e pop-up com prévia',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  assert.match(html,/id="btnAccountRedeemShow"[^>]*>Resgatar código</);
  assert.match(html,/id="accountRedeemCode"[^>]*maxlength="10"[^>]*minlength="10"/);
  assert.match(html,/id="exclusiveUnlockOverlay"/);assert.match(html,/id="exclusiveUnlockPreview"/);assert.match(html,/Prévia no Tripulante de teste/);
  assert.match(html,/cosmeticExclusiveStar','★'/);assert.match(html,/item\.exclusive/);
  assert.match(html,/\/api\/account\/redeem/);assert.match(html,/Código inválido\./);assert.match(html,/showExclusiveUnlockPopup/);
});
