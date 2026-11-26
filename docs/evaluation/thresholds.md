# Model screening thresholds — PROPOSED

**Status:** proposed by the implementation plan (M0-T2, assumption A14); **not approved.** They become
binding only when the product owner and the support lead approve them (open decision D8), and must be
approved and dated **before any model is run on the real sample recordings** (M0-T6). After approval,
changes need a recorded decision. Machine-readable copy: `scripts/eval/thresholds.json`.

| Measure (tech spec §8)                                      | Proposed threshold                           |
| ----------------------------------------------------------- | -------------------------------------------- |
| Evidence validity of published findings                     | 100 % (enforced by the validator)            |
| Issue detection recall, by distinct category                | ≥ 80 %                                       |
| Issue detection precision, by distinct category             | ≥ 80 %                                       |
| Outcome agreement on matched issues                         | ≥ 75 %                                       |
| Score criteria, exact agreement                             | ≥ 70 %                                       |
| Score criteria, within one point                            | ≥ 90 %                                       |
| Word error rate (agreed Persian normalization), median call | ≤ 30 % (screening signal, reported per call) |
| Mean wall time per 3-minute call, concurrency one           | ≤ 6 min                                      |
| Slowest call, normalized to 3 minutes                       | ≤ 10 min                                     |

Notes:

- The spec's ≈ 7 min mean is the hard ceiling (50 × 7 = 350 min of a 360-minute target); 6 min keeps
  headroom for retries and restarts.
- Passing the 10-sample screen supports model selection only; claiming pilot accuracy needs the separate
  representative set of tech spec §8.
- Agent-dependent criteria without agent-attributed evidence are rated insufficient evidence by the
  validator, so speaker attribution quality shows up in the score agreement.
- Persian normalization for WER: Persian/Arabic digits → Latin, ي/ك → ی/ک, diacritics, tatweel and ZWNJ
  removed, punctuation dropped (`src/lib/eval-metrics.ts`).

## How to run

```
npm run eval -- --labels <labels.json> --audio <folder> --out docs/evaluation/<name>.md --enforce
```

The synthetic run (`docs/evaluation/results-synthetic-fake.md`) proves the harness: the faithful fake
pipeline passes, and `--pipeline perturbed` (deliberately wrong output) fails. Real-model runs need the
selected engine (M3-T8, decision D2) and the written approval to process the recordings (D10).
