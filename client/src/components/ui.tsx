import { AlertTriangle, Info, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { OUTCOME_META, TASK_STATUS_META, pct } from '../lib/format';
import type { OutcomeStatus, TaskStatus } from '../lib/types';

export function OutcomeBadge({ status }: { status: OutcomeStatus }) {
  const m = OUTCOME_META[status];
  return (
    <span className={`badge ${m.tone}`} title={m.hint}>
      {m.label}
    </span>
  );
}

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const m = TASK_STATUS_META[status];
  return (
    <span className={`badge ${m.tone}`}>
      {status === 'running' && <span className="spinner" style={{ width: 10, height: 10, borderWidth: 1.5 }} />}
      {m.label}
    </span>
  );
}

export function Score({ value }: { value: number }) {
  return (
    <span className="score" title={`Cosine similarity ${value.toFixed(3)}`}>
      <span className="score-bar">
        <span style={{ width: `${Math.max(4, Math.min(100, value * 100))}%` }} />
      </span>
      {pct(value)}
    </span>
  );
}

export function Banner({ tone, children, icon }: { tone: 'error' | 'warn' | 'info'; children: ReactNode; icon?: LucideIcon }) {
  const Icon = icon ?? (tone === 'info' ? Info : AlertTriangle);
  return (
    <div className={`banner ${tone}`} role={tone === 'error' ? 'alert' : undefined}>
      <Icon size={17} style={{ flex: 'none', marginTop: 1 }} />
      <div style={{ minWidth: 0 }}>{children}</div>
    </div>
  );
}

export function Empty({ icon: Icon, title, children, action }: { icon: LucideIcon; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <span className="section-icon">
        <Icon size={22} />
      </span>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function SectionTitle({ icon: Icon, title, sub, right }: { icon: LucideIcon; title: string; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="card-head">
      <div className="title-row">
        <span className="section-icon">
          <Icon size={15} />
        </span>
        <div>
          <h2>{title}</h2>
          {sub && <div className="sub">{sub}</div>}
        </div>
      </div>
      {right}
    </div>
  );
}

export function Bullets({ items, empty = 'None provided.' }: { items: string[]; empty?: string }) {
  if (!items.length) return <p className="muted small">{empty}</p>;
  return (
    <ul className="bullets">
      {items.map((t, i) => (
        <li key={i}>{t}</li>
      ))}
    </ul>
  );
}
