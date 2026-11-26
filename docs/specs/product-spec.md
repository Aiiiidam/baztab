# Baztab Product Specification

**Release:** Phase 1  
**Product:** Support call analysis for a B2B digital signature product

## Product in plain English

Baztab helps the product team find the problems customers report most often. A support team member exports Persian call recordings from the phone system and uploads them to Baztab. AI turns each recording into text and identifies why the customer called, what went wrong, and how the call ended. Baztab groups similar issues and ranks them by the number of calls.

Baztab also uses AI to score how the support agent handled the call. A reviewer can check the reason for each score and listen to the part of the call that supports it.

## Users and goals

| User | Goal |
| --- | --- |
| Support manager or quality reviewer | Check call findings and review how agents handled calls. |
| Authorized support team member | Export recordings from the phone system, upload them, and check processing status. |

Phase 1 has no roles. Both user types are allowlisted members of the same organization workspace and can perform every task.

The primary goal is to identify common customer problems. Issue counts reflect the uploaded calls in the selected period. One customer may call more than once about the same problem.

## Phase 1 workflow

1. An authorized support team member exports recorded Persian calls from the phone system and uploads them manually.
2. Baztab shows the status of each recording while AI transcribes and analyzes it.
3. A reviewer opens a call to see its transcript, reason, issue, outcome, and quality scores. They can play the recording from a referenced timestamp.
4. The product team opens the issue report, sees which issues were reported most often, and drills into the calls behind each count.

## Functional requirements

| ID | Requirement | Acceptance criteria |
| --- | --- | --- |
| P1-01 | Manual upload from phone system exports | An authorized user can upload MP3 recordings (up to 50 files per batch and 10 MiB per file in the pilot) and see each one's status as Queued, Processing, Ready, or Failed. Invalid files produce a clear error, and exact duplicates are skipped. The filename never causes a rejection: a file with any name, including Persian characters or no leading date, is accepted, and a file without a leading date is dated by its upload day. Recordings uploaded before midnight Tehran time are ready by 09:00 the following morning, every day, and the user is told this ready time when uploading and while the call waits. Retrying a failed recording keeps the same call record. |
| P1-02 | AI transcription of Persian calls | A processed call has a Persian transcript with timestamps linked to audio playback. Where speaker attribution is uncertain, mark the speaker as Unknown. |
| P1-03 | AI extraction of reason, issue, and outcome | Each call shows why the user contacted support, what problem they reported, and what happened by the end of the call. Each finding links to supporting transcript evidence where available. Each issue has an outcome of Resolved, Unresolved or Unknown. An escalated or handed-off issue is Unresolved, and an unclear outcome is Unknown. An issue counts in the ranking only when it has supporting evidence and a mapped issue category. |
| P1-04 | Recurring issue report | The report groups similar issues, ranks them by the number of distinct calls mentioning each issue, and lets the user open the underlying calls. It shows the selected period and the total number of analyzed calls in that period. Repeating an issue during one call counts once for that issue. |
| P1-05 | AI call scoring | Each call shows a result for all three scoring criteria. Each assessed criterion includes a short explanation and a link to the relevant recording timestamp. When the AI cannot assess a criterion from the recording, show Insufficient evidence. After the recording and transcript expire, ratings remain but explanations and timestamp links are removed. |
| P1-06 | Human review | Authorized reviewers can confirm or correct extracted findings and scores. The review history records who changed what and when. The issue report reflects reviewed corrections. |
| P1-07 | Data access | Only allowlisted members can sign in, using their organization national ID, mobile number and password. Passwords use only Latin letters, Latin digits and standard symbols. Persian characters are not accepted. Only they can open their organization's recordings, transcripts, findings, scores, and reports. Protect recordings and transcripts in transit and at rest. AI processing runs on self-managed infrastructure. The pilot keeps recordings and transcripts for 10 days and keeps findings, scores and report counts after that. |

## Call analysis fields

| Field | Meaning | Illustrative example |
| --- | --- | --- |
| Reason for calling | What the customer wanted to do or get help with | Sign a document |
| Issue | What prevented progress or prompted the call | The verification code did not arrive |
| Outcome | What happened by the end of the recording: Resolved, Unresolved or Unknown | Unresolved: support escalated the issue and the customer was still unable to sign. |

If a customer calls back about the same problem, each recording counts as a separate call. A call can contribute to more than one issue group when it contains distinct problems.

## AI call scoring rubric

| Criterion | What the AI assesses |
| --- | --- |
| Understands the issue | The agent establishes what the customer is trying to do and what went wrong, using clarification where needed. |
| Gives correct information or action | The agent gives the customer correct information or takes the correct action for the reported issue. |
| Closes the call clearly | The agent confirms the result or explains what will happen next when the issue stays open. |

**Pilot scale:** Met (2), Partly met (1), and Not met (0). Use Insufficient evidence when the recording is too unclear or incomplete to judge. Show a total out of 6 when all three criteria can be assessed. For an incomplete assessment, show the individual results and mark the total as incomplete.

Score agent behavior independently of the issue outcome. An unresolved call, including an escalated one, can receive full marks when the agent understands the problem, gives correct information or takes the correct action, and explains the next step. Use timestamped evidence from the call and allow human correction.

## Phase 1 pilot checks

| Measure | How to check it |
| --- | --- |
| Extraction quality | Compare AI-generated reasons, issues, and outcomes with human review of a sample of Persian calls. Include ambiguous and multi-issue calls. |
| Issue grouping | Check whether different descriptions of the same problem are grouped together and whether related but distinct problems stay separate. Verify counts against the underlying calls. |
| Scoring quality | Compare each criterion and its supporting evidence with a support lead's assessment on the same recordings. Include unresolved calls and calls with poor audio. |
| Usefulness | Check whether the product team can identify and prioritize actual fixes from the ranked issues and supporting calls. |
| Processing reliability | Measure the percentage of valid recordings processed successfully and the time from upload to results. |

## Later phases

Automatic phone system ingestion, live coaching, FAQ suggestions, and customer satisfaction analysis are candidates for later phases.

## Open decisions

The [technical specification](tech-spec.md) settles format (MP3), volume (about 50 calls per day), file limits, the date fallback (the upload date, labeled تاریخ بارگذاری), processing location (self-managed AI), access (allowlisted members), pilot retention (10 days) and the results deadline (09:00 Tehran the next morning). Still open:

- Validate the scoring rubric with the support lead and agree on the pilot sample and acceptable accuracy.
