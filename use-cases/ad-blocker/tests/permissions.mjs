import {chromium} from 'playwright';
import {readFile, writeFile, cp, mkdtemp, rm, mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';

const fixture = await readFile('tests/fixture.html','utf8');
const site = 'https://www.bloomberg.com/';
const results = [];
async function scenario(legacy) {
  const root = await mkdtemp(join(tmpdir(),'jev-permission-'));
  const extension = join(root,'extension');
  await cp('dist',extension,{recursive:true});
  if (legacy) {
    const manifest=JSON.parse(await readFile(join(extension,'manifest.json'),'utf8'));
    manifest.optional_host_permissions=['http://*/*','https://*/*'];
    await writeFile(join(extension,'manifest.json'),JSON.stringify(manifest));
  }
  let context;
  try {
    // No host pregrants and no stubbed permissions API. The fixed scenario
    // requires a person/desktop automation to accept Chromium's native prompt.
    context=await chromium.launchPersistentContext(join(root,'profile'),{channel:'chromium',executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,headless:legacy,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
    await context.route('https://www.bloomberg.com/**',route=>route.fulfill({status:200,contentType:'text/html',body:fixture}));
    const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
    await worker.evaluate(()=>{
      globalThis.apiCalls=0;
      globalThis.fetch=async(url,options)=>{
        if(String(url)!=='https://openrouter.ai/api/alpha/decisions')throw new Error('Unexpected request');
        const body=JSON.parse(options.body);globalThis.apiCalls++;
        return new Response(JSON.stringify({model:body.model,answers:Object.fromEntries(body.state.candidates.map(c=>[c.id,{type:'noul',noul:c.text.includes('not a paid')?.02:.98}]))}));
      };
    });
    const id=new URL(worker.url()).host;
    const settings=await context.newPage();await settings.goto(`chrome-extension://${id}/options.html`);
    assert.equal((await settings.evaluate(()=>chrome.runtime.sendMessage({type:'save-settings',settings:{apiKey:'synthetic-permission-test',consent:true,threshold:.9,dailyLimit:100}}))).ok,true);
    const page=await context.newPage();await page.goto(site);
    // The fixture tab id is available after creation even before URL access.
    const tabId=await settings.evaluate(async()=>{
      const tabs=await chrome.tabs.query({});return tabs.find(t=>t.active && !t.url?.startsWith('chrome-extension://')).id;
    });
    const popup=await context.newPage();
    // As in the integration tests, emulate only the action popup's activeTab
    // lookup. The permission request, browser prompt and grant are real.
    await popup.addInitScript(({tabId,site})=>{const query=chrome.tabs.query.bind(chrome.tabs);chrome.tabs.query=async args=>args.active?[{id:tabId,url:site}]:query(args);},{tabId,site});
    await popup.goto(`chrome-extension://${id}/popup.html`);
    assert.equal(await settings.evaluate(()=>chrome.permissions.contains({origins:['*://www.bloomberg.com/*']})),false);
    await popup.locator('#site-toggle').click();
    if (legacy) {
      await popup.locator('#notice').filter({hasText:'Only permissions specified in the manifest may be requested.'}).waitFor({timeout:5000});
      assert.equal(await worker.evaluate(()=>globalThis.apiCalls),0);
      results.push('Reproduced the reported error with the original split-scheme manifest.');
      console.log('PASS reproduced the exact Bloomberg permission error before the fix');
      return;
    }
    console.log('WAITING: accept the native Chromium permission prompt for www.bloomberg.com in the isolated test profile.');
    await popup.locator('#site-toggle').filter({hasText:'Pause on this site'}).waitFor({timeout:180000});
    assert.equal(await settings.evaluate(()=>chrome.permissions.contains({origins:['*://www.bloomberg.com/*']})),true);
    assert.equal(await settings.evaluate(()=>chrome.permissions.contains({origins:['*://example.com/*']})),false);
    await page.locator('#paid-one').waitFor({state:'hidden',timeout:15000});
    assert.equal(await page.locator('#editorial').isVisible(),true);
    results.push('Real site permission request accepted; only the requested site granted; fixture ad hidden.');
    console.log('PASS native permission acceptance, scoped grant and first-page scanning');
    await page.reload();await page.locator('#paid-one').waitFor({state:'hidden',timeout:10000});
    results.push('Grant and scanner registration continue working after page reload.');
    console.log('PASS reload reuses the site grant without another prompt');
    await popup.locator('#site-toggle').click();await page.locator('#paid-one').waitFor({state:'visible',timeout:5000});
    results.push('Pause restores the fixture page after a real grant.');
    console.log('PASS pause restores the page');
  } finally { if(context)await context.close();await rm(root,{recursive:true,force:true}); }
}
try { await scenario(true); await scenario(false); }
finally { await mkdir('test-results',{recursive:true});await writeFile('test-results/permissions.json',JSON.stringify(results,null,2)); }
