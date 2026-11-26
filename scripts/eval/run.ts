/**
 * Evaluation harness (tech spec §8, plan M0-T2 / M3-T9). Runs an inference
 * pipeline over a labeled folder and reports, against scripts/eval/thresholds.json:
 * WER (Persian normalization), issue recall/precision by category, outcome
 * agreement, evidence validity, per-criterion agreement (exact and ±1), wall
 * time per call normalized to a 3-minute call, peak RSS, unknown-speaker share.
 *
 *   npx tsx --conditions=react-server scripts/eval/run.ts \
 *     --labels e2e/fixtures/labeled/labels.json --audio e2e/fixtures/audio \
 *     [--pipeline fake|perturbed] [--out docs/evaluation/results.md] [--enforce]
 *
 * It reuses the worker's engine and validator, so the numbers judge what would
 * be published. Real recordings may only be used on approved infrastructure
 * (open decision D10); this script never sends audio anywhere itself.
 * `perturbed` is a deliberately wrong pipeline that must fail the thresholds.
 */
import 'dotenv/config';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

process.env.PROCESS_ROLE = 'cli';
process.env.LOG_LEVEL = 'warn';

type Label = {
  file: string;
  transcript: string;
  issues: { categoryKey: string; outcome: string }[];
  scores: Record<string, string>;
};

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      labels: { type: 'string', default: 'e2e/fixtures/labeled/labels.json' },
      audio: { type: 'string', default: 'e2e/fixtures/audio' },
      pipeline: { type: 'string', default: 'fake' },
      out: { type: 'string' },
      enforce: { type: 'boolean', default: false },
    },
  });
  const m = await import('@/lib/eval-metrics');
  const { TAXONOMY_V0 } = await import('@/lib/data/taxonomy-v0');
  const { RUBRIC_VERSION, CRITERIA } = await import('@/lib/validations/analysis');
  const { createFakeEngine } = await import('@/services/inference/fake');
  const { validateAnalysis, validateTranscript, InvalidOutputError } =
    await import('@/services/inference/validate');
  const { probeMp3 } = await import('@/services/media.service');

  if (!['fake', 'perturbed'].includes(values.pipeline!)) {
    console.error(
      'Only the fake pipeline exists until a model is chosen (plan M3-T8, decision D2).',
    );
    return 2;
  }
  const engine = createFakeEngine();
  const labels = JSON.parse(readFileSync(values.labels!, 'utf8')) as { calls: Label[] };
  const thresholds = JSON.parse(readFileSync('scripts/eval/thresholds.json', 'utf8'));
  const keys = new Set<string>(TAXONOMY_V0.map((c) => c.key));
  const categories = TAXONOMY_V0.map(({ key, label }) => ({ key, label }));

  const wers: number[] = [];
  const secondsPer3Min: number[] = [];
  let tp = 0,
    predicted = 0,
    expected = 0,
    compared = 0,
    agreed = 0;
  let exact = 0,
    withinOne = 0,
    criteria = 0,
    validOutputs = 0,
    unknownSegments = 0,
    segmentsTotal = 0;
  let peakRss = 0;
  const rows: string[] = [];

  for (const label of labels.calls) {
    const file = path.join(values.audio!, label.file);
    const media = await probeMp3(file, statSync(file).size);
    const started = performance.now();
    const signal = new AbortController().signal;
    const transcript = await engine.transcriber.transcribe(file, { attempt: 2, signal });
    validateTranscript(transcript.segments, media.durationMs);
    let raw = await engine.analyzer.analyze(
      {
        segments: transcript.segments.map((s, i) => ({ ...s, ref: `s${i}` })),
        categories,
        rubricVersion: RUBRIC_VERSION,
      },
      { attempt: 2, signal },
    );
    if (values.pipeline === 'perturbed') raw = perturb(raw);
    const elapsed = (performance.now() - started) / 1000;
    peakRss = Math.max(peakRss, process.memoryUsage().rss);
    secondsPer3Min.push((elapsed * 180_000) / media.durationMs);

    let hypothesis = transcript.segments.map((s) => s.text).join(' ');
    if (values.pipeline === 'perturbed')
      hypothesis = hypothesis
        .split(' ')
        .filter((_, i) => i % 3)
        .join(' ');
    const wer = m.wordErrorRate(label.transcript, hypothesis);
    wers.push(wer);
    segmentsTotal += transcript.segments.length;
    unknownSegments += transcript.segments.filter((s) => s.speaker === 'UNKNOWN').length;

    let predictedIssues: { categoryKey: string; outcome: string }[] = [];
    let predictedScores: Record<string, string> = {};
    try {
      const analysis = validateAnalysis(raw, transcript.segments, keys);
      validOutputs += 1;
      predictedIssues = analysis.findings
        .filter((f) => f.eligible && f.categoryKey)
        .map((f) => ({ categoryKey: f.categoryKey as string, outcome: f.outcome }));
      predictedScores = Object.fromEntries(analysis.scores.map((s) => [s.criterion, s.rating]));
    } catch (error) {
      if (!(error instanceof InvalidOutputError)) throw error;
    }

    const detection = m.issueDetection(label.issues, predictedIssues);
    tp += detection.truePositives;
    predicted += detection.predicted;
    expected += detection.expected;
    const outcomes = m.outcomeAgreement(label.issues, predictedIssues);
    compared += outcomes.compared;
    agreed += outcomes.agreed;
    let callExact = 0;
    for (const criterion of CRITERIA) {
      const result = m.criterionAgreement(
        label.scores[criterion],
        predictedScores[criterion] ?? 'missing',
      );
      criteria += 1;
      if (result.exact) {
        exact += 1;
        callExact += 1;
      }
      if (result.withinOne) withinOne += 1;
    }
    rows.push(
      `| ${label.file} | ${(wer * 100).toFixed(1)}% | ${detection.truePositives}/${detection.expected} | ${outcomes.agreed}/${outcomes.compared} | ${callExact}/3 | ${elapsed.toFixed(2)} s |`,
    );
  }

  const metrics = {
    issueRecall: m.ratio(tp, expected),
    issuePrecision: m.ratio(tp, predicted),
    outcomeAgreement: m.ratio(agreed, compared),
    criterionExact: m.ratio(exact, criteria),
    criterionWithinOne: m.ratio(withinOne, criteria),
    medianWer: m.median(wers),
    evidenceValidity: m.ratio(validOutputs, labels.calls.length),
    meanSecondsPer3MinCall:
      secondsPer3Min.reduce((a, b) => a + b, 0) / (secondsPer3Min.length || 1),
    maxSecondsPer3MinCall: Math.max(...secondsPer3Min),
    unknownSpeakerShare: m.ratio(unknownSegments, segmentsTotal),
    peakRssMiB: Math.round(peakRss / 1024 / 1024),
  };
  const checks: [string, boolean][] = [
    ['issue recall', metrics.issueRecall >= thresholds.issueRecallMin],
    ['issue precision', metrics.issuePrecision >= thresholds.issuePrecisionMin],
    ['outcome agreement', metrics.outcomeAgreement >= thresholds.outcomeAgreementMin],
    ['criterion exact', metrics.criterionExact >= thresholds.criterionExactMin],
    ['criterion within one', metrics.criterionWithinOne >= thresholds.criterionWithinOneMin],
    ['median WER', metrics.medianWer <= thresholds.medianWerMax],
    ['evidence validity', metrics.evidenceValidity >= thresholds.evidenceValidityMin],
    [
      'mean time per 3-min call',
      metrics.meanSecondsPer3MinCall <= thresholds.meanSecondsPer3MinCallMax,
    ],
    [
      'max time per 3-min call',
      metrics.maxSecondsPer3MinCall <= thresholds.maxSecondsPer3MinCallMax,
    ],
  ];
  const passed = checks.every(([, ok]) => ok);

  const report = [
    `# Evaluation run — pipeline \`${values.pipeline}\`, ${labels.calls.length} labeled calls`,
    '',
    `Thresholds: ${thresholds.status}`,
    '',
    '| Call | WER | Issues found | Outcomes agreed | Criteria exact | Wall time |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
    ...rows,
    '',
    '| Metric | Value | Check |',
    '| --- | ---: | --- |',
    ...Object.entries(metrics).map(([name, value]) => {
      const check = checks.find(([c]) => name.toLowerCase().startsWith(c.split(' ')[0]));
      return `| ${name} | ${typeof value === 'number' ? Number(value.toFixed(3)) : value} | ${check ? (check[1] ? 'pass' : 'FAIL') : ''} |`;
    }),
    '',
    `**Result: ${passed ? 'PASS' : 'FAIL'}** (${
      checks
        .filter(([, ok]) => !ok)
        .map(([n]) => n)
        .join(', ') || 'all checks met'
    })`,
    '',
  ].join('\n');
  console.log(report);
  if (values.out) writeFileSync(values.out, report);
  return values.enforce && !passed ? 1 : 0;
}

/** A deliberately wrong pipeline: flips outcomes, drops issues, downgrades scores. */
function perturb(raw: unknown): unknown {
  const output = JSON.parse(JSON.stringify(raw)) as {
    issues?: { outcome: string; categoryKey: string | null }[];
    scores?: Record<string, { rating: string }>;
  };
  output.issues = (output.issues ?? []).slice(1).map((issue) => ({
    ...issue,
    outcome: issue.outcome === 'RESOLVED' ? 'UNRESOLVED' : 'RESOLVED',
    categoryKey: 'app_error',
  }));
  for (const score of Object.values(output.scores ?? {})) {
    if (score.rating === 'MET') score.rating = 'NOT_MET';
  }
  return output;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  },
);
