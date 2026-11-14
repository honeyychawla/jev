import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ArrowRight, ArrowUpRight, Check, Copy, GearSix, MagnifyingGlass, X } from '@phosphor-icons/react';
import { getCatalog, getStatus, getSuggestions } from './api';
import { SettingsPanel } from './Settings';
import { EmojiMotion, MovingEmoji } from './EmojiMotion';
import type { AppStatus, EmojiItem, Suggestions } from '../shared/types';

function useLiveSuggestions(text: string, composing: boolean, configured: boolean | undefined) {
  const [result, setResult] = useState<Suggestions | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const immediate = useRef(false);
  useEffect(() => {
    setResult(null); setError(''); setBusy(false);
    if (!text.trim() || composing || configured === undefined) return;
    const controller = new AbortController();
    setBusy(true);
    const timer = window.setTimeout(() => {
      getSuggestions(text.trim(), controller.signal).then(value => {
        if (!controller.signal.aborted) { setResult(value); setBusy(false); }
      }).catch(err => {
        if (!controller.signal.aborted) { setError(err instanceof Error ? err.message : 'Could not load suggestions.'); setBusy(false); }
      });
    }, immediate.current ? 0 : 450);
    immediate.current = false;
    return () => { clearTimeout(timer); controller.abort(); };
  }, [text, composing, configured, revision]);
  return { result: result?.text === text.trim() ? result : null, error, busy, retry: () => { immediate.current = true; setRevision(value => value + 1); } };
}

function Modal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current!; dialog.showModal(); return () => dialog.close(); }, []);
  return <dialog ref={ref} className={`modal ${wide ? 'picker-modal' : ''}`} onCancel={onClose} onClick={event => { if (event.target === ref.current) onClose(); }} aria-labelledby="modal-title">
    <div className="modal-header"><h2 id="modal-title">{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={20} /></button></div>
    {children}
  </dialog>;
}

function EmojiPicker({ onPick, onClose }: { onPick: (item: EmojiItem) => void; onClose: () => void }) {
  const [catalog, setCatalog] = useState<EmojiItem[]>([]);
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('All');
  const [variants, setVariants] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { getCatalog().then(setCatalog).catch(() => setError('Could not load the emoji catalog. Close and try again.')); }, []);
  const groups = useMemo(() => ['All', ...new Set(catalog.map(e => e.group))], [catalog]);
  const filtered = useMemo(() => {
    const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    return catalog.filter(e => (variants || e.tone === null || words.some(w => ['skin', 'tone', 'light', 'dark', 'medium'].includes(w))) && (group === 'All' || group === e.group) && words.every(word => `${e.label} ${e.emoji} ${e.tags.join(' ')}`.toLowerCase().includes(word)));
  }, [catalog, query, group, variants]);
  return <Modal title="All emoji" onClose={onClose} wide>
    <div className="picker-controls">
      <label className="search-input"><MagnifyingGlass size={19} /><input autoFocus aria-label="Search all emoji" placeholder="Search a feeling, food, place…" value={query} onChange={e => setQuery(e.target.value)} /></label>
      <div className="picker-filters"><select aria-label="Emoji category" value={group} onChange={e => setGroup(e.target.value)}>{groups.map(g => <option key={g}>{g}</option>)}</select><label><input type="checkbox" checked={variants} onChange={e => setVariants(e.target.checked)} /> Skin tones</label></div>
    </div>
    <div className="picker-grid">{filtered.map(e => <button className="picker-emoji" key={e.id} title={e.label} aria-label={`Insert ${e.label}`} onClick={() => { onPick(e); onClose(); }}>{e.emoji}</button>)}
      {filtered.length === 0 && <p className="picker-empty">{error || (catalog.length ? 'No matches. Try another word or category.' : 'Loading the emoji catalog…')}</p>}
    </div>
    <div className="picker-footer">{filtered.length.toLocaleString()} emoji · Appearance depends on your device</div>
  </Modal>;
}

const noise = (seed: number) => { const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453; return value - Math.floor(value); };

