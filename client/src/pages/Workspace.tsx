import { ArrowLeft, BrainCircuit, Code2, Radio, RotateCcw, Workflow } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { MemoryCard } from '../components/MemoryCard';
import { OutcomeForm } from '../components/OutcomeForm';
import { Checklist, Findings, Lessons, PlanHeader, Risks, Sources, Steps } from '../components/PlanView';
import { Timeline } from '../components/Timeline';
import { Banner, Empty, SectionTitle, TaskStatusBadge } from '../components/ui';
import { api, type Health } from '../lib/api';
import { fullDate } from '../lib/format';
import { useTask } from '../lib/hooks';
import type { StepStatus } from '../lib/types';

export function Workspace({ health }: { health?: Health }) {
  const { id = '' } = useParams();
  const { task, error, setTask } = useTask(id);
  const [actionError, setActionError] = useState<string>();
  const [retrying, setRetrying] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  if (error && !task) {
    return (
      <div className="page">
        <Banner tone="error">{error}</Banner>
        <Link to="/" className="btn" style={{ alignSelf: 'flex-start' }}>
          <ArrowLeft size={15} /> Back to Command Center
        </Link>
      </div>
    );
  }
  if (!task) {
    return (
      <div className="page">
        <div className="skeleton" style={{ height: 120 }} />
        <div className="skeleton" style={{ height: 420 }} />
      </div>
    );
  }

  const used = task.memories.filter((m) => m.used);
  const labels = new Set(used.map((_, i) => `M${i + 1}`));
  const failedStage = task.error ? task.stages.find((s) => s.id === task.error!.stage) : undefined;

  async function retry() {
    setRetrying(true);
    setActionError(undefined);
    try {
      setTask(await api.retryTask(task!.id));
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setRetrying(false);
    }
  }

  async function updateStep(stepId: string, status: StepStatus, note?: string) {
    setActionError(undefined);
    try {
      setTask(await api.updateStep(task!.id, stepId, status, note));
    } catch (err) {
      setActionError((err as Error).message);
    }
  }

  return (
    <div className="page">
      <Link to="/" className="small muted row" style={{ gap: 6 }}>
        <ArrowLeft size={14} /> Command Center
      </Link>

      <div className="card card-pad goal-card">
        <div className="row" style={{ marginBottom: 10 }}>
          <span className="eyebrow" style={{ margin: 0 }}>
            Execution Workspace
          </span>
          <span className="tag">{task.domain}</span>
          <span className="spacer" />
          <TaskStatusBadge status={task.status} />
        </div>
        <h1>{task.goal}</h1>
        {task.description && <p className="lede" style={{ whiteSpace: 'pre-wrap' }}>{task.description}</p>}
        <p className="small muted" style={{ marginTop: 10 }}>
          Started {fullDate(task.createdAt)} · <span className="mono">{task.id.slice(0, 8)}</span>
        </p>
      </div>

      {task.status === 'failed' && failedStage && !task.plan && (
        <Banner tone="error">
          <strong>Failed at “{failedStage.label}”.</strong> {task.error?.message}
          <div style={{ marginTop: 10 }}>
            <button className="btn btn-sm" onClick={retry} disabled={retrying}>
              <RotateCcw size={13} /> Retry run
            </button>
          </div>
        </Banner>
      )}
      {task.error && task.plan && !task.outcome && <Banner tone="error">Saving the outcome failed at “{failedStage?.label}”: {task.error.message}. Your plan is intact — try saving again.</Banner>}
      {actionError && <Banner tone="error">{actionError}</Banner>}
      {task.parseWarning && <Banner tone="warn">{task.parseWarning}</Banner>}

      <div className="ws">
        <aside className="ws-side">
          <div className="card card-pad">
            <SectionTitle icon={Workflow} title="Workflow" sub="Live backend events" />
            <Timeline stages={task.stages} />
          </div>
        </aside>

        <div className="stack" style={{ gap: 20 }}>
          <div className="card card-pad">
            <SectionTitle
              icon={BrainCircuit}
              title="Relevant previous experiences"
              sub={
                task.stages.find((s) => s.id === 'memory_searched')?.status === 'completed'
                  ? `${task.memories.length} retrieved from Qdrant · ${used.length} used in the prompt`
                  : 'Waiting for memory search…'
              }
            />
            {task.memories.length === 0 ? (
              task.stages.find((s) => s.id === 'experiences_retrieved')?.status === 'completed' ? (
                <Empty icon={BrainCircuit} title="Memory is empty for this kind of task">
                  The agent will plan from first principles. Record the outcome below and it becomes the first experience future tasks can learn from.
                </Empty>
              ) : (
                <div className="stack">
                  <div className="skeleton" style={{ height: 70 }} />
                  <div className="skeleton" style={{ height: 70 }} />
                </div>
              )
            ) : (
              <div className="stack">
                {task.memories.map((m) => (
                  <MemoryCard key={m.id} payload={m.payload} score={m.score} unused={!m.used} label={m.used ? `M${used.indexOf(m) + 1}` : undefined} />
                ))}
              </div>
            )}
          </div>

          {task.omiContext.length > 0 && (
            <div className="card card-pad">
              <SectionTitle icon={Radio} title="Omi personal context" sub="From your Omi memories and conversations" />
              <ul className="bullets">
                {task.omiContext.map((o, i) => (
                  <li key={i}>
                    <span className="badge" style={{ marginRight: 6 }}>
                      {o.kind}
                    </span>
                    {o.text}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {task.status === 'running' && !task.plan && (
            <div className="card card-pad row" style={{ gap: 12 }}>
              <span className="spinner" />
              <span className="muted">{task.stages.find((s) => s.status === 'running')?.label ?? 'Working'}…</span>
            </div>
          )}

          {task.plan && (
            <>
              <PlanHeader plan={task.plan} />
              <Findings plan={task.plan} memoryLabels={labels} />
              <Steps plan={task.plan} locked={Boolean(task.outcome)} onChange={updateStep} />
              <Risks plan={task.plan} />
              <Checklist plan={task.plan} />
              <Lessons plan={task.plan} />
              <Sources plan={task.plan} />
              <OutcomeForm task={task} onSaved={setTask} omiAvailable={Boolean(health?.omi.configured && health.omi.reachable)} />
            </>
          )}

          {task.rawResponse && (
            <div className="card card-pad">
              <SectionTitle
                icon={Code2}
                title="Raw agent response"
                sub="Exactly what the Lyzr agent returned"
                right={
                  <button className="btn btn-sm" onClick={() => setShowRaw((v) => !v)}>
                    {showRaw ? 'Hide' : 'Show'}
                  </button>
                }
              />
              {showRaw && <pre className="raw mono">{task.rawResponse}</pre>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
