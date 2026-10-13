import { Router } from 'express';
import { z } from 'zod';
import { NotFoundError } from '../lib/errors.js';
import { createTask, recordOutcome, resetForRetry, runTask } from '../services/orchestrator.js';
import { taskStore } from '../services/taskStore.js';
import { OUTCOME_STATUSES } from '../types.js';
import { validate } from './validate.js';

export const tasksRouter = Router();

const domain = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9 _-]{0,39}$/, 'domain must be 1-40 letters, digits, spaces, - or _');

const CreateTask = z.object({
  goal: z.string().trim().min(5, 'goal must be at least 5 characters').max(500),
  description: z.string().trim().max(4000).default(''),
  domain: domain.default('general'),
  useOmi: z.boolean().default(true),
});

const UpdateStep = z.object({
  status: z.enum(['pending', 'completed', 'failed']),
  note: z.string().trim().max(1000).optional(),
});

const Outcome = z
  .object({
    outcome_status: z.enum(OUTCOME_STATUSES),
    verification_notes: z.string().trim().max(4000).default(''),
    solution: z.string().trim().max(8000).optional(),
    tags: z.array(z.string().trim().toLowerCase().min(1).max(40)).max(20).default([]),
    lessons: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
    confidence: z.number().min(0).max(1).default(0.5),
    saveToOmi: z.boolean().default(false),
  })
  .refine((o) => o.outcome_status === 'unverified' || o.verification_notes.length >= 10, {
    path: ['verification_notes'],
    message: 'Describe how the outcome was verified (at least 10 characters) for success, partial or failed outcomes',
  });

function getTask(id: string) {
  const task = taskStore.get(id);
  if (!task) throw new NotFoundError(`Task ${id} not found`);
  return task;
}

tasksRouter.get('/', (_req, res) => {
  res.json(
    taskStore.list().map(({ rawResponse: _r, memories, plan, omiContext: _o, ...t }) => ({
      ...t,
      memoryCount: memories.length,
      stepCount: plan?.steps.length ?? 0,
      stepsCompleted: plan?.steps.filter((s) => s.status === 'completed').length ?? 0,
    })),
  );
});

tasksRouter.post('/', (req, res) => {
  const input = validate(CreateTask, req.body);
  const task = createTask(input);
  void runTask(task); // the client follows real progress via GET /api/tasks/:id
  res.status(202).json(task);
});

tasksRouter.get('/:id', (req, res) => {
  res.json(getTask(req.params.id));
});

tasksRouter.post('/:id/retry', (req, res) => {
  const task = getTask(req.params.id);
  if (task.status !== 'failed' || task.plan) {
    res.status(409).json({ error: 'Only runs that failed before producing a plan can be retried' });
    return;
  }
  resetForRetry(task);
  void runTask(task);
  res.status(202).json(task);
});

tasksRouter.patch('/:id/steps/:stepId', (req, res) => {
  const task = getTask(req.params.id);
  const body = validate(UpdateStep, req.body);
  const s = task.plan?.steps.find((x) => x.id === req.params.stepId);
  if (!s) throw new NotFoundError(`Step ${req.params.stepId} not found`);
  if (task.outcome) {
    res.status(409).json({ error: 'Outcome already saved; steps are locked' });
    return;
  }
  s.status = body.status;
  if (body.note !== undefined) s.note = body.note;
  taskStore.save(task);
  res.json(task);
});

tasksRouter.post('/:id/outcome', async (req, res) => {
  const task = getTask(req.params.id);
  const body = validate(Outcome, req.body);
  if (!task.plan) {
    res.status(409).json({ error: 'This task has no plan to record an outcome for' });
    return;
  }
  if (task.outcome) {
    res.status(409).json({ error: 'Outcome already saved for this task' });
    return;
  }
  if (body.outcome_status === 'success' && !task.plan.steps.some((s) => s.status === 'completed')) {
    res.status(422).json({ error: 'Mark at least one step as completed before recording a success' });
    return;
  }
  try {
    res.json(await recordOutcome(task, body));
  } catch (err) {
    // Keep the plan usable so the save can be retried.
    task.status = 'awaiting_outcome';
    taskStore.save(task);
    throw err;
  }
});
