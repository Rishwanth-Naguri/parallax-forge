import type { OutcomeStatus, TaskStatus } from './types';

export const DOMAINS = ['general', 'engineering', 'devops', 'data', 'security', 'product', 'operations', 'research', 'marketing'];

export function relativeTime(iso: string): string {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function fullDate(iso: string): string {
  return iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '';
}

export const OUTCOME_META: Record<OutcomeStatus, { label: string; tone: string; hint: string }> = {
  success: { label: 'Verified success', tone: 'success', hint: 'Tested and worked' },
  partial: { label: 'Partial', tone: 'warn', hint: 'Partly worked' },
  failed: { label: 'Failed', tone: 'danger', hint: 'Tested and did not work — kept so it is not repeated' },
  unverified: { label: 'Unverified', tone: 'neutral', hint: 'Recommendation only; never tested' },
};

export const TASK_STATUS_META: Record<TaskStatus, { label: string; tone: string }> = {
  running: { label: 'Running', tone: 'accent' },
  awaiting_outcome: { label: 'Awaiting outcome', tone: 'warn' },
  failed: { label: 'Run failed', tone: 'danger' },
  completed: { label: 'Outcome saved', tone: 'success' },
};

export const pct = (score: number) => `${Math.round(score * 100)}%`;
