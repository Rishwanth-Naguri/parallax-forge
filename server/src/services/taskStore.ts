import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { log } from '../lib/errors.js';
import type { Task } from '../types.js';

/** Task runs are operational history (not vector memory), persisted to a local JSON file. */
const FILE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data', 'tasks.json');
const tasks = new Map<string, Task>();

function load() {
  if (!existsSync(FILE)) return;
  try {
    const list = JSON.parse(readFileSync(FILE, 'utf8')) as Task[];
    for (const t of list) {
      // A run interrupted by a server restart cannot resume; record that honestly.
      if (t.status === 'running') {
        const stage = t.stages.find((s) => s.status === 'running');
        if (stage) {
          stage.status = 'failed';
          stage.error = 'Interrupted by server restart';
          t.error = { stage: stage.id, message: 'Interrupted by server restart' };
        }
        t.status = 'failed';
      }
      tasks.set(t.id, t);
    }
  } catch (err) {
    log.error('Could not read task history; starting empty', err);
  }
}

let timer: NodeJS.Timeout | null = null;
function persist() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    try {
      mkdirSync(dirname(FILE), { recursive: true });
      writeFileSync(`${FILE}.tmp`, JSON.stringify([...tasks.values()], null, 2));
      renameSync(`${FILE}.tmp`, FILE);
    } catch (err) {
      log.error('Failed to persist task history', err);
    }
  }, 150);
}

load();

export const taskStore = {
  get: (id: string) => tasks.get(id),
  list: () => [...tasks.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  save(task: Task) {
    task.updatedAt = new Date().toISOString();
    tasks.set(task.id, task);
    persist();
  },
};
