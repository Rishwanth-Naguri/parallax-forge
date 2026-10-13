import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { embed, experienceText } from '../services/embeddings.js';
import { listExperiences, memoryStats, searchExperiences, upsertExperience } from '../services/qdrant.js';
import { OUTCOME_STATUSES, type ExperiencePayload } from '../types.js';
import { validate } from './validate.js';

export const memoriesRouter = Router();

const ListQuery = z.object({
  q: z.string().trim().max(500).optional(),
  domain: z.string().trim().toLowerCase().max(40).optional(),
  outcome_status: z.enum(OUTCOME_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const CreateMemory = z
  .object({
    task_id: z.string().trim().max(100).optional(),
    problem: z.string().trim().min(5).max(4000),
    domain: z.string().trim().toLowerCase().min(1).max(40).default('general'),
    solution: z.string().trim().min(5).max(8000),
    outcome_status: z.enum(OUTCOME_STATUSES).default('unverified'),
    source_urls: z.array(z.string().url()).max(20).default([]),
    tags: z.array(z.string().trim().toLowerCase().min(1).max(40)).max(20).default([]),
    confidence: z.number().min(0).max(1).default(0.5),
    verification_notes: z.string().trim().max(4000).default(''),
    lessons: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
  })
  .refine((m) => m.outcome_status === 'unverified' || m.verification_notes.length >= 10, {
    path: ['verification_notes'],
    message: 'Verified outcomes (success/partial/failed) need verification notes of at least 10 characters',
  });

memoriesRouter.get('/', async (req, res) => {
  const q = validate(ListQuery, req.query);
  const filter = { domain: q.domain || undefined, outcome_status: q.outcome_status };
  if (q.q) {
    const hits = await searchExperiences(await embed(experienceText(q.q, q.domain)), q.limit, filter);
    res.json({ mode: 'semantic', items: hits });
    return;
  }
  const items = await listExperiences(filter, q.limit);
  res.json({ mode: 'list', items });
});

memoriesRouter.get('/stats', async (_req, res) => {
  res.json({ ...(await memoryStats()), collection: config.qdrant.collection });
});

memoriesRouter.post('/', async (req, res) => {
  const body = validate(CreateMemory, req.body);
  const payload: ExperiencePayload = {
    ...body,
    task_id: body.task_id || `manual-${randomUUID()}`,
    created_at: new Date().toISOString(),
  };
  const id = await upsertExperience(payload, await embed(experienceText(payload.problem, payload.domain)));
  res.status(201).json({ id, payload });
});
