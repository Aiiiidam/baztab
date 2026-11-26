# 014 — An OpenAI engine for development and evaluation only

**Decision.** `INFERENCE_ENGINE=openai` adds a third engine beside `fake` and the future self-managed
one. It transcribes with a diarizing OpenAI model (`OPENAI_TRANSCRIBE_MODEL`, default
`gpt-4o-transcribe-diarize`), maps the anonymous speaker labels to agent and customer with one
structured call (UNKNOWN when unclear), and analyses with structured outputs against the v1 schema
(`OPENAI_ANALYSIS_MODEL`, default `gpt-5.5`). Its output passes through the same validator as any
engine. `env-schema.ts` refuses it whenever `NODE_ENV=production`, with no override.
`scripts/eval/review-samples.ts` runs unlabeled samples through it and writes a review report outside
the repository.

**Why.** The project owner chose, on 2026-11-26, to measure transcription and analysis quality on the
10 supplied samples with their existing OpenAI account before choosing the production host (D2). The
tech spec rule (§2: customer audio and transcripts never go to an external AI API) stays in force for
every deployed environment; this engine exists so that quality, prompts and the rubric can be judged
now. The owner's choice is recorded as the D10 approval to process those 10 samples with OpenAI from
the development machine, and for nothing else.

**Consequences.**

- The engine cannot reach staging or production: the web and worker images run with
  `NODE_ENV=production`, so validation fails at boot.
- `gpt-4o-transcribe-diarize` is deprecated by OpenAI (shutdown 2027-02-26) but is the only file
  model that returns speaker turns with timestamps, which evidence links need. It is a setting, so a
  successor can replace it.
- Network errors, rate limits, exhausted credit and server errors are transient (retried within the
  attempt budget); a refused, truncated or non-JSON response is invalid output.
- Real Persian quality numbers come from human review of the report until the samples are labeled
  (D1); `scripts/eval/run.ts` scores labeled sets.
- Plan task M3-T8 (the self-managed production engine) remains open.
