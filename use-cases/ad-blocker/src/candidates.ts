import { redact, type Candidate } from './core';

const AD_WORD = /(?:^|[\s_-])(ad|ads|advert|advertisement|advertising|adsbygoogle|sponsored|promoted)(?:$|[\s_-])/i;
const AD_HOST = /(^|\.)(doubleclick\.net|googlesyndication\.com|googleadservices\.com|adnxs\.com|taboola\.com|outbrain\.com|amazon-adsystem\.com)$/i;
const SELECTOR = '[data-ad],[data-ad-slot],[data-ad-client],[data-sponsored],ins.adsbygoogle,iframe[src],[aria-label],[id*="ad" i],[class*="ad" i],[class*="sponsor" i],[class*="promoted" i]';
const PRIORITY_SELECTOR = '[data-ad],[data-ad-slot],[data-ad-client],[data-sponsored],ins.adsbygoogle,[aria-label="advertisement" i],[aria-label="sponsored" i]';

export function sensitivePage(doc: Document): boolean {
  if (/(?:^|\/)(checkout|payment|billing|login|signin|inbox)(?:\/|$)/i.test(doc.location?.pathname || '')) return true;
  // News sites preload hidden login forms and Stripe telemetry frames. Only
  // rendered sensitive controls should stop scanning a public page.
  for (const el of doc.querySelectorAll('input[type="password" i], input[autocomplete], iframe[src]')) {
    if (el.tagName === 'IFRAME') {
      const host = hostname(el.getAttribute('src'), doc.baseURI);
      if (!/(^|\.)(stripe\.com|paypal\.com)$/i.test(host)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 1 || rect.height <= 1) continue;
    } else if (!el.matches('input[type="password" i]') && !/(?:^|\s)(cc-[\w-]+|one-time-code)(?:\s|$)/i.test(el.getAttribute('autocomplete') || '')) continue;
    if (visible(el)) return true;
  }
  return false;
}
function hostname(value: string | null, base: string) { try { const url = new URL(value || '', base); return /^https?:$/.test(url.protocol) ? url.hostname : ''; } catch { return ''; } }
export function safeText(el: Element, limit = 180) {
  const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let text = '', node: Node | null;
  while ((node = walker.nextNode()) && text.length < 800) {
    const parent = node.parentElement;
    if (parent && !parent.closest('script,style,noscript,input,textarea,select,[contenteditable], [hidden], [aria-hidden="true"]') && visible(parent)) text += ` ${node.textContent || ''}`;
  }
  return redact(text, limit);
}
function visible(el: Element): boolean {
  if (!el.getClientRects().length || getComputedStyle(el).visibility !== 'visible') return false;
  for (let parent: Element | null = el; parent; parent = parent.parentElement) {
    const style = getComputedStyle(parent);
    if (style.opacity === '0' || style.contentVisibility === 'hidden') return false;
  }
  return true;
}
export function candidateFor(el: HTMLElement, id: string): Candidate | null {
  if (['HTML','BODY','MAIN','NAV','HEADER','FOOTER','FORM','INPUT','BUTTON','TEXTAREA','SELECT'].includes(el.tagName) || el.closest('form,[contenteditable],nav,[role="navigation"]') || el.querySelector('input,textarea,[contenteditable]')) return null;
  const rect = el.getBoundingClientRect();
  if (rect.width < 30 || rect.height < 18 || rect.width > 1800 || rect.height > 1000 || !visible(el)) return null;
  if (el.querySelectorAll('a').length > 20) return null;
  const classes = `${el.id} ${el.className}`;
  const label = el.getAttribute('aria-label') || el.getAttribute('title') || '';
  const hosts = [...new Set([...(el.matches('a,iframe') ? [el] : []), ...el.querySelectorAll('a[href],iframe[src]')].slice(0, 20).map(x => hostname(x.getAttribute(x.tagName === 'IFRAME' ? 'src' : 'href'), el.ownerDocument.baseURI)).filter(Boolean))].slice(0, 4);
  const signals: string[] = [];
  if (el.matches('[data-ad],[data-ad-slot],[data-ad-client],[data-sponsored],ins.adsbygoogle')) signals.push('ad attribute');
  if (AD_WORD.test(classes)) signals.push('ad-like class or id');
  if (AD_WORD.test(label)) signals.push('advertising label');
  if (hosts.some(h => AD_HOST.test(h))) signals.push('ad network hostname');
  if (!signals.length) return null;
  return {id, tag: el.tagName.toLowerCase(), classes: redact(classes, 100), label: redact(label, 80), text: safeText(el), width: Math.round(rect.width), height: Math.round(rect.height), linkHosts: hosts, signals};
}
export function findCandidates(doc: Document): HTMLElement[] {
  const result: HTMLElement[] = [];
  // Bounded work per mutation; no full-page text extraction.
  const visited = new Set<HTMLElement>();
  // Explicit ad slots must not be crowded out by class names like "padding".
  for (const selector of [PRIORITY_SELECTOR, SELECTOR]) {
    let inspected = 0;
    for (const el of doc.querySelectorAll<HTMLElement>(selector)) {
      if (visited.has(el)) continue;
      visited.add(el);
      if (++inspected > 1200 || result.length >= 100) break;
      if (candidateFor(el, 'c0')) result.push(el);
    }
  }
  // Prefer an ad container over multiple descendants of that same ad.
  return result.filter(el => !result.some(other => other !== el && other.contains(el)));
}