const EmojiFloor = memo(function EmojiFloor({ catalog, featured }: { catalog: EmojiItem[]; featured: EmojiItem[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  const pieces = useMemo(() => {
    const base = catalog.filter(emoji => emoji.tone === null);
    if (!base.length || !width) return [];
    const columns = Math.ceil(width / (width < 600 ? 38 : 47));
    const settled = Array.from({ length: columns * 4 }, (_, index) => {
      const row = Math.floor(index / columns);
      const column = index % columns;
      if (row === 3 && noise(index + 71) < 0.52) return null;
      if (row === 2 && noise(index + 52) < 0.15) return null;
      const emoji = base[Math.floor(noise(index + 17) * base.length)];
      return { emoji, index, style: {
        '--x': `${((column + (row % 2 ? .5 : 0) + noise(index + 3) * .28) / columns) * 100}%`,
        '--bottom': `${row * 30 + noise(index + 8) * 14 - 8}px`,
        '--angle': `${noise(index + 12) * 70 - 35}deg`,
        '--size': `${(width < 600 ? 34 : 40) + noise(index + 9) * 12}px`,
        '--delay': `${row * 65 + noise(index + 33) * 230}ms`,
      } as CSSProperties };
    }).filter(piece => piece !== null);
    const assigned = new Set<number>();
    for (const emoji of featured.slice(-Math.min(24, settled.length))) {
      let slot = Array.from(emoji.id).reduce((value, character) => (value * 31 + character.charCodeAt(0)) >>> 0, 0) % settled.length;
      while (assigned.has(slot)) slot = (slot + 1) % settled.length;
      assigned.add(slot);
      settled[slot] = { ...settled[slot], emoji };
    }
    return settled;
  }, [catalog, width, featured]);
  return <div className="emoji-floor" ref={ref} aria-hidden="true">{pieces.map(piece => <span className="fallen-emoji" data-emoji-id={piece.emoji.id} key={piece.index} style={piece.style}>{piece.emoji.emoji}</span>)}</div>;
});

export function App() {
  const [text, setText] = useState('');
  const [shown, setShown] = useState<Suggestions | null>(null);
  const [featured, setFeatured] = useState<EmojiItem[]>([]);
  const flightLayer = useRef<HTMLDivElement>(null);
  const [motion] = useState(() => new EmojiMotion(flightLayer));
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [catalog, setCatalog] = useState<EmojiItem[]>([]);
  const [serverError, setServerError] = useState('');
  const [settings, setSettings] = useState(false);
  const [picker, setPicker] = useState(false);
  const [composing, setComposing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const pendingCaret = useRef<number | null>(null);
  const live = useLiveSuggestions(text, composing, status?.configured);
  const hasText = Boolean(text.trim());
  const floorFeatured = useMemo(() => [...new Map([...featured, ...(shown?.emojis ?? [])].map(emoji => [emoji.id, emoji])).values()].slice(-24), [featured, shown]);
  useEffect(() => {
    if (live.result) setShown(live.result);
    else if (live.error) setShown(null);
  }, [live.result, live.error]);
  useEffect(() => {
    if (shown) setFeatured(previous => [...new Map([...previous, ...shown.emojis].map(emoji => [emoji.id, emoji])).values()].slice(-24));
  }, [shown]);
  useLayoutEffect(() => { motion.syncSources(); }, [floorFeatured, motion]);
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    window.addEventListener('resize', motion.finish);
    preference.addEventListener('change', motion.finish);
    return () => { window.removeEventListener('resize', motion.finish); preference.removeEventListener('change', motion.finish); motion.dispose(); };
  }, [motion]);
  function changeText(value: string, inputType = '') {
    if (!value.trim() || value.length < text.length || inputType.startsWith('delete')) setShown(null);
    setText(value);
  }

  const refreshStatus = useCallback(() => {
    getStatus().then(value => { setStatus(value); setServerError(''); }).catch(() => setServerError('Local server is offline.'));
  }, []);
  useEffect(() => {
    refreshStatus();
    getCatalog().then(setCatalog).catch(() => {});
    const timer = setInterval(refreshStatus, 3000);
    window.addEventListener('focus', refreshStatus);
    return () => { clearInterval(timer); window.removeEventListener('focus', refreshStatus); };
  }, [refreshStatus]);
  useLayoutEffect(() => {
    if (input.current && pendingCaret.current !== null) {
      input.current.focus();
      input.current.setSelectionRange(pendingCaret.current, pendingCaret.current);
      pendingCaret.current = null;
    }
  }, [text]);

  function insertEmoji(emoji: EmojiItem) {
    const start = input.current?.selectionStart ?? text.length;
    const finish = input.current?.selectionEnd ?? start;
    const value = text.slice(0, start) + emoji.emoji + text.slice(finish);
    if (value.length > 2000) return;
    pendingCaret.current = start + emoji.emoji.length;
    changeText(value);
  }
  function clear() { changeText('', 'deleteContent'); input.current?.focus(); }
  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); setCopied(true); setCopyError(''); setTimeout(() => setCopied(false), 1800); }
    catch { setCopyError('Could not copy. Select the text and copy it manually.'); }
  }
  const emojis = shown?.emojis ?? [];

  return <div className="search-page">
    <header className="page-header">
      <nav aria-label="Tools"><button className="nav-button" onClick={() => setPicker(true)}>All emoji</button><button className="icon-button settings-button" aria-label="Settings" title="Settings" onClick={() => setSettings(true)}><GearSix size={20} /></button></nav>
    </header>

    <main className="search-stage">
      <h1 className="wordmark">emote<span>.</span></h1>
      <form className="search-form" role="search" onSubmit={event => { event.preventDefault(); if (hasText && !composing && !live.busy) live.retry(); }}>
        <div className="search-bar">
          <MagnifyingGlass className="search-symbol" size={21} aria-hidden="true" />
          <label className="sr-only" htmlFor="message">Your message</label>
          <input ref={input} id="message" type="text" autoComplete="off" spellCheck={false} maxLength={2000} value={text} placeholder="Describe an emoji, or just start typing" onChange={event => changeText(event.target.value, (event.nativeEvent as InputEvent).inputType)} onCompositionStart={() => setComposing(true)} onCompositionEnd={() => setComposing(false)} onKeyDown={event => { if (event.key === 'Escape') clear(); if (event.key === 'Enter' && (composing || event.nativeEvent.isComposing)) event.preventDefault(); }} />
          {hasText && <button type="button" className="icon-button clear-button" aria-label="Clear search" title="Clear" onClick={clear}><X size={18} /></button>}
          <button type="submit" className="search-submit" aria-label="Search emoji" title="Search" disabled={!hasText || composing || live.busy}><ArrowRight size={21} /></button>
        </div>
      </form>

      <section className={`search-results ${hasText ? 'has-query' : ''}`} aria-label="Emoji suggestions" aria-live="polite" aria-busy={live.busy}>
        {!hasText ? <p className="search-hint">Find the right emoji for what you mean.</p>
          : live.error ? <div className="result-error" role="alert"><span>{live.error}</span><button className="text-button" onClick={live.retry}>Retry</button></div>
          : emojis.length ? <><div className="matches">{emojis.map((emoji, index) => <MovingEmoji key={emoji.id} emoji={emoji} order={index} count={emojis.length} motion={motion} onPick={insertEmoji} />)}</div><div className="results-caption"><span>{live.busy ? 'Updating matches…' : shown?.source === 'local' ? 'Keyword preview' : 'Click an emoji to add it'}{shown?.source === 'local' && <button className="text-button" onClick={() => setSettings(true)}>Connect Jev</button>}</span><button className="copy-text" onClick={() => void copy(text)} aria-label="Copy text">{copied ? <Check size={13} /> : <Copy size={13} />}{copied ? 'Copied' : 'Copy text'}</button></div></>
          : live.busy ? <div className="loading-results"><span className="loading-dots" aria-hidden="true"><i /><i /><i /></span><span>Finding emoji</span></div>
          : <p className="no-results">{status?.configured ? 'No matches. Try a different description.' : <>No keyword matches. <button className="text-button" onClick={() => setSettings(true)}>Connect Jev for meaning-based search.</button></>}</p>}
        {copyError && !settings && <p className="copy-error" role="alert">{copyError}</p>}
      </section>
    </main>

    <EmojiFloor catalog={catalog} featured={floorFeatured} />
    <div className="emoji-motion-layer" ref={flightLayer} aria-hidden="true" />
    <footer className="page-footer"><span>{status ? `${status.emojiCount.toLocaleString()} emoji` : 'Emoji search'}</span><button onClick={() => setSettings(true)}>{serverError || (status?.configured ? 'Jev · OpenRouter' : 'Connect OpenRouter')}<ArrowUpRight size={12} /></button></footer>

    {picker && <EmojiPicker onPick={insertEmoji} onClose={() => { setPicker(false); input.current?.focus(); }} />}
    {settings && <Modal title="Connect OpenRouter" onClose={() => { setSettings(false); setCopyError(''); }}><SettingsPanel status={status} onConnected={value => { setStatus(value); setServerError(''); if (text.trim()) live.retry(); }} /></Modal>}
  </div>;
}
