import {element, notice, request, run} from './ui';
const key = element<HTMLInputElement>('api-key');
const consent = element<HTMLInputElement>('consent');
const threshold = element<HTMLInputElement>('threshold-input');
const daily = element<HTMLInputElement>('daily-limit');
const save = element<HTMLButtonElement>('save');
const test = element<HTMLButtonElement>('test');
const forget = element<HTMLButtonElement>('forget');
const verify = element<HTMLButtonElement>('verify');
let hasSavedKey = false;
function renderVerification(report: any) {
  const panel = element('verification'); panel.replaceChildren(); panel.hidden = !report;
  if (!report) return;
  const passed = report.cases.filter((c: any) => c.passed).length;
  const title = document.createElement('strong'); title.textContent = `${passed}/${report.cases.length} sample decisions matched`;
  const meta = document.createElement('p'); meta.className = 'help'; meta.textContent = `${report.model} · ${(report.elapsedMs / 1000).toFixed(2)} seconds · ${new Date(report.time).toLocaleString()}`;
  const list = document.createElement('ul'); list.className = 'site-list';
  for (const item of report.cases) {
    const row = document.createElement('li'); row.textContent = `${item.passed ? 'Pass' : 'Review'}: ${item.label} — ${Math.round(item.probability * 100)}% ad probability`; list.append(row);
  }
  const help = document.createElement('p'); help.className = 'help'; help.textContent = 'This verifies a real API request and four fixed examples. It does not measure accuracy across all websites.';
  panel.append(title, meta, list, help);
}
function renderThreshold() { element('threshold-value').textContent = `${threshold.value}%`; }
threshold.addEventListener('input', renderThreshold);
async function load() {
  const response = await request({type: 'get-settings'}), s = response.settings;
  hasSavedKey = s.hasKey;
  key.placeholder = s.hasKey ? 'Key saved. Enter a new key to replace it.' : 'sk-or-v1-…';
  consent.checked = s.consent; threshold.value = String(Math.round(s.threshold * 100)); daily.value = String(s.dailyLimit); renderThreshold();
  element('connection').textContent = s.hasKey ? 'Key saved · test connection to verify' : 'Not connected';
  test.disabled = !s.hasKey; forget.disabled = !s.hasKey;
  verify.disabled = !s.hasKey; renderVerification(response.verification);
  element('usage').textContent = `${response.usage.count} of ${s.dailyLimit} requests used today. Resets at 00:00 UTC.`;
  const list = element('sites'); list.replaceChildren();
  element('no-sites').hidden = Boolean(s.sites.length);
  for (const host of s.sites) {
    const row = document.createElement('li'), text = document.createElement('span'), button = document.createElement('button');
    text.textContent = host; button.textContent = 'Remove'; button.className = 'text-button';
    run(button, async () => { await request({type: 'set-site', host, enabled: false}); await load(); notice(`${host} removed. Its hidden blocks have been restored.`); });
    row.append(text, button); list.append(row);
  }
}
element<HTMLFormElement>('settings-form').addEventListener('submit', event => {
  event.preventDefault(); save.disabled = true; notice('');
  void (async () => {
    try {
      await request({type: 'save-settings', settings: {apiKey: key.value, consent: consent.checked, threshold: Number(threshold.value) / 100, dailyLimit: Number(daily.value)}});
      key.value = ''; await load(); notice('Settings saved. Open the extension on a website to enable it.');
    } catch (e) { notice((e as Error).message, true); } finally { save.disabled = false; }
  })();
});
run(test, async () => { notice('Checking your OpenRouter key…'); const result = await request({type: 'test-key'}); element('connection').textContent = 'OpenRouter key verified'; notice(result.message); });
run(verify, async () => {
  notice('Sending four fixed examples to Jev through OpenRouter…');
  const result = await request({type: 'verify-model'}); renderVerification(result.report);
  const passed = result.report.cases.filter((c: any) => c.passed).length;
  notice(`Live request completed. ${passed}/4 sample decisions matched.`, passed < 4);
});
key.addEventListener('input', () => {
  const unsaved = Boolean(key.value.trim()); test.disabled = verify.disabled = unsaved || !hasSavedKey;
  element('connection').textContent = unsaved ? 'Save your new key before testing' : hasSavedKey ? 'Key saved · test connection to verify' : 'Not connected';
});
run(forget, async () => { await request({type: 'forget-key'}); key.value = ''; await load(); notice('API key removed. Scanning is off and hidden blocks have been restored.'); });
void load().catch(e => notice(e.message, true));
