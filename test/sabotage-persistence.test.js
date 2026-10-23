'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

test('luzes e comunicações permanecem até reparo explícito',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  assert.match(html,/Luzes e comunicações não expiram sozinhas/);
  assert.doesNotMatch(html,/S\.lights-=dt/);
  assert.doesNotMatch(html,/S\.comms-=dt/);
  assert.match(html,/function resolveSab\(type\)/);
  assert.match(html,/G\.sab\[type\]=0;G\.sab\.cd=CFG\.sab/);
});
