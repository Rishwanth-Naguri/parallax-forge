import type { OmiSnippet, RetrievedMemory } from '../types.js';

const STATUS_LABEL: Record<string, string> = {
  success: 'VERIFIED SUCCESS — worked when tested',
  partial: 'PARTIAL — partly worked; check notes',
  failed: 'FAILED — do not repeat this approach without addressing why it failed',
  unverified: 'UNVERIFIED — a past recommendation that was never tested; treat as a hypothesis',
};

const OUTPUT_SCHEMA = `{
  "goal": "restated goal in one sentence",
  "success_criteria": ["measurable criterion", "..."],
  "relevant_experiences": [{ "reference": "M1", "how_used": "what you reused or avoided and why" }],
  "findings": ["key finding", "..."],
  "reasoning_summary": "2-4 sentences explaining the approach",
  "steps": [{
    "priority": 1,
    "title": "short imperative title",
    "description": "what to do",
    "prerequisites": ["..."],
    "expected_outcome": "observable result",
    "verification": "how to check this step worked",
    "requires_approval": false
  }],
  "risks": [{ "risk": "...", "likelihood": "low|medium|high", "mitigation": "...", "recovery": "..." }],
  "verification_checklist": ["..."],
  "lessons_to_save": ["generalisable lesson for future tasks"],
  "sources": [{ "title": "...", "url": "..." }]
}`;

export function buildPrompt(input: {
  goal: string;
  description: string;
  domain: string;
  memories: RetrievedMemory[];
  omi: OmiSnippet[];
}): string {
  const used = input.memories.filter((m) => m.used);
  const memoryBlock = used.length
    ? used
        .map((m, i) => {
          const p = m.payload;
          return [
            `[M${i + 1}] relevance=${m.score.toFixed(3)} | status=${STATUS_LABEL[p.outcome_status]} | domain=${p.domain} | confidence=${p.confidence}`,
            `  Problem: ${p.problem}`,
            `  Solution tried: ${p.solution}`,
            p.verification_notes ? `  Verification notes: ${p.verification_notes}` : '',
            p.lessons.length ? `  Lessons: ${p.lessons.join('; ')}` : '',
            p.source_urls.length ? `  Sources: ${p.source_urls.join(', ')}` : '',
          ]
            .filter(Boolean)
            .join('\n');
        })
        .join('\n\n')
    : 'None. No sufficiently relevant past experience exists — plan from first principles and say so.';

  const omiBlock = input.omi.length
    ? input.omi.map((o, i) => `[O${i + 1}] (${o.kind}) ${o.text}`).join('\n')
    : '';

  return `You are PARALLAX FORGE, an operations planning agent with persistent experience memory.
Produce an evidence-grounded, actionable plan for the task below.

## Task
Goal: ${input.goal}
Domain: ${input.domain}
Details: ${input.description || '(none provided)'}

## Retrieved past experiences (from vector memory)
${memoryBlock}
${omiBlock ? `\n## Personal context from the user's Omi device (memories/conversations)\n${omiBlock}\n` : ''}
## Rules
- Past experiences are evidence, not authority. Weigh them by relevance and status. Prefer VERIFIED SUCCESS; explicitly avoid repeating FAILED approaches; treat UNVERIFIED as hypotheses.
- Reference experiences by their id (M1, M2, ...) in "relevant_experiences". If none were provided, return an empty array.
- You cannot browse the internet. Only list a source if its URL appears in the experiences above; otherwise return "sources": [].
- Any step that is external, irreversible, financial, or changes production systems must set "requires_approval": true. You only plan; you never execute.
- Steps are ordered by priority (1 = do first). Keep 3-8 steps.
- Each step needs a concrete, checkable "verification".

## Output format
Respond with ONLY a single JSON object in a \`\`\`json fenced block, matching this shape exactly:
${OUTPUT_SCHEMA}`;
}
