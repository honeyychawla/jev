import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { captureViewport } from '../browser-capture.mjs';

test('live screen capture and rendering keep the ordering page stable', async t => {
  const browser = await chromium.launch({ channel: 'chrome', headless: false, chromiumSandbox: true, args:['--enable-automation'] });
  try {
    const page = await browser.newPage({viewport:{width:800,height:600}});
    const renderer = await readFile(new URL('../live-frame-renderer.mjs', import.meta.url), 'utf8');
    await page.route('https://screen-fixture.test/**', route => route.fulfill({
      contentType: route.request().url().endsWith('.mjs') ? 'text/javascript' : 'text/html',
      body: route.request().url().endsWith('.mjs') ? renderer : '<main style="height:1800px;background:#006491"><input id="order" value="Keep my order"><canvas id="screen"></canvas></main>',
    }));
    await page.goto('https://screen-fixture.test/');

    await t.test('repeated captures leave focus, scroll, dimensions, and page styles untouched', async () => {
      await page.locator('#order').focus();
      await page.evaluate(() => {
        document.querySelector('#order').setSelectionRange(3, 6);
        window.screenChanges = {mutations:0,resizes:0,scrolls:0};
        new MutationObserver(records => window.screenChanges.mutations += records.length).observe(document.documentElement,{subtree:true,attributes:true,childList:true});
        window.addEventListener('resize',()=>window.screenChanges.resizes++);
        window.addEventListener('scroll',()=>window.screenChanges.scrolls++);
      });
      for (let i=0; i<10; i++) {
        const bytes = await captureViewport(page);
        assert.equal(bytes.subarray(0,2).toString('hex'),'ffd8');
      }
      assert.deepEqual(await page.evaluate(() => ({
        ...window.screenChanges, width:innerWidth, height:innerHeight,
        active:document.activeElement.id, value:document.activeElement.value,
        selection:[document.activeElement.selectionStart,document.activeElement.selectionEnd],
      })), {mutations:0,resizes:0,scrolls:0,width:800,height:600,active:'order',value:'Keep my order',selection:[3,6]});
    });

    await t.test('the last frame stays visible after a bad frame or cancelled refresh', async () => {
      const result = await page.evaluate(async () => {
        const {paintLiveFrame} = await import('/live-frame-renderer.mjs');
        const canvas = document.querySelector('#screen');
        const source = document.createElement('canvas'); source.width=4; source.height=4;
        const make = async color => {
          source.getContext('2d').fillStyle=color;source.getContext('2d').fillRect(0,0,4,4);
          return new Promise(resolve=>source.toBlob(resolve));
        };
        const pixel = () => [...canvas.getContext('2d').getImageData(0,0,1,1).data];
        await paintLiveFrame(canvas,await make('#ff0000'));
        const first=pixel(); let rejected=false;
        try {await paintLiveFrame(canvas,new Blob(['broken image']));} catch {rejected=true;}
        const afterError=pixel();
        const cancelled=await paintLiveFrame(canvas,await make('#0000ff'),()=>false);
        const afterCancel=pixel();
        await paintLiveFrame(canvas,await make('#0000ff'));
        return {first,rejected,afterError,cancelled,afterCancel,last:pixel()};
      });
      assert.deepEqual(result,{first:[255,0,0,255],rejected:true,afterError:[255,0,0,255],cancelled:false,afterCancel:[255,0,0,255],last:[0,0,255,255]});
    });

    await t.test('Chrome launches with its sandbox enabled', async () => {
      const session = await browser.newBrowserCDPSession();
      const {arguments:args} = await session.send('Browser.getBrowserCommandLine');
      assert.equal(args.includes('--no-sandbox'),false);
      await session.detach();
    });
  } finally {await browser.close();}
});
