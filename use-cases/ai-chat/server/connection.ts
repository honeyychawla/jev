import { APIError, APITimeoutError, noul, type TypeSafeClient } from '@typesafe-ai/sdk';
import { createClient } from './suggest.js';

export class ConnectionError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

export async function verifyConnection(apiKey: string, model: string, signal: AbortSignal,
  request: typeof fetch = fetch, client: Pick<TypeSafeClient, 'systemOne'> = createClient(apiKey)) {
  try {
    const response = await request('https://openrouter.ai/api/v1/key', {
      headers: { Authorization: `Bearer ${apiKey}` }, signal,
      redirect: 'error',
    });
    if (response.status === 401 || response.status === 403) throw new ConnectionError(401, 'OpenRouter rejected this key. Copy a valid API key and try again.');
    if (response.status === 429) throw new ConnectionError(429, 'OpenRouter is busy. Wait a moment and try again.');
    if (!response.ok) throw new ConnectionError(502, 'Could not verify the key with OpenRouter. Please try again.');
    // Discard account metadata; only the key's validity is needed here.
    await response.arrayBuffer();
    const result = await client.systemOne({ model, state: 'Emote connection test', questions: {
      connection: noul('Does this text describe a connection test?'),
    } }, { signal });
    if (result.answers.connection?.type !== 'noul' || !Number.isFinite(result.answers.connection.noul)) {
      throw new ConnectionError(502, 'Jev returned an unexpected response. Please try again.');
    }
    return result.model;
  } catch (error) {
    if (error instanceof ConnectionError) throw error;
    if (error instanceof APIError) {
      if (error.status === 401 || error.status === 403) throw new ConnectionError(403, 'The key cannot access Jev. Check its model permissions in OpenRouter.');
      if (error.status === 402) throw new ConnectionError(402, 'The key is valid, but OpenRouter needs credits to run Jev. Add credits, then try again.');
      if (error.status === 404) throw new ConnectionError(404, 'The selected Jev model is unavailable. Update TYPESAFE_MODEL in .env and try again.');
      if (error.status === 429) throw new ConnectionError(429, 'OpenRouter is rate limiting requests. Wait a moment and try again.');
    }
    if (error instanceof APITimeoutError || signal.aborted) throw new ConnectionError(504, 'The connection test timed out. Please try again.');
    throw new ConnectionError(502, 'Could not reach TypeSafe through OpenRouter. Check your connection and try again.');
  }
}
