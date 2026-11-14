import {siteFromUrl, sitePattern, type PageStatus, type PublicSettings} from './core';
import {element, notice, request, run} from './ui';
let tabId: number | undefined, host: string | null = null, settings: PublicSettings;
let active = false;
let loading = false, changingSite = false, renderedItems = '';
const toggle = element<HTMLButtonElement>('site-toggle');
const scan = element<HTMLButtonElement>('scan');
const restore = element<HTMLButtonElement>('restore-all');
async function pageMessage(type: string, extra = {}) {
  if (tabId === undefined) throw new Error('Open a website first.');
  return chrome.tabs.sendMessage(tabId, {type, ...extra}) as Promise<PageStatus>;
}
function renderPage(status?: PageStatus) {
  element('hidden-count').textContent = String(status?.hidden || 0);
  element('checked-count').textContent = String(status?.checked || 0);
  element('page-note').textContent = status?.note || (active ? 'Reload this tab if scanning has not started.' : 'Enable this site to let Jev check likely ads.');
  element('state').textContent = status?.busy ? 'Checking' : active ? 'Enabled' : 'Paused';
  element('state').classList.toggle('active', active);
  restore.disabled = !status?.hidden;
  scan.disabled = !active || Boolean(status?.busy);
  const items = JSON.stringify(status?.items || []);
  if (items === renderedItems) return;
  renderedItems = items;
  const list = element('hidden-list'); list.replaceChildren();
  element('empty').hidden = Boolean(status?.hidden);
  for (const item of status?.items || []) {
    const row = document.createElement('li');
    const copy = document.createElement('div');
    const title = document.createElement('p'); title.textContent = item.text;
    const confidence = document.createElement('span'); confidence.textContent = `${Math.round(item.probability * 100)}% ad confidence`;
    copy.append(title, confidence);
    const button = document.createElement('button'); button.textContent = 'Restore'; button.className = 'text-button'; button.setAttribute('aria-label', `Restore ${item.text.slice(0, 40)}`);
    run(button, async () => renderPage(await pageMessage('restore', {id: item.id})));
    row.append(copy, button); list.append(row);
  }
}
async function load() {
  if (loading || changingSite) return;
  loading = true;
  try {
  const result = await request({type: 'get-settings'}); settings = result.settings;
  const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
  tabId = tab?.id; host = siteFromUrl(tab?.url);
  const permitted = host && await chrome.permissions.contains({origins: [sitePattern(host)]});
  active = Boolean(permitted && host && settings.sites.includes(host) && settings.hasKey && settings.consent);
  element('hostname').textContent = host || 'Open a website';
  element('request-count').textContent = `${result.usage.count} / ${settings.dailyLimit}`;
  element('threshold').textContent = `${Math.round(settings.threshold * 100)}%`;
  toggle.textContent = active ? 'Pause on this site' : 'Enable on this site';
  toggle.disabled = !host || !settings.hasKey || !settings.consent;
  toggle.classList.toggle('secondary', active);
  element('setup').hidden = settings.hasKey && settings.consent;
  try { renderPage(await pageMessage('page-status')); } catch { renderPage(); }
  } finally { loading = false; }
}
toggle.addEventListener('click', () => {
  if (!host) return;
  const site = host, enabling = !active;
  // Request immediately in the click gesture; Chrome requires a user gesture.
  const permission = enabling ? chrome.permissions.request({origins: [sitePattern(site)]}) : Promise.resolve(true);
  toggle.disabled = true; changingSite = true;
  void (async () => {
    try {
      if (!await permission) throw new Error('Site access was not granted.');
      await request({type: 'set-site', host: site, enabled: enabling});
      changingSite = false;
      await load();
    } catch (e) { notice((e as Error).message, true); toggle.disabled = false; }
    finally { changingSite = false; }
  })();
});
run(scan, async () => { renderPage(await pageMessage('rescan')); });
run(restore, async () => { renderPage(await pageMessage('restore-all')); });
document.querySelectorAll('[data-settings]').forEach(button => button.addEventListener('click', () => { void chrome.runtime.openOptionsPage(); }));
void load().catch(e => notice(e.message, true));
setInterval(() => { void load().catch(() => {}); }, 1000);
