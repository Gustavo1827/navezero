'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),zlib=require('node:zlib');
const {createStaticSender}=require('../static-files');
test('arquivos compactados mantêm conteúdo, respeitam cache e atualizam após substituição',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nz-http-')),file=path.join(dir,'data.json'),text=JSON.stringify({text:'Nave Zero '.repeat(20000)});fs.writeFileSync(file,text);
 const send=createStaticSender(),server=http.createServer((req,res)=>void send(req,res,file,'application/json; charset=utf-8'));server.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 t.after(async()=>{await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true})});
 const request=(headers={},method='GET')=>new Promise((resolve,reject)=>{const req=http.request({host:'127.0.0.1',port:server.address().port,method,headers},res=>{const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}))});req.on('error',reject);req.end()});
 const identity=await request({'accept-encoding':'identity'});assert.equal(identity.body.toString(),text);assert.equal(identity.headers['content-encoding'],undefined);
 const br=await request({'accept-encoding':'br, gzip'});assert.equal(br.headers['content-encoding'],'br');assert.equal(zlib.brotliDecompressSync(br.body).toString(),text);assert.ok(br.body.length<identity.body.length/10);assert.equal(br.headers.vary,'Accept-Encoding');assert.equal(br.headers['cache-control'],'no-cache');
 const gz=await request({'accept-encoding':'br;q=0,gzip;q=1'});assert.equal(gz.headers['content-encoding'],'gzip');assert.equal(zlib.gunzipSync(gz.body).toString(),text);
 const plain=await request({'accept-encoding':'br;q=0,gzip;q=0'});assert.equal(plain.body.toString(),text);
 const head=await request({'accept-encoding':'br'},'HEAD');assert.equal(head.body.length,0);assert.equal(Number(head.headers['content-length']),br.body.length);
 const cached=await request({'accept-encoding':'br','if-none-match':br.headers.etag});assert.equal(cached.status,304);assert.equal(cached.body.length,0);
 const replacement=text.replace('Nave Zero','Nave Nova');fs.writeFileSync(file,replacement);fs.utimesSync(file,Date.now()/1000+2,Date.now()/1000+2);
 const updated=await request({'accept-encoding':'br','if-none-match':br.headers.etag});assert.equal(updated.status,200);assert.notEqual(updated.headers.etag,br.headers.etag);assert.equal(zlib.brotliDecompressSync(updated.body).toString(),replacement);
 fs.unlinkSync(file);assert.equal((await request()).status,404);
});
