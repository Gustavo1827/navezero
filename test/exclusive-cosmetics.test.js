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
async function start(){const app=createGameServer({port:0,host:'127.0.0.1',supabaseUrl:'http://127.0.0.1',supabaseSecretKey:'test-key',fetchImpl:mockSupabase()});await new Promise(resolve=>app.server.once('listening',resolve));return {app,base:`http://127.0.0.1:${app.server.address().port}`}}
function cookiePair(response){return String(response.headers.get('set-cookie')||'').split(';')[0]}
async function close(app){await new Promise(resolve=>app.server.close(resolve));rooms.clear()}
async function createAccount(base,name='Piloto',profileExtra={}){
  const preview=await (await fetch(base+'/api/account/id-preview')).json();
  const profile={name,color:'azul',cosmetics:{hat:'none',pet:'none',outfit:'none',visor:'none'},personalSettings:{volume:1,keys:{}},roomSettings:{mapId:'nave',size:10,bots:3,cfg:{}},...profileExtra};
  const res=await fetch(base+'/api/account/create',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:'SenhaSegura-123!',idPreviewToken:preview.token,profile})});
  assert.equal(res.status,201);return {cookie:cookiePair(res),body:await res.json()};
}

test('catálogo exclusivo mantém IDs/códigos estáveis e assets separados',()=>{
  const root=path.join(__dirname,'..'),cfg=JSON.parse(fs.readFileSync(path.join(root,'exclusive-cosmetics.json'),'utf8'));
  const expected=[
    ['carrinho_orbital_roupa','A8b9Ak29Gd'],['mini_explorador_pet','N7x2Pq8Lm4'],['coroa_toxica_chapeu','Z3m8Vt1Qa6'],
    ['rubor_cosmico_rosto','K9r2Nx7Bc5'],['fios_rebeldes_chapeu','P4d8Hs2Wq9'],['visor_67_rosto','T6y1Lf8Za3']
  ];
  assert.deepEqual(cfg.cosmetics.map(x=>x.id),expected.map(x=>x[0]));
  assert.deepEqual(cfg.codes.map(x=>[x.cosmeticId,x.code]),expected);
  for(const item of cfg.cosmetics){assert.match(item.id,/^[a-z0-9_]+$/);assert.ok(fs.statSync(path.join(root,item.asset)).size>100,'asset vazio: '+item.asset)}
  for(const item of cfg.codes)assert.match(item.code,/^[A-Za-z0-9]{10}$/);
  const explosive=cfg.cosmetics.find(x=>x.id==='mini_explorador_pet');
  assert.equal(explosive.name,'O Explosivo','o ID do pet deve permanecer estável, mudando apenas o nome');
  assert.equal(cfg.codes.find(x=>x.cosmeticId==='mini_explorador_pet').code,'N7x2Pq8Lm4');
});

