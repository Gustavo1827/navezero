/* Backend-only REST transport and safe diagnostics. No SDK or billing operations. */
'use strict';
const BASE='https://generativelanguage.googleapis.com/v1beta/';
// Standard text generation has a free tier for these models.
// https://ai.google.dev/gemini-api/docs/pricing (checked 2026-11-10).
// Listing a model alone does not establish free-tier availability.
const FREE_LITE=['gemini-3.5-flash-lite','gemini-3.1-flash-lite','gemini-2.5-flash-lite'];
function wait(ms,signal){return new Promise((resolve,reject)=>{if(signal?.aborted)return reject(signal.reason);const finish=()=>{signal?.removeEventListener('abort',cancel);resolve()},timer=setTimeout(finish,ms),cancel=()=>{clearTimeout(timer);signal.removeEventListener('abort',cancel);reject(signal.reason)};signal?.addEventListener('abort',cancel,{once:true})})}
function create({fetchImpl=globalThis.fetch,key=()=>process.env.GEMINI_API_KEY,log=()=>{},preferred=process.env.BOT_IA_MODEL,clock=()=>Date.now(),retryWait=wait,random=Math.random,onAttempt=()=>{}}){
 let selected=null,expires=0,listing=null,warming=null,ready=false,available=[],fallbackNextAt=0;const excluded=new Set();
 const safe=value=>{let s=String(value||'');const secret=key();if(secret)s=s.split(secret).join('[redacted]');return s.replace(/AIza[\w-]+|https?:\/\/\S+|[\w.+-]+@[\w.-]+|[A-Za-z0-9_-]{48,}/g,'[redacted]').replace(/[\x00-\x1f]/g,' ').slice(0,700)};
 async function request(path,body,signal){const res=await fetchImpl(BASE+path,{method:body?'POST':'GET',headers:{'x-goog-api-key':key(),'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal});let data;try{data=await res.json()}catch{if(res.ok)throw Error('invalid_json');data={}}
  if(!res.ok){const e=data?.error||{};log('api_error',{http:Number(res.status),reason:({400:'invalid_request',401:'authentication',403:'permission_or_region',404:'model_unavailable',429:'quota',503:'unavailable'})[res.status]||'http_error',status:safe(e.status),message:safe(e.message).replace(/([\"'])([^\"']{80,})\1/g,'[redacted detail]'),fields:(e.details||[]).flatMap(d=>d.fieldViolations||[]).slice(0,5).map(f=>safe(f.field))});throw Error('http_'+Number(res.status))}return data;
 }
 async function withRetries(operation,kind,signal){for(let attempt=0;attempt<3;attempt++){signal?.throwIfAborted();try{const data=await operation(attempt);if(attempt)log('retry_succeeded',{operation:kind,attempts:attempt+1,model:selected});return data}catch(e){if(e.message!=='http_503')throw e;if(attempt===2){log('retry_exhausted',{operation:kind,attempts:3,model:selected});throw e}const waitMs=Math.round(1000*2**attempt*(.8+.4*random()));log('api_retry',{operation:kind,retry:attempt+1,waitMs,http:503});await retryWait(waitMs,signal)}}}
 async function model(signal){if(!key())throw Error('key_missing');if(selected&&clock()<expires)return selected;if(listing)return listing;listing=(async()=>{const models=[];let token='';for(let page=0;page<5;page++){const path='models?pageSize=100'+(token?'&pageToken='+encodeURIComponent(token):''),data=await withRetries(()=>request(path,null,signal),'models.list',signal);models.push(...(data.models||[]));token=data.nextPageToken||'';if(!token)break}const eligible=models.filter(m=>m.supportedGenerationMethods?.includes('generateContent')&&/^models\/gemini-[a-z0-9.-]+$/.test(m.name));available=eligible.map(m=>m.name);
   log('models_listed',{count:eligible.length,models:eligible.filter(m=>/flash-lite/.test(m.name)).map(m=>m.name).slice(0,12)});
   const requested=String(preferred||'').replace(/^models\//,'');let choice;if(requested){choice=eligible.find(m=>m.name==='models/'+requested&&!excluded.has(m.name));if(!choice){log('model_unavailable',{configured:safe(requested),reason:'not_listed_for_generateContent'});throw Error('model_not_listed')}}else{choice=eligible.filter(m=>FREE_LITE.includes(m.name.replace('models/',''))&&!excluded.has(m.name)).sort((a,b)=>{const rank=n=>{const i=FREE_LITE.indexOf(n.replace('models/',''));return i<0?99:i};return rank(a.name)-rank(b.name)})[0]}
   if(!choice)throw Error('no_compatible_lite_model');selected=choice.name;expires=clock()+600000;log('model_selected',{model:selected,method:'generateContent'});return selected})().finally(()=>listing=null);return listing;
 }
 async function generate(body,{signal,beforeAttempt=()=>true}={}){let name=await model(signal);return withRetries(async attempt=>{
  if(!beforeAttempt())throw Error('stale_request');
  // Only the last of the two retries may switch models. Keep it for ten minutes,
  // with at most one switch per thirty minutes; no cascading model roulette.
  const alternate=attempt===2&&clock()>=fallbackNextAt?FREE_LITE.map(n=>'models/'+n).find(n=>n!==name&&available.includes(n)&&!excluded.has(n)):null;
  const complete=await onAttempt({attempt,model:alternate||name,body});signal?.throwIfAborted();
  if(alternate){log('model_fallback',{from:name,model:alternate,reason:'repeated_503',forMs:600000});name=selected=alternate;expires=clock()+600000;fallbackNextAt=clock()+1800000}
  try{const data=await request(name+':generateContent',body,signal);if(typeof complete==='function')complete(data);return data}catch(e){if(e.message==='http_404'){excluded.add(name);selected=null;expires=0}throw e}
 },'generateContent',signal)}
 async function diagnose(){if(warming)return warming;warming=(async()=>{log('diagnostic_started',{keyConfigured:!!key(),version:'gemini-rest-2'});if(!key()){log('diagnostic_skipped',{reason:'key_missing'});return false}const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),12000);timer.unref?.();try{const data=await generate({contents:[{role:'user',parts:[{text:'Return only this JSON object: {"ok":true}'}]}],generationConfig:{maxOutputTokens:512,responseMimeType:'application/json'}},{signal:abort.signal});const raw=data.candidates?.[0]?.content?.parts?.filter(p=>!p.thought).map(p=>p.text||'').join('')||'';const answer=JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g,''));if(answer.ok!==true)throw Error('invalid_diagnostic_response');log('diagnostic_succeeded',{model:selected,parsed:true});return true}catch(e){log('diagnostic_failed',{reason:/^http_\d+$/.test(e.message)?e.message:e.name==='AbortError'?'timeout':'invalid_or_unavailable_response'});return false}finally{clearTimeout(timer);ready=true}})();return warming}
 return{generate,diagnose,get ready(){return ready},get selected(){return selected},safe};
}
module.exports={create};
