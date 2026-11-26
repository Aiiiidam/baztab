/**
 * Run unlabeled sample recordings through the OpenAI evaluation engine
 * (decision 014) and write a human-review report: per call the transcript with
 * speaker roles and timestamps, the validated findings and scores, and timing.
 * The support lead judges the output; once labels exist, `run.ts` scores it.
 *
 *   npx tsx --env-file=.env --conditions=react-server scripts/eval/review-samples.ts \
 *     --audio D:/Bouzhan/baztab-samples [--out D:/Bouzhan/baztab-samples/review]
 *
 * This sends the audio and transcripts to OpenAI: run it only on recordings
 * approved for that (D10). The report holds customer content, so it refuses to
 * write inside the repository.
 */
import { mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

process.env.PROCESS_ROLE = 'cli';
process.env.LOG_LEVEL = 'warn';

const REPO = path.resolve(import.meta.dirname, '..', '..');

function clock(ms: number) {
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: { audio: { type: 'string' }, out: { type: 'string' } },
  });
  if (!values.audio) {
    console.error('--audio <folder of MP3 files> is required');
    return 2;
  }
  const audioDir = path.resolve(values.audio);
  const outDir = path.resolve(values.out ?? path.join(audioDir, 'review'));
  if (!path.relative(REPO, outDir).startsWith('..')) {
    console.error(
      'Refusing to write customer content inside the repository; choose --out elsewhere.',
    );
    return 2;
  }
  mkdirSync(outDir, { recursive: true });

  const { TAXONOMY_V0 } = await import('@/lib/data/taxonomy-v0');
  const { RUBRIC_VERSION, scoreTotal } = await import('@/lib/validations/analysis');
  const { createOpenAiEngine } = await import('@/services/inference/openai');
  const { validateAnalysis, validateTranscript } = await import('@/services/inference/validate');
  const { probeMp3 } = await import('@/services/media.service');

  const engine = createOpenAiEngine();
  const keys = new Set<string>(TAXONOMY_V0.map((c) => c.key));
  const labelOf = new Map<string, string>(TAXONOMY_V0.map((c) => [c.key, c.label]));
  const categories = TAXONOMY_V0.map(({ key, label }) => ({ key, label }));
  const files = readdirSync(audioDir).filter((f) => f.toLowerCase().endsWith('.mp3'));

  const sections: string[] = [];
  const rows: string[] = [];
  const raw: Record<string, unknown> = {};
  let valid = 0,
    segmentsTotal = 0,
    unknownSegments = 0,
    eligibleIssues = 0;
  const perThreeMinutes: number[] = [];

  for (const [index, file] of files.entries()) {
    const name = `call-${String(index + 1).padStart(2, '0')}`;
    process.stderr.write(`${name} … `);
    const filePath = path.join(audioDir, file);
    const signal = new AbortController().signal;
    const started = performance.now();
    try {
      const media = await probeMp3(filePath, statSync(filePath).size);
      const transcript = await engine.transcriber.transcribe(filePath, { attempt: 1, signal });
      if (!transcript.usableSpeech) throw new Error('no usable Persian speech');
      validateTranscript(transcript.segments, media.durationMs);
      const output = await engine.analyzer.analyze(
        {
          segments: transcript.segments.map((s, i) => ({ ...s, ref: `s${i}` })),
          categories,
          rubricVersion: RUBRIC_VERSION,
        },
        { attempt: 1, signal },
      );
      raw[name] = { file, transcript: transcript.segments, output };
      const analysis = validateAnalysis(output, transcript.segments, keys);
      const seconds = (performance.now() - started) / 1000;
      perThreeMinutes.push((seconds * 180_000) / media.durationMs);
      valid += 1;
      segmentsTotal += transcript.segments.length;
      unknownSegments += transcript.segments.filter((s) => s.speaker === 'UNKNOWN').length;
      eligibleIssues += analysis.findings.filter((f) => f.eligible).length;
      const total = scoreTotal(analysis.scores.map((s) => s.rating));
      const refList = (list: number[]) => list.map((i) => `s${i}`).join(', ') || '—';

      rows.push(
        `| ${name} | ${clock(media.durationMs)} | ${analysis.findings.length} | ${total ?? 'ناقص'} | ${seconds.toFixed(1)} s |`,
      );
      sections.push(
        [
          `## ${name} — ${file}`,
          '',
          `Duration ${clock(media.durationMs)} · processed in ${seconds.toFixed(1)} s`,
          '',
          '### Transcript',
          '',
          ...transcript.segments.map(
            (s, i) => `- \`s${i}\` [${clock(s.startMs)}] **${s.speaker}**: ${s.text}`,
          ),
          '',
          `### Reason: ${analysis.reason.text} (${refList(analysis.reason.evidence)})`,
          '',
          '### Issues',
          '',
          ...(analysis.findings.length
            ? analysis.findings.map(
                (f) =>
                  `- ${f.summary} — **${f.categoryKey ? labelOf.get(f.categoryKey) : 'بدون دسته'}**, ${f.outcome}` +
                  `${f.outcomeExplanation ? `: ${f.outcomeExplanation}` : ''} (evidence ${refList(f.evidence)}; outcome ${refList(f.outcomeEvidence)})` +
                  `${f.eligible ? '' : ' — not counted in the report'}`,
              )
            : ['- none']),
          '',
          `### Scores (total ${total ?? 'ناقص'} / 6)`,
          '',
          ...analysis.scores.map(
            (s) =>
              `- ${s.criterion}: **${s.rating}**${s.explanation ? ` — ${s.explanation}` : ''} (${refList(s.evidence)})`,
          ),
          '',
          '### Reviewer notes',
          '',
          '- Transcript accurate? Speakers right? Issues, outcomes and scores right?',
          '',
        ].join('\n'),
      );
      process.stderr.write(`ok (${seconds.toFixed(1)} s)\n`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      rows.push(`| ${name} | — | — | — | failed: ${message.slice(0, 80)} |`);
      sections.push(`## ${name} — ${file}\n\nFailed: ${message}\n`);
      process.stderr.write(`failed: ${message}\n`);
    }
  }

  const mean = perThreeMinutes.reduce((a, b) => a + b, 0) / (perThreeMinutes.length || 1);
  const report = [
    `# Sample review — OpenAI evaluation engine`,
    '',
    `Models: ${engine.transcriber.modelVersion} · analysis ${engine.analyzer.modelVersion} (${engine.analyzer.promptVersion}) · ${RUBRIC_VERSION}`,
    '',
    `Valid outputs ${valid}/${files.length} · eligible issues ${eligibleIssues} · unknown-speaker segments ${unknownSegments}/${segmentsTotal} · mean ${mean.toFixed(1)} s per 3-minute call`,
    '',
    '| Call | Duration | Issues | Score | Time |',
    '| --- | ---: | ---: | ---: | ---: |',
    ...rows,
    '',
    ...sections,
  ].join('\n');
  writeFileSync(path.join(outDir, 'review.md'), report);
  writeFileSync(path.join(outDir, 'raw.json'), JSON.stringify(raw, null, 2));
  console.log(`Wrote ${path.join(outDir, 'review.md')} (${valid}/${files.length} valid)`);
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  },
);
