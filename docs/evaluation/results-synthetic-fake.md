# Evaluation run — pipeline `fake`, 5 labeled calls

Thresholds: PROPOSED — not approved. Binding only after the product owner and support lead approve them (open decision D8); see docs/evaluation/thresholds.md.

| Call                            |  WER | Issues found | Outcomes agreed | Criteria exact | Wall time |
| ------------------------------- | ---: | -----------: | --------------: | -------------: | --------: |
| 20261019_093015_09121234567.mp3 | 0.0% |          1/1 |             1/1 |            3/3 |    0.16 s |
| 20261020-escalated.mp3          | 0.0% |          1/1 |             1/1 |            3/3 |    0.18 s |
| تماس پشتیبانی بدون تاریخ.mp3    | 0.0% |          2/2 |             2/2 |            3/3 |    0.17 s |
| 20261021 insufficient.mp3       | 0.0% |          0/0 |             0/0 |            3/3 |    0.18 s |
| uncategorized.mp3               | 0.0% |          0/0 |             0/0 |            3/3 |    0.26 s |

| Metric                 |  Value | Check |
| ---------------------- | -----: | ----- |
| issueRecall            |      1 | pass  |
| issuePrecision         |      1 | pass  |
| outcomeAgreement       |      1 | pass  |
| criterionExact         |      1 | pass  |
| criterionWithinOne     |      1 | pass  |
| medianWer              |      0 | pass  |
| evidenceValidity       |      1 | pass  |
| meanSecondsPer3MinCall |   6.93 | pass  |
| maxSecondsPer3MinCall  | 11.438 | pass  |
| unknownSpeakerShare    |  0.111 |       |
| peakRssMiB             |     85 |       |

**Result: PASS** (all checks met)
