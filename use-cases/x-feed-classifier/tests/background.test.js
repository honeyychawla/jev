import test from 'node:test';
import assert from 'node:assert/strict';
import {fixtureResponse} from './helpers.js';
function store(){let d={};return {get:async keys=>Object.fromEntries((typeof keys==='string'?[keys]:keys).filter(k=>k in d).map(k=>[k,structuredClone(d[k])])),set:async v=>Object.assign(d,structuredClone(v)),remove:async keys=>{for(const k of typeof keys==='string'?[keys]:keys)delete d[k];},setAccessLevel:async()=>{}};}
const local=store(),session=store();let listener,installed,requests=0,mode='ok',active=0,maxActive=0,lastBody;
globalThis.chrome={storage:{local,session},runtime:{id:'testid',getURL:p=>'chrome-extension://testid/'+p,onMessage:{addListener:cb=>listener=cb},onInstalled:{addListener:cb=>installed=cb},onStartup:{addListener:()=>{}},openOptionsPage:async()=>{}},tabs:{query:async()=>[],sendMessage:async()=>{}},permissions:{contains:async()=>true}};
globalThis.fetch=async(url,init)=>{
 requests++;lastBody=JSON.parse(init.body);assert.equal(url,'https://openrouter.ai/api/v1/systemone');assert.equal(init.credentials,'omit');assert.equal(init.redirect,'error');assert.equal(lastBody.questions.decision.type,'choice');assert.equal(lastBody.model,'typesafe/jev-1.14');assert.equal(init.headers.Authorization,'Bearer sk-or-v1-fixture-secret');assert.ok(!JSON.stringify(lastBody).includes('sk-or-v1-fixture-secret'));
 if(mode==='error'||mode==='credits')return {ok:false,status:mode==='credits'?402:429,headers:new Headers({'retry-after':'60'})};
 if(mode==='envelope')return {ok:true,json:async()=>({error:{code:502,message:'upstream failure'}})};
 if(mode==='hold'){active++;maxActive=Math.max(maxActive,active);try{await new Promise((resolve,reject)=>{const done=setTimeout(resolve,100);init.signal.addEventListener('abort',()=>{clearTimeout(done);reject(new DOMException('Aborted','AbortError'));},{once:true});});}finally{active--;}}
 return {ok:true,json:async()=>fixtureResponse()};
};
await import('../background.js');
const own={id:'testid',url:'chrome-extension://testid/popup.html'},feed={id:'testid',url:'https://x.com/home',tab:{id:1}};
const message=(m,s=own)=>new Promise(resolve=>listener(m,s,resolve));
const p={text:'New AI tool release with a beginner tutorial.',url:'https://x.com/u/status/1'};
test('trusted boundaries, honest setup, Jev connection, cache, personalization and key lifecycle',async()=>{
 assert.equal((await message({type:'STATE'},{id:'other',url:'https://x.com/home'})).ok,false);
 assert.equal((await message({type:'CLASSIFY',post:p},{id:'testid',url:'https://x.com/messages'})).ok,false);
 for(const type of ['CONNECT','SETTINGS','PAUSE','DISCONNECT'])assert.equal((await message({type,key:'sk-or-v1-fixture-secret',settings:{}},feed)).ok,false);
 const missing=(await message({type:'CLASSIFY',post:p},feed)).result;assert.equal(missing.action,'unavailable');assert.equal(requests,0);
 await message({type:'SETTINGS',settings:{basicFallback:true}});assert.equal((await message({type:'CLASSIFY',post:p},feed)).result.source,'local');
 await message({type:'SETTINGS',settings:{basicFallback:false}});
 const rejected=await message({type:'CONNECT',key:'typesafe-direct-key'});assert.equal(rejected.ok,false);assert.match(rejected.error,/OpenRouter/);assert.equal(requests,0);
 assert.equal((await message({type:'CONNECT',key:'sk-or-v1-fixture-secret',remember:true})).ok,true);assert.equal(requests,1);
 const s=(await message({type:'STATE'})).result;assert.equal(s.rememberKey,true);assert.ok(!JSON.stringify(s).includes('sk-or-v1-fixture-secret'));
 assert.equal((await message({type:'CLASSIFY',post:p},feed)).result.source,'jev');assert.equal(requests,2);
 await message({type:'CLASSIFY',post:p},feed);assert.equal(requests,2);assert.equal((await message({type:'STATE'})).result.calls,1);
 await message({type:'FEEDBACK',post:p,action:'skip'},feed);assert.equal((await message({type:'CLASSIFY',post:p},feed)).result.source,'you');
 await message({type:'CLASSIFY',post:{...p,url:'https://x.com/u/status/2',text:p.text+' Another.'}},feed);assert.equal(lastBody.state.reader_corrections[0].decision,'skip');
 await message({type:'FEEDBACK',post:p,action:'reset'},feed);assert.equal((await message({type:'STATE'})).result.feedbackCount,0);
 await message({type:'SETTINGS',settings:{profile:'Explore AI tools for musicians.'}});await message({type:'CLASSIFY',post:p},feed);assert.equal(lastBody.state.reader_profile,'Explore AI tools for musicians.');
 await message({type:'DISCONNECT'});assert.equal((await message({type:'STATE'})).result.hasKey,false);assert.equal((await local.get('openRouterRememberedKey')).openRouterRememberedKey,undefined);
});
test('rate limits are explicit, suppress repeated requests, and optional fallback stays labeled',async()=>{
 mode='ok';await message({type:'CONNECT',key:'sk-or-v1-fixture-secret'});mode='error';
 const r=(await message({type:'CLASSIFY',post:{text:'AI test failing request'}})).result;assert.equal(r.action,'unavailable');assert.match(r.reasons[0],/limiting/);
 const n=requests;await message({type:'CLASSIFY',post:{text:'AI second failure'}});assert.equal(requests,n);
 await message({type:'SETTINGS',settings:{basicFallback:true}});const fallback=(await message({type:'CLASSIFY',post:p})).result;assert.equal(fallback.source,'local');assert.equal(fallback.confidence,null);assert.equal(fallback.fallback,true);
 await message({type:'RETRY'});assert.equal((await message({type:'STATE'})).result.cooldown,0);mode='ok';await message({type:'SETTINGS',settings:{basicFallback:false}});
});
test('concurrent requests are capped, deduplicated, and pause cancels work promptly',async()=>{
 await message({type:'CONNECT',key:'sk-or-v1-fixture-secret'});mode='hold';maxActive=0;
 const before=requests,shared={text:'AI unique shared test'};
 await Promise.all([message({type:'CLASSIFY',post:shared}),message({type:'CLASSIFY',post:shared})]);assert.equal(requests,before+1);
 const pending=Array.from({length:5},(_,i)=>message({type:'CLASSIFY',post:{text:'New AI tool '+i}}));
 await new Promise(r=>setTimeout(r,20));const start=Date.now();await message({type:'PAUSE'});assert.ok(Date.now()-start<80,'Pause must not wait behind API requests');
 const responses=await Promise.all(pending);assert.ok(responses.every(r=>r.result.paused));assert.ok(maxActive<=2);assert.equal((await message({type:'STATE'})).result.settings.enabled,false);
 mode='ok';await message({type:'PAUSE'});
});
test('session budget is enforced and reset restores checks',async()=>{
 await session.set({calls:200});const n=requests;
 const r=(await message({type:'CLASSIFY',post:{text:'AI budget limit example'}})).result;assert.equal(r.action,'unavailable');assert.match(r.reasons[0],/limit/);assert.equal(requests,n);
 await message({type:'RESET_USAGE'});assert.equal((await message({type:'STATE'})).result.calls,0);assert.equal((await message({type:'CLASSIFY',post:{text:'AI budget limit example'}})).result.source,'jev');
});

