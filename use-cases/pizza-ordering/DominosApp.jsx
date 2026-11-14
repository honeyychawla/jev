import React, { useEffect, useRef, useState } from 'react';
import { ArrowUp, ArrowSquareOut, Play, Pause, Check, WarningCircle, CaretDown, Browser, ArrowClockwise, Timer } from '@phosphor-icons/react';
import './live.css';
import LiveScreen from './LiveScreen.jsx';
const pretty = x => JSON.stringify(x, null, 2);
export default function DominosApp() {
  const [state, setState] = useState(null), [text, setText] = useState(''), [error, setError] = useState(''), [pending, setPending] = useState(false), [expanded, setExpanded] = useState(null), [localTiming, setLocalTiming] = useState(null), [showHistory, setShowHistory] = useState(false);
  const csrf = useRef(), lock = useRef(false), end = useRef(), entry = useRef(), autoOpened = useRef(false);
  async function load() { const [legacy, live] = await Promise.all([fetch('/api/state').then(r => r.json()), fetch('/api/live/state').then(r => r.json())]); csrf.current = legacy.csrf; setState(live); }
  useEffect(() => { load().catch(e => setError(e.message)); const timer = setInterval(() => fetch('/api/live/state').then(r => r.json()).then(setState).catch(() => {}), 1200); return () => clearInterval(timer); }, []);
  useEffect(() => { const scroller = end.current?.parentElement; scroller?.scrollTo({ top: scroller.scrollHeight, behavior: 'instant' }); }, [state?.messages?.length, pending]);
  async function post(path, body = {}) {
    const request = () => fetch(path, { method:'POST', headers:{'Content-Type':'application/json','X-CSRF-Token':csrf.current}, body:JSON.stringify(body) });
    let r = await request();
    if (r.status === 403) { const session = await fetch('/api/state').then(r=>r.json()); csrf.current=session.csrf; r=await request(); }
    if (!r.ok) throw new Error((await r.json()).error || 'Local server error.'); return r;
  }
  async function action(name) {
    setPending(true); setError('');
    try { const r = await post(`/api/live/${name}`); setState(await r.json()); }
    catch (e) { setError(e.message); }
    finally { setPending(false); }
  }
  useEffect(() => {
    if (!state || autoOpened.current) return;
    autoOpened.current = true;
    if (!state.connected && !state.busy && !pending) action('connect');
  }, [state?.connected, state?.busy, pending]);
  async function send(message = text, resume = false) {
    if (lock.current || pending || state?.busy || (!resume && !message.trim())) return;
    lock.current = true; setPending(true); setError(''); setText(''); setLocalTiming({ startedAt: Date.now(), endedAt: null });
    try {
      const r = await post('/api/live/message', resume ? { resume: true } : { message });
      const reader = r.body.getReader(), decoder = new TextDecoder(); let buffer = '';
      while (true) {
        const chunk = await reader.read(); buffer += decoder.decode(chunk.value, { stream: !chunk.done }); const lines = buffer.split('\n'); buffer = lines.pop();
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line);
          if (event.type === 'state') setState(event.data);
          if (event.type === 'error') setError(event.data.error);
          if (event.type === 'activity') setState(old => ({ ...old, activity: old.activity.some(a => a.id === event.data.id) ? old.activity.map(a => a.id === event.data.id ? event.data : a) : [...old.activity, event.data] }));
        }
        if (chunk.done) break;
      }
    } catch (e) { setError(e.message); if(!resume)setText(current=>current || message); }
    finally { lock.current = false; setPending(false); setLocalTiming(t => t ? { ...t, endedAt: Date.now() } : null); }
  }
  const busy = state?.busy || pending;
  const taskTiming = state?.taskTiming && (!localTiming || state.taskTiming.startedAt >= localTiming.startedAt) ? state.taskTiming : localTiming;
  const clicks = state?.activity?.filter(a => a.status === 'clicked') || [];
  const items = state?.cartItems || state?.observation?.products?.filter(p => p.cartQuantity) || [];
  const status = busy ? (state?.connected ? 'Jev is working on your order' : 'Opening Domino’s') : state && !state.connected ? 'Ready for your order' : ({ disconnected: 'Opening the ordering browser', ready: 'Ready for your order', working: 'Jev is working on your order', checkout: 'Stopped before payment', handoff: 'Continue on Domino’s', clarification: 'More detail needed', unavailable: 'Choose another option', error: 'Needs attention', paused: 'Paused' }[state?.status] || 'Connecting to local server');
  const messages = state?.messages || [];
  const currentStart = Math.max(0, messages.findLastIndex(message => message.role === 'user'));
  const oldMessages = messages.slice(0, currentStart), recentMessages = messages.slice(currentStart);
  const allActivity = state?.activity || [];
  const taskActivity = allActivity.filter(a => Date.parse(a.startedAt) >= (state?.taskTiming?.startedAt || 0));
  const visibleActivity = showHistory ? allActivity : taskActivity;
  const lastResponse = [...allActivity].reverse().find(a => a.response?.model);
  const apiFailed = allActivity.at(-1)?.status === 'error' && /OpenRouter|Jev timed out|unexpected model/i.test(allActivity.at(-1)?.error || '');
  const lastLatency = lastResponse?.latencyMs;
  const money = value => new Intl.NumberFormat('en-IN', {style:'currency',currency:'INR',maximumFractionDigits:2}).format(value);
  const subtotal = items.reduce((sum,item)=>sum+(Number(String(item.displayedPrice).replace(/[^0-9.]/g,'')) || 0)*(item.fromCart ? 1 : item.cartQuantity),0);
  return <div className="dominos-app">
    <header className="dominos-header">
      <a className="dominos-brand" href="/" aria-label="Domino’s chat ordering"><img src="/dominos-mark.svg" alt=""/><span>Domino’s</span></a>
      <span className="demo-caption">Local ordering demo · No payment</span>
      <details className="jev-connection"><summary><span className={`connection-dot ${apiFailed ? 'error' : lastResponse ? 'online' : ''}`}/>{apiFailed ? 'Jev connection error' : lastResponse ? 'Jev online' : state?.configured ? 'Jev key configured' : 'Checking Jev'}<CaretDown size={12}/></summary><div><b>OpenRouter · typesafe/jev-1.14</b><span>{lastResponse ? `Last real response: ${lastLatency} ms` : 'Waiting for the first API response'}</span>{lastResponse && <span>Model: {lastResponse.response.model}</span>}<span>The API key stays on this Mac.</span></div></details>
    </header>
    <main className="dominos-main">
      <div className="order-status"><span className={busy ? 'status-running' : ''}>{busy && <span className="status-pulse"/>}{status}</span><TaskTimer timing={taskTiming}/>{busy && <button className="quiet-button" onClick={()=>action('stop')}><Pause size={15}/>Pause</button>}</div>
      <div className="order-layout">
        <LiveScreen connected={Boolean(state?.connected)} busy={busy || !state} fallback={state?.screenshot} openBrowser={()=>action('connect')}/>
        <section className="order-panel chat-panel" aria-label="Domino’s order chat">
          <div className="simple-panel-heading"><h1>Your order</h1></div>
          <div className="chat-scroll">
            {oldMessages.length > 0 && <details className="earlier-messages"><summary>Earlier messages ({oldMessages.length})</summary>{oldMessages.map(m=><ChatMessage key={m.id} message={m}/>)}</details>}
            {!messages.length && <div className="chat-welcome"><h2>What would you like?</h2><p>Tell me the item, size and quantity. You can change it anytime.</p><button className="suggested-order" onClick={()=>send('One large Margherita pizza.')} disabled={busy}>One large Margherita <ArrowUp size={15}/></button></div>}
            {recentMessages.map(m=><ChatMessage key={m.id} message={m}/>)}
            {busy && <div className="chat-working"><span className="status-pulse"/> {state?.connected ? 'Reading the page and choosing the next step…' : 'Opening Domino’s…'}</div>}
            {error && <p className="inline-error" role="alert">{error}</p>}
            <div ref={end}/>
          </div>
          {['handoff','paused','error'].includes(state?.status) && !busy && <div className="continue-strip"><span>{state.status==='error' ? 'Review the cart, then resume the remaining steps.' : state.status==='paused' ? 'Paused. Continue when ready.' : 'Complete the required step on Domino’s.'}</span><button className="quiet-button" onClick={()=>send('',true)}><Play size={14}/>Resume</button></div>}
          <form className="order-composer" onSubmit={e=>{e.preventDefault();send();}}><label className="sr-only" htmlFor="live-message">Domino’s order message</label><textarea ref={entry} id="live-message" value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();send();}}} rows={2} maxLength={1200} placeholder="e.g. Two large Margheritas"/><button type="submit" className="primary-button" aria-label="Send Domino’s message" disabled={busy||!state||!text.trim()}><ArrowUp size={20}/></button></form>
        </section>
        <section className="order-panel cart-panel" aria-label="Live Domino’s browser and cart">
          <div className="simple-panel-heading"><h2>Cart</h2><button className="quiet-button icon-button" aria-label="Refresh cart" onClick={()=>action('observe')} disabled={busy||!state?.connected}><ArrowClockwise size={17}/></button></div>
          <div className="cart-content">
            {state?.cartRecoveryNeeded && state.savedCart?.length>0 && <div className="saved-cart-notice"><b>Your saved cart is available</b><p>The website cart is empty. A previous cart is saved here.</p><button className="quiet-button" disabled={busy} onClick={()=>send(`Restore my saved cart: ${state.savedCart.map(item=>`${item.cartQuantity} ${item.name}, ${item.variant}`).join('; ')}. Restore these quantities, adding only what is missing. Keep other items. Then show the cart and stop before payment.`)}>Restore {state.savedCart.reduce((n,item)=>n+item.cartQuantity,0)} saved items</button></div>}
            {!state?.cartVerified && items.length>0 && <p className="cart-verification">Checking sizes and quantities against Domino’s cart…</p>}
            {items.length ? <div className="cart-lines">{items.map((item,i)=><article key={`${item.name}-${item.variant}-${i}`}><span className="cart-quantity">{item.cartQuantity}×</span><div><h3>{item.name}</h3><p>{item.variant.replace(/(Regular|Medium|Large)(?=[A-Z])/,'$1 · ').replace(/\s*\|\s*/g,' · ')}</p></div><span className="line-price">{item.fromCart ? item.displayedPrice : money(Number(String(item.displayedPrice).replace(/[^0-9.]/g,''))*item.cartQuantity)}</span></article>)}</div> : <p className="empty-cart">Your items will appear here.</p>}
            {state?.cartVerified && items.length>0 && <div className="cart-total"><span>{state.observation?.totals?.total ? 'Total' : 'Items subtotal'}</span><strong>{state.observation?.totals?.total ? `₹${state.observation.totals.total}` : money(subtotal)}</strong></div>}
          </div>
          <div className="cart-bottom"><button className="primary-button review-button" disabled={busy||!items.length} onClick={()=>send('That’s all. Show the final cart and total, then stop before payment.')}>Review order</button><p>No order is placed automatically.</p></div>
        </section>
        <section className="order-panel activity-panel-simple" aria-label="Every Jev decision and browser click">
          <div className="simple-panel-heading"><h2>Jev activity</h2><span>{taskActivity.filter(a=>a.status==='clicked').length} {taskActivity.filter(a=>a.status==='clicked').length === 1 ? 'click' : 'clicks'}</span></div>
          <div className="activity-list">{visibleActivity.length ? visibleActivity.map((a,i)=><ClickEntry key={a.id} item={a} number={i+1} expand={setExpanded}/>) : <p className="empty-activity">Each decision and click will appear here as Jev works.</p>}</div>
          {allActivity.length>taskActivity.length && <button className="history-toggle" onClick={()=>setShowHistory(!showHistory)}>{showHistory ? 'Show current task only' : `Previous activity (${allActivity.length-taskActivity.length})`}</button>}
        </section>
      </div>
    </main>
    {expanded && <div className="screenshot-overlay" role="dialog" aria-label="Browser screenshot" aria-modal="true" onClick={()=>setExpanded(null)}><button autoFocus className="primary-button" onClick={()=>setExpanded(null)} onKeyDown={e=>{if(e.key==='Escape')setExpanded(null);}}>Close screenshot</button><img src={expanded} alt="Domino’s browser screenshot" onClick={e=>e.stopPropagation()}/></div>}
  </div>;
}
function ChatMessage({message}) {
  return <div className={`order-message ${message.role}`}><span>{message.role==='user' ? 'You' : 'Jev'}</span><p>{message.text}</p></div>;
}
function ClickEntry({item:a,number,expand}) {
  const answer=a.response?.answers?.next_action;
  const label=a.kind==='interpretation'?a.title:a.target ? `${a.target.label}${a.target.product ? ` · ${a.target.product}` : ''}` : ({stop_done:'Cart verified',stop_checkout:'Ready for review',stop_handoff:'Your input is needed',stop_clarification:'More detail needed',stop_unavailable:'Option unavailable'}[a.choice] || 'Choosing the next step…');
  return <article className={`jev-step ${a.status}`}><div className="step-main"><span className="step-number">{a.status==='clicked' ? <Check size={13}/> : number}</span><p>{label}</p></div><div className="step-meta"><span>{a.latencyMs!=null ? `API ${a.latencyMs} ms` : 'Waiting for Jev'}{answer?.confidence!=null ? ` · ${Math.round(answer.confidence*100)}% confidence` : ''}</span></div>
    <details className="step-details"><summary>Decision details <CaretDown size={11}/></summary>{Object.entries(a.request?.questions||{}).map(([key,q])=><div key={key}><p><b>{key}:</b> {a.response?.answers?.[key]?.choice||'Pending'}{a.response?.answers?.[key]?.confidence!=null?` · ${Math.round(a.response.answers[key].confidence*100)}% confidence`:''}</p><p>{q.instructions}</p></div>)}{a.error && <p className="inline-error">{a.error}</p>}{a.screenshotAfter && <button className="quiet-button" onClick={()=>expand(a.screenshotAfter)} aria-label={`Enlarge screenshot after click ${number}`}>View click screenshot <ArrowSquareOut size={12}/></button>}<details><summary>Full request & response</summary><pre>{pretty({request:a.request,response:a.response})}</pre></details></details>
  </article>;
}
function TaskTimer({ timing }) {
  const [now, setNow] = useState(Date.now);
  const running = Boolean(timing && timing.endedAt == null);
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(timer);
  }, [running, timing?.startedAt]);
  const elapsed = timing ? Math.max(0, timing.durationMs ?? ((timing.endedAt ?? now) - timing.startedAt)) : 0;
  const minutes = Math.floor(elapsed / 60000);
  const seconds = (Math.floor((elapsed % 60000) / 100) / 10).toFixed(1).padStart(4, '0');
  const value = `${String(minutes).padStart(2, '0')}:${seconds}`;
  return <div className={`task-timer ${running ? 'running' : ''}`} title="Total task time, including browser startup, Jev calls, clicks, and page loading. Resets for each message or Resume.">
    <Timer size={16}/><span>{running ? 'Task time' : timing ? 'Last task' : 'Task time'}</span><output role="timer" aria-label="Task execution time" aria-live="off">{value}</output>
  </div>;
}
