import { Save, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { api } from '../lib/api';
import { OUTCOME_META, fullDate } from '../lib/format';
import { OUTCOME_STATUSES, type OutcomeStatus, type Task } from '../lib/types';
import { Banner, OutcomeBadge, SectionTitle } from './ui';

export function OutcomeForm({ task, onSaved, omiAvailable }: { task: Task; onSaved: (t: Task) => void; omiAvailable: boolean }) {
  const plan = task.plan!;
  const done = plan.steps.filter((s) => s.status === 'completed').length;
  const failed = plan.steps.filter((s) => s.status === 'failed').length;

  const [status, setStatus] = useState<OutcomeStatus>('unverified');
  const [notes, setNotes] = useState('');
  const [lessons, setLessons] = useState(plan.lessons_to_save.join('\n'));
  const [tags, setTags] = useState(task.domain);
  const [confidence, setConfidence] = useState(0.6);
  const [saveToOmi, setSaveToOmi] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  if (task.outcome) {
    const o = task.outcome;
    return (
      <div className="card card-pad plan-section">
        <SectionTitle icon={ShieldCheck} title="Outcome recorded" sub={`Saved ${fullDate(o.savedAt)} · point ${o.pointId.slice(0, 8)}`} right={<OutcomeBadge status={o.status} />} />
        <p style={{ color: 'var(--text-2)', whiteSpace: 'pre-wrap' }}>{o.notes || 'No verification notes (unverified recommendation).'}</p>
        {o.omiSaved && <p className="small muted" style={{ marginTop: 8 }}>Lesson also saved to Omi.</p>}
        {o.omiSaved === false && <Banner tone="warn">Saving to Omi failed: {o.omiError}</Banner>}
      </div>
    );
  }

  const successBlocked = status === 'success' && done === 0;
  const notesRequired = status !== 'unverified' && notes.trim().length < 10;

  async function save() {
    setBusy(true);
    setError(undefined);
    try {
      const t = await api.recordOutcome(task.id, {
        outcome_status: status,
        verification_notes: notes,
        lessons: lessons.split('\n').map((l) => l.trim()).filter(Boolean),
        tags: tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean),
        confidence,
        saveToOmi,
      });
      onSaved(t);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card card-pad plan-section">
      <SectionTitle
        icon={ShieldCheck}
        title="Outcome verification"
        sub={`Record what actually happened · ${done} done, ${failed} failed, ${plan.steps.length - done - failed} pending`}
      />
      <div className="stack" style={{ gap: 16 }}>
        <div className="outcome-opts" role="radiogroup">
          {OUTCOME_STATUSES.map((s) => (
            <button key={s} type="button" role="radio" aria-checked={status === s} className={`outcome-opt${status === s ? ' on' : ''}`} onClick={() => setStatus(s)}>
              <div className="t">{OUTCOME_META[s].label}</div>
              <div className="d">{OUTCOME_META[s].hint}</div>
            </button>
          ))}
        </div>
        {successBlocked && <Banner tone="warn">Mark at least one step as done before recording a verified success.</Banner>}

        <div>
          <label className="label" htmlFor="vnotes">
            Verification notes {status !== 'unverified' && <span className="muted">(required)</span>}
          </label>
          <textarea
            id="vnotes"
            className="textarea"
            placeholder={status === 'unverified' ? 'Optional: why is this being saved untested?' : 'How did you verify it? Metrics, checks, what failed and why…'}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
        <div className="grid-2">
          <div>
            <label className="label" htmlFor="lessons">
              Lessons (one per line)
            </label>
            <textarea id="lessons" className="textarea" value={lessons} onChange={(e) => setLessons(e.target.value)} />
          </div>
          <div className="stack">
            <div>
              <label className="label" htmlFor="tags">
                Tags (comma separated)
              </label>
              <input id="tags" className="input" value={tags} onChange={(e) => setTags(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="conf">
                Confidence · {Math.round(confidence * 100)}%
              </label>
              <input id="conf" type="range" min={0} max={1} step={0.05} value={confidence} onChange={(e) => setConfidence(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--accent)' }} />
            </div>
            {omiAvailable && (
              <label className="check" title="Writes a short lesson to your Omi account — an external action, so it is off by default">
                <input type="checkbox" checked={saveToOmi} onChange={(e) => setSaveToOmi(e.target.checked)} />I approve also saving the lesson to my Omi memories
              </label>
            )}
          </div>
        </div>
        {error && <Banner tone="error">{error}</Banner>}
        <div className="row">
          <span className="spacer" />
          <button className="btn btn-primary" disabled={busy || successBlocked || notesRequired} onClick={save}>
            {busy ? <span className="spinner" style={{ borderColor: 'rgba(255,255,255,.35)', borderTopColor: '#fff' }} /> : <Save size={16} />}
            Save experience to memory
          </button>
        </div>
      </div>
    </div>
  );
}
