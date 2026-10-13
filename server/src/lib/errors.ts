export class ServiceError extends Error {
  constructor(
    public readonly service: 'lyzr' | 'qdrant' | 'embedding' | 'omi' | 'parser',
    message: string,
    public readonly httpStatus = 502,
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}

export class NotFoundError extends Error {
  readonly httpStatus = 404;
}

const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]{8,}/g,
  /omi_(mcp|dev)_[A-Za-z0-9]+/g,
  /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
];

/** Strips anything that looks like a credential before it is logged or sent to the client. */
export function redact(text: string): string {
  return SECRET_PATTERNS.reduce((acc, re) => acc.replace(re, '[redacted]'), text);
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === 'AbortError' || err.name === 'TimeoutError') return 'Request timed out';
    return redact(err.message);
  }
  return redact(String(err));
}

export const log = {
  info: (msg: string, meta?: Record<string, unknown>) =>
    console.log(`[${new Date().toISOString()}] INFO  ${msg}`, meta ? redact(JSON.stringify(meta)) : ''),
  warn: (msg: string, meta?: Record<string, unknown>) =>
    console.warn(`[${new Date().toISOString()}] WARN  ${msg}`, meta ? redact(JSON.stringify(meta)) : ''),
  error: (msg: string, err?: unknown) =>
    console.error(`[${new Date().toISOString()}] ERROR ${msg}`, err ? errorMessage(err) : ''),
};
