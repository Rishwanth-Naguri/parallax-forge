import { ArrowRight, BrainCircuit, CheckCircle2, CircleSlash, Clock, Database, History, Sparkles, XCircle } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Banner, Empty, SectionTitle, TaskStatusBadge } from '../components/ui';
import { api, ApiError, type Health } from '../lib/api';
import { DOMAINS, relativeTime } from '../lib/format';
import { useAsync } from '../lib/hooks';

export function CommandCenter({ health }: { health?: Health }) {
  const navigate = useNavigate();
  const stats = useAsync(api.memoryStats);
  const tasks = useAsync(api.listTasks);
  const [goal, setGoal] = useState('');
  const [description, setDescription] = useState('');
  const [domain, setDomain] = useState('general');
  const [useOmi, setUseOmi] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(undefined);
    try {
      const task = await api.createTask({ goal, description, domain, useOmi });
      navigate(`/tasks/${task.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start the task');
      setSubmitting(false);
    }
  }

  const s = stats.data;
  const omiAvailable = health?.omi.configured && health.omi.reachable;

  return (
    <div className="page">
      <section className="hero">
        <div className="eyebrow">Command Center</div>
        <h1>What are we forging today?</h1>
        <p className="lede">
          Describe a goal. PARALLAX FORGE recalls similar past problems, what worked and what failed, then asks your Lyzr agent for a
          grounded plan you can execute, verify, and feed back into memory.
        </p>

        <form className="goal-form" onSubmit={submit}>
          <input
            className="input goal-input"
            placeholder="e.g. Reduce p95 API latency below 200ms before the Friday launch"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            maxLength={500}
            required
            minLength={5}
            aria-label="Goal"
          />
          <textarea
            className="textarea"
            placeholder="Context, constraints, what you've already tried (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={4000}
            aria-label="Task description"
          />
          <div className="goal-form-foot">
            <select className="select" value={domain} onChange={(e) => setDomain(e.target.value)} aria-label="Domain">
              {DOMAINS.map((d) => (
                <option key={d} value={d}>
                  {d[0].toUpperCase() + d.slice(1)}
                </option>
              ))}
            </select>
            <label className="check" title={omiAvailable ? 'Search your Omi memories and conversations for context' : 'Omi is not connected'}>
              <input type="checkbox" checked={useOmi && Boolean(omiAvailable)} disabled={!omiAvailable} onChange={(e) => setUseOmi(e.target.checked)} />
              Include Omi personal context
            </label>
            <span className="spacer" />
            <button className="btn btn-primary btn-lg" disabled={submitting || goal.trim().length < 5}>
              {submitting ? <span className="spinner" style={{ borderColor: 'rgba(255,255,255,.35)', borderTopColor: '#fff' }} /> : <Sparkles size={17} />}
              Forge plan
            </button>
          </div>
          {error && <Banner tone="error">{error}</Banner>}
        </form>
      </section>

      {health && health.status !== 'ok' && (
        <Banner tone="warn">
          <strong>Some services are not ready.</strong>{' '}
          {[
            !health.lyzr.configured && 'Lyzr is not configured.',
            !health.qdrant.collectionReady && `Qdrant: ${health.qdrant.error ?? 'collection not ready'}.`,
            !health.embedding.ok && `Embeddings: ${health.embedding.error ?? 'model not loaded'}.`,
          ]
            .filter(Boolean)
            .join(' ')}
        </Banner>
      )}

      <div className="grid-4">
        <Stat icon={Database} label="Experiences in memory" value={s?.total} />
        <Stat icon={CheckCircle2} label="Verified successes" value={s?.byStatus.success} />
        <Stat icon={XCircle} label="Failures preserved" value={s?.byStatus.failed} />
        <Stat icon={CircleSlash} label="Unverified" value={s?.byStatus.unverified} />
      </div>
      {stats.error && <Banner tone="error">Memory statistics unavailable: {stats.error}</Banner>}

      <div className="card card-pad">
        <SectionTitle
          icon={History}
          title="Recent tasks"
          right={
            <Link to="/history" className="btn btn-sm btn-ghost">
              View all <ArrowRight size={14} />
            </Link>
          }
        />
        {tasks.loading && !tasks.data ? (
          <div className="stack">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton" style={{ height: 44 }} />
            ))}
          </div>
        ) : tasks.error ? (
          <Banner tone="error">{tasks.error}</Banner>
        ) : !tasks.data?.length ? (
          <Empty icon={BrainCircuit} title="No tasks yet">
            Your first goal starts the memory loop. If the memory is empty, the agent plans from first principles, and the outcome you record becomes the first experience.
          </Empty>
        ) : (
          <div>
            {tasks.data.slice(0, 6).map((t) => (
              <Link key={t.id} to={`/tasks/${t.id}`} className="list-row">
                <div className="grow">
                  <div className="truncate" style={{ fontWeight: 550 }}>
                    {t.goal}
                  </div>
                  <div className="small muted row" style={{ gap: 8 }}>
                    <span className="tag">{t.domain}</span>
                    <span>
                      <Clock size={12} style={{ verticalAlign: -1 }} /> {relativeTime(t.createdAt)}
                    </span>
                    <span>{t.memoryCount} memories recalled</span>
                  </div>
                </div>
                <TaskStatusBadge status={t.status} />
                <ArrowRight size={16} className="muted" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Database; label: string; value?: number }) {
  return (
    <div className="card stat">
      <div className="stat-label">
        <Icon size={14} /> {label}
      </div>
      <div className="stat-value">{value ?? <span className="skeleton" style={{ display: 'inline-block', width: 40, height: 26 }} />}</div>
    </div>
  );
}
