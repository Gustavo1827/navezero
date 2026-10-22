'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createGameServer,rooms}=require('../server');

function mockSupabase(){
  const accounts=new Map(),sessions=new Map();
  const json=(status,data)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
  return async function fetchImpl(input,init={}){
    const url=new URL(input);const table=url.pathname.split('/').pop();const method=String(init.method||'GET').toUpperCase();
    const body=init.body?JSON.parse(init.body):null;
    const eq=(name)=>{const raw=url.searchParams.get(name)||'';return raw.startsWith('eq.')?decodeURIComponent(raw.slice(3)):null};
    if(table==='nzo_accounts'){
      if(method==='GET'){
        const id=eq('id');const row=id?accounts.get(id):null;return json(200,row?[row]:[]);
      }
      if(method==='POST'){
        if(accounts.has(body.id))return json(409,{message:'duplicate key'});accounts.set(body.id,{...body});return json(201,[{...body}]);
      }
      if(method==='PATCH'){
        const id=eq('id'),prev=accounts.get(id);if(!prev)return json(200,[]);const row={...prev,...body};accounts.set(id,row);return json(200,[{...row}]);
      }
    }
    if(table==='nzo_sessions'){
      if(method==='GET'){
        const hash=eq('token_hash');const row=hash?sessions.get(hash):null;return json(200,row?[row]:[]);
      }
      if(method==='POST'){sessions.set(body.token_hash,{...body});return json(201,[{...body}]);}
      if(method==='DELETE'){
        const hash=eq('token_hash');if(hash)sessions.delete(hash);else{
          const lt=url.searchParams.get('expires_at');if(lt&&lt.startsWith('lt.')){const cutoff=new Date(decodeURIComponent(lt.slice(3))).getTime();for(const [k,v] of sessions)if(new Date(v.expires_at).getTime()<cutoff)sessions.delete(k)}
        }return new Response(null,{status:204});
      }
    }
    return json(404,{message:'not found'});
  };
}
async function start(){
  const app=createGameServer({port:0,host:'127.0.0.1',supabaseUrl:'http://127.0.0.1',supabaseSecretKey:'test-key',fetchImpl:mockSupabase()});
  await new Promise(resolve=>app.server.once('listening',resolve));
  return {app,base:`http://127.0.0.1:${app.server.address().port}`};
}
function cookiePair(response){return String(response.headers.get('set-cookie')||'').split(';')[0]}
async function close(app){await new Promise(resolve=>app.server.close(resolve));rooms.clear()}

test('contas opcionais usam Supabase, hash scrypt, sessão HttpOnly e isolamento de perfil',async t=>{
  const {app,base}=await start();t.after(async()=>{try{await close(app)}catch{}});
  const password='SenhaSegura-123!';
  const created=await fetch(base+'/api/account/create',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password,profile:{name:'Piloto',color:'verde',cosmetics:{hat:'antenna_lunar'},personalSettings:{volume:1.4,keys:{map:'KeyM'}},roomSettings:{mapId:'nexus',size:10,bots:3,cfg:{kill:40,speed:210}}}})});
  assert.equal(created.status,201);const createdBody=await created.json();assert.match(createdBody.account.id,/^[A-Za-z]+#[0-9]{4}$/);assert.equal(createdBody.account.profile.name,'Piloto');
  const cookie=cookiePair(created);assert.match(cookie,/^nz_session=/);assert.match(String(created.headers.get('set-cookie')),/HttpOnly/);assert.match(String(created.headers.get('set-cookie')),/SameSite=Strict/);
  const me=await fetch(base+'/api/account/me',{headers:{cookie}});assert.equal(me.status,200);assert.equal((await me.json()).account.id,createdBody.account.id);
  const unauthorized=await fetch(base+'/api/account/profile',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({profile:{name:'Intruso'}})});assert.equal(unauthorized.status,401);
  const updated=await fetch(base+'/api/account/profile',{method:'PATCH',headers:{'content-type':'application/json',cookie},body:JSON.stringify({profile:{name:'ContaNova',color:'azul',cosmetics:{hat:'none',pet:'drone_pingo'},personalSettings:{volume:.6,keys:{map:'KeyN',killMark:null}},roomSettings:{mapId:'nave',size:8,bots:2,cfg:{kill:20,actionDistance:2}}}})});
  assert.equal(updated.status,200);const updatedBody=await updated.json();assert.equal(updatedBody.account.profile.name,'ContaNova');assert.equal(updatedBody.account.profile.roomSettings.cfg.kill,20);
  const bad=await fetch(base+'/api/account/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:createdBody.account.id,password:'senha-errada'})});assert.equal(bad.status,401);assert.equal((await bad.json()).message,'ID ou senha incorretos.');
  const login=await fetch(base+'/api/account/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:createdBody.account.id,password})});assert.equal(login.status,200);const loginCookie=cookiePair(login);
  const logout=await fetch(base+'/api/account/logout',{method:'POST',headers:{'content-type':'application/json',cookie:loginCookie},body:'{}'});assert.equal(logout.status,200);
  const after=await fetch(base+'/api/account/me',{headers:{cookie:loginCookie}});assert.equal(after.status,401);
});
