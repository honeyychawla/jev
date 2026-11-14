import { API_URL, MODEL, DEFAULTS, MAX_PER_PAGE, apiError, makeRequest, publicSettings, readDecisions, siteFromUrl, sitePattern, validateCandidates, type Settings, type Candidate } from './core';

// Content scripts never receive the key and cannot read extension local storage.
const ready = chrome.storage.local.setAccessLevel({accessLevel: 'TRUSTED_CONTEXTS'});
const inflight = new Map<AbortController, string>();
const pageCounts = new Map<string, number>();
const cache = new Map<string, number>();
let queue: Promise<unknown> = Promise.resolve();
let mutationQueue: Promise<unknown> = Promise.resolve();
let generation = 0;
const siteVersions = new Map<string, number>();
const versionFor = (host: string) => `${generation}:${siteVersions.get(host) || 0}`;
let scriptQueue: Promise<unknown> = Promise.resolve();
async function settings(): Promise<Settings> {
  await ready;
  const data = await chrome.storage.local.get<{settings?: Partial<Settings>}>('settings');
  return {...DEFAULTS, ...data.settings};
}
async function usage() {
  const day = new Date().toISOString().slice(0, 10);
  const {usage: stored} = await chrome.storage.local.get<{usage?: {day: string; count: number}}>('usage');
  return stored?.day === day ? stored as {day: string; count: number} : {day, count: 0};
}
function trusted(sender: chrome.runtime.MessageSender) {
  return sender.id === chrome.runtime.id && sender.url?.startsWith(chrome.runtime.getURL(''));
}
async function updateScripts() {
  const s = await settings();
  const registered = await chrome.scripting.getRegisteredContentScripts();
  const own = registered.filter(x => x.id === 'jev-sites');
  const hosts: string[] = [];
  for (const host of s.sites) if (await chrome.permissions.contains({origins: [sitePattern(host)]})) hosts.push(host);
  const matches = hosts.map(sitePattern).sort();
  if (s.apiKey && s.consent && matches.length) {
    if (!own.length) await chrome.scripting.registerContentScripts([{
      id: 'jev-sites', matches, js: ['content.js'], runAt: 'document_idle', persistAcrossSessions: true, allFrames: false
    }]);
    else if (JSON.stringify(own[0].matches?.sort()) !== JSON.stringify(matches)) await chrome.scripting.updateContentScripts([{id: 'jev-sites', matches, js: ['content.js']}]);
  } else if (own.length) await chrome.scripting.unregisterContentScripts({ids: ['jev-sites']});
}
function syncScripts() {
  const run = scriptQueue.then(updateScripts); scriptQueue = run.catch(() => {}); return run;
}
async function refreshTabs(host?: string, reset = false) {
  for (const tab of await chrome.tabs.query(host ? {url: sitePattern(host)} : {})) {
    if (tab.id !== undefined) chrome.tabs.sendMessage(tab.id, {type: 'refresh', reset}).catch(() => {});
  }
}
async function changed(host?: string, reset = false) {
  if (host) siteVersions.set(host, (siteVersions.get(host) || 0) + 1); else generation++;
  for (const [controller, requestHost] of inflight) if (!host || requestHost === host) controller.abort();
  if (reset) cache.clear();
  await syncScripts();
  await refreshTabs(host, reset);
}
async function judge(message: any, sender: chrome.runtime.MessageSender) {
  const host = siteFromUrl(sender.url);
  if (!host || sender.id !== chrome.runtime.id || sender.tab?.id === undefined || sender.frameId !== 0) throw new Error('Unsupported page.');
  const version = versionFor(host);
  const s = await settings();
  if (!s.apiKey || !s.consent || !s.sites.includes(host) || !await chrome.permissions.contains({origins: [sitePattern(host)]})) throw new Error('Enable this site and connect Jev in Settings first.');
  const candidates = validateCandidates(message.candidates);
  const page = `${sender.tab.id}:${sender.documentId || sender.url}`;
  const previous = pageCounts.get(page) || 0;
  if (previous + candidates.length > MAX_PER_PAGE) throw new Error('Page limit reached. Reload to start a new scan.');
  pageCounts.set(page, previous + candidates.length);
  if (pageCounts.size > 200) pageCounts.delete(pageCounts.keys().next().value!);
  const signatures = candidates.map(({id, ...rest}) => JSON.stringify([host, rest]));
  if (version !== versionFor(host)) throw new Error('Settings changed. Scan cancelled.');
  if (signatures.every(key => cache.has(key))) return {decisions: candidates.map((c, i) => ({id: c.id, probability: cache.get(signatures[i])!})), threshold: s.threshold};
  const {decisions} = await callJev(s, host, candidates, version);
  decisions.forEach((d, i) => cache.set(signatures[i], d.probability));
  while (cache.size > 500) cache.delete(cache.keys().next().value!);
  return {decisions, threshold: s.threshold};
}
async function callJev(s: Settings, host: string, candidates: Candidate[], version: string) {
  const used = await usage();
  if (used.count >= s.dailyLimit) throw new Error('Daily request limit reached. Resets at 00:00 UTC.');
  // Reserve before fetching: concurrent tabs cannot exceed the daily cap.
  await chrome.storage.local.set({usage: {...used, count: used.count + 1}});
  // Settings can change during the storage await, before there is a request to abort.
  if (version !== versionFor(host)) throw new Error('Settings changed. Scan cancelled.');
  const controller = new AbortController();
  inflight.set(controller, host);
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(API_URL, {method: 'POST', headers: {'Content-Type': 'application/json', Authorization: `Bearer ${s.apiKey}`}, body: JSON.stringify(makeRequest(host, candidates)), credentials: 'omit', redirect: 'error', signal: controller.signal});
    if (!response.ok) throw new Error(apiError(response.status));
    let body: any;
    try { body = await response.json(); } catch { throw new Error('OpenRouter returned invalid JSON. Nothing was hidden.'); }
    const decisions = readDecisions(body, candidates);
    if (version !== versionFor(host)) throw new Error('Settings changed. Scan cancelled.');
    return {decisions, model: typeof body.model === 'string' ? body.model : MODEL};
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw new Error('Scan cancelled or timed out. Nothing was hidden.');
    if (error instanceof TypeError) throw new Error('Could not reach OpenRouter. Check your connection.');
    throw error;
  } finally { clearTimeout(timeout); inflight.delete(controller); }
}
async function handle(message: any, sender: chrome.runtime.MessageSender): Promise<any> {
  if (!message || typeof message.type !== 'string' || sender.id !== chrome.runtime.id) throw new Error('Invalid request.');
  if (message.type === 'content-settings') {
    const host = siteFromUrl(sender.url);
    if (!host || sender.frameId !== 0 || sender.tab?.id === undefined) throw new Error('Unsupported page.');
    const s = await settings();
    return {enabled: Boolean(s.apiKey && s.consent && s.sites.includes(host) && await chrome.permissions.contains({origins: [sitePattern(host)]})), threshold: s.threshold};
  }
  if (message.type === 'classify') {
    const run = queue.then(() => judge(message, sender));
    queue = run.catch(() => {});
    return run;
  }
  if (!trusted(sender)) throw new Error('This action is available only in extension settings.');
  if (message.type === 'get-settings') return {settings: publicSettings(await settings()), usage: await usage(), verification: (await chrome.storage.local.get('verification')).verification};
  if (message.type === 'verify-model') {
    const run = queue.then(async () => {
      const host = 'jev-shield-self-test.invalid', version = versionFor(host);
      const s = await settings(); if (!s.apiKey) throw new Error('Save an OpenRouter API key first.');
      const cases = [
        {text: 'Sponsored. Paid placement: try the Acorn planning app. Buy now.', ad: true, label: 'Paid display advertisement'},
        {text: 'An editorial research article about advertising, not a paid placement.', ad: false, label: 'Ordinary editorial article'},
        {text: 'Regular store product listing: blue cotton shirt, size medium. This is not a paid placement.', ad: false, label: 'Regular product listing'},
        {text: 'Sponsored recommendation. Paid promotion for a travel offer.', ad: true, label: 'Sponsored recommendation'}
      ];
      const candidates = cases.map((c, i): Candidate => ({id: `c${i+1}`, tag: 'aside', classes: c.ad ? 'sponsored' : 'article', label: c.ad ? 'Sponsored' : '', text: c.text, width: 300, height: 250, linkHosts: [], signals: c.ad ? ['advertising label'] : ['ad-like class or id']}));
      const started = Date.now();
      const result = await callJev(s, host, candidates, version);
      const report = {time: new Date().toISOString(), model: result.model, elapsedMs: Date.now() - started, cases: result.decisions.map((d, i) => ({label: cases[i].label, probability: d.probability, expectedAd: cases[i].ad, passed: (d.probability >= .9) === cases[i].ad}))};
      await chrome.storage.local.set({verification: report});
      return {report};
    });
    queue = run.catch(() => {}); return run;
  }
  if (message.type === 'save-settings') {
    const old = await settings();
    const patch = message.settings;
    if (!patch || typeof patch.consent !== 'boolean' || typeof patch.threshold !== 'number' || !Number.isFinite(patch.threshold) || patch.threshold < 0.7 || patch.threshold > 0.99 || !Number.isInteger(patch.dailyLimit) || patch.dailyLimit < 1 || patch.dailyLimit > 1000) throw new Error('Check the threshold and daily request limit.');
    const apiKey = typeof patch.apiKey === 'string' && patch.apiKey.trim() ? patch.apiKey.trim() : old.apiKey;
    if (apiKey.length > 512 || /\s/.test(apiKey)) throw new Error('The key contains invalid whitespace.');
    await chrome.storage.local.set({settings: {...old, apiKey, consent: patch.consent, threshold: patch.threshold, dailyLimit: patch.dailyLimit}});
    if (apiKey !== old.apiKey) await chrome.storage.local.remove('verification');
    await changed(undefined, apiKey !== old.apiKey);
    return {settings: publicSettings(await settings())};
  }
  if (message.type === 'forget-key') {
    await chrome.storage.local.set({settings: {...await settings(), apiKey: '', consent: false}});
    await chrome.storage.local.remove('verification');
    await changed(undefined, true); return {};
  }
  if (message.type === 'test-key') {
    const s = await settings();
    if (!s.apiKey) throw new Error('Save an OpenRouter API key first.');
    const response = await fetch('https://openrouter.ai/api/v1/key', {headers: {Authorization: `Bearer ${s.apiKey}`}, credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(10000)});
    if (!response.ok) throw new Error(apiError(response.status));
    const body = await response.json();
    if (!body.data || typeof body.data.label !== 'string') throw new Error('Unexpected key verification response from OpenRouter.');
    return {message: 'OpenRouter key verified. Jev 1.14 is selected. Model access is checked when you scan.'};
  }
  if (message.type === 'set-site') {
    const host = message.host;
    if (typeof host !== 'string' || siteFromUrl(`https://${host}`) !== host || typeof message.enabled !== 'boolean') throw new Error('Invalid site.');
    const s = await settings();
    if (message.enabled && (!s.apiKey || !s.consent)) throw new Error('Connect Jev and enable data sharing in Settings first.');
    if (message.enabled && !await chrome.permissions.contains({origins: [sitePattern(host)]})) throw new Error('Site permission was not granted.');
    const sites = s.sites.filter(x => x !== host);
    if (message.enabled) sites.push(host);
    await chrome.storage.local.set({settings: {...s, sites}});
    await changed(host);
    if (message.enabled) {
      for (const tab of await chrome.tabs.query({url: sitePattern(host)})) if (tab.id !== undefined) await chrome.scripting.executeScript({target: {tabId: tab.id}, files: ['content.js']}).catch(() => {});
    }
    return {};
  }
  throw new Error('Unknown action.');
}
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Serialize config writes separately from model requests; pausing can abort a running request.
  const mutating = ['save-settings', 'forget-key', 'set-site'].includes(message?.type);
  const run = mutating ? mutationQueue.then(() => handle(message, sender)) : handle(message, sender);
  if (mutating) mutationQueue = run.catch(() => {});
  run.then(data => sendResponse({ok: true, ...data}), error => sendResponse({ok: false, error: error instanceof Error ? error.message : 'Something went wrong.'}));
  return true;
});
chrome.runtime.onInstalled.addListener(() => { syncScripts().catch(console.error); });
chrome.runtime.onStartup.addListener(() => { syncScripts().catch(console.error); });
chrome.permissions.onRemoved.addListener(() => { changed().catch(console.error); });
