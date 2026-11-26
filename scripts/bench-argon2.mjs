/**
 * Argon2id cost benchmark (tech spec §4.4, plan M1-T4). Measures the sign-in
 * hash at the parameters in src/services/auth.service.ts, alone and under a
 * burst of concurrent sign-ins, so the cost can be checked on the target host.
 *
 *   node scripts/bench-argon2.mjs [concurrency=10] [rounds=5]
 */
import { availableParallelism } from 'node:os';
import { hash, verify } from '@node-rs/argon2';

const OPTIONS = { algorithm: 2, memoryCost: 19_456, timeCost: 2, parallelism: 1 };
const concurrency = Number(process.argv[2] ?? 10);
const rounds = Number(process.argv[3] ?? 5);

const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
};

const stored = await hash('Benchmark-Password-1', OPTIONS);

const single = [];
for (let i = 0; i < 20; i++) {
  const start = performance.now();
  await verify(stored, 'Benchmark-Password-1');
  single.push(performance.now() - start);
}

const burst = [];
for (let round = 0; round < rounds; round++) {
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      const start = performance.now();
      await verify(stored, 'Benchmark-Password-1');
      burst.push(performance.now() - start);
    }),
  );
}

const fmt = (ms) => `${ms.toFixed(1)} ms`;
console.log(`Argon2id m=${OPTIONS.memoryCost} KiB t=${OPTIONS.timeCost} p=${OPTIONS.parallelism}`);
console.log(`CPU threads: ${availableParallelism()}`);
console.log(
  `single verify   p50 ${fmt(percentile(single, 50))}  p95 ${fmt(percentile(single, 95))}`,
);
console.log(
  `${concurrency} concurrent   p50 ${fmt(percentile(burst, 50))}  p95 ${fmt(percentile(burst, 95))}  max ${fmt(Math.max(...burst))}`,
);
console.log(
  `peak memory for ${concurrency} concurrent hashes ≈ ${((OPTIONS.memoryCost * concurrency) / 1024).toFixed(0)} MiB`,
);
