import { env } from '@/lib/env';
import { createFakeEngine } from './fake';
import type { InferenceEngine } from './types';

/**
 * The configured self-managed engine. Only the deterministic fake exists until
 * the model and host are chosen (plan M3-T8, blocked by D1/D2/D10); a real
 * adapter implements the same Transcriber/Analyzer interfaces.
 */
export function createEngine(): InferenceEngine {
  switch (env.INFERENCE_ENGINE) {
    case 'fake':
      return createFakeEngine();
  }
}

export type { InferenceEngine } from './types';
