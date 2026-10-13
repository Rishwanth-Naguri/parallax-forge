import { randomUUID } from 'node:crypto';
import { config, omiConfigured } from '../config.js';
import { ServiceError, errorMessage, redact } from '../lib/errors.js';
import type { OmiSnippet } from '../types.js';

/**
 * Minimal client for Omi's hosted MCP server (Streamable HTTP, JSON-RPC tools/call).
 * Used to pull the user's personal context (memories + conversations captured by the Omi device)
 * into the Lyzr prompt, and — only with explicit user approval — to write a verified lesson back.
 */
const PROTOCOL_VERSION = '2025-03-26';

async function callTool<T = Record<string, unknown>>(name: string, args: Record<string, unknown>): Promise<T> {
  if (!omiConfigured()) throw new ServiceError('omi', 'Omi is not configured: set OMI_API_KEY in server/.env', 503);
  let res: Response;
  try {
    res = await fetch(config.omi.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.omi.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'MCP-Protocol-Version': PROTOCOL_VERSION,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: randomUUID(), method: 'tools/call', params: { name, arguments: args } }),
      signal: AbortSignal.timeout(config.omi.timeoutMs),
    });
  } catch (err) {
    throw new ServiceError('omi', `Omi request failed: ${errorMessage(err)}`, 504);
  }
  const raw = await res.text();
  if (!res.ok) {
    const hint = res.status === 401 ? ' (check OMI_API_KEY; it must be an omi_mcp_ key)' : '';
    throw new ServiceError('omi', `Omi returned HTTP ${res.status}${hint}: ${redact(raw.slice(0, 200))}`);
  }

  // Streamable HTTP may answer with plain JSON or an SSE stream of `data:` lines.
  const messages = res.headers.get('content-type')?.includes('text/event-stream')
    ? raw
        .split(/\r?\n/)
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trim())
    : [raw];
  for (const m of messages) {
    let msg: { error?: { message?: string }; result?: { isError?: boolean; structuredContent?: unknown; content?: { text?: string }[] } };
    try {
      msg = JSON.parse(m);
    } catch {
      continue;
    }
    if (msg.error) throw new ServiceError('omi', `Omi tool ${name} error: ${redact(msg.error.message ?? 'unknown')}`);
    if (msg.result) {
      const structured = msg.result.structuredContent as Record<string, unknown> | undefined;
      const payload = structured ?? safeJson(msg.result.content?.[0]?.text);
      if (msg.result.isError || (payload && 'error' in payload)) {
        throw new ServiceError('omi', `Omi tool ${name} failed: ${redact(JSON.stringify(payload?.error ?? payload).slice(0, 200))}`);
      }
      return (payload ?? {}) as T;
    }
  }
  throw new ServiceError('omi', `Omi tool ${name} returned no result`);
}

function safeJson(text?: string): Record<string, unknown> | undefined {
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return { text };
  }
}

type Rec = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' ? v : '');

/** Searches Omi memories and conversations relevant to the goal. */
export async function fetchOmiContext(query: string, limit = 4): Promise<OmiSnippet[]> {
  const [mem, conv] = await Promise.all([
    callTool<{ memories?: Rec[] }>('search_memories', { query, limit }),
    callTool<{ conversations?: Rec[] }>('search_conversations', { query, limit }),
  ]);
  const memories: OmiSnippet[] = (mem.memories ?? [])
    .map((m) => ({
      kind: 'memory' as const,
      id: str(m.id),
      text: str(m.content),
      score: typeof m.relevance_score === 'number' ? m.relevance_score : undefined,
    }))
    .filter((s) => s.text);
  const conversations: OmiSnippet[] = (conv.conversations ?? [])
    .map((c) => {
      const s = (c.structured as Rec | undefined) ?? c;
      const text = [str(s.title), str(s.overview) || str(c.summary)].filter(Boolean).join(' — ');
      return { kind: 'conversation' as const, id: str(c.id), text };
    })
    .filter((s) => s.text);
  return [...memories, ...conversations];
}

export async function saveOmiMemory(content: string): Promise<void> {
  const res = await callTool<{ success?: boolean }>('create_memory', { content: content.slice(0, 1000) });
  if (res.success === false) throw new ServiceError('omi', 'Omi did not accept the memory');
}

export async function omiHealth() {
  if (!omiConfigured()) return { configured: false, reachable: false };
  try {
    await callTool('get_memories', { limit: 1 });
    return { configured: true, reachable: true };
  } catch (err) {
    return { configured: true, reachable: false, error: errorMessage(err) };
  }
}
