import { History } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Banner, Empty, OutcomeBadge, TaskStatusBadge } from '../components/ui';
import { api } from '../lib/api';
import { TASK_STATUS_META, fullDate, relativeTime } from '../lib/format';
import { useAsync } from '../lib/hooks';
import type { TaskStatus } from '../lib/types';

export function TaskHistory() {
  const navigate = useNavigate();
  const tasks = useAsync(api.listTasks);
  const [filter, setFilter] = useState<TaskStatus | ''>('');
  const rows = (tasks.data ?? []).filter((t) => !filter || t.status === filter);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Task History</div>
          <h1>Every run, as it actually ended</h1>
          <p className="lede">Statuses reflect what really happened: runs that failed, plans awaiting verification, and outcomes saved to memory.</p>
        </div>
        <select className="select" style={{ width: 'auto' }} value={filter} onChange={(e) => setFilter(e.target.value as TaskStatus | '')} aria-label="Filter by status">
          <option value="">All statuses</option>
          {Object.entries(TASK_STATUS_META).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
      </div>

      {tasks.error && <Banner tone="error">{tasks.error}</Banner>}

      <div className="card" style={{ overflow: 'hidden' }}>
        {tasks.loading && !tasks.data ? (
          <div className="card-pad stack">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton" style={{ height: 40 }} />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <Empty icon={History} title={filter ? 'No runs with this status' : 'No runs yet'} action={!filter && <Link to="/" className="btn btn-primary">Start a task</Link>}>
            {!filter && 'Tasks you start from the Command Center appear here.'}
          </Empty>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Goal</th>
                <th className="hide-sm">Domain</th>
                <th>Run status</th>
                <th className="hide-sm">Steps</th>
                <th>Outcome</th>
                <th className="hide-sm">Started</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id} onClick={() => navigate(`/tasks/${t.id}`)}>
                  <td style={{ maxWidth: 380 }}>
                    <Link to={`/tasks/${t.id}`} className="truncate" style={{ display: 'block', fontWeight: 550 }}>
                      {t.goal}
                    </Link>
                    {t.error && (
                      <div className="small" style={{ color: 'var(--danger)' }}>
                        Failed at {t.error.stage.replace(/_/g, ' ')}
                      </div>
                    )}
                  </td>
                  <td className="hide-sm">
                    <span className="tag">{t.domain}</span>
                  </td>
                  <td>
                    <TaskStatusBadge status={t.status} />
                  </td>
                  <td className="hide-sm">
                    {t.stepCount ? (
                      <div className="row small muted" style={{ flexWrap: 'nowrap' }}>
                        <div className="progress">
                          <span style={{ width: `${(t.stepsCompleted / t.stepCount) * 100}%` }} />
                        </div>
                        {t.stepsCompleted}/{t.stepCount}
                      </div>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>{t.outcome ? <OutcomeBadge status={t.outcome.status} /> : <span className="muted small">Not recorded</span>}</td>
                  <td className="hide-sm small muted" title={fullDate(t.createdAt)}>
                    {relativeTime(t.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
