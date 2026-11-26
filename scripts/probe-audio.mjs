/**
 * Size, bitrate and duration of every MP3 in a folder (plan M0-T1, M0-T5).
 * Reads metadata only through ffprobe; prints no filenames unless --names is
 * given, so the output can be shared even for real exports.
 *
 *   node scripts/probe-audio.mjs <folder> [--names] [--budget-bytes 800000000] [--calls-per-day 50]
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    names: { type: 'boolean' },
    'budget-bytes': { type: 'string', default: '800000000' },
    'calls-per-day': { type: 'string', default: '50' },
  },
});
const folder = positionals[0];
if (!folder) {
  console.error('Usage: node scripts/probe-audio.mjs <folder> [--names]');
  process.exit(1);
}
const FFPROBE = process.env.FFPROBE_PATH ?? 'ffprobe';

function probe(file) {
  try {
    const out = execFileSync(
      FFPROBE,
      ['-v', 'error', '-show_entries', 'format=format_name,duration,bit_rate', '-of', 'json', file],
      { encoding: 'utf8', timeout: 15_000 },
    );
    const format = JSON.parse(out).format ?? {};
    return {
      format: format.format_name,
      seconds: Number(format.duration),
      bitRate: Number(format.bit_rate),
    };
  } catch {
    return null;
  }
}

const rows = [];
for (const entry of readdirSync(folder)) {
  if (!entry.toLowerCase().endsWith('.mp3')) continue;
  const file = path.join(folder, entry);
  const bytes = statSync(file).size;
  const meta = probe(file);
  rows.push({
    entry,
    bytes,
    ...meta,
    valid: Boolean(meta && meta.format?.includes('mp3') && meta.seconds > 0),
  });
}

const pct = (list, p) => {
  if (list.length === 0) return NaN;
  const sorted = [...list].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
};
const valid = rows.filter((row) => row.valid);
const sizes = valid.map((row) => row.bytes);
const kbps = valid.map((row) => row.bitRate / 1000);
const minutes = valid.map((row) => row.seconds / 60);
const mean = (list) => list.reduce((a, b) => a + b, 0) / (list.length || 1);

if (values.names) {
  for (const row of rows) {
    console.log(
      `${row.valid ? 'ok ' : 'BAD'} ${row.bytes.toString().padStart(10)} B  ${(row.bitRate / 1000 || 0).toFixed(0).padStart(4)} kbps  ${(row.seconds || 0).toFixed(1).padStart(7)} s  ${row.entry}`,
    );
  }
}
console.log(
  `files: ${rows.length}  valid MP3: ${valid.length}  invalid: ${rows.length - valid.length}`,
);
console.log(
  `bytes   mean ${mean(sizes).toFixed(0)}  p50 ${pct(sizes, 50)}  p95 ${pct(sizes, 95)}  max ${Math.max(...sizes)}`,
);
console.log(
  `kbps    mean ${mean(kbps).toFixed(1)}  p50 ${pct(kbps, 50)?.toFixed(1)}  p95 ${pct(kbps, 95)?.toFixed(1)}`,
);
console.log(
  `minutes mean ${mean(minutes).toFixed(2)}  p50 ${pct(minutes, 50)?.toFixed(2)}  p95 ${pct(minutes, 95)?.toFixed(2)}`,
);

// Retention days that fit the budget (plan M0-T5): headroom = two concurrent 10 MiB uploads + 5 %.
const budget = Number(values['budget-bytes']);
const perDay = Number(values['calls-per-day']);
const headroom = 2 * 10 * 1024 * 1024 + 0.05 * budget;
const days = Math.floor((budget - headroom) / (perDay * mean(sizes)));
console.log(
  `retention days within ${budget} B at ${perDay} calls/day: ${Number.isFinite(days) ? days : 'n/a'}`,
);
