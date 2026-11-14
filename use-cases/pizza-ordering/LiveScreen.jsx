import React, { useEffect, useRef, useState } from 'react';
import { ArrowsOut, ArrowsIn, ArrowSquareOut, Browser } from '@phosphor-icons/react';
import { paintLiveFrame } from './live-frame-renderer.mjs';

export default function LiveScreen({ connected, busy, fallback, openBrowser }) {
  const [hasFrame, setHasFrame] = useState(false), [phase, setPhase] = useState('connecting'), [expanded, setExpanded] = useState(false);
  const screen = useRef(), canvas = useRef();
  useEffect(() => {
    if (!connected) { setPhase('saved'); return; }
    let stopped = false, timer;
    const controller = new AbortController();
    async function refresh() {
      if (document.visibilityState === 'hidden') { timer = setTimeout(refresh, 1500); return; }
      try {
        const response = await fetch('/api/live/frame', { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(7000)]), cache: 'no-store' });
        if (!response.ok) throw new Error('Screen unavailable');
        const bytes = await response.blob();
        if (stopped) return;
        if (await paintLiveFrame(canvas.current, bytes, () => !stopped)) {
          canvas.current.dataset.capturedAt = response.headers.get('X-Frame-Captured-At');
          setHasFrame(true);
          setPhase('live');
        }
      } catch {
        if (!stopped) setPhase('reconnecting');
      }
      if (!stopped) timer = setTimeout(refresh, 750);
    }
    setPhase('connecting'); refresh();
    return () => { stopped = true; clearTimeout(timer); controller.abort(); };
  }, [connected]);
  useEffect(() => {
    if (!expanded) return;
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = before; };
  }, [expanded]);
  function handleKeys(event) {
    if (!expanded) return;
    if (event.key === 'Escape') { setExpanded(false); return; }
    if (event.key === 'Tab') {
      const buttons = [...screen.current.querySelectorAll('button:not(:disabled)')];
      const first = buttons[0], last = buttons.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }
  const hasView = hasFrame || fallback;
  const label = !connected ? 'Browser closed · last view' : phase === 'live' ? 'Live' : phase === 'reconnecting' ? 'Reconnecting view…' : 'Connecting view…';
  return <>
    {expanded && <div className="live-screen-backdrop" onClick={() => setExpanded(false)}/>}
    <section ref={screen} className={`order-panel live-screen-panel ${expanded ? 'screen-expanded' : ''}`} aria-label="Domino’s live screen" role={expanded ? 'dialog' : undefined} aria-modal={expanded ? true : undefined} onKeyDown={handleKeys}>
      <div className="simple-panel-heading"><h2>Domino’s screen</h2><div className="screen-controls"><span className={`screen-state ${connected && phase === 'live' ? 'is-live' : ''}`}><i/>{label}</span><button className="quiet-button" disabled={!hasView} onClick={() => setExpanded(!expanded)} aria-label={expanded ? 'Shrink live screen' : 'Expand live screen'}>{expanded ? <ArrowsIn size={16}/> : <ArrowsOut size={16}/>}<span>{expanded ? 'Shrink' : 'Expand'}</span></button></div></div>
      <div className="live-screen-stage"><canvas ref={canvas} className="live-screen-image" hidden={!hasFrame} role="img" aria-label="Live view of the Domino’s ordering website"/>{!hasFrame && (fallback ? <img className="live-screen-image" src={fallback} alt="Last captured view of the Domino’s ordering website"/> : <div className="screen-placeholder"><Browser size={36}/><h3>Your ordering screen</h3><p>The Domino’s website will appear here.</p><button className="primary-button" disabled={busy} onClick={openBrowser}>Open Domino’s</button></div>)}</div>
      <div className="screen-caption"><span>{connected ? 'Watch here. Use the browser to enter details.' : 'Open the browser to resume the live view.'}</span><button className="quiet-button" disabled={busy} onClick={openBrowser}>Use browser <ArrowSquareOut size={13}/></button></div>
    </section>
  </>;
}
