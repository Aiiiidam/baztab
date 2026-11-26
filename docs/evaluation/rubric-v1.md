# Scoring rubric v1 — anchors (draft for the support lead)

**Status:** draft anchors derived from the product specification's rubric. They must be validated with
the support lead before the sample calls are labeled (product spec › Open decisions, plan D5). The
version string `rubric-v1` is recorded on every analysis revision.

Scale: برآورده شد (2) · تا حدی برآورده شد (1) · برآورده نشد (0) · شواهد ناکافی. Score the agent's
behaviour independently of the outcome: an escalated (حل‌نشده) call can earn full marks. Every rating
other than شواهد ناکافی cites at least one segment spoken by the agent.

| Criterion                                          | 2 — Met                                                                                  | 1 — Partly met                                                                | 0 — Not met                                                 | Insufficient evidence                               |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------- |
| درک مشکل (understands the issue)                   | Establishes what the customer is trying to do and what went wrong, asking what is needed | Grasps the goal or the failure but misses a clarifying question that mattered | Acts on a wrong or unestablished understanding              | Agent speech missing, inaudible or not attributable |
| اطلاعات یا اقدام درست (correct information/action) | Gives correct information or takes the correct action (including a correct escalation)   | Correct in part, incomplete, or needs a later correction                      | Wrong information or action, or none when one was available | The action cannot be judged from the recording      |
| پایان روشن تماس (closes the call clearly)          | Confirms the result, or explains what happens next and when, when the issue stays open   | Ends with a result or next step that is vague or unconfirmed                  | Ends with no result and no next step                        | The recording ends before the close                 |

Labeling template (one row per call): file · reference transcript · issues (category key + outcome) ·
three ratings · notes. Machine-readable example: `e2e/fixtures/labeled/labels.json`.
