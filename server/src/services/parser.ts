import { z } from 'zod';
import { ServiceError } from '../lib/errors.js';
import type { Plan } from '../types.js';

const text = z.preprocess((v) => (v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v)), z.string());
const textList = z.preprocess(
  (v) => (Array.isArray(v) ? v : typeof v === 'string' && v ? [v] : []),
  z.array(text),
);

const PlanSchema = z.object({
  goal: text,
  success_criteria: textList,
  relevant_experiences: z
    .array(z.object({ reference: text, how_used: text }))
    .catch([]),
  findings: textList,
  reasoning_summary: text,
  steps: z
    .array(
      z.object({
        priority: z.coerce.number().catch(99),
        title: text,
        description: text,
        prerequisites: textList,
        expected_outcome: text,
        verification: text,
        requires_approval: z.coerce.boolean().catch(false),
      }),
    )
    .min(1, 'plan contains no steps'),
  risks: z
    .array(z.object({ risk: text, likelihood: text, mitigation: text, recovery: text }))
    .catch([]),
  verification_checklist: textList,
  lessons_to_save: textList,
  sources: z.array(z.object({ title: text, url: text })).catch([]),
});

/** Pulls the first JSON object out of an LLM reply (fenced block preferred, then outermost braces). */
export function extractJson(reply: string): unknown {
  const fenced = reply.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [fenced?.[1], reply.slice(reply.indexOf('{'), reply.lastIndexOf('}') + 1)].filter(
    (c): c is string => Boolean(c && c.trim().startsWith('{')),
  );
  for (const c of candidates) {
    try {
      return JSON.parse(c);
    } catch {
      /* try next */
    }
  }
  throw new ServiceError('parser', 'Agent reply did not contain a valid JSON plan');
}

/**
 * Validates the agent's plan. Sources are only kept when their URL was present in the retrieved
 * memories — the agent cannot browse, so any other URL would be an unsupported citation.
 */
export function parsePlan(reply: string, allowedSourceUrls: Set<string>): { plan: Plan; warnings: string[] } {
  const result = PlanSchema.safeParse(extractJson(reply));
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new ServiceError('parser', `Agent plan failed validation at "${issue?.path.join('.')}": ${issue?.message}`);
  }
  const p = result.data;
  const warnings: string[] = [];

  const sources = p.sources.filter((s) => allowedSourceUrls.has(s.url.trim()));
  if (sources.length < p.sources.length) {
    warnings.push(`${p.sources.length - sources.length} source(s) cited by the agent were dropped because they were not in retrieved evidence.`);
  }

  const steps = [...p.steps]
    .sort((a, b) => a.priority - b.priority)
    .map((s, i) => ({ ...s, id: `s${i + 1}`, priority: i + 1, status: 'pending' as const }));

  return { plan: { ...p, steps, sources }, warnings };
}
