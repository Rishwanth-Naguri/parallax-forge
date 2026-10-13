import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildPrompt } from './prompt.js';
import { extractJson, parsePlan } from './parser.js';

const plan = {
  goal: 'Ship it',
  success_criteria: ['works'],
  relevant_experiences: [],
  findings: ['f'],
  reasoning_summary: 'r',
  steps: [
    { priority: 2, title: 'Second', description: 'd', prerequisites: [], expected_outcome: 'o', verification: 'v', requires_approval: true },
    { priority: 1, title: 'First', description: 'd', prerequisites: 'one prereq', expected_outcome: 'o', verification: 'v' },
  ],
  risks: [],
  verification_checklist: ['check'],
  lessons_to_save: [],
  sources: [
    { title: 'kept', url: 'https://example.com/a' },
    { title: 'invented', url: 'https://invented.example/b' },
  ],
};

test('extracts JSON from a fenced block with surrounding prose', () => {
  const out = extractJson(`Here you go:\n\`\`\`json\n${JSON.stringify({ a: 1 })}\n\`\`\`\nThanks`);
  assert.deepEqual(out, { a: 1 });
});

test('throws when reply has no JSON', () => {
  assert.throws(() => extractJson('no plan here'), /valid JSON plan/);
});

test('orders steps by priority, normalises fields, drops uncited sources', () => {
  const { plan: p, warnings } = parsePlan(JSON.stringify(plan), new Set(['https://example.com/a']));
  assert.equal(p.steps[0].title, 'First');
  assert.equal(p.steps[0].id, 's1');
  assert.deepEqual(p.steps[0].prerequisites, ['one prereq']);
  assert.equal(p.steps[0].status, 'pending');
  assert.equal(p.steps[1].requires_approval, true);
  assert.deepEqual(p.sources.map((s) => s.url), ['https://example.com/a']);
  assert.equal(warnings.length, 1);
});

test('rejects a plan with no steps', () => {
  assert.throws(() => parsePlan(JSON.stringify({ ...plan, steps: [] }), new Set()), /no steps/);
});

test('prompt labels failed and unverified memories and excludes unused ones', () => {
  const mk = (status: 'failed' | 'unverified', used: boolean, problem: string) => ({
    id: problem,
    score: 0.8,
    used,
    payload: {
      task_id: 't', problem, domain: 'ops', solution: 's', outcome_status: status, source_urls: [], tags: [],
      confidence: 0.5, created_at: '', verification_notes: '', lessons: [],
    },
  });
  const prompt = buildPrompt({
    goal: 'g', description: '', domain: 'ops', omi: [],
    memories: [mk('failed', true, 'P-failed'), mk('unverified', true, 'P-unverified'), mk('failed', false, 'P-hidden')],
  });
  assert.match(prompt, /FAILED — do not repeat/);
  assert.match(prompt, /UNVERIFIED/);
  assert.doesNotMatch(prompt, /P-hidden/);
});
