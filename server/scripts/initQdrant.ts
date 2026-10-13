/** Creates (or verifies) the Qdrant collection with the vector config the embedding model needs. */
import { config } from '../src/config.js';
import { ensureCollection, qdrantHealth } from '../src/services/qdrant.js';

try {
  await ensureCollection();
  const h = await qdrantHealth();
  console.log(`Collection "${config.qdrant.collection}" ready at ${h.url}`);
  if ('vectorSize' in h) console.log(`  vectors: size=${h.vectorSize}, distance=${h.distance}, points=${h.points}`);
} catch (err) {
  console.error('Qdrant initialisation failed:', err instanceof Error ? err.message : err);
  process.exit(1);
}
