"use strict";
(() => {
  // src/core.ts
  var MAX_BATCH = 12;
  var MAX_PER_PAGE = 72;
  function redact(value, limit) {
    return value.replace(/https?:\/\/\S+/gi, "[link]").replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "[email]").replace(/\b(?:\d[ -]?){12,19}\b/g, "[number]").replace(/\s+/g, " ").trim().slice(0, limit);
  }
  function shouldHide(probability, threshold) {
    return Number.isFinite(probability) && probability >= threshold && probability <= 1;
  }

  // src/candidates.ts
  var AD_WORD = /(?:^|[\s_-])(ad|ads|advert|advertisement|advertising|adsbygoogle|sponsored|promoted)(?:$|[\s_-])/i;
  var AD_HOST = /(^|\.)(doubleclick\.net|googlesyndication\.com|googleadservices\.com|adnxs\.com|taboola\.com|outbrain\.com|amazon-adsystem\.com)$/i;
  var SELECTOR = '[data-ad],[data-ad-slot],[data-ad-client],[data-sponsored],ins.adsbygoogle,iframe[src],[aria-label],[id*="ad" i],[class*="ad" i],[class*="sponsor" i],[class*="promoted" i]';
  var PRIORITY_SELECTOR = '[data-ad],[data-ad-slot],[data-ad-client],[data-sponsored],ins.adsbygoogle,[aria-label="advertisement" i],[aria-label="sponsored" i]';
  function sensitivePage(doc) {
    if (/(?:^|\/)(checkout|payment|billing|login|signin|inbox)(?:\/|$)/i.test(doc.location?.pathname || "")) return true;
    for (const el of doc.querySelectorAll('input[type="password" i], input[autocomplete], iframe[src]')) {
      if (el.tagName === "IFRAME") {
        const host = hostname(el.getAttribute("src"), doc.baseURI);
        if (!/(^|\.)(stripe\.com|paypal\.com)$/i.test(host)) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width <= 1 || rect.height <= 1) continue;
      } else if (!el.matches('input[type="password" i]') && !/(?:^|\s)(cc-[\w-]+|one-time-code)(?:\s|$)/i.test(el.getAttribute("autocomplete") || "")) continue;
      if (visible(el)) return true;
    }
    return false;
  }
  function hostname(value, base) {
    try {
      const url = new URL(value || "", base);
      return /^https?:$/.test(url.protocol) ? url.hostname : "";
    } catch {
      return "";
    }
  }
  function safeText(el, limit = 180) {
    const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let text = "", node;
    while ((node = walker.nextNode()) && text.length < 800) {
      const parent = node.parentElement;
      if (parent && !parent.closest('script,style,noscript,input,textarea,select,[contenteditable], [hidden], [aria-hidden="true"]') && visible(parent)) text += ` ${node.textContent || ""}`;
    }
    return redact(text, limit);
  }
  function visible(el) {
    if (!el.getClientRects().length || getComputedStyle(el).visibility !== "visible") return false;
    for (let parent = el; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      if (style.opacity === "0" || style.contentVisibility === "hidden") return false;
    }
    return true;
  }
  function candidateFor(el, id) {
    if (["HTML", "BODY", "MAIN", "NAV", "HEADER", "FOOTER", "FORM", "INPUT", "BUTTON", "TEXTAREA", "SELECT"].includes(el.tagName) || el.closest('form,[contenteditable],nav,[role="navigation"]') || el.querySelector("input,textarea,[contenteditable]")) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width < 30 || rect.height < 18 || rect.width > 1800 || rect.height > 1e3 || !visible(el)) return null;
    if (el.querySelectorAll("a").length > 20) return null;
    const classes = `${el.id} ${el.className}`;
    const label = el.getAttribute("aria-label") || el.getAttribute("title") || "";
    const hosts = [...new Set([...el.matches("a,iframe") ? [el] : [], ...el.querySelectorAll("a[href],iframe[src]")].slice(0, 20).map((x) => hostname(x.getAttribute(x.tagName === "IFRAME" ? "src" : "href"), el.ownerDocument.baseURI)).filter(Boolean))].slice(0, 4);
    const signals = [];
    if (el.matches("[data-ad],[data-ad-slot],[data-ad-client],[data-sponsored],ins.adsbygoogle")) signals.push("ad attribute");
    if (AD_WORD.test(classes)) signals.push("ad-like class or id");
    if (AD_WORD.test(label)) signals.push("advertising label");
    if (hosts.some((h) => AD_HOST.test(h))) signals.push("ad network hostname");
    if (!signals.length) return null;
    return { id, tag: el.tagName.toLowerCase(), classes: redact(classes, 100), label: redact(label, 80), text: safeText(el), width: Math.round(rect.width), height: Math.round(rect.height), linkHosts: hosts, signals };
  }
  function findCandidates(doc) {
    const result = [];
    const visited = /* @__PURE__ */ new Set();
    for (const selector of [PRIORITY_SELECTOR, SELECTOR]) {
      let inspected = 0;
      for (const el of doc.querySelectorAll(selector)) {
        if (visited.has(el)) continue;
        visited.add(el);
        if (++inspected > 1200 || result.length >= 100) break;
        if (candidateFor(el, "c0")) result.push(el);
      }
    }
    return result.filter((el) => !result.some((other) => other !== el && other.contains(el)));
  }

  // src/content.ts
  if (!window.__jevShieldLoaded) {
    let restore = function(id, keep = true) {
      const record = hidden.get(id);
      if (!record) return;
      if (record.display) record.element.style.setProperty("display", record.display, record.priority);
      else record.element.style.removeProperty("display");
      if (keep) kept.add(record.element);
      hidden.delete(id);
    }, restoreAll = function(keep = true) {
      for (const id of hidden.keys()) restore(id, keep);
    }, hide = function(element, evaluation) {
      if (kept.has(element) || hidden.has(evaluation.candidate.id)) return;
      hidden.set(evaluation.candidate.id, { ...evaluation, element, display: element.style.getPropertyValue("display"), priority: element.style.getPropertyPriority("display") });
      element.style.setProperty("display", "none", "important");
    }, applyDecisions = function() {
      for (const [el, evaluation] of decisions) {
        if (!el.isConnected) {
          decisions.delete(el);
          hidden.delete(evaluation.candidate.id);
          continue;
        }
        const isHidden = hidden.has(evaluation.candidate.id);
        if (isHidden && !shouldHide(evaluation.probability, threshold)) restore(evaluation.candidate.id, false);
        if (hidden.has(evaluation.candidate.id)) continue;
        const current = candidateFor(el, evaluation.candidate.id);
        if (!current || signature(current) !== evaluation.signature) {
          decisions.delete(el);
          seen.delete(el);
          continue;
        }
        if (shouldHide(evaluation.probability, threshold)) hide(el, evaluation);
      }
    }, status = function() {
      for (const [id, record] of hidden) if (!record.element.isConnected) {
        hidden.delete(id);
        decisions.delete(record.element);
      }
      return { hidden: hidden.size, checked, busy, note, items: [...hidden].map(([id, r]) => ({ id, text: r.candidate.text || r.candidate.label || "Display ad", probability: r.probability })) };
    }, schedule = function() {
      if (!enabled || busy || fault || timer) return;
      timer = window.setTimeout(() => {
        timer = 0;
        void scan();
      }, 750);
    };
    restore2 = restore, restoreAll2 = restoreAll, hide2 = hide, applyDecisions2 = applyDecisions, status2 = status, schedule2 = schedule;
    window.__jevShieldLoaded = true;
    let enabled = false, busy = false, checked = 0, nextId = 0, epoch = 0, timer = 0, threshold = 0.9, note = "Ready to scan.", fault = false;
    let seen = /* @__PURE__ */ new WeakMap();
    let lastUrl = location.href;
    const kept = /* @__PURE__ */ new WeakSet();
    const decisions = /* @__PURE__ */ new Map();
    const hidden = /* @__PURE__ */ new Map();
    const send = (message) => chrome.runtime.sendMessage(message);
    const signature = ({ id, width, height, ...evidence }) => JSON.stringify(evidence);
    const observer = new MutationObserver((mutations) => {
      for (const [id, record] of hidden) {
        if (mutations.some((m) => !["style", "hidden"].includes(m.attributeName || "") && (m.target === record.element || record.element.contains(m.target)))) {
          restore(id, false);
          decisions.delete(record.element);
          seen.delete(record.element);
        }
      }
      schedule();
    });
    async function scan() {
      if (!enabled || busy || fault) return;
      if (sensitivePage(document)) {
        restoreAll(false);
        note = "Skipped: this page may contain sign-in or payment information.";
        return;
      }
      applyDecisions();
      if (checked >= MAX_PER_PAGE) {
        note = "Page scan limit reached. Reload for a new scan.";
        return;
      }
      const entries = [];
      for (const el of findCandidates(document)) {
        if (kept.has(el)) continue;
        const candidate = candidateFor(el, `c${nextId + 1}`);
        if (!candidate) continue;
        const key = signature(candidate);
        if (seen.get(el) === key) continue;
        nextId++;
        entries.push({ el, candidate, signature: key });
        if (entries.length >= Math.min(MAX_BATCH, MAX_PER_PAGE - checked)) break;
      }
      if (!entries.length) {
        note = "Watching for new ad blocks.";
        return;
      }
      busy = true;
      note = "Jev is checking likely ads\u2026";
      const version = epoch;
      entries.forEach(({ el, signature: signature2 }) => seen.set(el, signature2));
      checked += entries.length;
      try {
        const response = await send({ type: "classify", candidates: entries.map((x) => x.candidate) });
        if (version !== epoch || !enabled) {
          entries.forEach(({ el }) => seen.delete(el));
          return;
        }
        if (!response?.ok) throw new Error(response?.error || "Jev could not check this page.");
        if (sensitivePage(document)) {
          entries.forEach(({ el }) => seen.delete(el));
          restoreAll(false);
          note = "Skipped: this page may contain sensitive information.";
          return;
        }
        for (const decision of response.decisions) {
          const entry = entries.find((x) => x.candidate.id === decision.id);
          if (!entry || !entry.el.isConnected) continue;
          const current = candidateFor(entry.el, entry.candidate.id);
          if (!current || signature(current) !== entry.signature) {
            seen.delete(entry.el);
            continue;
          }
          const evaluation = { candidate: current, probability: decision.probability, signature: entry.signature };
          decisions.set(entry.el, evaluation);
          if (shouldHide(decision.probability, threshold)) hide(entry.el, evaluation);
        }
        note = "Watching for new ad blocks.";
      } catch (error) {
        if (version === epoch) {
          note = error.message;
          fault = true;
        }
        entries.forEach(({ el }) => seen.delete(el));
      } finally {
        busy = false;
        if (!fault) schedule();
      }
    }
    async function refresh(reset = false) {
      epoch++;
      enabled = false;
      observer.disconnect();
      clearTimeout(timer);
      timer = 0;
      fault = false;
      if (sensitivePage(document)) note = "Skipped: this page may contain sign-in or payment information.";
      if (reset) {
        restoreAll(false);
        decisions.clear();
        seen = /* @__PURE__ */ new WeakMap();
      }
      const version = epoch;
      try {
        const response = await send({ type: "content-settings" });
        if (version !== epoch) return;
        enabled = Boolean(response?.ok && response.enabled);
        threshold = response?.threshold ?? 0.9;
        note = enabled && sensitivePage(document) ? "Skipped: this page may contain sign-in or payment information." : enabled ? "Ready to scan." : "Paused on this site.";
        if (!enabled || sensitivePage(document)) restoreAll(false);
        if (enabled) {
          observer.observe(document.documentElement, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ["class", "id", "style", "hidden", "aria-label", "title", "src", "href", "data-ad", "data-ad-slot", "data-ad-client", "data-sponsored", "type", "autocomplete"] });
          if (!sensitivePage(document)) applyDecisions();
          schedule();
        }
      } catch {
        restoreAll(false);
        note = "Extension updated. Reload this page to reconnect.";
      }
    }
    window.setInterval(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        void refresh(true);
      }
    }, 1e3);
    window.addEventListener("pagehide", () => {
      clearTimeout(timer);
      timer = 0;
      observer.disconnect();
    });
    window.addEventListener("pageshow", (event) => {
      if (event.persisted) void refresh(true);
    });
    chrome.runtime.onMessage.addListener((message, sender, reply) => {
      if (sender.id !== chrome.runtime.id) return;
      if (message.type === "page-status") reply(status());
      else if (message.type === "restore") {
        restore(message.id);
        note = "Restored. This block will stay visible until you reload.";
        reply(status());
      } else if (message.type === "restore-all") {
        restoreAll();
        note = "Restored. These blocks will stay visible until you reload.";
        reply(status());
      } else if (message.type === "rescan") {
        fault = false;
        schedule();
        reply(status());
      } else if (message.type === "refresh") {
        void refresh(Boolean(message.reset));
        reply({ ok: true });
      }
    });
    void refresh();
  }
  var restore2;
  var restoreAll2;
  var hide2;
  var applyDecisions2;
  var status2;
  var schedule2;
})();
