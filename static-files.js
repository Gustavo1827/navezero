'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),zlib=require('node:zlib'),{promisify}=require('node:util');
const gzip=promisify(zlib.gzip),brotli=promisify(zlib.brotliCompress);
function createStaticSender(){
 const cache=new Map();
 async function read(file){
  const stat=await fs.promises.stat(file),signature=stat.mtimeMs+':'+stat.ctimeMs+':'+stat.size,old=cache.get(file);
  if(old?.signature===signature){cache.delete(file);cache.set(file,old);return old.promise}
  const promise=(async()=>{const data=await fs.promises.readFile(file),[gz,br]=await Promise.all([gzip(data,{level:6}),brotli(data,{params:{[zlib.constants.BROTLI_PARAM_QUALITY]:5,[zlib.constants.BROTLI_PARAM_MODE]:zlib.constants.BROTLI_MODE_TEXT}})]),variants={identity:data,gzip:gz,br};return Object.fromEntries(Object.entries(variants).map(([name,body])=>[name,{body,etag:'"'+crypto.createHash('sha256').update(body).digest('hex').slice(0,24)+'"'}]))})();
  cache.set(file,{signature,promise});if(cache.size>32)cache.delete(cache.keys().next().value);
  try{return await promise}catch(error){if(cache.get(file)?.promise===promise)cache.delete(file);throw error}
 }
 return async function send(req,res,file,type,missingStatus=404){
  try{
   const variants=await read(file),quality=new Map();
   for(const part of String(req.headers['accept-encoding']||'').toLowerCase().split(',')){const [name,...params]=part.trim().split(';');if(!name)continue;const q=params.find(p=>p.trim().startsWith('q=')),number=q===undefined?1:Number(q.trim().slice(2));quality.set(name,Number.isFinite(number)?Math.max(0,Math.min(1,number)):0)}
   const br=quality.get('br')??quality.get('*')??0,gz=quality.get('gzip')??quality.get('*')??0,encoding=br>0&&br>=gz?'br':gz>0?'gzip':'identity',variant=variants[encoding];
   const headers={'content-type':type,'cache-control':'no-cache',vary:'Accept-Encoding',etag:variant.etag};if(encoding!=='identity')headers['content-encoding']=encoding;
   const tags=String(req.headers['if-none-match']||'').split(',').map(t=>t.trim().replace(/^W\//,''));
   if((req.method==='GET'||req.method==='HEAD')&&(tags.includes(variant.etag)||tags.includes('*'))){res.writeHead(304,headers);res.end();return}
   headers['content-length']=variant.body.length;res.writeHead(200,headers);res.end(req.method==='HEAD'?undefined:variant.body);
  }catch(error){if(res.headersSent)return;res.writeHead(missingStatus,{'content-type':'text/plain; charset=utf-8','cache-control':'no-cache'});res.end(missingStatus===404?'Não encontrado':'Arquivo indisponível')}
 };
}
module.exports={createStaticSender};
