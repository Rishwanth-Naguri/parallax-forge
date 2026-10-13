import { randomUUID } from 'node:crypto';
import { config, omiConfigured } from '../config.js';
import { errorMessage, log } from '../lib/errors.js';
import { STAGE_DEFS, type ExperiencePayload, type OutcomeStatus, type StageId, type Task } from '../types.js';
import { embed, experienceText } from './embeddings.js';
import { callLyzrAgent } from './lyzr.js';
import { fetchOmiContext, saveOmiMemory } from './omi.js';
import { parsePlan } from './parser.js';
import { buildPrompt } from './prompt.js';
import { searchExperiences, upsertExperience } from './qdrant.js';
import { taskStore } from './taskStore.js';

export interface TaskInput {
  goal: string;
  description: string;
  domain: string;
  useOmi: boolean;
}

export function createTask(input: TaskInput): Task {
  const now = new Date().toISOString();
  const task: Task = {
    id: randomUUID(),
    ...input,
    status: 'running',
    createdAt: now,
    updatedAt: now,
    stages: STAGE_DEFS.map((s) => ({ id: s.id, label: s.label, status: 'pending' })),
    memories: [],
    omiContext: [],
  };
  taskStore.save(task);
  return task;
}

/** Resets everything from the planning stages onward so a failed run can be retried with the same task id. */
export function resetForRetry(task: Task) {
  task.status = 'running';
  task.error = undefined;
  task.plan = undefined;
  task.rawResponse = undefined;
  task.parseWarning = undefined;
  task.memories = [];
  task.omiContext = [];
  task.stages = STAGE_DEFS.map((s) => ({ id: s.id, label: s.label, status: 'pending' }));
  taskStore.save(task);
}

function stage(task: Task, id: StageId) {
  return task.stages.find((s) => s.id === id)!;
}

/** Runs one stage: marks it running, awaits the real operation, and only then marks it completed. */
async function step<T>(task: Task, id: StageId, fn: () => Promise<T>, detail?: (r: T) => string): Promise<T> {
  const s = stage(task, id);
  s.status = 'running';
  s.startedAt = new Date().toISOString();
  s.error = undefined;
  taskStore.save(task);
  try {
    const result = await fn();
    s.status = 'completed';
    s.finishedAt = new Date().toISOString();
    if (detail) s.detail = detail(result);
    taskStore.save(task);
    return result;
  } catch (err) {
    const message = errorMessage(err);
    s.status = 'failed';
    s.finishedAt = new Date().toISOString();
    s.error = message;
    task.status = 'failed';
    task.error = { stage: id, message };
    taskStore.save(task);
    throw err;
  }
}

function skip(task: Task, id: StageId, detail: string) {
  const s = stage(task, id);
  s.status = 'skipped';
  s.detail = detail;
  taskStore.save(task);
}

