/**
 * Synthetic audio fixtures (plan M0-T1). Writes small MP3s and invalid files to
 * e2e/fixtures/audio/ for unit, integration and e2e tests. No real recording
 * is ever used here.
 *
 *   node scripts/make-fixtures.mjs            (FFMPEG_PATH overrides `ffmpeg`)
 *
 * The ID3 `comment` tag `baztab-fake:<scenario>` tells the fake inference
 * adapter (src/services/inference/fake.ts) which synthetic call to produce;
 * a file without the tag gets a scenario chosen from its hash. Every MP3 uses a
 * different tone so no two fixtures are exact duplicates.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

const FFMPEG = process.env.FFMPEG_PATH ?? 'ffmpeg';
const OUT = path.resolve('e2e/fixtures/audio');

const MP3S = [
  { name: '20261019_093015_09121234567.mp3', scenario: 'standard', frequency: 440, seconds: 6 },
  { name: 'تماس پشتیبانی بدون تاریخ.mp3', scenario: 'multi', frequency: 494, seconds: 6 },
  { name: '2026101912 long prefix.mp3', scenario: 'standard', frequency: 523, seconds: 4 },
  { name: '20261020-escalated.mp3', scenario: 'escalated', frequency: 587, seconds: 6 },
  { name: '20261021 insufficient.mp3', scenario: 'insufficient', frequency: 622, seconds: 4 },
  { name: 'transient-failure.mp3', scenario: 'transient', frequency: 659, seconds: 4 },
  { name: 'invalid-output.mp3', scenario: 'invalid', frequency: 698, seconds: 4 },
  { name: 'uncategorized.mp3', scenario: 'uncategorized', frequency: 740, seconds: 4 },
  { name: 'silence.mp3', scenario: 'silent', silent: true, seconds: 4 },
];

function ffmpeg(args) {
  execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

for (const file of MP3S) {
  const source = file.silent
    ? `anullsrc=r=16000:cl=mono:d=${file.seconds}`
    : `sine=frequency=${file.frequency}:sample_rate=16000:duration=${file.seconds}`;
  ffmpeg([
    '-f',
    'lavfi',
    '-i',
    source,
    '-ac',
    '1',
    '-ar',
    '16000',
    '-c:a',
    'libmp3lame',
    '-b:a',
    '24k',
    '-metadata',
    `comment=baztab-fake:${file.scenario}`,
    path.join(OUT, file.name),
  ]);
}

// A valid WAV renamed to .mp3: the extension passes, the media check must not.
ffmpeg([
  '-f',
  'lavfi',
  '-i',
  'sine=frequency=880:duration=1',
  '-f',
  'wav',
  path.join(OUT, 'wav-renamed.mp3'),
]);
// Random bytes with an .mp3 name, an empty file, and a non-MP3 extension.
writeFileSync(path.join(OUT, 'corrupt.mp3'), randomBytes(4096));
writeFileSync(path.join(OUT, 'empty.mp3'), Buffer.alloc(0));
writeFileSync(path.join(OUT, 'notes.txt'), 'not audio\n');

console.log(`Fixtures written to ${path.relative(process.cwd(), OUT)}`);
