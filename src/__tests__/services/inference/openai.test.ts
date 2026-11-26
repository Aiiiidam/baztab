import { describe, expect, it, vi } from 'vitest';
import { analysisOutputSchema } from '@/lib/validations/analysis';
import {
  analysisJsonSchema,
  OpenAiClient,
  parseResponseJson,
  toSegments,
} from '@/services/inference/openai';
import { TransientInferenceError } from '@/services/inference/types';
import { InvalidOutputError } from '@/services/inference/validate';

const signal = new AbortController().signal;

function client(response: Response) {
  const fetchImpl = vi.fn(async () => response);
  return {
    fetchImpl,
    client: new OpenAiClient(
      { apiKey: 'sk-test', baseUrl: 'https://api.example/v1', timeoutMs: 1000 },
      fetchImpl as unknown as typeof fetch,
    ),
  };
}

function responseWith(text: string, status = 'completed') {
  return { status, output: [{ type: 'message', content: [{ type: 'output_text', text }] }] };
}

describe('OpenAiClient', () => {
  it('treats exhausted credit and rate limits as transient, naming the code', async () => {
    const { client: c } = client(
      Response.json({ error: { code: 'credit_balance_exhausted' } }, { status: 429 }),
    );
    const error = await c.request('/responses', '{}', signal).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TransientInferenceError);
    expect((error as Error).message).toBe('OpenAI responded 429 (credit_balance_exhausted)');
  });

  it('fails a bad request without retrying it as transient', async () => {
    const { client: c } = client(Response.json({ error: { code: 'bad' } }, { status: 400 }));
    const error = await c.request('/responses', '{}', signal).catch((e: unknown) => e);
    expect(error).not.toBeInstanceOf(TransientInferenceError);
  });

  it('turns a network failure into a transient error', async () => {
    const c = new OpenAiClient(
      { apiKey: 'k', baseUrl: 'https://api.example/v1', timeoutMs: 1000 },
      (async () => {
        throw new TypeError('fetch failed');
      }) as unknown as typeof fetch,
    );
    await expect(c.request('/x', '{}', signal)).rejects.toBeInstanceOf(TransientInferenceError);
  });

  it('sends a strict JSON schema and parses the structured result', async () => {
    const { client: c, fetchImpl } = client(Response.json(responseWith('{"roles":[]}')));
    const result = await c.structured(
      { model: 'm', instructions: 'i', input: 'x', name: 'n', schema: { type: 'object' } },
      signal,
    );
    expect(result).toEqual({ roles: [] });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.example/v1/responses');
    expect(JSON.parse(init.body as string)).toMatchObject({
      model: 'm',
      store: false,
      text: { format: { type: 'json_schema', strict: true } },
    });
  });
});

describe('parseResponseJson', () => {
  it('rejects refusals, truncation and non-JSON as invalid output', () => {
    expect(() =>
      parseResponseJson({ output: [{ type: 'message', content: [{ type: 'refusal' }] }] }),
    ).toThrow(InvalidOutputError);
    expect(() => parseResponseJson(responseWith('{}', 'incomplete'))).toThrow(InvalidOutputError);
    expect(() => parseResponseJson(responseWith('not json'))).toThrow(InvalidOutputError);
    expect(() => parseResponseJson({ output: [] })).toThrow(InvalidOutputError);
  });
});

describe('toSegments', () => {
  it('orders segments, converts to milliseconds and leaves unmapped speakers UNKNOWN', () => {
    const roles = new Map([['A', 'AGENT' as const]]);
    expect(
      toSegments(
        [
          { speaker: 'B', start: 4.2, end: 6, text: ' سلام ' },
          { speaker: 'A', start: 0, end: 0, text: 'پشتیبانی' },
          { speaker: 'A', start: 7, end: 8, text: '   ' },
        ],
        roles,
      ),
    ).toEqual([
      { startMs: 0, endMs: 1, speaker: 'AGENT', text: 'پشتیبانی' },
      { startMs: 4200, endMs: 6000, speaker: 'UNKNOWN', text: 'سلام' },
    ]);
  });
});

describe('analysisJsonSchema', () => {
  it('requires every field the v1 output schema accepts', () => {
    const schema = analysisJsonSchema(['otp_not_received']);
    expect(schema.required).toEqual(['schemaVersion', 'reason', 'issues', 'scores']);
    expect(schema.properties.issues.items.properties.categoryKey.enum).toEqual([
      'otp_not_received',
      null,
    ]);
    // A document shaped by the JSON schema is accepted by the zod contract.
    const score = { rating: 'MET', explanation: 'x', evidence: ['s0'] };
    expect(
      analysisOutputSchema.safeParse({
        schemaVersion: '1',
        reason: { text: 'x', evidence: ['s0'] },
        issues: [
          {
            summary: 'x',
            categoryKey: null,
            outcome: 'UNKNOWN',
            outcomeExplanation: null,
            evidence: [],
            outcomeEvidence: [],
          },
        ],
        scores: { UNDERSTANDING: score, CORRECT_ACTION: score, CLEAR_CLOSURE: score },
      }).success,
    ).toBe(true);
  });
});
