import type { Speaker } from '@prisma/client';

/**
 * Self-managed inference behind two interfaces (tech spec §2, §8, decision
 * 010). Adapters run inside the worker or on a private host; customer audio
 * and transcripts never go to an external AI API in a deployed environment
 * (the OpenAI engine is development and evaluation only, decision 014). The analysis step receives
 * transcript segments as untrusted data plus a fixed task schema — no tools,
 * no network.
 */

export type TranscribedSegment = {
  startMs: number;
  endMs: number;
  /** Only AGENT/CUSTOMER when attribution is confident; UNKNOWN otherwise. */
  speaker: Speaker;
  text: string;
};

export type TranscriptionResult = {
  /** False for silence, music or another language: the call fails with no_usable_speech. */
  usableSpeech: boolean;
  segments: TranscribedSegment[];
};

export type JobContext = {
  /** 1-based attempt of the processing job. */
  attempt: number;
  signal: AbortSignal;
};

export interface Transcriber {
  /** Pinned model identifier (name + version + checksum), recorded on each revision. */
  readonly modelVersion: string;
  transcribe(audioPath: string, context: JobContext): Promise<TranscriptionResult>;
}

/** What the analysis model sees: segment references s0…sN with timing and speaker. */
export type AnalysisInput = {
  segments: (TranscribedSegment & { ref: string })[];
  categories: { key: string; label: string }[];
  rubricVersion: string;
};

export interface Analyzer {
  readonly modelVersion: string;
  readonly promptVersion: string;
  /** Returns raw model output; the pipeline validates it against the schema. */
  analyze(input: AnalysisInput, context: JobContext): Promise<unknown>;
}

/** A failure worth retrying later (host busy, timeout, OOM). */
export class TransientInferenceError extends Error {
  constructor(message = 'transient inference failure') {
    super(message);
    this.name = 'TransientInferenceError';
  }
}

export type InferenceEngine = { transcriber: Transcriber; analyzer: Analyzer };
