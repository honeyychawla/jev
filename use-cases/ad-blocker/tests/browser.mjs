import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile, writeFile, cp, mkdir, mkdtemp, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';

const fixture = await readFile('tests/fixture.html');
const server = createServer((req,res) => { res.writeHead(200, {'Content-Type':'text/html'}); res.end(fixture); });
await new Promise(r => server.listen(0,'127.0.0.1',r));
const url = `http://127.0.0.1:${server.address().port}`;
const profile = await mkdtemp(join(tmpdir(),'jev-shield-test-'));
const testExtension = await mkdtemp(join(tmpdir(),'jev-shield-extension-'));
await cp('dist', testExtension, {recursive:true});
const testManifest = JSON.parse(await readFile(join(testExtension, 'manifest.json'),'utf8'));
// Pregrant only the loopback fixture in the test copy. Native permission dialogs
// cannot be accepted in headless Chromium; the distributable stays optional-only.
testManifest.host_permissions.push('*://127.0.0.1/*');
await writeFile(join(testExtension,'manifest.json'),JSON.stringify(testManifest));
await mkdir('test-results',{recursive:true});
let context;
const checks = [];
function pass(name) { checks.push(name); console.log(`PASS ${name}`); }
try {
  context = await chromium.launchPersistentContext(profile,{channel:'chromium',executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,headless:true,viewport:{width:1200,height:900},args:[`--disable-extensions-except=${testExtension}`,`--load-extension=${testExtension}`]});
  const sw = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const id = new URL(sw.url()).host;
  // Synthetic provider, confined to this isolated browser profile. No actual key or paid API calls.
  await sw.evaluate(() => {
    globalThis.testCalls = []; globalThis.testMode = 'success'; globalThis.testDelay = 0;
    globalThis.fetch = async (url, options = {}) => {
      if (String(url) === 'https://openrouter.ai/api/v1/key') return new Response(JSON.stringify({data:{label:'local-test-key'}}),{status:200});
      if (String(url) !== 'https://openrouter.ai/api/alpha/decisions') throw new Error('Unexpected network request in test');
      const body = JSON.parse(options.body); globalThis.testCalls.push(body);
      if (globalThis.testDelay) await new Promise((resolve,reject) => { const t = setTimeout(resolve,globalThis.testDelay); options.signal.addEventListener('abort',() => {clearTimeout(t);reject(new DOMException('Aborted','AbortError'));},{once:true}); });
      if (globalThis.testMode === 'error') return new Response('',{status:429});
      if (globalThis.testMode === 'malformed') return new Response(JSON.stringify({answers:{}}),{status:200});
      return new Response(JSON.stringify({answers:Object.fromEntries(body.state.candidates.map(c => [c.id,{type:'noul',noul:c.text.includes('not a paid') ? .03 : .98}]))}),{status:200});
    };
  });
  const options = await context.newPage();
  const errors = []; options.on('pageerror',e => errors.push(e.message));
  await options.goto(`chrome-extension://${id}/options.html`);
  const request = message => options.evaluate(m => chrome.runtime.sendMessage(m),message);
  await options.locator('#api-key').fill('test-key-for-local-tests-only');
  await options.locator('#save').click();
  await options.locator('#notice').filter({hasText:'Settings saved'}).waitFor();
  const page = await context.newPage(); await page.goto(url);
  assert.equal(await sw.evaluate(() => globalThis.testCalls.length),0);
  assert.equal(await page.locator('#paid-one').isVisible(),true);
  pass('no scanning before consent and per-site activation');
  await options.locator('#consent').check(); await options.locator('#save').click();
  await options.locator('#notice').filter({hasText:'Settings saved'}).waitFor();
  await options.locator('#test').click(); await options.locator('#connection').filter({hasText:'OpenRouter key verified'}).waitFor();
  assert.equal(await options.locator('#api-key').inputValue(),'');
  pass('settings save, key isolation in UI, and connection test');
  await options.locator('#verify').click();
  await options.locator('#verification').filter({hasText:'4/4 sample decisions matched'}).waitFor();
  const check = (await request({type:'get-settings'})).verification;
  assert.equal(check.cases.length,4);assert.equal(check.model,'typesafe/jev-1.14');
  pass('live-check UI uses the provider contract and reports per-example results');
  // The site permission is requested in an actual click gesture in the extension.
  await options.evaluate(() => {
    const button = document.createElement('button'); button.id = 'grant-test-site'; button.textContent = 'Grant test site';
    button.onclick = async () => { window.testGranted = await chrome.permissions.request({origins:['*://127.0.0.1/*']}); };
    document.body.append(button);
  });
  await options.locator('#grant-test-site').click();
  await options.waitForFunction(() => window.testGranted !== undefined);
  assert.equal(await options.evaluate(() => window.testGranted),true);
  assert.equal((await request({type:'set-site',host:'127.0.0.1',enabled:true})).ok,true);
  await page.locator('#paid-one').waitFor({state:'hidden'});
  assert.equal(await page.locator('#editorial').isVisible(),true);
  assert.equal(await page.locator('#advertising-research').isVisible(),true);
  pass('real MV3 worker classifies candidates and preserves ordinary content');
  const payload = JSON.stringify(await sw.evaluate(() => globalThis.testCalls));
  for (const forbidden of ['NEVER_SEND_FORM_VALUE','privateToken','test-key-for-local-tests-only']) assert.equal(payload.includes(forbidden),false);
  assert.ok(payload.includes('example.com'));
  pass('payload excludes form values, full link URLs and API key');
  const tabId = await options.evaluate(async url => (await chrome.tabs.query({})).find(t => t.url?.startsWith(url)).id,url);
  const isolation = await options.evaluate(async tabId => {
    const [result] = await chrome.scripting.executeScript({target:{tabId},func:async () => {
      let canReadStorage = false;
      try { const data = await chrome.storage.local.get('settings'); canReadStorage = Boolean(data.settings?.apiKey); } catch {}
      const response = await chrome.runtime.sendMessage({type:'get-settings'});
      return {canReadStorage, privilegedRequestAllowed:response.ok};
    }});
    return result.result;
  },tabId);
  assert.deepEqual(isolation,{canReadStorage:false,privilegedRequestAllowed:false});
  pass('content-script context cannot read the key or use privileged settings messages');
  const pageMessage = (type,extra = {}) => options.evaluate(async ({tabId,message}) => chrome.tabs.sendMessage(tabId,message),{tabId,message:{type,...extra}});
  let status = await pageMessage('page-status'); assert.equal(status.hidden,1);
  await pageMessage('restore',{id:status.items[0].id});
  await page.locator('#paid-one').waitFor({state:'visible'});
  assert.equal(await page.locator('#paid-one').evaluate(el => el.style.getPropertyValue('display')),'block');
  assert.equal(await page.locator('#paid-one').evaluate(el => el.style.getPropertyPriority('display')),'important');
  const addAd = async name => page.evaluate(name => {const el=document.createElement('aside');el.id=name;el.className='sponsored';el.textContent=`Sponsored: ${name} paid placement`;document.querySelector('main').append(el);},name);
  await addAd('dynamic-ad'); await page.locator('#dynamic-ad').waitFor({state:'hidden'});
  assert.equal(await page.locator('#paid-one').isVisible(),true);
  pass('restore preserves original CSS and dynamic ads are scanned');

  const popup = await context.newPage();
  // A popup opened as a normal test tab lacks the real action's activeTab context.
  // Only substitute that tab lookup; every extension message and worker remains real.
  await popup.addInitScript(tabId => {const query=chrome.tabs.query.bind(chrome.tabs);chrome.tabs.query=async args => args.active ? [await chrome.tabs.get(tabId)] : query(args);},tabId);
  await popup.goto(`chrome-extension://${id}/popup.html`);
  await popup.locator('#hidden-count').filter({hasText:'1'}).waitFor();
  await popup.waitForTimeout(200);
  await popup.screenshot({path:'test-results/popup.jpg',type:'jpeg',quality:78,clip:{x:0,y:0,width:380,height:665}});
  await popup.locator('#restore-all').click(); await page.locator('#dynamic-ad').waitFor({state:'visible'});
  await popup.locator('#site-toggle').click();
  await popup.locator('#site-toggle').filter({hasText:'Enable on this site'}).waitFor();
  const before = await sw.evaluate(() => globalThis.testCalls.length);
  await addAd('paused-ad'); await page.waitForTimeout(1100);
  assert.equal(await sw.evaluate(() => globalThis.testCalls.length),before);
  assert.equal(await page.locator('#paused-ad').isVisible(),true);
  pass('popup status, restore all, and pause stop scanning');
  await popup.locator('#site-toggle').click(); await page.locator('#paused-ad').waitFor({state:'hidden'});
  await popup.close();
  await sw.evaluate(() => {globalThis.testMode='error';});
  await addAd('error-ad');
  await options.waitForFunction(async tabId => (await chrome.tabs.sendMessage(tabId,{type:'page-status'})).note.includes('rate limit'),tabId);
  assert.equal(await page.locator('#error-ad').isVisible(),true);
  pass('API errors leave candidates visible and stop automatic retries');
  await sw.evaluate(() => {globalThis.testMode='success';});
  await pageMessage('rescan'); await page.locator('#error-ad').waitFor({state:'hidden'});
  pass('explicit rescan retries a failed candidate');
  await sw.evaluate(() => {globalThis.testMode='malformed';});
  await request({type:'save-settings',settings:{apiKey:'replacement-synthetic-key',consent:true,threshold:.9,dailyLimit:100}});
  await page.reload(); await options.waitForFunction(async tabId => (await chrome.tabs.sendMessage(tabId,{type:'page-status'})).note.includes('incomplete decision'),tabId);
  assert.equal(await page.locator('#paid-one').isVisible(),true);
  pass('invalid provider responses fail closed');
  await sw.evaluate(() => {globalThis.testMode='success';});
  await page.goto(`${url}/login`); await page.waitForTimeout(1200);
  assert.equal(await page.locator('#paid-one').isVisible(),true);
  assert.match((await pageMessage('page-status')).note,/Skipped/);
  pass('sensitive sign-in pages are skipped');
  await page.goto(url); await page.locator('#paid-one').waitFor({state:'hidden'});
  await sw.evaluate(() => {globalThis.testDelay=4000;});
  await addAd('slow-ad');
  await options.waitForFunction(async tabId => (await chrome.tabs.sendMessage(tabId,{type:'page-status'})).busy,tabId);
  await request({type:'set-site',host:'127.0.0.1',enabled:false});
  await page.locator('#paid-one').waitFor({state:'visible'});
  await page.waitForTimeout(1200); assert.equal(await page.locator('#slow-ad').isVisible(),true);
  pass('pause aborts in-flight classification and restores the page');
  await sw.evaluate(() => {globalThis.testDelay=0;});
  await request({type:'save-settings',settings:{consent:true,threshold:.9,dailyLimit:1}});
  await request({type:'set-site',host:'127.0.0.1',enabled:true});
  await page.reload();
  const countBeforeCap = await sw.evaluate(() => globalThis.testCalls.length);
  await addAd('uncached-capped-ad');
  await options.waitForFunction(async tabId => (await chrome.tabs.sendMessage(tabId,{type:'page-status'})).note.includes('Daily request limit'),tabId);
  assert.equal(await page.locator('#uncached-capped-ad').isVisible(),true);
  assert.equal(await sw.evaluate(() => globalThis.testCalls.length),countBeforeCap);
  pass('persisted daily request cap stops further API calls');
  await options.reload();
  await options.setViewportSize({width:1000,height:1000});
  await options.screenshot({path:'test-results/settings.jpg',type:'jpeg',quality:76,fullPage:true});
  await options.setViewportSize({width:390,height:844});
  assert.equal(await options.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true);
  await options.emulateMedia({colorScheme:'dark'});
  await options.screenshot({path:'test-results/settings-dark-mobile.jpg',type:'jpeg',quality:75,fullPage:true});
  await options.locator('#forget').click();
  await options.locator('#notice').filter({hasText:'API key removed'}).waitFor();
  const final = await request({type:'get-settings'}); assert.equal(final.settings.hasKey,false); assert.equal(final.settings.consent,false);
  assert.equal(errors.length,0,errors.join('\n'));
  pass('responsive settings, dark mode, and remove-key flow');
  console.log(`\n${checks.length} browser checks passed. Synthetic Jev responses; no live API call.`);
} finally {
  if (context) await context.close();
  server.close();
  await rm(profile,{recursive:true,force:true});
  await rm(testExtension,{recursive:true,force:true});
}
