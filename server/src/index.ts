import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { config, lyzrConfigured, omiConfigured } from './config.js';
import { ServiceError, errorMessage, log } from './lib/errors.js';
import { healthRouter } from './routes/health.js';
import { memoriesRouter } from './routes/memories.js';
import { tasksRouter } from './routes/tasks.js';
import { ValidationError } from './routes/validate.js';
import { embed } from './services/embeddings.js';
import { ensureCollection } from './services/qdrant.js';

const app = express();
app.disable('x-powered-by');
const allowedOrigins = config.clientOrigin
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes('*')) {
        return callback(null, true);
      }
      const normalized = origin.replace(/\/+$/, '');
      const isAllowed = allowedOrigins.some((ao) => ao.replace(/\/+$/, '') === normalized);
      if (isAllowed) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: '100kb' }));

app.use('/api/health', healthRouter);
app.use('/health', healthRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/memories', memoriesRouter);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ValidationError) {
    res.status(400).json({ error: 'Validation failed', issues: err.issues });
    return;
  }
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({ error: 'Malformed JSON body' });
    return;
  }
  const status = (err as { httpStatus?: number }).httpStatus ?? 500;
  const service = err instanceof ServiceError ? err.service : undefined;
  if (status >= 500) log.error(`${req.method} ${req.path} failed`, err);
  res.status(status).json({ error: status === 500 ? 'Internal server error' : errorMessage(err), service });
});

const port = Number(process.env.PORT) || config.port;
const host = '0.0.0.0';

app.listen(port, host, () => {
  log.info(`PARALLAX FORGE API listening on http://${host}:${port}`, {
    lyzr: lyzrConfigured(),
    omi: omiConfigured(),
    qdrant: new URL(config.qdrant.url).host,
    collection: config.qdrant.collection,
  });
  // Warm up: verify collection and load the embedding model so the first task is fast.
  ensureCollection().then(
    () => log.info('Qdrant collection ready'),
    (err) => log.error('Qdrant not ready (will retry on demand)', err),
  );
  embed('warm up').then(
    () => log.info('Embedding model ready'),
    (err) => log.error('Embedding model failed to load', err),
  );
});
