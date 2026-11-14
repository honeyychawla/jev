import type { AppStatus, EmojiItem, Suggestions } from '../shared/types';

async function readResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error || 'The local server is unavailable. Make sure it is running.');
  }
  return response.json() as Promise<T>;
}
export const getStatus = () => fetch('/api/status').then(readResponse<AppStatus>);
export const getCatalog = () => fetch('/api/emojis').then(readResponse<EmojiItem[]>);
export const connectOpenRouter = (apiKey?: string) =>
  fetch('/api/settings/openrouter', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Emote-Setup': '1' }, body: JSON.stringify(apiKey ? { apiKey } : {}) })
    .then(readResponse<AppStatus>);
export const getSuggestions = (text: string, signal?: AbortSignal) =>
  fetch('/api/suggest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }), signal })
    .then(readResponse<Suggestions>);
