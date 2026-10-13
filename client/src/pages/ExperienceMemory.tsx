import { BrainCircuit, ExternalLink, Plus, Search, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { MemoryCard } from '../components/MemoryCard';
import { Banner, Bullets, Empty, OutcomeBadge, Score } from '../components/ui';
import { api, type MemoryItem } from '../lib/api';
import { DOMAINS, OUTCOME_META, fullDate } from '../lib/format';
import { useAsync } from '../lib/hooks';
import { OUTCOME_STATUSES, type OutcomeStatus } from '../lib/types';

export function ExperienceMemory() {
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [domain, setDomain] = useState('');
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState<MemoryItem>();
  const [adding, setAdding] = useState(false);

  const mem = useAsync(() => api.listMemories({ q: submitted, domain, outcome_status: status }), [submitted, domain, status]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Experience Memory</div>
          <h1>What the forge remembers</h1>
          <p className="lede">Every saved outcome lives in Qdrant as a vector. Search by meaning, not keywords. Failures are kept on purpose so they are not repeated.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setAdding(true)}>
          <Plus size={16} /> Add experience
        </button>
      </div>

      <form
        className="toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(query.trim());
        }}
      >
        <div className="search-wrap">
          <Search size={16} />
          <input className="input" placeholder="Semantic search: e.g. “database migration downtime”" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <select className="select" value={domain} onChange={(e) => setDomain(e.target.value)} aria-label="Filter by domain">
          <option value="">All domains</option>
          {DOMAINS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <select className="select" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by outcome">
          <option value="">All outcomes</option>
          {OUTCOME_STATUSES.map((s) => (
            <option key={s} value={s}>
              {OUTCOME_META[s].label}
            </option>
          ))}
        </select>
        <button className="btn">Search</button>
        {submitted && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setQuery('');
              setSubmitted('');
            }}
          >
            Clear
          </button>
        )}
      </form>

      {mem.error && <Banner tone="error">{mem.error}</Banner>}
      {mem.data && (
        <p className="small muted">
          {mem.data.mode === 'semantic' ? `${mem.data.items.length} closest matches by cosine similarity` : `${mem.data.items.length} experiences, newest first`}
        </p>
      )}

      {mem.loading && !mem.data ? (
        <div className="mem-grid">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton" style={{ height: 150 }} />
          ))}
        </div>
      ) : mem.data && mem.data.items.length === 0 ? (
        <div className="card">
          <Empty
            icon={BrainCircuit}
            title={submitted || domain || status ? 'No matching experiences' : 'Memory is empty'}
            action={
              <button className="btn btn-primary" onClick={() => setAdding(true)}>
                <Plus size={16} /> Save the first experience
              </button>
            }
          >
            {submitted || domain || status
              ? 'Try a broader query or remove a filter.'
              : 'Run a task and record its outcome, or add a past experience by hand so the next plan has something to learn from.'}
          </Empty>
        </div>
      ) : (
        <div className="mem-grid">
          {mem.data?.items.map((m) => (
            <MemoryCard key={m.id} payload={m.payload} score={m.score} onClick={() => setSelected(m)} />
          ))}
        </div>
      )}

      {selected && <Detail item={selected} onClose={() => setSelected(undefined)} />}
      {adding && (
        <AddExperience
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            mem.reload();
          }}
        />
      )}
    </div>
  );
}

function Drawer({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label={title}>
        <div className="row">
          <h2>{title}</h2>
          <span className="spacer" />
          <button className="btn btn-sm btn-ghost" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        {children}
      </aside>
    </>
  );
}

