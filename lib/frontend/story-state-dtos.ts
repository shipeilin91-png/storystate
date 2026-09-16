export type ExtractionStatus = "review_required" | "no_changes" | "failed";
export type ReviewDecisionValue = "accepted" | "rejected";
export type BackendDecisionValue =
  ReviewDecisionValue | "needs_review" | "deferred";
export type ReviewRecommendation =
  "AUTO_ACCEPT_ELIGIBLE" | "NEEDS_REVIEW" | "REJECT" | "CONFLICT";
export type ReviewRisk = "LOW" | "MEDIUM" | "HIGH" | "CONFLICT";

export type SourceRevisionDTO = {
  id: string;
  revisionNumber: number;
  title: string;
  chapter: number;
  createdAt: string;
};

export type ValidatorResultDTO = {
  status: "passed" | "failed" | "conflict" | "needs_review";
  recommendation: ReviewRecommendation;
  reason: string;
  risk: ReviewRisk;
  checks: { label: string; passed: boolean }[];
  validatorVersion?: string;
};

export type ReviewCandidateDTO = {
  id: string;
  kind: "canonical" | "soft" | "no_change";
  target: {
    entityId: string;
    entityName: string;
    category: string;
    field: string;
  };
  before: string;
  after: string;
  evidence: { quote: string; sourceRevisionId: string }[];
  event: { id: string; summary: string } | null;
  compilerIssues: {
    code: string;
    message: string;
    severity: "warning" | "error";
  }[];
  validatorResult: ValidatorResultDTO;
  risk: ReviewRisk;
  recommendation: ReviewRecommendation;
  sourceRevision: SourceRevisionDTO;
  reasoning: string;
  provenance: string[];
  decision: "needs_review" | ReviewDecisionValue;
  acceptAllowed: boolean;
};

export type ExtractionRunResultDTO = {
  runId: string;
  status: ExtractionStatus;
  createdAt: string;
  sourceRevision: SourceRevisionDTO;
  baseStateVersion?: number;
  candidates: ReviewCandidateDTO[];
  compilerIssues: ReviewCandidateDTO["compilerIssues"];
  warnings: ReviewCandidateDTO["compilerIssues"];
  validationIssues: BackendValidationIssue[];
  provider: { modelId: string; calls: number; packetHash: string | null };
  timing: { startedAt: string; completedAt: string; durationMs: number };
  message?: string;
};

export type ReviewDecisionDTO = {
  candidateId: string;
  decision: ReviewDecisionValue;
  actor: string;
  reason: string;
  decidedAt: string;
};

export type CanonicalStateSnapshotDTO = {
  storyId: string;
  version: number;
  chapter: number;
  refreshedAt: string;
  records: {
    id: string;
    category: string;
    name: string;
    fields: Record<string, string>;
    evidence: string;
  }[];
};

export type HistoryEntryDTO = {
  id: string;
  version: number;
  chapter: number;
  committedAt: string;
  title: string;
  changes: string[];
  sourceRevisionId?: string;
};

export type CommitResultDTO = {
  commitId: string;
  committedCandidateIds: string[];
  committedAt: string;
  canonicalState: CanonicalStateSnapshotDTO;
  history: HistoryEntryDTO[];
};

export type ExtractStateChangesInputDTO = {
  storyId: string;
  title: string;
  chapter: number;
  expectedStateVersion: number;
  content: string;
};

export type BackendStory = {
  id: string;
  title: string;
  currentVersion: number;
  currentChapter: number | null;
  storyRevision: number;
  createdAt: string;
};
export type BackendValidatorResult = Omit<ValidatorResultDTO, "checks"> & {
  checks?: Array<{
    agent:
      | "deterministic"
      | "context"
      | "generic"
      | "evidence"
      | "knowledge_boundary"
      | "temporal_state";
    verdict: "SUPPORTED" | "UNCERTAIN" | "UNSUPPORTED";
    reason: string;
    evidenceIds: string[];
    code?: string;
  }>;
};
export type BackendDelta = {
  id: string;
  operation:
    "CREATE" | "UPDATE" | "CLOSE" | "RESOLVE" | "INVALIDATE" | "NO_CHANGE";
  targetType: string;
  targetId: string;
  fieldPath: string;
  before: unknown;
  after: unknown;
  sourceEventId: string | null;
  evidenceIds: string[];
  reason: string;
  confidence: number;
  risk: string[];
  decision: BackendDecisionValue;
  validatorResult: BackendValidatorResult | null;
  committedVersionId: string | null;
  createdAt: string;
};
export type BackendEvidence = {
  id: string;
  sourceRevisionId: string;
  quote: string;
  start: number;
  end: number;
};
export type BackendEvent = {
  id: string;
  sourceRevisionId: string;
  summary: string;
  createdAt: string;
};
export type BackendSourceRevision = {
  id: string;
  documentId: string;
  revisionNumber: number;
  visibility: "canonical" | "author_only";
};
export type BackendSourceDocument = {
  id: string;
  title: string;
  sourceOrder: number;
  chapter: number | null;
};
export type BackendReviewHydration = {
  story: BackendStory;
  candidateDeltas: BackendDelta[];
  evidence: BackendEvidence[];
  events: BackendEvent[];
  sourceRevisions: BackendSourceRevision[];
  sourceDocuments: BackendSourceDocument[];
};
export type BackendCanonicalState = Record<
  string,
  Array<Record<string, unknown> & { id: string; active: boolean }>
>;
export type BackendStateResponse = {
  story: BackendStory;
  state: BackendCanonicalState;
};
export type BackendVersion = {
  id: string;
  versionNumber: number;
  parentVersionId: string | null;
  commitKind: "delta_commit" | "restore";
  createdAt: string;
  deltaIds: string[];
  snapshot: BackendCanonicalState;
  restoredFromVersionId: string | null;
  chapter: number | null;
  storyRevision: number;
};
export type BackendExtractionResult = {
  status: "completed" | "failed";
  sourceRevisionId: string;
  baseStateVersion: number;
  candidateDeltas: BackendDelta[];
  validatorResults: Array<BackendValidatorResult | null>;
  compilerIssues: Array<{
    code: string;
    level: "RUN_FATAL" | "EFFECT_REJECTED" | "WARNING";
    message: string;
    effectIndex?: number;
    eventKey?: string;
  }>;
  warnings: Array<{
    code: string;
    level: "RUN_FATAL" | "EFFECT_REJECTED" | "WARNING";
    message: string;
    effectIndex?: number;
    eventKey?: string;
  }>;
  validationIssues?: BackendValidationIssue[];
  evidence: BackendEvidence[];
  events: BackendEvent[];
  provider: { modelId: string; calls: number; packetHash: string | null };
  timing: { startedAt: string; completedAt: string; durationMs: number };
};

export type BackendValidationIssue = {
  deltaId: string;
  code: "VALIDATOR_UNAVAILABLE";
};
