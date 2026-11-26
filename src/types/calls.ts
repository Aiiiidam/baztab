import type { CallState, DateSource, IssueOutcome } from '@prisma/client';

/** Audio/transcript availability for one call (tech spec §9 GET /api/calls/:id). */
export type RecordingAvailability = {
  /** Audio and transcript may be served now. */
  available: boolean;
  durationMs: number;
  /** When audio and transcript are (or were) removed. */
  expiresAt: string;
  expired: boolean;
};

/** One row of فهرست تماس‌ها and the header of جزئیات تماس. Client-safe. */
export type CallListRow = {
  id: string;
  ref: string;
  originalFilename: string;
  acceptedAt: string;
  effectiveDate: string;
  dateSource: DateSource;
  state: CallState;
  failureCode: string | null;
  failureRetryable: boolean;
  /** Expected ready time while the call waits (09:00 Tehran the next morning). */
  readyAt: string | null;
  /** Current pipeline stage while processing. */
  stage: string | null;
  recording: RecordingAvailability | null;
  rowVersion: number;
  /** Issue labels of the active revision (category, else the model's wording). */
  issues: string[];
  /** Distinct outcomes of the active revision's issues. */
  outcomes: IssueOutcome[];
  /** Optional review status, separate from processing state. */
  reviewed: boolean;
  activeRevisionId: string | null;
};

/** A validated evidence reference: the segment and where it starts in the audio. */
export type SegmentRef = { segmentId: string; startMs: number };

export type FindingView = {
  id: string;
  position: number;
  category: { id: string; label: string } | null;
  /** Model wording; null after expiry. */
  summary: string | null;
  outcome: import('@prisma/client').IssueOutcome;
  outcomeExplanation: string | null;
  eligible: boolean;
  categoryHumanSet: boolean;
  outcomeHumanSet: boolean;
  evidence: SegmentRef[];
  outcomeEvidence: SegmentRef[];
};

export type ScoreView = {
  criterion: import('@prisma/client').ScoreCriterion;
  rating: import('@prisma/client').ScoreRating;
  explanation: string | null;
  humanSet: boolean;
  evidence: SegmentRef[];
};

export type AnalysisView = {
  revisionId: string;
  version: number;
  reason: { text: string | null; evidence: SegmentRef[] };
  findings: FindingView[];
  scores: ScoreView[];
  /** Out of 6 when all three criteria were assessed; null means ناقص. */
  total: number | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
};

export type TranscriptSegmentView = {
  id: string;
  index: number;
  startMs: number;
  endMs: number;
  speaker: import('@prisma/client').Speaker;
  text: string;
};

export type HistoryEntry = {
  id: string;
  field: string;
  previousValue: string | null;
  newValue: string | null;
  actor: string;
  createdAt: string;
};

export type CallDetail = CallListRow & {
  retentionDays: number;
  analysis: AnalysisView | null;
  /** Present only while the transcript is retained. */
  transcript: TranscriptSegmentView[] | null;
  categories: { id: string; key: string; label: string }[];
  history: HistoryEntry[];
};
