'use strict';
const {create}=require('../gemini-api');
const api=create({log:(event,fields)=>console.log('[BOT-IA] '+JSON.stringify({event,...fields}))});
api.diagnose().then(ok=>{process.exitCode=ok?0:1}).catch(()=>{console.log('[BOT-IA] {"event":"diagnostic_failed","reason":"unexpected_error"}');process.exitCode=1});
