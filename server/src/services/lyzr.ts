import { config, lyzrConfigured } from '../config.js';
import { ServiceError, errorMessage, redact } from '../lib/errors.js';

export interface LyzrResult {
  text: string;
  latencyMs: number;
}

/** Calls the existing Lyzr agent. Server-side only; the API key never leaves this process. */
export async function callLyzrAgent(message: string, sessionKey: string): Promise<LyzrResult> {
  if (!lyzrConfigured()) {
    throw new ServiceError('lyzr', 'Lyzr is not configured: set LYZR_API_KEY and LYZR_AGENT_ID in server/.env', 503);
  }
  const started = Date.now();
  let res: Response;
  try {
    res = await fetch(config.lyzr.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': config.lyzr.apiKey! },
      body: JSON.stringify({
        user_id: config.lyzr.userId,
        agent_id: config.lyzr.agentId,
        session_id: `${config.lyzr.agentId}-${sessionKey}`,
        message,
      }),
      signal: AbortSignal.timeout(config.lyzr.timeoutMs),
    });
  } catch (err) {
    throw new ServiceError('lyzr', `Lyzr request failed: ${errorMessage(err)}`, 504);
  }

  const body = await res.text();
  if (!res.ok) {
    const hint = res.status === 401 || res.status === 403 ? ' (check LYZR_API_KEY / LYZR_AGENT_ID)' : '';
    throw new ServiceError('lyzr', `Lyzr returned HTTP ${res.status}${hint}: ${redact(body.slice(0, 300))}`);
  }

  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    throw new ServiceError('lyzr', 'Lyzr returned a non-JSON response');
  }
  const text = (json as { response?: unknown }).response;
  if (typeof text !== 'string' || !text.trim()) {
    throw new ServiceError('lyzr', 'Lyzr response did not contain a "response" text field');
  }
  return { text, latencyMs: Date.now() - started };
}

export function lyzrStatus() {
  return {
    configured: lyzrConfigured(),
    endpoint: new URL(config.lyzr.url).host,
    agentIdSet: Boolean(config.lyzr.agentId),
  };
}
