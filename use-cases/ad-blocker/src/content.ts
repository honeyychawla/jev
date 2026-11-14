import { MAX_BATCH, MAX_PER_PAGE, shouldHide, type Candidate, type PageStatus } from './core';
import { candidateFor, findCandidates, sensitivePage } from './candidates';

declare global { interface Window { __jevShieldLoaded?: boolean; } }
if (!window.__jevShieldLoaded) {
  window.__jevShieldLoaded = true;
  type Evaluation = {candidate: Candidate; probability: number; signature: string};
  type Hidden = Evaluation & {element: HTMLElement; display: string; priority: string};
  let enabled = false, busy = false, checked = 0, nextId = 0, epoch = 0, timer = 0, threshold = .9, note = 'Ready to scan.', fault = false;
  let seen = new WeakMap<HTMLElement, string>();
  let lastUrl = location.href;
  const kept = new WeakSet<HTMLElement>();
  const decisions = new Map<HTMLElement, Evaluation>();
  const hidden = new Map<string, Hidden>();
  const send = (message: object) => chrome.runtime.sendMessage(message);
  const signature = ({id, width, height, ...evidence}: Candidate) => JSON.stringify(evidence);

  function restore(id: string, keep = true) {
    const record = hidden.get(id); if (!record) return;
    if (record.display) record.element.style.setProperty('display', record.display, record.priority);
    else record.element.style.removeProperty('display');
    if (keep) kept.add(record.element);
    hidden.delete(id);
  }
  function restoreAll(keep = true) { for (const id of hidden.keys()) restore(id, keep); }
  function hide(element: HTMLElement, evaluation: Evaluation) {
    if (kept.has(element) || hidden.has(evaluation.candidate.id)) return;
    hidden.set(evaluation.candidate.id, {...evaluation, element, display: element.style.getPropertyValue('display'), priority: element.style.getPropertyPriority('display')});
    element.style.setProperty('display', 'none', 'important');
  }
  function applyDecisions() {
    for (const [el, evaluation] of decisions) {
      if (!el.isConnected) { decisions.delete(el); hidden.delete(evaluation.candidate.id); continue; }
      const isHidden = hidden.has(evaluation.candidate.id);
      if (isHidden && !shouldHide(evaluation.probability, threshold)) restore(evaluation.candidate.id, false);
      if (hidden.has(evaluation.candidate.id)) continue;
      const current = candidateFor(el, evaluation.candidate.id);
      if (!current || signature(current) !== evaluation.signature) { decisions.delete(el); seen.delete(el); continue; }
      if (shouldHide(evaluation.probability, threshold)) hide(el, evaluation);
    }
  }
  const observer = new MutationObserver(mutations => {
    // Frameworks reuse nodes. An old ad decision must never hide a new article.
    for (const [id, record] of hidden) {
      // Visibility changes need a fresh privacy check, but our own display:none
      // writes must not invalidate the ad decision and cause a hide/restore loop.
      if (mutations.some(m => !['style','hidden'].includes(m.attributeName || '') && (m.target === record.element || record.element.contains(m.target)))) {
        restore(id, false); decisions.delete(record.element); seen.delete(record.element);
      }
    }
    schedule();
  });
  function status(): PageStatus {
    for (const [id, record] of hidden) if (!record.element.isConnected) { hidden.delete(id); decisions.delete(record.element); }
    return {hidden: hidden.size, checked, busy, note, items: [...hidden].map(([id, r]) => ({id, text: r.candidate.text || r.candidate.label || 'Display ad', probability: r.probability}))};
  }
  function schedule() {
    // Throttle: continual mutations must not keep moving the scan deadline.
    if (!enabled || busy || fault || timer) return;
    timer = window.setTimeout(() => { timer = 0; void scan(); }, 750);
  }
  async function scan() {
    if (!enabled || busy || fault) return;
    if (sensitivePage(document)) { restoreAll(false); note = 'Skipped: this page may contain sign-in or payment information.'; return; }
    applyDecisions();
    if (checked >= MAX_PER_PAGE) { note = 'Page scan limit reached. Reload for a new scan.'; return; }
    const entries: {el: HTMLElement; candidate: Candidate; signature: string}[] = [];
    for (const el of findCandidates(document)) {
      if (kept.has(el)) continue;
      const candidate = candidateFor(el, `c${nextId + 1}`); if (!candidate) continue;
      const key = signature(candidate); if (seen.get(el) === key) continue;
      nextId++; entries.push({el, candidate, signature: key});
      if (entries.length >= Math.min(MAX_BATCH, MAX_PER_PAGE - checked)) break;
    }
    if (!entries.length) { note = 'Watching for new ad blocks.'; return; }
    busy = true; note = 'Jev is checking likely ads…';
    const version = epoch;
    entries.forEach(({el, signature}) => seen.set(el, signature)); checked += entries.length;
    try {
      const response = await send({type: 'classify', candidates: entries.map(x => x.candidate)});
      if (version !== epoch || !enabled) { entries.forEach(({el}) => seen.delete(el)); return; }
      if (!response?.ok) throw new Error(response?.error || 'Jev could not check this page.');
      if (sensitivePage(document)) { entries.forEach(({el}) => seen.delete(el)); restoreAll(false); note = 'Skipped: this page may contain sensitive information.'; return; }
      for (const decision of response.decisions) {
        const entry = entries.find(x => x.candidate.id === decision.id);
        if (!entry || !entry.el.isConnected) continue;
        const current = candidateFor(entry.el, entry.candidate.id);
        if (!current || signature(current) !== entry.signature) { seen.delete(entry.el); continue; }
        const evaluation = {candidate: current, probability: decision.probability, signature: entry.signature};
        decisions.set(entry.el, evaluation);
        if (shouldHide(decision.probability, threshold)) hide(entry.el, evaluation);
      }
      note = 'Watching for new ad blocks.';
    } catch (error) {
      if (version === epoch) { note = (error as Error).message; fault = true; }
      entries.forEach(({el}) => seen.delete(el));
    } finally { busy = false; if (!fault) schedule(); }
  }
  async function refresh(reset = false) {
    epoch++; enabled = false; observer.disconnect(); clearTimeout(timer); timer = 0; fault = false;
    if (sensitivePage(document)) note = 'Skipped: this page may contain sign-in or payment information.';
    if (reset) { restoreAll(false); decisions.clear(); seen = new WeakMap(); }
    const version = epoch;
    try {
      const response = await send({type: 'content-settings'});
      if (version !== epoch) return;
      enabled = Boolean(response?.ok && response.enabled); threshold = response?.threshold ?? .9;
      note = enabled && sensitivePage(document) ? 'Skipped: this page may contain sign-in or payment information.' : enabled ? 'Ready to scan.' : 'Paused on this site.';
      if (!enabled || sensitivePage(document)) restoreAll(false);
      if (enabled) {
        observer.observe(document.documentElement, {childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['class','id','style','hidden','aria-label','title','src','href','data-ad','data-ad-slot','data-ad-client','data-sponsored','type','autocomplete']});
        if (!sensitivePage(document)) applyDecisions();
        schedule();
      }
    } catch { restoreAll(false); note = 'Extension updated. Reload this page to reconnect.'; }
  }
  // SPA routes can change without a DOM mutation, including entry to an inbox.
  window.setInterval(() => {
    if (location.href !== lastUrl) { lastUrl = location.href; void refresh(true); }
  }, 1000);
  window.addEventListener('pagehide', () => { clearTimeout(timer); timer = 0; observer.disconnect(); });
  window.addEventListener('pageshow', event => { if (event.persisted) void refresh(true); });
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (sender.id !== chrome.runtime.id) return;
    if (message.type === 'page-status') reply(status());
    else if (message.type === 'restore') { restore(message.id); note = 'Restored. This block will stay visible until you reload.'; reply(status()); }
    else if (message.type === 'restore-all') { restoreAll(); note = 'Restored. These blocks will stay visible until you reload.'; reply(status()); }
    else if (message.type === 'rescan') { fault = false; schedule(); reply(status()); }
    else if (message.type === 'refresh') { void refresh(Boolean(message.reset)); reply({ok: true}); }
  });
  void refresh();
}