function Detail({ item, onClose }: { item: MemoryItem; onClose: () => void }) {
  const p = item.payload;
  const isTask = !p.task_id.startsWith('manual-');
  return (
    <Drawer title="Experience" onClose={onClose}>
      <div className="row">
        <OutcomeBadge status={p.outcome_status} />
        <span className="tag">{p.domain}</span>
        {item.score !== undefined && <Score value={item.score} />}
      </div>
      <KV k="Problem" v={p.problem} />
      <KV k="Solution" v={p.solution} />
      <KV k="Verification notes" v={p.verification_notes || '—'} />
      <div className="kv">
        <div className="k">Lessons</div>
        <Bullets items={p.lessons} empty="No lessons recorded." />
      </div>
      <div className="grid-2">
        <KV k="Confidence" v={`${Math.round(p.confidence * 100)}%`} />
        <KV k="Created" v={fullDate(p.created_at)} />
      </div>
      {p.tags.length > 0 && (
        <div className="row">
          {p.tags.map((t) => (
            <span key={t} className="tag">
              #{t}
            </span>
          ))}
        </div>
      )}
      {p.source_urls.length > 0 && (
        <div className="kv">
          <div className="k">Sources</div>
          {p.source_urls.map((u) => (
            <a key={u} href={u} target="_blank" rel="noreferrer noopener" className="row small" style={{ color: 'var(--accent-600)' }}>
              <ExternalLink size={12} /> {u}
            </a>
          ))}
        </div>
      )}
      {isTask && (
        <Link to={`/tasks/${p.task_id}`} className="btn" style={{ alignSelf: 'flex-start' }}>
          Open originating task
        </Link>
      )}
    </Drawer>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="kv">
      <div className="k">{k}</div>
      <div className="v">{v}</div>
    </div>
  );
}

function AddExperience({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ problem: '', solution: '', domain: 'general', outcome_status: 'unverified' as OutcomeStatus, verification_notes: '', tags: '', lessons: '', sources: '', confidence: 0.5 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));
  const lines = (s: string, sep: RegExp) => s.split(sep).map((x) => x.trim()).filter(Boolean);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      await api.createMemory({
        problem: f.problem,
        solution: f.solution,
        domain: f.domain,
        outcome_status: f.outcome_status,
        verification_notes: f.verification_notes,
        tags: lines(f.tags.toLowerCase(), /,/),
        lessons: lines(f.lessons, /\n/),
        source_urls: lines(f.sources, /\s+/),
        confidence: f.confidence,
      });
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Drawer title="Add experience" onClose={onClose}>
      <form className="stack" style={{ gap: 14 }} onSubmit={submit}>
        <div>
          <label className="label">Problem</label>
          <textarea className="textarea" required minLength={5} value={f.problem} onChange={(e) => set('problem', e.target.value)} />
        </div>
        <div>
          <label className="label">Solution / approach taken</label>
          <textarea className="textarea" required minLength={5} value={f.solution} onChange={(e) => set('solution', e.target.value)} />
        </div>
        <div className="grid-2">
          <div>
            <label className="label">Domain</label>
            <select className="select" value={f.domain} onChange={(e) => set('domain', e.target.value)}>
              {DOMAINS.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Outcome</label>
            <select className="select" value={f.outcome_status} onChange={(e) => set('outcome_status', e.target.value as OutcomeStatus)}>
              {OUTCOME_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {OUTCOME_META[s].label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="label">Verification notes {f.outcome_status !== 'unverified' && <span className="muted">(required)</span>}</label>
          <textarea className="textarea" value={f.verification_notes} onChange={(e) => set('verification_notes', e.target.value)} />
        </div>
        <div>
          <label className="label">Lessons (one per line)</label>
          <textarea className="textarea" value={f.lessons} onChange={(e) => set('lessons', e.target.value)} />
        </div>
        <div className="grid-2">
          <div>
            <label className="label">Tags (comma separated)</label>
            <input className="input" value={f.tags} onChange={(e) => set('tags', e.target.value)} />
          </div>
          <div>
            <label className="label">Confidence · {Math.round(f.confidence * 100)}%</label>
            <input type="range" min={0} max={1} step={0.05} value={f.confidence} onChange={(e) => set('confidence', Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--accent)' }} />
          </div>
        </div>
        <div>
          <label className="label">Source URLs (space or newline separated)</label>
          <textarea className="textarea" style={{ minHeight: 60 }} value={f.sources} onChange={(e) => set('sources', e.target.value)} />
        </div>
        {error && <Banner tone="error">{error}</Banner>}
        <button className="btn btn-primary" disabled={busy}>
          {busy ? <span className="spinner" style={{ borderColor: 'rgba(255,255,255,.35)', borderTopColor: '#fff' }} /> : <Plus size={16} />}
          Embed & save to Qdrant
        </button>
      </form>
    </Drawer>
  );
}
