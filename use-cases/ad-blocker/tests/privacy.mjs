import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile, writeFile, cp, mkdtemp, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';

const fixture = (await readFile('tests/fixture.html', 'utf8')).replace('</body>', `
  ${Array.from({length:4}, (_, i) => `<iframe id="stripe-${i}" src="https://js.stripe.com/v3/controller-${i}" style="width:100%;height:1px;visibility:hidden;border:0"></iframe>`).join('')}
  <div id="account-dialog" style="display:none"><form>
    <label>Password <input type="password" value="PRIVATE_PASSWORD_SENTINEL"></label>
    <label>Card <input autocomplete="cc-number" value="PRIVATE_CARD_SENTINEL"></label>
    <label>Code <input autocomplete="one-time-code" value="PRIVATE_CODE_SENTINEL"></label>
  </form></div>
  </body>`);
const server = createServer((req, res) => {res.writeHead(200, {'Content-Type':'text/html'});res.end(fixture);});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const root = await mkdtemp(join(tmpdir(), 'jev-privacy-'));
const extension = join(root, 'extension');
await cp('dist', extension, {recursive:true});
const manifest = JSON.parse(await readFile(join(extension, 'manifest.json'), 'utf8'));
manifest.host_permissions.push('*://127.0.0.1/*');
await writeFile(join(extension, 'manifest.json'), JSON.stringify(manifest));
let context;
let passed = 0;
const pass = name => {passed++; console.log(`PASS ${name}`);};
try {
  context = await chromium.launchPersistentContext(join(root, 'profile'), {channel:'chromium', executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, headless:true, args:[`--disable-extensions-except=${extension}`, `--load-extension=${extension}`]});
  await context.route('https://js.stripe.com/**', route => route.fulfill({contentType:'text/html', body:'<!doctype html><title>Payment fixture</title>'}));
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  await worker.evaluate(() => {
    globalThis.calls = [];
    globalThis.fetch = async (url, options) => {
      if (String(url) !== 'https://openrouter.ai/api/alpha/decisions') throw new Error('Unexpected request');
      const body = JSON.parse(options.body); globalThis.calls.push(body);
      return new Response(JSON.stringify({answers:Object.fromEntries(body.state.candidates.map(c => [c.id, {type:'noul', noul:c.text.includes('not a paid') ? .02 : .98}]))}));
    };
  });
  const control = await context.newPage();
  await control.goto(`chrome-extension://${new URL(worker.url()).host}/options.html`);
  const request = m => control.evaluate(m => chrome.runtime.sendMessage(m), m);
  assert.equal((await request({type:'save-settings',settings:{apiKey:'synthetic-privacy-test-key',consent:true,threshold:.9,dailyLimit:100}})).ok, true);
  assert.equal((await request({type:'set-site',host:'127.0.0.1',enabled:true})).ok, true);
  const page = await context.newPage(); await page.goto(origin);
  const tabId = await control.evaluate(async origin => (await chrome.tabs.query({})).find(t => t.url?.startsWith(origin)).id, origin);
  const status = () => control.evaluate(id => chrome.tabs.sendMessage(id, {type:'page-status'}), tabId);
  const waitNote = async text => {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      try {if ((await status()).note.includes(text)) return;} catch {}
      await page.waitForTimeout(100);
    }
    assert.fail(`Status did not contain ${text}`);
  };
  await page.locator('#paid-one').waitFor({state:'hidden',timeout:5000});
  assert.equal(await page.locator('#editorial').isVisible(), true);
  assert.ok((await status()).checked > 0);
  pass('four hidden Stripe frames and a closed account form do not suppress scanning');

  const callsBefore = await worker.evaluate(() => globalThis.calls.length);
  await page.locator('#account-dialog').evaluate(el => {el.style.removeProperty('display');});
  await waitNote('Skipped');
  assert.equal(await page.locator('#paid-one').isVisible(), true);
  assert.equal(await worker.evaluate(() => globalThis.calls.length), callsBefore);
  pass('opening a sign-in/payment form via inline style pauses and restores ads');

  await page.locator('#account-dialog').evaluate(el => {el.hidden = true;});
  await page.locator('#paid-one').waitFor({state:'hidden',timeout:5000});
  assert.equal(await worker.evaluate(() => globalThis.calls.length), callsBefore);
  pass('closing the form via hidden resumes using retained decisions');

  await page.locator('#stripe-0').evaluate(el => {el.style.cssText = 'width:320px;height:100px;visibility:visible';});
  await waitNote('Skipped');
  assert.equal(await page.locator('#paid-one').isVisible(), true);
  pass('a visible payment iframe still pauses scanning');

  await page.locator('#stripe-0').evaluate(el => {el.style.visibility = 'hidden';});
  await page.locator('#paid-one').waitFor({state:'hidden',timeout:5000});
  await page.waitForTimeout(1200);
  assert.equal(await page.locator('#paid-one').isVisible(), false);
  assert.equal((await status()).hidden, 1);
  pass('hiding the payment iframe resumes without a hide/restore loop');

  await page.goto(`${origin}/checkout`);
  await waitNote('Skipped');
  assert.equal(await page.locator('#paid-one').isVisible(), true);
  assert.equal(await worker.evaluate(() => globalThis.calls.length), callsBefore);
  pass('checkout routes remain excluded even when payment elements are hidden');

  const payload = JSON.stringify(await worker.evaluate(() => globalThis.calls));
  for (const secret of ['PRIVATE_PASSWORD_SENTINEL','PRIVATE_CARD_SENTINEL','PRIVATE_CODE_SENTINEL','NEVER_SEND_FORM_VALUE']) assert.equal(payload.includes(secret), false);
  pass('classification payloads exclude all form values');
  console.log(`${passed} privacy regression checks passed; synthetic provider, no live API calls.`);
} finally {
  if (context) await context.close();
  server.close();
  await rm(root, {recursive:true,force:true});
}
