import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Pizza, ArrowUp, ArrowRight, Receipt, Lightning, Check, ArrowCounterClockwise, Plus, CaretDown, X, ChatCircleDots, CircleNotch, WarningCircle, Coffee, Code, LockSimple, CheckCircle, List } from '@phosphor-icons/react';
import './style.css';
import DominosApp from './DominosApp.jsx';

const money = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value / 100);
const pretty = value => JSON.stringify(value, null, 2);
const label = value => value.replaceAll('_', ' ');
function App() {
  const [state, setState] = useState(null);
  const [activity, setActivity] = useState([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const chatEnd = useRef();
  const input = useRef();
  const csrf = useRef();
  const requestLock = useRef(false);
  function update(s) { setState(old => ({ ...old, ...s })); if (s.activity) setActivity(s.activity); if (s.csrf) csrf.current = s.csrf; }
  async function load() {
    try { const response = await fetch('/api/state'); if (!response.ok) throw new Error('Could not connect to the local server.'); update(await response.json()); setError(''); }
    catch (e) { setError(e.message); }
  }
  useEffect(() => { load(); }, []);
  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: 'instant', block: 'nearest' }); }, [state?.messages, busy]);
  async function post(path, body) {
    return fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf.current }, body: JSON.stringify(body) });
  }
  async function send(message = text, retry = false) {
    if (requestLock.current || !state || (!retry && !message.trim())) return;
    requestLock.current = true; setBusy(true); setError('');
    const previous = text; setText('');
    try {
      const response = await post('/api/message', retry ? { retry: true } : { message });
      if (!response.ok) throw new Error((await response.json()).error);
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split('\n'); buffer = lines.pop();
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line);
          if (event.type === 'state') update(event.data);
          if (event.type === 'error') setError(event.data.error);
          if (event.type === 'activity') setActivity(old => old.some(a => a.id === event.data.id) ? old.map(a => a.id === event.data.id ? event.data : a) : [...old, event.data]);
        }
        if (done) break;
      }
    } catch (e) { setError(`${e.message} No further changes will be made until you retry or refresh.`); setText(previous); }
    finally { requestLock.current = false; setBusy(false); setTimeout(() => input.current?.focus(), 0); }
  }
  async function action(path, payload = {}) {
    if (requestLock.current) return;
    requestLock.current = true; setBusy(true); setError('');
    try { const response = await post(path, payload); const data = await response.json(); if (!response.ok) throw new Error(data.error); update(data); setText(''); }
    catch (e) { setError(e.message); }
    finally { requestLock.current = false; setBusy(false); }
  }
  const cart = state?.cart;
  const calls = activity.filter(a => a.status !== 'pending');
  const latency = calls.reduce((sum, a) => sum + (a.latencyMs || 0), 0);
  const disabled = busy || state?.busy || !state?.configured || Boolean(state?.failed || state?.order);
  return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href="/" aria-label="Slice home"><span className="brand-symbol"><Pizza size={27} weight="bold"/></span><span>slice<span className="brand-dot">.</span></span><span className="brand-divider"/><span className="brand-caption">THE LOCAL<br/>PIZZA COUNTER</span></a>
      <div className="top-actions"><span className="local-status"><span className="status-dot"/>{state?.configured ? 'Local server · key configured' : state ? 'API key missing' : 'Connecting locally'}</span><button className="button subtle" onClick={() => action('/api/reset')} disabled={busy || !state}><Plus size={16}/> New order</button></div>
    </header>
    <main>
      <div className="intro"><div><div className="eyebrow">A LITTLE CONVERSATION. A GREAT ORDER.</div><h1>Pizza, in your words.</h1><p>Tell us what sounds good. Change your mind. We’ll keep up.</p></div><button className="button menu-button" onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen}><List size={19}/> {menuOpen ? 'Hide menu' : 'Explore the menu'}<CaretDown className={menuOpen ? 'rotate' : ''} size={15}/></button></div>
      <div className="menu-ribbon"><span className="ribbon-label">ON THE MENU</span><span>Mushroom</span><span>Margherita</span><span>Pepperoni</span><span className="ribbon-rule"/><span>Lemonade & sparkling water</span><span className="ribbon-note">Demo prices in USD</span></div>
      {menuOpen && <section className="menu-drawer" aria-label="Pizza menu">{state?.menu?.map(item => <div className="menu-item" key={item.id}><span className="small-icon">{item.kind === 'pizza' ? <Pizza size={22}/> : <Coffee size={22}/>}</span><h3>{item.name}</h3><p>{item.description}</p><div>{Object.entries(item.sizes).map(([size, price]) => <span key={size}><b>{label(size)}</b> {money(price)}</span>)}</div><button className="text-button" onClick={() => { setText(`One ${item.kind === 'pizza' ? 'medium ' : ''}${item.name.toLowerCase()}.`); input.current?.focus(); }}>Compose order <ArrowRight size={14}/></button></div>)}</section>}
      {!state && <div className="connection-notice" role="status">{error || 'Connecting to your local pizza counter…'}{error && <button className="button" onClick={load}>Reconnect</button>}</div>}
      {state && !state.configured && <div className="error-banner" role="alert"><WarningCircle size={22}/> The local server cannot find OPENROUTER_API_KEY. Ordering is stopped until the server key is configured.</div>}
      <div className="workspace">
        <section className="panel chat-panel" aria-label="Order chat">
          <PanelHeader number="01" title="Let’s talk pizza" subtitle="YOUR CONVERSATION" icon={<ChatCircleDots size={20}/>}/>
          <div className="chat-scroll" aria-live="polite" aria-relevant="additions text">
            <div className="chat-date">TODAY’S ORDER</div>
            <div className="assistant-message"><div className="avatar"><Pizza size={18}/></div><div className="bubble"><span className="speaker">SLICE COUNTER</span><p>Hey, welcome to Slice.<br/>What can I get started for you?</p><p className="message-muted">Try a pizza and a drink, one item at a time. Say “that’s all” when you’re ready.</p></div></div>
            {!state?.messages?.length && <div className="suggestions"><span>START WITH A FAVORITE</span><button onClick={() => send('One large mushroom pizza.')} disabled={disabled}><Pizza size={17}/> One large mushroom pizza <ArrowUp size={15}/></button><button onClick={() => send('Show me the menu.')} disabled={disabled}>What’s on the menu? <ArrowUp size={15}/></button></div>}
            {state?.messages?.map(m => <div key={m.id} className={m.role === 'user' ? 'user-message' : 'assistant-message'}>{m.role === 'assistant' && <div className="avatar"><Pizza size={18}/></div>}<div className="bubble">{m.role === 'assistant' && <span className="speaker">SLICE COUNTER</span>}<p>{m.text}</p></div></div>)}
            {busy && <div className="working" role="status"><span className="working-dots"><i/><i/><i/></span>{state?.ready ? 'Saving your demo order…' : 'Waiting for Jev’s decision…'}</div>}
            {(error || state?.failed) && <div className="chat-error" role="alert"><WarningCircle size={22}/><strong>Order paused</strong><p>{error || state.failed.error}</p><p>Your existing cart is preserved.</p>{state?.failed ? <button className="button" onClick={() => send('', true)} disabled={busy}><ArrowCounterClockwise size={16}/> Retry with Jev</button> : <button className="button" onClick={load}>Refresh status</button>}</div>}
            <div ref={chatEnd}/>
          </div>
          <div className="composer"><form onSubmit={e => { e.preventDefault(); send(); }}><label className="sr-only" htmlFor="message">Your order message</label><textarea id="message" ref={input} rows={2} value={text} maxLength={1200} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }} disabled={disabled} placeholder={state?.order ? 'Demo order saved. Start a new order above.' : 'One large mushroom pizza…'}/><button className="send-button" type="submit" aria-label="Send message" disabled={disabled || !text.trim()}><ArrowUp size={21} weight="bold"/></button></form><div className="composer-note"><span>Enter to send · Shift + Enter for a new line</span><span>{busy ? 'Jev is working' : 'Make it yours'}</span></div></div>
        </section>
        <section className="panel cart-panel" aria-label="Live cart">
          <PanelHeader number="02" title="Your table" subtitle="THE LIVE CART" icon={<Receipt size={20}/>}/>
          <div className="cart-body" aria-live="polite">
            <div className="cart-label"><span>{state?.order ? 'SAVED DEMO ORDER' : state?.ready ? 'REVIEW YOUR ORDER' : 'ORDER IN PROGRESS'}</span><span>{cart?.quantity || 0} {(cart?.quantity || 0) === 1 ? 'item' : 'items'}</span></div>
            {!cart?.items.length ? <div className="empty-cart"><div className="empty-pizza"><Pizza size={57} weight="thin"/></div><h3>A little room for pizza.</h3><p>Your order will appear here<br/>as you chat.</p></div> : <div className="cart-items">{cart.items.map(item => <div className="cart-item" key={item.id}><div className="item-illustration">{item.kind === 'pizza' ? <Pizza size={28} weight="light"/> : <Coffee size={28} weight="light"/>}</div><div className="item-details"><h3>{item.name}</h3><p>{label(item.size)}{item.kind === 'drink' && ' · 330 ml'}</p><span className="quantity">Qty {item.quantity}</span><span className="unit-price">{money(item.unitPrice)} each</span></div><strong>{money(item.lineTotal)}</strong></div>)}</div>}
            {state?.ready && <div className="review-note"><CheckCircle size={18}/><span>Everything look good?<br/>Confirm below to save your demo order.</span></div>}
            {state?.order && <div className="saved-order"><div className="saved-check"><Check size={26} weight="bold"/></div><h3>That’s your order.</h3><p>Saved on this Mac</p><span className="order-number">{state.order.orderNumber}</span><a className="text-button" download={`${state.order.orderNumber}.json`} href={`data:application/json;charset=utf-8,${encodeURIComponent(pretty(state.order))}`}>Download receipt <ArrowRight size={14}/></a></div>}
          </div>
          <div className="checkout"><div className="totals-line"><span>Subtotal</span><span>{money(cart?.subtotal || 0)}</span></div><div className="totals-line faint"><span>Demo fees & tax</span><span>{money(0)}</span></div><div className="total"><span>Total</span><strong>{money(cart?.total || 0)}<small>USD</small></strong></div><div className="demo-label">Demo — no food purchased.</div><button className="button confirm-button" disabled={busy || !state?.ready || !!state?.failed || !!state?.order} onClick={() => action('/api/confirm', { revision: state.revision })}>{state?.order ? <><Check size={18}/> Order saved</> : <>Confirm <ArrowRight size={18}/></>}</button><p className="checkout-hint">{state?.order ? 'No payment. No restaurant order.' : state?.ready ? 'Saves this order locally on your Mac.' : 'Say “that’s all” in chat to review and confirm.'}</p></div>
        </section>
        <section className="panel activity-panel" aria-label="Jev activity">
          <PanelHeader number="03" title="Behind the order" subtitle="JEV ACTIVITY" icon={<Lightning size={20}/>}/>
          <div className="model-strip"><span className="model-dot"/><span>typesafe/jev-1.14</span><span className="api-label">OPENROUTER</span></div>
          <div className="activity-scroll">
            {!activity.length ? <div className="activity-empty"><div className="activity-mark"><Code size={29} weight="light"/></div><h3>Every decision, in the open.</h3><p>Send a message to see the questions we ask Jev and the answers it actually returns.</p><div className="activity-steps"><div><span>1</span> Your message + menu + cart</div><div><span>2</span> Jev selects an action and options</div><div><span>3</span> Local code updates the cart</div></div><span className="no-results">No API calls yet</span></div> : [...activity].reverse().map((entry, idx) => <Activity key={entry.id} entry={entry} number={activity.length - idx}/>)}
          </div>
          <div className="activity-footer"><span><b>{calls.length}</b> API {calls.length === 1 ? 'call' : 'calls'}</span><span>{latency ? `${(latency / 1000).toFixed(2)} s total` : 'Awaiting first response'}</span></div>
        </section>
      </div>
      <footer className="footer"><span><LockSimple size={14}/> API key stays on your local server.</span><span>Jev decides. Code calculates. You confirm.</span><span>A demo, with real decisions.</span></footer>
    </main>
  </div>;
}
function PanelHeader({ number, title, subtitle, icon }) { return <div className="panel-header"><div className="panel-number">{number}</div><div><span className="panel-subtitle">{subtitle}</span><h2>{title}</h2></div><span className="panel-icon">{icon}</span></div>; }
function Activity({ entry, number }) {
  const answers = entry.response?.answers || {};
  return <article className={`activity-entry ${entry.status}`}><div className="activity-title"><span className="call-number">{String(number).padStart(2, '0')}</span><h3>{entry.title}</h3><span className="call-status">{entry.status === 'pending' ? 'LIVE' : entry.status === 'error' ? 'ERROR' : `${entry.latencyMs.toLocaleString()} ms`}</span></div>{entry.status === 'pending' && <p className="pending-label">Questions sent. Waiting for the API…</p>}{entry.error && <p className="activity-error">{entry.error}</p>}<div className="decision-list">{Object.entries(entry.request.questions).map(([name, question]) => <details className="decision" key={name}><summary><span className="decision-key">{label(name)}</span><span className="decision-answer">{answers[name]?.choice || (entry.status === 'pending' ? '…' : 'No result')}</span><span className="confidence">{answers[name]?.confidence != null ? `${(answers[name].confidence * 100).toFixed(1)}%` : '—'}</span><CaretDown size={12}/></summary><div className="question-body"><b>Question sent</b><p>{question.instructions}</p><b>Options sent</b><pre>{pretty(question.criteria)}</pre><b>Actual returned decision</b><pre>{pretty(answers[name] || null)}</pre></div></details>)}</div>{entry.status === 'success' && <p className="confidence-caption">Percentages are API-returned confidence.</p>}<details className="raw-details"><summary><Code size={14}/> Full request & response <CaretDown size={12}/></summary><span className="raw-label">REQUEST · POST /api/alpha/decisions</span><pre>{pretty(entry.request)}</pre><span className="raw-label">ACTUAL RESPONSE</span><pre>{pretty(entry.response)}</pre>{entry.response?.id && <p className="request-id">{entry.response.id}</p>}</details></article>;
}
createRoot(document.getElementById('root')).render(location.port === '4318' || new URLSearchParams(location.search).get('mode') === 'demo' ? <App/> : <DominosApp/>);
