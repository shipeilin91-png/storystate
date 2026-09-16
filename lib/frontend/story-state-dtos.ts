export type ExtractionStatus = "review_required" | "no_changes" | "failed";

export type ReviewDecisionValue = "accepted" | "rejected";
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
};

export type ExtractionRunResultDTO = {
  runId: string;
  status: ExtractionStatus;
  createdAt: string;
  sourceRevision: SourceRevisionDTO;
  candidates: ReviewCandidateDTO[];
  compilerIssues: ReviewCandidateDTO["compilerIssues"];
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