test('resgate é servidor-side, uma vez por conta, reutilizável em outra conta e não aceita falsificação',async t=>{
  const {app,base}=await start();t.after(async()=>{try{await close(app)}catch{}});
  const noAccount=await fetch(base+'/api/account/redeem',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code:'N7x2Pq8Lm4'})});
  assert.equal(noAccount.status,401);

  const first=await createAccount(base,'Piloto',{cosmetics:{hat:'none',pet:'none',outfit:'carrinho_orbital_roupa',visor:'none'},exclusiveCosmetics:['carrinho_orbital_roupa'],redeemedExclusiveCodes:['A8b9Ak29Gd']});
  assert.deepEqual(first.body.account.profile.exclusiveCosmetics,[],'criação não pode forjar propriedade exclusiva');
  assert.equal(first.body.account.profile.cosmetics.outfit,'none','criação não pode equipar exclusivo não possuído');
  assert.equal(Object.hasOwn(first.body.account.profile,'redeemedExclusiveCodes'),false,'códigos resgatados não são enviados ao cliente');

  const catalogRes=await fetch(base+'/api/account/exclusive-catalog'),catalogText=await catalogRes.text();
  assert.equal(catalogRes.status,200);assert.doesNotMatch(catalogText,/A8b9Ak29Gd|N7x2Pq8Lm4/,'endpoint público não expõe códigos');
  const rawConfig=await fetch(base+'/exclusive-cosmetics.json');assert.equal(rawConfig.status,404,'arquivo administrativo não deve ser servido pelo jogo');
  const assetRes=await fetch(base+'/assets/exclusive/mini_explorador_pet.png');assert.equal(assetRes.status,200);assert.equal(assetRes.headers.get('content-type'),'image/png');
  const invalid=await fetch(base+'/api/account/redeem',{method:'POST',headers:{'content-type':'application/json',cookie:first.cookie},body:JSON.stringify({code:'XXXXXXXXXX'})});
  assert.equal(invalid.status,400);assert.equal((await invalid.json()).message,'Código inválido.');

  const concurrent=await Promise.all([1,2].map(()=>fetch(base+'/api/account/redeem',{method:'POST',headers:{'content-type':'application/json',cookie:first.cookie},body:JSON.stringify({code:'N7x2Pq8Lm4'})})));
  assert.deepEqual(concurrent.map(r=>r.status).sort((a,b)=>a-b),[200,409]);
  const success=concurrent.find(r=>r.status===200),again=concurrent.find(r=>r.status===409);
  const successBody=await success.json();assert.equal(successBody.message,'Cosmético desbloqueado!');assert.equal(successBody.cosmetic.id,'mini_explorador_pet');
  assert.equal((await again.json()).message,'Você já resgatou este código.');

  const me=await fetch(base+'/api/account/me',{headers:{cookie:first.cookie}}),meBody=await me.json();
  assert.deepEqual(meBody.account.profile.exclusiveCosmetics,['mini_explorador_pet']);assert.equal(Object.hasOwn(meBody.account.profile,'redeemedExclusiveCodes'),false);

  const forged=await fetch(base+'/api/account/profile',{method:'PATCH',headers:{'content-type':'application/json',cookie:first.cookie},body:JSON.stringify({profile:{name:'Piloto',color:'azul',cosmetics:{hat:'coroa_toxica_chapeu',pet:'mini_explorador_pet',outfit:'none',visor:'none'},exclusiveCosmetics:['coroa_toxica_chapeu'],redeemedExclusiveCodes:['Z3m8Vt1Qa6'],personalSettings:{volume:1,keys:{}},roomSettings:{mapId:'nave',size:10,bots:3,cfg:{}}}})});
  assert.equal(forged.status,200);const forgedBody=await forged.json();
  assert.deepEqual(forgedBody.account.profile.exclusiveCosmetics,['mini_explorador_pet']);
  assert.equal(forgedBody.account.profile.cosmetics.hat,'none');
  assert.equal(forgedBody.account.profile.cosmetics.pet,'mini_explorador_pet','exclusivo realmente obtido pode ser equipado');

  const second=await createAccount(base,'Outro');
  const sameGlobalCode=await fetch(base+'/api/account/redeem',{method:'POST',headers:{'content-type':'application/json',cookie:second.cookie},body:JSON.stringify({code:'N7x2Pq8Lm4'})});
  assert.equal(sameGlobalCode.status,200,'o mesmo código pode ser usado por outra conta');
});

test('interface tem resgate, estrela exclusiva e pop-up com prévia',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  assert.match(html,/id="btnAccountRedeemShow"[^>]*>Resgatar código</);
  assert.match(html,/id="accountRedeemCode"[^>]*maxlength="10"[^>]*minlength="10"/);
  assert.match(html,/id="exclusiveUnlockOverlay"/);assert.match(html,/id="exclusiveUnlockPreview"/);assert.match(html,/Prévia no Tripulante de teste/);
  assert.match(html,/cosmeticExclusiveStar','★'/);assert.match(html,/item\.exclusive/);
  assert.match(html,/\/api\/account\/redeem/);assert.match(html,/Código inválido\./);assert.match(html,/showExclusiveUnlockPopup/);
});
