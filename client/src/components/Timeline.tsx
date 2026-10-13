import { Check, Minus, X } from 'lucide-react';
import type { Stage } from '../lib/types';

/** Renders backend-reported stage states verbatim; nothing is animated ahead of the server. */
export function Timeline({ stages }: { stages: Stage[] }) {
  return (
    <ol className="timeline">
      {stages.map((s) => (
        <li key={s.id} className={`tl-item ${s.status}`}>
          <span className="tl-node" aria-label={s.status}>
            {s.status === 'completed' && <Check size={14} strokeWidth={3} />}
            {s.status === 'failed' && <X size={14} strokeWidth={3} />}
            {s.status === 'running' && <span className="spinner" style={{ width: 12, height: 12 }} />}
            {s.status === 'skipped' && <Minus size={12} />}
          </span>
          <div>
            <div className="tl-label">{s.label}</div>
            {s.detail && <div className="tl-detail">{s.detail}</div>}
            {s.error && <div className="tl-error">{s.error}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}