export async function runTask(task: Task): Promise<void> {
  try {
    await step(task, 'goal_received', async () => task.goal, () => `Task ${task.id.slice(0, 8)} accepted`);

    const queryText = await step(
      task,
      'task_analyzed',
      async () => experienceText(`${task.goal}\n${task.description}`.trim(), task.domain),
      (t) => `Domain "${task.domain}", ${t.split(/\s+/).length} words to embed`,
    );

    const vector = await step(task, 'embedding_generated', () => embed(queryText), (v) => `${v.length}-d vector · ${config.embedding.model}`);

    const hits = await step(
      task,
      'memory_searched',
      () => searchExperiences(vector, config.memory.topK),
      (h) => `${h.length} candidate(s) from "${config.qdrant.collection}"`,
    );

    await step(
      task,
      'experiences_retrieved',
      async () => {
        task.memories = hits.map((h) => ({ ...h, used: h.score >= config.memory.minScore }));
        return task.memories;
      },
      (m) => {
        const used = m.filter((x) => x.used).length;
        return m.length
          ? `${used} of ${m.length} above relevance threshold ${config.memory.minScore}`
          : 'Memory is empty — planning from first principles';
      },
    );

    if (task.useOmi && omiConfigured()) {
      task.omiContext = await step(task, 'omi_context', () => fetchOmiContext(task.goal), (o) => `${o.length} Omi snippet(s) retrieved`);
    } else {
      skip(task, 'omi_context', omiConfigured() ? 'Disabled for this task' : 'Omi not configured');
    }

    const prompt = buildPrompt({ ...task, memories: task.memories, omi: task.omiContext });
    const reply = await step(task, 'lyzr_reasoning', () => callLyzrAgent(prompt, task.id), (r) => `Agent replied in ${(r.latencyMs / 1000).toFixed(1)}s`);
    task.rawResponse = reply.text;

    const allowed = new Set(task.memories.filter((m) => m.used).flatMap((m) => m.payload.source_urls));
    const { plan, warnings } = await step(
      task,
      'plan_generated',
      async () => parsePlan(reply.text, allowed),
      (r) => `${r.plan.steps.length} steps, ${r.plan.risks.length} risks`,
    );
    task.plan = plan;
    task.parseWarning = warnings.join(' ') || undefined;
    task.status = 'awaiting_outcome';
    stage(task, 'outcome_verification').detail = 'Waiting for you to test the plan and record what actually happened';
    taskStore.save(task);
  } catch (err) {
    log.warn('Task run failed', { taskId: task.id, stage: task.error?.stage, message: task.error?.message ?? errorMessage(err) });
  }
}

export interface OutcomeInput {
  outcome_status: OutcomeStatus;
  verification_notes: string;
  solution?: string;
  tags: string[];
  lessons: string[];
  confidence: number;
  saveToOmi: boolean;
}

/** Records what actually happened and persists the experience to Qdrant. */
export async function recordOutcome(task: Task, input: OutcomeInput): Promise<Task> {
  const plan = task.plan!;
  const solution =
    input.solution?.trim() ||
    plan.steps
      .map((s) => `${s.priority}. ${s.title} [${s.status}]${s.note ? ` — ${s.note}` : ''}`)
      .join('\n');

  await step(
    task,
    'outcome_verification',
    async () => input.outcome_status,
    (s) => {
      const done = plan.steps.filter((x) => x.status === 'completed').length;
      const failed = plan.steps.filter((x) => x.status === 'failed').length;
      return `Recorded as ${s.toUpperCase()} · ${done} completed, ${failed} failed, ${plan.steps.length - done - failed} pending`;
    },
  );

  const payload: ExperiencePayload = {
    task_id: task.id,
    problem: `${task.goal}${task.description ? `\n${task.description}` : ''}`,
    domain: task.domain,
    solution,
    outcome_status: input.outcome_status,
    source_urls: plan.sources.map((s) => s.url),
    tags: input.tags,
    confidence: input.confidence,
    created_at: new Date().toISOString(),
    verification_notes: input.verification_notes,
    lessons: input.lessons,
  };

  const pointId = await step(
    task,
    'memory_updated',
    async () => upsertExperience(payload, await embed(experienceText(payload.problem, payload.domain))),
    (id) => `Saved point ${id.slice(0, 8)} to "${config.qdrant.collection}"`,
  );

  task.outcome = { status: input.outcome_status, notes: input.verification_notes, pointId, savedAt: payload.created_at };
  task.status = 'completed';
  task.error = undefined;

  if (input.saveToOmi && omiConfigured()) {
    try {
      await saveOmiMemory(
        `PARALLAX FORGE lesson (${input.outcome_status}) for "${task.goal}": ${input.lessons.join('; ') || input.verification_notes}`,
      );
      task.outcome.omiSaved = true;
    } catch (err) {
      task.outcome.omiSaved = false;
      task.outcome.omiError = errorMessage(err);
    }
  }
  taskStore.save(task);
  return task;
}
