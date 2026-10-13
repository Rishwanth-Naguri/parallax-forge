import type { ExperiencePayload } from '../lib/types';
import { relativeTime } from '../lib/format';
import { OutcomeBadge, Score } from './ui';

export function MemoryCard({
  payload,
  score,
  label,
  unused,
  onClick,
}: {
  payload: ExperiencePayload;
  score?: number;
  label?: string;
  unused?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      className={`mem${unused ? ' unused' : ''}`}
      onClick={onClick}
      style={onClick ? { cursor: 'pointer' } : undefined}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
    >
      <div className="mem-head">
        {label && <span className="badge accent">{label}</span>}
        <OutcomeBadge status={payload.outcome_status} />
        <span className="tag">{payload.domain}</span>
        <span className="spacer" />
        {score !== undefined && <Score value={score} />}
      </div>
      <div className="mem-problem">{payload.problem.split('\n')[0]}</div>
      <div className="mem-body" style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
        {payload.solution}
      </div>
      <div className="row small muted" style={{ marginTop: 10, gap: 6 }}>
        {payload.tags.slice(0, 4).map((t) => (
          <span className="tag" key={t}>
            #{t}
          </span>
        ))}
        <span className="spacer" />
        {unused && <span>Below relevance threshold — not used</span>}
        {!unused && <span>{relativeTime(payload.created_at)}</span>}
      </div>
    </div>
  );
}