test('upgrade isolates providers and preserves OpenRouter keys and user preferences',async()=>{
 await local.set({rememberedKey:'legacy-typesafe-key',openRouterRememberedKey:'sk-or-v1-fixture-secret',settings:{profile:'AI for musicians',mode:'dim'}});
 await session.set({apiKey:'legacy-typesafe-key',openRouterApiKey:'sk-or-v1-fixture-secret'});
 await installed();
 assert.equal((await local.get('rememberedKey')).rememberedKey,undefined);assert.equal((await session.get('apiKey')).apiKey,undefined);
 const s=(await message({type:'STATE'})).result;assert.equal(s.hasKey,true);assert.equal(s.settings.profile,'AI for musicians');assert.equal(s.settings.mode,'dim');
 await message({type:'DISCONNECT'});assert.equal((await message({type:'STATE'})).result.hasKey,false);
});

test('OpenRouter credit and error-envelope failures never save a connection',async()=>{
 const before=requests;mode='credits';const credits=await message({type:'CONNECT',key:'sk-or-v1-fixture-secret'});assert.equal(credits.ok,false);assert.match(credits.error,/OpenRouter.*credits/);assert.equal((await message({type:'STATE'})).result.hasKey,false);
 mode='envelope';const failure=await message({type:'CONNECT',key:'sk-or-v1-fixture-secret'});assert.equal(failure.ok,false);assert.match(failure.error,/OpenRouter could not complete/);assert.equal((await message({type:'STATE'})).result.hasKey,false);assert.equal(requests,before+2);mode='ok';
});
