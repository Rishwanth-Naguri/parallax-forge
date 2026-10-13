import type { ExperiencePayload, OutcomeStatus, StepStatus, Task, TaskStatus } from './types';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly issues?: { path: string; message: string }[],
  ) {
    super(message);
  }
}

const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');

async function request<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api${path}`, {
      ...init,
      headers: init?.json !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: init?.json !== undefined ? JSON.stringify(init.json) : undefined,
    });
  } catch {
    throw new ApiError('Cannot reach the PARALLAX FORGE backend.', 0);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok && !(path.startsWith('/health') && res.status === 503)) {
    const issues = body.issues as { path: string; message: string }[] | undefined;
    const msg = issues?.length ? issues.map((i) => i.message).join(' · ') : (body.error ?? `Request failed (${res.status})`);
    throw new ApiError(msg, res.status, issues);
  }
  return body as T;
}

export interface TaskSummary {
  id: string;
  goal: string;
  description: string;
  domain: string;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  memoryCount: number;
  stepCount: number;
  stepsCompleted: number;
  error?: Task['error'];
  outcome?: Task['outcome'];
}

export interface MemoryItem {
  id: string;
  score?: number;
  payload: ExperiencePayload;
}

export interface Health {
  status: 'ok' | 'degraded';
  lyzr: { configured: boolean; endpoint: string };
  qdrant: { reachable: boolean; collectionReady: boolean; collection: string; url: string; points?: number; error?: string };
  embedding: { ok: boolean; model: string; dimension: number; distance: string; error?: string };
  omi: { configured: boolean; reachable: boolean; error?: string };
}

export const api = {
  health: () => request<Health>('/health'),
  listTasks: () => request<TaskSummary[]>('/tasks'),
  getTask: (id: string) => request<Task>(`/tasks/${id}`),
  createTask: (input: { goal: string; description: string; domain: string; useOmi: boolean }) =>
    request<Task>('/tasks', { method: 'POST', json: input }),
  retryTask: (id: string) => request<Task>(`/tasks/${id}/retry`, { method: 'POST' }),
  updateStep: (id: string, stepId: string, status: StepStatus, note?: string) =>
    request<Task>(`/tasks/${id}/steps/${stepId}`, { method: 'PATCH', json: { status, note } }),
  recordOutcome: (
    id: string,
    input: {
      outcome_status: OutcomeStatus;
      verification_notes: string;
      tags: string[];
      lessons: string[];
      confidence: number;
      saveToOmi: boolean;
    },
  ) => request<Task>(`/tasks/${id}/outcome`, { method: 'POST', json: input }),
  listMemories: (params: { q?: string; domain?: string; outcome_status?: string }) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]);
    return request<{ mode: 'semantic' | 'list'; items: MemoryItem[] }>(`/memories?${qs}`);
  },
  memoryStats: () => request<{ total: number; byStatus: Record<OutcomeStatus, number>; collection: string }>('/memories/stats'),
  createMemory: (input: Partial<ExperiencePayload> & { problem: string; solution: string }) =>
    request<{ id: string; payload: ExperiencePayload }>('/memories', { method: 'POST', json: input }),
};
