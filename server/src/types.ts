export const STAGE_DEFS = [
  { id: 'goal_received', label: 'Goal received' },
  { id: 'task_analyzed', label: 'Task analyzed' },
  { id: 'embedding_generated', label: 'Embedding generated' },
  { id: 'memory_searched', label: 'Qdrant memory searched' },
  { id: 'experiences_retrieved', label: 'Relevant experiences retrieved' },
  { id: 'omi_context', label: 'Omi personal context' },
  { id: 'lyzr_reasoning', label: 'Lyzr agent reasoning' },
  { id: 'plan_generated', label: 'Plan generated' },
  { id: 'outcome_verification', label: 'Outcome verification' },
  { id: 'memory_updated', label: 'Memory updated' },
] as const;

export type StageId = (typeof STAGE_DEFS)[number]['id'];
export type StageStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface Stage {
  id: StageId;
  label: string;
  status: StageStatus;
  startedAt?: string;
  finishedAt?: string;
  detail?: string;
  error?: string;
}

/** `unverified` = a recommendation that nobody has tested yet. Never treated as success. */
export const OUTCOME_STATUSES = ['unverified', 'success', 'partial', 'failed'] as const;
export type OutcomeStatus = (typeof OUTCOME_STATUSES)[number];

export interface ExperiencePayload {
  task_id: string;
  problem: string;
  domain: string;
  solution: string;
  outcome_status: OutcomeStatus;
  source_urls: string[];
  tags: string[];
  confidence: number;
  created_at: string;
  verification_notes: string;
  lessons: string[];
}

export interface RetrievedMemory {
  id: string;
  score: number;
  /** Passed the relevance threshold and was included in the prompt. */
  used: boolean;
  payload: ExperiencePayload;
}

export interface OmiSnippet {
  kind: 'memory' | 'conversation';
  id?: string;
  text: string;
  score?: number;
}

export type StepStatus = 'pending' | 'completed' | 'failed';

export interface PlanStep {
  id: string;
  priority: number;
  title: string;
  description: string;
  prerequisites: string[];
  expected_outcome: string;
  verification: string;
  requires_approval: boolean;
  status: StepStatus;
  note?: string;
}

export interface Plan {
  goal: string;
  success_criteria: string[];
  relevant_experiences: { reference: string; how_used: string }[];
  findings: string[];
  reasoning_summary: string;
  steps: PlanStep[];
  risks: { risk: string; likelihood: string; mitigation: string; recovery: string }[];
  verification_checklist: string[];
  lessons_to_save: string[];
  sources: { title: string; url: string }[];
}

export type TaskStatus = 'running' | 'awaiting_outcome' | 'failed' | 'completed';

export interface Task {
  id: string;
  goal: string;
  description: string;
  domain: string;
  useOmi: boolean;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  stages: Stage[];
  memories: RetrievedMemory[];
  omiContext: OmiSnippet[];
  plan?: Plan;
  rawResponse?: string;
  parseWarning?: string;
  error?: { stage: StageId; message: string };
  outcome?: {
    status: OutcomeStatus;
    notes: string;
    pointId: string;
    savedAt: string;
    omiSaved?: boolean;
    omiError?: string;
  };
}
