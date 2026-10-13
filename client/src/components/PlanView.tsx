import { AlertOctagon, BookOpen, CheckCircle2, Circle, Lightbulb, Link2, ListChecks, ShieldAlert, Target, XCircle } from 'lucide-react';
import { useState } from 'react';
import type { Plan, PlanStep, StepStatus } from '../lib/types';
import { Bullets, SectionTitle } from './ui';

export function PlanHeader({ plan }: { plan: Plan }) {
  return (
    <div className="card card-pad plan-section">
      <SectionTitle icon={Target} title="Goal & success criteria" />
      <p style={{ fontWeight: 550, marginBottom: 12 }}>{plan.goal}</p>
      <Bullets items={plan.success_criteria} />
    </div>
  );
}

export function Findings({ plan, memoryLabels }: { plan: Plan; memoryLabels: Set<string> }) {
  return (
    <div className="card card-pad plan-section">
      <SectionTitle icon={Lightbulb} title="Findings & reasoning" />
      <p style={{ color: 'var(--text-2)', marginBottom: 14 }}>{plan.reasoning_summary}</p>
      <Bullets items={plan.findings} />
      {plan.relevant_experiences.length > 0 && (
        <div className="stack" style={{ marginTop: 18 }}>
          <div className="label" style={{ margin: 0 }}>
            How past experience was used
          </div>
          {plan.relevant_experiences.map((r, i) => (
            <div key={i} className="row small" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
              <span className={`badge ${memoryLabels.has(r.reference) ? 'accent' : ''}`} title={memoryLabels.has(r.reference) ? '' : 'Reference not found among retrieved memories'}>
                {r.reference}
              </span>
              <span style={{ color: 'var(--text-2)' }}>{r.how_used}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const STEP_OPTS: { s: StepStatus; label: string; Icon: typeof Circle }[] = [
  { s: 'pending', label: 'Pending', Icon: Circle },
  { s: 'completed', label: 'Done', Icon: CheckCircle2 },
  { s: 'failed', label: 'Failed', Icon: XCircle },
];

function StepCard({ step, locked, onChange }: { step: PlanStep; locked: boolean; onChange: (s: StepStatus, note?: string) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(step.note ?? '');
  const set = async (s: StepStatus) => {
    setBusy(true);
    try {
      await onChange(s, note || undefined);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={`step ${step.status}`}>
      <div className="step-head">
        <span className="step-num">{step.priority}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h3>{step.title}</h3>
            <div className="row">
              {step.requires_approval && (
                <span className="badge warn" title="External or irreversible: needs your explicit approval before anyone executes it">
                  <AlertOctagon size={12} /> Requires approval
                </span>
              )}
              <div className="seg" aria-label="Step status">
                {STEP_OPTS.map(({ s, label, Icon }) => (
                  <button key={s} className={`${step.status === s ? 'on' : ''} ${s}`} disabled={busy || locked} onClick={() => step.status !== s && set(s)}>
                    <Icon size={12} /> {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <p style={{ color: 'var(--text-2)', marginTop: 6 }}>{step.description}</p>
          <div className="step-meta">
            <div>
              <div className="k">Prerequisites</div>
              <div className="v">{step.prerequisites.length ? step.prerequisites.join(' · ') : '—'}</div>
            </div>
            <div>
              <div className="k">Expected outcome</div>
              <div className="v">{step.expected_outcome || '—'}</div>
            </div>
            <div>
              <div className="k">Verify by</div>
              <div className="v">{step.verification || '—'}</div>
            </div>
          </div>
          {!locked && step.status !== 'pending' && (
            <input
              className="input"
              style={{ marginTop: 12, height: 34, padding: '6px 11px', fontSize: 13 }}
              placeholder="What actually happened? (saved with the step)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onBlur={() => note !== (step.note ?? '') && set(step.status)}
              maxLength={1000}
            />
          )}
          {locked && step.note && <p className="small muted" style={{ marginTop: 8 }}>Note: {step.note}</p>}
        </div>
      </div>
    </div>
  );
}

export function Steps({ plan, locked, onChange }: { plan: Plan; locked: boolean; onChange: (id: string, s: StepStatus, note?: string) => Promise<void> }) {
  const done = plan.steps.filter((s) => s.status === 'completed').length;
  const failed = plan.steps.filter((s) => s.status === 'failed').length;
  return (
    <div className="card card-pad plan-section">
      <SectionTitle
        icon={ListChecks}
        title="Prioritized action plan"
        sub={`${done} done · ${failed} failed · ${plan.steps.length - done - failed} pending — these are recommendations until you verify them`}
      />
      <div className="steps">
        {plan.steps.map((s) => (
          <StepCard key={s.id} step={s} locked={locked} onChange={(st, note) => onChange(s.id, st, note)} />
        ))}
      </div>
    </div>
  );
}

export function Risks({ plan }: { plan: Plan }) {
  return (
    <div className="card card-pad plan-section">
      <SectionTitle icon={ShieldAlert} title="Risks & recovery strategy" />
      {!plan.risks.length ? (
        <p className="muted small">The agent identified no specific risks.</p>
      ) : (
        <div>
          {plan.risks.map((r, i) => (
            <div className="risk" key={i}>
              <div>
                <div className="row" style={{ marginBottom: 4 }}>
                  <span className={`badge ${/high/i.test(r.likelihood) ? 'danger' : /med/i.test(r.likelihood) ? 'warn' : ''}`}>{r.likelihood || 'unknown'}</span>
                </div>
                <div style={{ color: 'var(--text)', fontWeight: 550 }}>{r.risk}</div>
              </div>
              <div>
                <div className="label">Mitigation</div>
                {r.mitigation}
              </div>
              <div>
                <div className="label">Recovery</div>
                {r.recovery}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Checklist({ plan }: { plan: Plan }) {
  return (
    <div className="card card-pad plan-section">
      <SectionTitle icon={CheckCircle2} title="Verification checklist" />
      <ul className="checklist">
        {plan.verification_checklist.map((c, i) => (
          <li key={i}>
            <span className="box" /> {c}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Lessons({ plan }: { plan: Plan }) {
  return (
    <div className="card card-pad plan-section">
      <SectionTitle icon={BookOpen} title="Lessons to save" sub="Proposed by the agent — saved only with the outcome you record" />
      <Bullets items={plan.lessons_to_save} />
    </div>
  );
}

export function Sources({ plan }: { plan: Plan }) {
  if (!plan.sources.length) return null;
  return (
    <div className="card card-pad plan-section">
      <SectionTitle icon={Link2} title="Sources" sub="Only URLs present in retrieved experiences are shown" />
      <ul className="bullets">
        {plan.sources.map((s) => (
          <li key={s.url}>
            <a href={s.url} target="_blank" rel="noreferrer noopener" style={{ color: 'var(--accent-600)' }}>
              {s.title || s.url}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
