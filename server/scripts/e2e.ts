/**
 * End-to-end test against a RUNNING backend (npm run dev). Uses the real Lyzr agent, real embeddings
 * and the real Qdrant collection. Records it creates are tagged "e2e-test" in domain "e2e".
 *
 *   API_URL=http://localhost:8787 npm run test:e2e
 */
const API = process.env.API_URL ?? 'http://localhost:8787';
const runId = Date.now().toString(36);
let failures = 0;

function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
  if (!ok) failures++;
  return ok;
}

async function api<T = any>(path: string, init?: RequestInit & { json?: unknown }): Promise<{ status: number; body: T }> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json' },
    body: init?.json !== undefined ? JSON.stringify(init.json) : undefined,
  });
  return { status: res.status, body: (await res.json()) as T };
}

console.log(`PARALLAX FORGE e2e (run ${runId}) against ${API}\n`);

// 1. Health
console.log('1. Health');
const health = await api('/api/health');
check('backend reachable', health.status === 200 || health.status === 503);
check('Lyzr configured', health.body.lyzr?.configured === true);
check('Qdrant reachable + collection ready', health.body.qdrant?.collectionReady === true, health.body.qdrant?.error ?? '');
check('embedding model loaded', health.body.embedding?.ok === true, `${health.body.embedding?.model} dim=${health.body.embedding?.dimension}`);
console.log(`        Omi: configured=${health.body.omi?.configured} reachable=${health.body.omi?.reachable}`);
if (failures) {
  console.error('\nPrerequisites failed; aborting.');
  process.exit(1);
}

// 2. Seed a failed experience the agent should learn from
console.log('\n2. Seed experience');
const seed = await api('/api/memories', {
  method: 'POST',
  json: {
    problem: `[${runId}] Migrate a production PostgreSQL 14 database to a new server with minimal downtime`,
    domain: 'e2e',
    solution: 'Stopped the app, ran pg_dump/pg_restore of the full 400GB database, then restarted the app.',
    outcome_status: 'failed',
    verification_notes: 'Restore took 9 hours, far beyond the 30-minute maintenance window; rolled back.',
    tags: ['e2e-test', 'postgres'],
    lessons: ['Full dump/restore does not scale for large DBs; use logical or streaming replication then cut over.'],
    confidence: 0.9,
  },
});
check('POST /api/memories → 201', seed.status === 201, JSON.stringify(seed.body).slice(0, 200));
const seedId: string = seed.body.id;

// 3. Validation rejects bad input
const bad = await api('/api/tasks', { method: 'POST', json: { goal: 'x' } });
check('invalid task is rejected with 400', bad.status === 400);

// 4. Run a real task
console.log('\n3. Run task (real Lyzr call — may take up to ~2 min)');
const created = await api('/api/tasks', {
  method: 'POST',
  json: {
    goal: 'Move our production Postgres database to a new host without a long outage',
    description: 'About 400GB, PostgreSQL 14, maintenance window is 30 minutes.',
    domain: 'e2e',
    useOmi: true,
  },
});
check('POST /api/tasks → 202', created.status === 202);
const taskId: string = created.body.id;

let task: any = created.body;
const deadline = Date.now() + 180_000;
let lastSeen = '';
while (task.status === 'running' && Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 1000));
  task = (await api(`/api/tasks/${taskId}`)).body;
  const running = task.stages.find((s: any) => s.status === 'running')?.label ?? '';
  if (running && running !== lastSeen) console.log(`        … ${running}`);
  lastSeen = running;
}
for (const s of task.stages) console.log(`        [${s.status.padEnd(9)}] ${s.label}${s.detail ? ` — ${s.detail}` : ''}${s.error ? ` — ERROR: ${s.error}` : ''}`);

check('task reached awaiting_outcome', task.status === 'awaiting_outcome', task.error ? `${task.error.stage}: ${task.error.message}` : task.status);
const seededHit = task.memories?.find((m: any) => m.id === seedId);
check('Qdrant retrieved the seeded experience', Boolean(seededHit), seededHit ? `score=${seededHit.score.toFixed(3)} used=${seededHit.used}` : '');
check('seeded experience passed relevance threshold', seededHit?.used === true);
check('Lyzr returned a real response', typeof task.rawResponse === 'string' && task.rawResponse.length > 50, `${task.rawResponse?.length ?? 0} chars`);
check('plan has steps', (task.plan?.steps?.length ?? 0) > 0, `${task.plan?.steps?.length ?? 0} steps`);
check('outcome stages still pending (no auto-success)', task.stages.find((s: any) => s.id === 'memory_updated')?.status === 'pending');
if (!task.plan) process.exit(1);

// 5. Track steps and record outcome
console.log('\n4. Record outcome');
const premature = await api(`/api/tasks/${taskId}/outcome`, {
  method: 'POST',
  json: { outcome_status: 'success', verification_notes: 'Claimed success without any completed step.' },
});
check('success without completed steps is refused', premature.status === 422);

const stepUpd = await api(`/api/tasks/${taskId}/steps/s1`, { method: 'PATCH', json: { status: 'completed', note: 'done in e2e' } });
check('PATCH step → completed', stepUpd.status === 200 && stepUpd.body.plan.steps[0].status === 'completed');

const outcome = await api(`/api/tasks/${taskId}/outcome`, {
  method: 'POST',
  json: {
    outcome_status: 'partial',
    verification_notes: `e2e ${runId}: first step verified, remaining steps not executed in test.`,
    tags: ['e2e-test'],
    lessons: task.plan.lessons_to_save.slice(0, 3),
    confidence: 0.4,
    saveToOmi: false,
  },
});
check('POST outcome → 200', outcome.status === 200, outcome.body.error ?? '');
const pointId: string | undefined = outcome.body.outcome?.pointId;
check('memory_updated stage completed', outcome.body.stages?.find((s: any) => s.id === 'memory_updated')?.status === 'completed');

// 6. Persistence: the saved experience is retrievable from Qdrant
console.log('\n5. Persistence');
const listed = await api(`/api/memories?domain=e2e&outcome_status=partial&limit=200`);
check('saved experience listed from Qdrant', listed.body.items?.some((m: any) => m.id === pointId), `point ${pointId}`);
const searched = await api(`/api/memories?q=${encodeURIComponent('postgres migration new host downtime')}&domain=e2e`);
const found = searched.body.items?.find((m: any) => m.id === pointId);
check('saved experience found by semantic search', Boolean(found), found ? `score=${found.score.toFixed(3)}` : '');
const reread = await api(`/api/tasks/${taskId}`);
check('task persisted with outcome', reread.body.status === 'completed' && reread.body.outcome?.pointId === pointId);

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
process.exit(failures ? 1 : 0);
