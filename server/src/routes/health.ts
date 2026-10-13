import { Router } from 'express';
import { config } from '../config.js';
import { embeddingStatus } from '../services/embeddings.js';
import { lyzrStatus } from '../services/lyzr.js';
import { omiHealth } from '../services/omi.js';
import { qdrantHealth } from '../services/qdrant.js';

export const healthRouter = Router();

healthRouter.get('/', async (_req, res) => {
  const [qdrant, embedding, omi] = await Promise.all([qdrantHealth(), embeddingStatus(), omiHealth()]);
  const lyzr = lyzrStatus();
  const ok = qdrant.collectionReady && embedding.ok && lyzr.configured;
  res.status(ok ? 200 : 503).json({
    status: ok ? 'ok' : 'degraded',
    backend: { ok: true, uptimeSec: Math.round(process.uptime()) },
    lyzr,
    qdrant,
    embedding: { ...embedding, distance: config.embedding.distance },
    omi,
  });
});

healthRouter.get('/qdrant', async (_req, res) => {
  const qdrant = await qdrantHealth();
  res.status(qdrant.collectionReady ? 200 : 503).json(qdrant);
});
