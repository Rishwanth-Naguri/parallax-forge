import { BrainCircuit, History, LayoutDashboard, Triangle } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import type { Health } from '../lib/api';
import type { Async } from '../lib/hooks';

function Svc({ label, state, hint }: { label: string; state: 'ok' | 'bad' | 'off'; hint?: string }) {
  return (
    <div className="svc" title={hint}>
      <span className={`dot ${state}`} />
      {label}
    </div>
  );
}

export function Sidebar({ health }: { health: Async<Health> }) {
  const h = health.data;
  const backendDown = Boolean(health.error) && !h;
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">
          <Triangle size={17} strokeWidth={2.6} />
        </div>
        <div>
          <div className="brand-name">PARALLAX FORGE</div>
          <div className="brand-sub">Experience-driven operations</div>
        </div>
      </div>

      <nav className="nav">
        <NavLink to="/" end>
          <LayoutDashboard size={17} /> <span>Command Center</span>
        </NavLink>
        <NavLink to="/memory">
          <BrainCircuit size={17} /> <span>Experience Memory</span>
        </NavLink>
        <NavLink to="/history">
          <History size={17} /> <span>Task History</span>
        </NavLink>
      </nav>

      <div className="sidebar-foot">
        <div className="svc-title">System status</div>
        {backendDown ? (
          <Svc label="Backend unreachable" state="bad" hint={health.error} />
        ) : !h ? (
          <Svc label="Checking…" state="off" />
        ) : (
          <>
            <Svc label="Lyzr agent" state={h.lyzr.configured ? 'ok' : 'bad'} hint={h.lyzr.configured ? h.lyzr.endpoint : 'Not configured'} />
            <Svc
              label={`Qdrant${h.qdrant.collectionReady ? ` · ${h.qdrant.points ?? 0} pts` : ''}`}
              state={h.qdrant.collectionReady ? 'ok' : 'bad'}
              hint={h.qdrant.error ?? h.qdrant.collection}
            />
            <Svc label="Embeddings" state={h.embedding.ok ? 'ok' : 'bad'} hint={h.embedding.error ?? `${h.embedding.model} · ${h.embedding.dimension}d`} />
            <Svc
              label="Omi context"
              state={!h.omi.configured ? 'off' : h.omi.reachable ? 'ok' : 'bad'}
              hint={!h.omi.configured ? 'Not configured (optional)' : h.omi.error}
            />
          </>
        )}
      </div>
    </aside>
  );
}
