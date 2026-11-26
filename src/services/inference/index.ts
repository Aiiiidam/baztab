import { env } from '@/lib/env';
import { createFakeEngine } from './fake';
import { createOpenAiEngine } from './openai';
import type { InferenceEngine } from './types';

/**
 * The configured engine. `fake` is deterministic (development, tests,
 * synthetic staging); `openai` is for development and evaluation only and is
 * refused in production (decision 014). The self-managed production adapter
 * (plan M3-T8) implements the same Transcriber/Analyzer interfaces.
 */
export function createEngine(): InferenceEngine {
  switch (env.INFERENCE_ENGINE) {
    case 'fake':
      return createFakeEngine();
    case 'openai':
      return createOpenAiEngine();
  }
}

export type { InferenceEngine } from './types';
