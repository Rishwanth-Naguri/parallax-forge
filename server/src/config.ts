import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8787),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),

  LYZR_API_URL: z.string().url().default('https://agent-prod.studio.lyzr.ai/v3/inference/chat/'),
  LYZR_API_KEY: z.string().optional(),
  LYZR_AGENT_ID: z.string().optional(),
  LYZR_USER_ID: z.string().optional(),
  LYZR_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),

  QDRANT_URL: z.string().url().default('http://localhost:6333'),
  QDRANT_API_KEY: z.string().optional(),
  QDRANT_COLLECTION: z.string().default('parallax_experiences'),
  QDRANT_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),

  EMBEDDING_MODEL: z.string().default('Xenova/all-MiniLM-L6-v2'),
  EMBEDDING_DIMENSION: z.coerce.number().int().positive().default(384),
  MEMORY_TOP_K: z.coerce.number().int().positive().max(50).default(6),
  MEMORY_MIN_SCORE: z.coerce.number().min(0).max(1).default(0.35),

  OMI_MCP_URL: z.string().url().default('https://api.omi.me/v1/mcp'),
  OMI_API_KEY: z.string().optional(),
  OMI_TIMEOUT_MS: z.coerce.number().int().positive().default(20_000),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('[config] Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const env = parsed.data;
const blank = (v?: string) => (v && v.trim() ? v.trim() : undefined);

export const config = {
  port: env.PORT,
  clientOrigin: env.CLIENT_ORIGIN,
  lyzr: {
    url: env.LYZR_API_URL,
    apiKey: blank(env.LYZR_API_KEY),
    agentId: blank(env.LYZR_AGENT_ID),
    userId: blank(env.LYZR_USER_ID) ?? 'parallax-forge',
    timeoutMs: env.LYZR_TIMEOUT_MS,
  },
  qdrant: {
    url: env.QDRANT_URL,
    apiKey: blank(env.QDRANT_API_KEY),
    collection: env.QDRANT_COLLECTION,
    timeoutMs: env.QDRANT_TIMEOUT_MS,
  },
  embedding: {
    model: env.EMBEDDING_MODEL,
    dimension: env.EMBEDDING_DIMENSION,
    distance: 'Cosine' as const,
  },
  memory: {
    topK: env.MEMORY_TOP_K,
    minScore: env.MEMORY_MIN_SCORE,
  },
  omi: {
    url: env.OMI_MCP_URL,
    apiKey: blank(env.OMI_API_KEY),
    timeoutMs: env.OMI_TIMEOUT_MS,
  },
};

export const lyzrConfigured = () => Boolean(config.lyzr.apiKey && config.lyzr.agentId);
export const omiConfigured = () => Boolean(config.omi.apiKey);
