import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type Health } from './api';
import type { Task } from './types';

export interface Async<T> {
  data?: T;
  error?: string;
  loading: boolean;
  reload: () => void;
}

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []): Async<T> {
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true });
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    fn().then(
      (data) => alive && setState({ data, loading: false }),
      (err: Error) => alive && setState((s) => ({ data: s.data, error: err.message, loading: false })),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);
  return { ...state, reload: useCallback(() => setNonce((n) => n + 1), []) };
}

export function useHealth(): Async<Health> {
  const h = useAsync(api.health);
  useEffect(() => {
    const t = setInterval(h.reload, 30_000);
    return () => clearInterval(t);
  }, [h.reload]);
  return h;
}

/** Follows a task's real backend progress, polling only while it is running. */
export function useTask(id: string) {
  const [task, setTask] = useState<Task>();
  const [error, setError] = useState<string>();
  const timer = useRef<number>(undefined);

  const load = useCallback(async () => {
    try {
      const t = await api.getTask(id);
      setTask(t);
      setError(undefined);
      return t;
    } catch (err) {
      setError((err as Error).message);
      return undefined;
    }
  }, [id]);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const t = await load();
      if (alive && (!t || t.status === 'running')) timer.current = window.setTimeout(tick, 800);
    };
    void tick();
    return () => {
      alive = false;
      window.clearTimeout(timer.current);
    };
  }, [load]);

  const follow = useCallback(
    (t: Task) => {
      setTask(t);
      if (t.status === 'running') {
        const tick = async () => {
          const next = await load();
          if (next?.status === 'running') timer.current = window.setTimeout(tick, 800);
        };
        timer.current = window.setTimeout(tick, 800);
      }
    },
    [load],
  );

  return { task, error, setTask: follow };
}
