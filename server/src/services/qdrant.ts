import { randomUUID } from 'node:crypto';
import { QdrantClient } from '@qdrant/js-client-rest';
import { config } from '../config.js';
import { ServiceError, errorMessage, log } from '../lib/errors.js';
import { OUTCOME_STATUSES, type ExperiencePayload, type OutcomeStatus } from '../types.js';

const client = new QdrantClient({
  url: config.qdrant.url,
  apiKey: config.qdrant.apiKey,
  timeout: config.qdrant.timeoutMs,
  checkCompatibility: false,
});

const COLLECTION = config.qdrant.collection;
const KEYWORD_INDEXES = ['domain', 'outcome_status', 'task_id', 'tags'] as const;

let ensured: Promise<void> | null = null;

function wrap(op: string, err: unknown): ServiceError {
  if (err instanceof ServiceError) return err;
  const data = (err as { data?: { status?: { error?: string } } })?.data;
  const detail = data?.status?.error ?? errorMessage(err);
  return new ServiceError('qdrant', `Qdrant ${op} failed: ${detail}`);
}

async function createOrVerifyCollection(): Promise<void> {
  const { exists } = await client.collectionExists(COLLECTION);
  if (!exists) {
    log.info('Creating Qdrant collection', { collection: COLLECTION, size: config.embedding.dimension });
    await client.createCollection(COLLECTION, {
      vectors: { size: config.embedding.dimension, distance: config.embedding.distance },
    });
  } else {
    const info = await client.getCollection(COLLECTION);
    const vectors = info.config.params.vectors as { size?: number; distance?: string } | undefined;
    if (!vectors || typeof vectors.size !== 'number') {
      throw new ServiceError('qdrant', `Collection "${COLLECTION}" uses named vectors; expected a single unnamed vector.`);
    }
    if (vectors.size !== config.embedding.dimension || vectors.distance !== config.embedding.distance) {
      throw new ServiceError(
        'qdrant',
        `Collection "${COLLECTION}" is configured with size=${vectors.size}, distance=${vectors.distance}; ` +
          `this server needs size=${config.embedding.dimension}, distance=${config.embedding.distance}. ` +
          `Use a different QDRANT_COLLECTION or recreate the collection.`,
      );
    }
  }
  for (const field of KEYWORD_INDEXES) {
    await client.createPayloadIndex(COLLECTION, { field_name: field, field_schema: 'keyword', wait: true }).catch((err) => {
      // Index already existing is fine; anything else is surfaced.
      const msg = errorMessage(err);
      if (!/already exists/i.test(msg)) throw err;
    });
  }
}

/** Idempotent: checks the collection exists with a compatible vector config, creating it if absent. */
export function ensureCollection(): Promise<void> {
  if (!ensured) {
    ensured = createOrVerifyCollection().catch((err) => {
      ensured = null;
      throw wrap('collection check', err);
    });
  }
  return ensured;
}

function toPayload(raw: Record<string, unknown> | null | undefined): ExperiencePayload {
  const p = raw ?? {};
  const arr = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
  const status = OUTCOME_STATUSES.includes(p.outcome_status as OutcomeStatus) ? (p.outcome_status as OutcomeStatus) : 'unverified';
  return {
    task_id: String(p.task_id ?? ''),
    problem: String(p.problem ?? ''),
    domain: String(p.domain ?? 'general'),
    solution: String(p.solution ?? ''),
    outcome_status: status,
    source_urls: arr(p.source_urls),
    tags: arr(p.tags),
    confidence: typeof p.confidence === 'number' ? p.confidence : 0,
    created_at: String(p.created_at ?? ''),
    verification_notes: String(p.verification_notes ?? ''),
    lessons: arr(p.lessons),
  };
}

export interface MemoryFilter {
  domain?: string;
  outcome_status?: OutcomeStatus;
}

function buildFilter(f: MemoryFilter) {
  const must = [];
  if (f.domain) must.push({ key: 'domain', match: { value: f.domain } });
  if (f.outcome_status) must.push({ key: 'outcome_status', match: { value: f.outcome_status } });
  return must.length ? { must } : undefined;
}

export async function searchExperiences(vector: number[], limit: number, filter: MemoryFilter = {}) {
  await ensureCollection();
  try {
    const { points } = await client.query(COLLECTION, {
      query: vector,
      limit,
      with_payload: true,
      filter: buildFilter(filter),
    });
    return points.map((h) => ({ id: String(h.id), score: h.score, payload: toPayload(h.payload) }));
  } catch (err) {
    throw wrap('search', err);
  }
}

export async function upsertExperience(payload: ExperiencePayload, vector: number[]): Promise<string> {
  await ensureCollection();
  const id = randomUUID();
  try {
    const res = await client.upsert(COLLECTION, {
      wait: true,
      points: [{ id, vector, payload: payload as unknown as Record<string, unknown> }],
    });
    if (res.status !== 'completed') throw new Error(`upsert status ${res.status}`);
  } catch (err) {
    throw wrap('upsert', err);
  }
  return id;
}

export async function listExperiences(filter: MemoryFilter = {}, limit = 100) {
  await ensureCollection();
  try {
    const res = await client.scroll(COLLECTION, {
      limit: Math.min(limit, 500),
      with_payload: true,
      with_vector: false,
      filter: buildFilter(filter),
    });
    return res.points
      .map((p) => ({ id: String(p.id), payload: toPayload(p.payload) }))
      .sort((a, b) => b.payload.created_at.localeCompare(a.payload.created_at));
  } catch (err) {
    throw wrap('scroll', err);
  }
}

export async function memoryStats() {
  await ensureCollection();
  try {
    const total = (await client.count(COLLECTION, { exact: true })).count;
    const byStatus: Record<string, number> = {};
    for (const s of OUTCOME_STATUSES) {
      byStatus[s] = (await client.count(COLLECTION, { exact: true, filter: buildFilter({ outcome_status: s }) })).count;
    }
    return { total, byStatus };
  } catch (err) {
    throw wrap('count', err);
  }
}

export async function qdrantHealth() {
  const base = { url: redactUrl(config.qdrant.url), collection: COLLECTION, authenticated: Boolean(config.qdrant.apiKey) };
  try {
    await client.getCollections();
  } catch (err) {
    return { ...base, reachable: false, collectionReady: false, error: wrap('connect', err).message };
  }
  try {
    await ensureCollection();
    const info = await client.getCollection(COLLECTION);
    const vectors = info.config.params.vectors as { size?: number; distance?: string };
    return {
      ...base,
      reachable: true,
      collectionReady: true,
      points: info.points_count ?? 0,
      vectorSize: vectors.size,
      distance: vectors.distance,
      status: info.status,
    };
  } catch (err) {
    return { ...base, reachable: true, collectionReady: false, error: wrap('collection check', err).message };
  }
}

function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return 'invalid-url';
  }
}
