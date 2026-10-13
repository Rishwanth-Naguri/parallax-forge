import { pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';
import { config } from '../config.js';
import { ServiceError, errorMessage, log } from '../lib/errors.js';

/**
 * Real sentence embeddings computed locally with transformers.js (ONNX runtime).
 * The same model + mean pooling + L2 normalisation is used for both insertion and search,
 * so cosine similarity in Qdrant is meaningful.
 */
let extractorPromise: Promise<FeatureExtractionPipeline> | null = null;

function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (!extractorPromise) {
    log.info('Loading embedding model', { model: config.embedding.model });
    extractorPromise = (pipeline('feature-extraction', config.embedding.model, { dtype: 'fp32' }) as Promise<FeatureExtractionPipeline>).catch(
      (err) => {
        extractorPromise = null; // allow retry after a failed download
        throw err;
      },
    );
  }
  return extractorPromise;
}

export async function embed(text: string): Promise<number[]> {
  const input = text.trim();
  if (!input) throw new ServiceError('embedding', 'Cannot embed empty text', 400);
  let vector: number[];
  try {
    const extractor = await getExtractor();
    const output = await extractor(input, { pooling: 'mean', normalize: true });
    vector = Array.from(output.data as Float32Array);
  } catch (err) {
    throw new ServiceError('embedding', `Embedding failed: ${errorMessage(err)}`);
  }
  if (vector.length !== config.embedding.dimension) {
    throw new ServiceError(
      'embedding',
      `Embedding dimension mismatch: model produced ${vector.length}, EMBEDDING_DIMENSION is ${config.embedding.dimension}`,
    );
  }
  if (vector.some((v) => !Number.isFinite(v))) {
    throw new ServiceError('embedding', 'Embedding contained non-finite values');
  }
  return vector;
}

/** Text that represents an experience in vector space; used identically for tasks and stored experiences. */
export function experienceText(problem: string, domain?: string, extra?: string): string {
  return [domain ? `Domain: ${domain}` : '', `Problem: ${problem}`, extra ?? ''].filter(Boolean).join('\n');
}

export async function embeddingStatus(): Promise<{ ok: boolean; model: string; dimension: number; error?: string }> {
  try {
    const v = await embed('health check');
    return { ok: true, model: config.embedding.model, dimension: v.length };
  } catch (err) {
    return { ok: false, model: config.embedding.model, dimension: config.embedding.dimension, error: errorMessage(err) };
  }
}
