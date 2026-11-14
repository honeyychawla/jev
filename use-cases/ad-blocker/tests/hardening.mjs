import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile, writeFile, cp, mkdtemp, rm, mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';
const fixture=await readFile('tests/fixture.html');
const server=createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html'});res.end(fixture);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${server.address().port}`;
const root=await mkdtemp(join(tmpdir(),'jev-hardening-'));
const extension=join(root,'extension');await cp('dist',extension,{recursive:true});
const manifest=JSON.parse(await readFile(join(extension,'manifest.json'),'utf8'));
manifest.host_permissions.push('*://127.0.0.1/*','*://localhost/*');
await writeFile(join(extension,'manifest.json'),JSON.stringify(manifest));
let context;const results=[];
try{
 context=await chromium.launchPersistentContext(join(root,'profile'),{channel:'chromium',executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,headless:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
 const sw=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
 const id=new URL(sw.url()).host;
 await sw.evaluate(()=>{
  globalThis.calls=[];globalThis.delay=0;
  globalThis.fetch=async(url,options={})=>{
   if(String(url)==='https://openrouter.ai/api/v1/key')return new Response(JSON.stringify({data:{label:'test'}}));
   if(String(url)!=='https://openrouter.ai/api/alpha/decisions')throw new Error('Unexpected request');
   const body=JSON.parse(options.body);globalThis.calls.push(body);
   if(globalThis.delay)await new Promise((resolve,reject)=>{const t=setTimeout(resolve,globalThis.delay);options.signal.addEventListener('abort',()=>{clearTimeout(t);reject(new DOMException('Aborted','AbortError'));},{once:true});});
   return new Response(JSON.stringify({answers:Object.fromEntries(body.state.candidates.map(c=>[c.id,{type:'noul',noul:c.text.includes('not a paid')?.02:.98}]))}));
  };
 });
 const settings=await context.newPage();await settings.goto(`chrome-extension://${id}/options.html`);
 const request=m=>settings.evaluate(m=>chrome.runtime.sendMessage(m),m);
 assert.equal((await request({type:'save-settings',settings:{apiKey:'synthetic-hardening-key',consent:true,threshold:.9,dailyLimit:1000}})).ok,true);
 assert.equal((await request({type:'set-site',host:'127.0.0.1',enabled:true})).ok,true);
 const page=await context.newPage();await page.goto(url);
 const tabId=await settings.evaluate(async url=>{const tabs=await chrome.tabs.query({});return tabs.find(t=>t.url?.startsWith(url)).id;},url);
 const status=()=>settings.evaluate(id=>chrome.tabs.sendMessage(id,{type:'page-status'}),tabId);
 const calls=()=>sw.evaluate(()=>globalThis.calls.length);
 const test=async(name,fn)=>{try{await fn();results.push({name,passed:true});console.log(`PASS ${name}`);}catch(e){results.push({name,passed:false,error:e.message.split('\n')[0]});console.log(`FAIL ${name}: ${e.message.split('\n')[0]}`);}};
 const fresh=async()=>{await page.goto(`${url}/?run=${Date.now()}`);await page.locator('#paid-one').waitFor({state:'hidden',timeout:6000});};
 await test('continuous page mutations do not starve the scan',async()=>{
  await page.goto(url);await page.evaluate(()=>{const noise=document.createElement('div');document.body.append(noise);window.noise=setInterval(()=>{noise.textContent=String(Date.now());},70);});
  try{await page.locator('#paid-one').waitFor({state:'hidden',timeout:3500});}finally{await page.evaluate(()=>clearInterval(window.noise));}
 });
 await fresh();
 await test('reused editorial node is reclassified after its text changes',async()=>{
  await page.locator('#advertising-research').evaluate(el=>{el.textContent='Sponsored: a new paid placement in this reused container.';});
  await page.locator('#advertising-research').waitFor({state:'hidden',timeout:3500});
 });
 await fresh();
 await test('a hidden ad reused for ordinary content is restored',async()=>{
  await page.locator('#paid-one').evaluate(el=>{el.textContent='An editorial article, not a paid placement.';});
  await page.locator('#paid-one').waitFor({state:'visible',timeout:3500});
  await page.waitForTimeout(1100);assert.equal(await page.locator('#paid-one').isVisible(),true);
 });
 await fresh();
 await test('threshold changes reuse page decisions without another request',async()=>{
  const before=await calls();
  await request({type:'save-settings',settings:{consent:true,threshold:.99,dailyLimit:1000}});
  await page.locator('#paid-one').waitFor({state:'visible',timeout:3000});
  await request({type:'save-settings',settings:{consent:true,threshold:.9,dailyLimit:1000}});
  await page.locator('#paid-one').waitFor({state:'hidden',timeout:3000});
  assert.equal(await calls(),before);
 });
 await fresh();
 await test('enabling another site does not rescan this page',async()=>{
  const before=await status();const count=await calls();
  await request({type:'set-site',host:'localhost',enabled:true});
  await page.waitForTimeout(1300);
  assert.equal((await status()).checked,before.checked);assert.equal(await calls(),count);
 });
 await fresh();
 await test('SPA navigation to a private route restores hidden blocks',async()=>{
  await page.evaluate(()=>history.pushState({},'', '/inbox'));
  await page.locator('#paid-one').waitFor({state:'visible',timeout:3500});
  assert.match((await status()).note,/Skipped/);
 });
 await fresh();
 await test('CSS-hidden text is excluded from candidate snippets',async()=>{
  await page.evaluate(()=>{const el=document.createElement('aside');el.className='sponsored';el.id='hidden-text-ad';el.innerHTML='Sponsored: public offer <span style="display:none">PRIVATE_HIDDEN_VALUE</span><span style="visibility:hidden">PRIVATE_INVISIBLE_VALUE</span><span style="opacity:0"><strong>PRIVATE_TRANSPARENT_VALUE</strong></span>';document.querySelector('main').append(el);});
  await page.locator('#hidden-text-ad').waitFor({state:'hidden',timeout:3500});
  const payload=JSON.stringify(await sw.evaluate(()=>globalThis.calls));
  assert.equal(payload.includes('PRIVATE_HIDDEN_VALUE'),false);assert.equal(payload.includes('PRIVATE_INVISIBLE_VALUE'),false);assert.equal(payload.includes('PRIVATE_TRANSPARENT_VALUE'),false);
 });
 await fresh();
 await test('explicit ad slots are found after thousands of unrelated class matches',async()=>{
  await page.evaluate(()=>{
   const clutter=document.createElement('div');clutter.id='clutter';
   for(let i=0;i<1600;i++){const d=document.createElement('div');d.className='padding header';d.textContent='Ordinary content';clutter.append(d);}
   const ad=document.createElement('aside');ad.id='late-placement';ad.dataset.adSlot='fixture';ad.textContent='Sponsored: paid placement after a long document.';
   document.body.append(clutter,ad);
  });
  await page.locator('#late-placement').waitFor({state:'hidden',timeout:5000});
 });
 await fresh();
 await test('daily cap is respected across two tabs racing to scan',async()=>{
  await request({type:'set-site',host:'127.0.0.1',enabled:false});
  await request({type:'save-settings',settings:{consent:true,threshold:.9,dailyLimit:1}});
  await request({type:'save-settings',settings:{apiKey:'fresh-key-for-concurrency-test',consent:true,threshold:.9,dailyLimit:1}});
  await sw.evaluate(async()=>{await chrome.storage.local.set({usage:{day:new Date().toISOString().slice(0,10),count:0}});globalThis.delay=500;});
  const page2=await context.newPage();await Promise.all([page.goto(url+'/a'),page2.goto(url+'/b')]);
  const before=await calls();await request({type:'set-site',host:'127.0.0.1',enabled:true});
  await page.waitForTimeout(2400);assert.equal(await calls()-before,1);await page2.close();
 });
 await test('revoking consent restores content in every enabled tab',async()=>{
  await request({type:'save-settings',settings:{consent:true,threshold:.9,dailyLimit:1000}});
  const page2=await context.newPage();await page2.goto(url+'/second');await fresh();await page2.locator('#paid-one').waitFor({state:'hidden',timeout:5000});
  await request({type:'save-settings',settings:{consent:false,threshold:.9,dailyLimit:1000}});
  await page.locator('#paid-one').waitFor({state:'visible',timeout:3000});await page2.locator('#paid-one').waitFor({state:'visible',timeout:3000});await page2.close();
 });
 await test('settings and request budget survive a full browser restart',async()=>{
  await request({type:'save-settings',settings:{consent:true,threshold:.9,dailyLimit:1}});
  await sw.evaluate(async()=>{await chrome.storage.local.set({usage:{day:new Date().toISOString().slice(0,10),count:1}});});
  await context.close();
  context=await chromium.launchPersistentContext(join(root,'profile'),{channel:'chromium',executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,headless:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
  const resumed=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
  await resumed.evaluate(()=>{globalThis.unexpectedCalls=0;globalThis.fetch=async()=>{globalThis.unexpectedCalls++;throw new Error('A capped request must not reach the network');};});
  const control=await context.newPage();await control.goto(`chrome-extension://${id}/options.html`);
  const config=await control.evaluate(()=>chrome.runtime.sendMessage({type:'get-settings'}));
  assert.equal(config.settings.hasKey,true);assert.equal(config.settings.consent,true);assert.equal(config.usage.count,1);
  const freshPage=await context.newPage();await freshPage.goto(url+'/restart');
  await control.waitForFunction(async url=>{const tab=(await chrome.tabs.query({})).find(t=>t.url===url+'/restart');try{return (await chrome.tabs.sendMessage(tab.id,{type:'page-status'})).note.includes('Daily request limit');}catch{return false;}},url,{timeout:5000});
  assert.equal(await freshPage.locator('#paid-one').isVisible(),true);assert.equal(await resumed.evaluate(()=>globalThis.unexpectedCalls),0);
 });
}finally{
 if(context)await context.close();server.close();await rm(root,{recursive:true,force:true});
 await mkdir('test-results',{recursive:true});await writeFile('test-results/hardening.json',JSON.stringify(results,null,2));
}
console.log(`${results.filter(r=>r.passed).length}/${results.length} hardening checks passed`);
if(results.some(r=>!r.passed))process.exitCode=1;
