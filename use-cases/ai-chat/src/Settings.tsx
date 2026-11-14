import { useState, type FormEvent } from 'react';
import { ArrowUpRight, Check, Copy } from '@phosphor-icons/react';
import { connectOpenRouter } from './api';
import type { AppStatus } from '../shared/types';

export function SettingsPanel({ status, onConnected }: { status: AppStatus | null; onConnected: (value: AppStatus) => void }) {
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [copied, setCopied] = useState(false);

  async function connect(event: FormEvent) {
    event.preventDefault();
    if (busy || (!apiKey.trim() && !status?.configured)) return;
    setBusy(true); setError(''); setSuccess(false);
    try {
      const result = await connectOpenRouter(apiKey.trim() || undefined);
      setApiKey(''); onConnected(result); setSuccess(true);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not connect. Please try again.'); }
    finally { setBusy(false); }
  }
  return <div className="settings-body">
    <div className="setting-row"><span>Model</span><strong>TypeSafe Jev</strong></div>
    <div className="setting-row"><span>Connection</span><strong>{status?.connectionVerified ? 'Connected' : status?.configured ? 'Key saved · not tested' : 'Not connected'}</strong></div>
    <form className="key-form" onSubmit={connect}>
      <label htmlFor="openrouter-key">OpenRouter API key</label>
      <input id="openrouter-key" type="password" value={apiKey} placeholder={status?.configured ? 'Paste a new key to replace the saved key' : 'sk-or-v1-…'} autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={520} disabled={busy} aria-describedby="key-help" onChange={event => { setApiKey(event.target.value); setError(''); setSuccess(false); }} />
      <p id="key-help">Paste only the key. It is saved in this app’s local .env file. The test makes one small Jev request.</p>
      <button className="connect-button" type="submit" disabled={busy || (!apiKey.trim() && !status?.configured)}>{busy ? 'Testing connection…' : apiKey.trim() || !status?.configured ? 'Save & test connection' : 'Test saved key'}</button>
      {error && <p className="connection-message error" role="alert">{error}</p>}
      {success && <p className="connection-message success" role="status"><Check size={15} /> Connected. TypeSafe Jev is ready.</p>}
    </form>
    <div className="settings-links"><a href="https://openrouter.ai/settings/keys" target="_blank" rel="noreferrer">Get an OpenRouter API key <ArrowUpRight size={13} /></a></div>
    <details className="manual-setup"><summary>Use a .env file instead</summary><p className="setup-instructions">Set <code>OPENROUTER_API_KEY=your-key</code> in this file. Then use “Test saved key” above.</p><div className="path-box"><code>{status?.envPath || 'outputs/emote/.env'}</code><button className="icon-button" aria-label="Copy configuration file path" onClick={() => { navigator.clipboard.writeText(status?.envPath || 'outputs/emote/.env').then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }).catch(() => setError('Could not copy the path. Select it and copy manually.')); }}>{copied ? <Check size={17} /> : <Copy size={17} />}</button></div></details>
    <p className="privacy-note">Your saved key is never sent back to the browser. Search text is sent to OpenRouter when Jev is connected.</p>
  </div>;
}
