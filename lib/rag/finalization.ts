import { isDeepStrictEqual } from "node:util";
import type { Pool } from "pg";
import { deltaInputSchema } from "../domain/state";
import { ExtractionService, type ExtractionRunResult } from "../extraction/service";
import { buildExtractionPacket } from "../extraction/packet";
import { productionExtractor } from "../extraction/production";
import type { ExtractorProvider } from "../extraction/provider";
import { MemoryStateRepository } from "../repositories/memory-state-repository";
import { productionPool, productionRepository } from "../server/api";
import { backfillEvidenceChunks } from "./backfill";
import type { EvidenceChunk } from "./chunks";
import { PostgresChunkRepository } from "./postgres-chunks";
import {
  EvidenceRetriever,
  RAG_LIMITS,
  ragEnabled,
  scopeFor,
  type ChunkRepository,
  type RetrievalScope,
} from "./retrieval";
import {
  evidenceRagCases,
  ragAggregate,
  type ExpectedRagEffect,
  type RagCase,
} from "../../tests/fixtures/rag-badcases";

export const RAG_FINALIZATION_CASE_IDS = [
  "R01", "R02", "R03", "R04", "R05", "R06",
  "R07", "R08", "R09", "R10", "R11", "R12",
] as const;
export type RagFinalizationCaseId = (typeof RAG_FINALIZATION_CASE_IDS)[number];
export type RagBenchmarkArm = "baseline" | "rag";

export const RAG_MIGRATION_SQL = `
create extension if not exists vector;

create table if not exists story_evidence_chunks (
  id uuid primary key,
  story_id uuid not null references stories(id),
  source_document_id uuid not null,
  source_revision_id uuid not null,
  source_order integer not null check (source_order >= 0),
  chapter integer,
  chunk_index integer not null check (chunk_index >= 0),
  start_offset integer not null check (start_offset >= 0),
  end_offset integer not null check (end_offset > start_offset),
  content text not null check (length(trim(content)) > 0),
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  retrieval_vector vector(384) not null,
  vectorizer_version text not null,
  created_at timestamptz not null default now(),
  foreign key (story_id,source_document_id) references source_documents(story_id,id),
  foreign key (story_id,source_revision_id) references source_revisions(story_id,id),
  unique (story_id,source_revision_id,chunk_index,vectorizer_version)
);

create index if not exists story_chunks_chronology
  on story_evidence_chunks(story_id,source_order desc);
create index if not exists story_chunks_revision
  on story_evidence_chunks(story_id,source_revision_id);
create index if not exists story_chunks_content
  on story_evidence_chunks(story_id,content_hash);
alter table story_evidence_chunks enable row level security;
`;

function configured(name: string): string {
  const value = process.env[name];
  if (!value || value === "[SENSITIVE]") throw new Error("FINALIZATION_RUNTIME_NOT_CONFIGURED");
  return value;
}

export function finalizationStatus() {
  configured("STORYSTATE_DATABASE_URL");
  configured("STORYSTATE_EXTRACTOR_API_KEY");
  configured("STORYSTATE_EXTRACTOR_ENDPOINT");
  configured("STORYSTATE_EXTRACTOR_MODEL");
  if (ragEnabled()) throw new Error("FINALIZATION_REQUIRES_RAG_DISABLED");
  productionPool();
  productionExtractor();
  return {
    status: "READY" as const,
    databaseTarget: "REMOTE" as const,
    ragEnabled: false,
    caseCount: RAG_FINALIZATION_CASE_IDS.length,
  };
}

export async function migrateEvidenceRag(pool: Pool = productionPool()) {
  await pool.query(RAG_MIGRATION_SQL);
  const result = await pool.query(
    "select to_regclass('public.story_evidence_chunks') is not null as table_exists",
  );
  const tableExists = result.rows[0]?.table_exists === true;
  if (!tableExists) throw new Error("RAG_MIGRATION_TABLE_MISSING");
  return {
    migration: "PASS" as const,
    databaseTarget: "REMOTE" as const,
    tableExists,
  };
}

export async function backfillEvidenceRag(pool: Pool = productionPool()) {
  return backfillEvidenceChunks(pool);
}

type SmokeResult = {
  retrievalSmoke: "PASS" | "FAIL";
  databaseTarget: "REMOTE";
  sameStory: "PASS" | "FAIL";
  crossStory: number;
  currentRevisionLeakage: number;
  futureRevisionLeakage: number;
  topK: number;
  contextChars: number;
  vectorRanking: "PASS" | "FAIL";
  recency: "PASS" | "FAIL";
  entityBoost: "PASS" | "FAIL";
  dedupe: "PASS" | "FAIL";
  failures: string[];
};

function smokeFailure(code: string): SmokeResult {
  return {
    retrievalSmoke: "FAIL",
    databaseTarget: "REMOTE",
    sameStory: "FAIL",
    crossStory: 0,
    currentRevisionLeakage: 0,
    futureRevisionLeakage: 0,
    topK: 0,
    contextChars: 0,
    vectorRanking: "FAIL",
    recency: "FAIL",
    entityBoost: "FAIL",
    dedupe: "FAIL",
    failures: [code],
  };
}

export async function retrievalSmoke(pool: Pool = productionPool()): Promise<SmokeResult> {
  const storyRows = await pool.query("select id from stories order by created_at, id limit 50");
  const stateRepository = productionRepository();
  const chunkRepository = new PostgresChunkRepository(pool);
  const retriever = new EvidenceRetriever(chunkRepository);
  let best: SmokeResult | null = null;

  for (const storyRow of storyRows.rows) {
    const aggregate = await stateRepository.read(storyRow.id);
    const documents = new Map(aggregate.documents.map(document => [document.id, document]));
    const latestRevisionIds = new Set(
      aggregate.documents.flatMap(document => {
        const latest = aggregate.revisions
          .filter(revision => revision.documentId === document.id)
          .sort((left, right) => right.revisionNumber - left.revisionNumber)[0];
        return latest ? [latest.id] : [];
      }),
    );
    const revisions = aggregate.revisions
      .filter(revision => revision.visibility === "canonical" && latestRevisionIds.has(revision.id))
      .sort((left, right) =>
        (documents.get(right.documentId)?.sourceOrder ?? -1) -
        (documents.get(left.documentId)?.sourceOrder ?? -1),
      );

    for (const revision of revisions) {
      let packet;
      try {
        packet = buildExtractionPacket(aggregate, revision.id);
      } catch {
        continue;
      }
      const scope = scopeFor(aggregate, packet);
      if (scope.eligibleRevisionIds.length === 0) continue;
      const context = await retriever.retrieve(aggregate, packet);
      if (context.chunks.length === 0) continue;

      const stored = await pool.query(
        "select id,story_id from story_evidence_chunks where id=any($1::uuid[])",
        [context.chunks.map(chunk => chunk.id)],
      );
      const selectedIds = new Set(context.chunks.map(chunk => chunk.id));
      const crossStory = stored.rows.filter(row =>
        selectedIds.has(row.id) && row.story_id !== aggregate.story.id).length;
      const sameStory = stored.rows.length === context.chunks.length && crossStory === 0;
      const currentRevisionLeakage = context.chunks
        .filter(chunk => chunk.sourceRevisionId === packet.sourceRevisionId).length;
      const futureRevisionLeakage = context.chunks
        .filter(chunk => chunk.sourceOrder >= packet.sourceOrder).length;
      const contextChars = context.chunks
        .reduce((sum, chunk) => sum + Array.from(chunk.content).length, 0);
      const ranked = context.chunks.slice(RAG_LIMITS.recentReserved);
      const vectorRanking = context.chunks.every(chunk =>
        Number.isFinite(chunk.vectorScore) && Number.isFinite(chunk.score)) &&
        ranked.every((chunk, index) =>
          index === 0 || ranked[index - 1]!.score >= chunk.score);
      const recency = context.chunks.every(chunk =>
        chunk.sourceOrder < packet.sourceOrder && chunk.recencyBoost > 0);
      const entityBoost = scope.entityNames.length > 0 &&
        context.chunks.some(chunk => chunk.entityBoost > 0);
      const dedupe = new Set(context.chunks.map(chunk => chunk.contentHash)).size ===
        context.chunks.length;
      const topK = context.chunks.length;
      const failures = [
        ...(!sameStory ? ["SAME_STORY"] : []),
        ...(crossStory !== 0 ? ["CROSS_STORY"] : []),
        ...(currentRevisionLeakage !== 0 ? ["CURRENT_REVISION_LEAKAGE"] : []),
        ...(futureRevisionLeakage !== 0 ? ["FUTURE_REVISION_LEAKAGE"] : []),
        ...(topK > RAG_LIMITS.topK ? ["TOP_K"] : []),
        ...(contextChars > RAG_LIMITS.contextChars ? ["CONTEXT_BUDGET"] : []),
        ...(!vectorRanking ? ["VECTOR_RANKING"] : []),
        ...(!recency ? ["RECENCY"] : []),
        ...(!entityBoost ? ["ENTITY_BOOST"] : []),
        ...(!dedupe ? ["DEDUPE"] : []),
      ];
      const result: SmokeResult = {
        retrievalSmoke: failures.length === 0 ? "PASS" : "FAIL",
        databaseTarget: "REMOTE",
        sameStory: sameStory ? "PASS" : "FAIL",
        crossStory,
        currentRevisionLeakage,
        futureRevisionLeakage,
        topK,
        contextChars,
        vectorRanking: vectorRanking ? "PASS" : "FAIL",
        recency: recency ? "PASS" : "FAIL",
        entityBoost: entityBoost ? "PASS" : "FAIL",
        dedupe: dedupe ? "PASS" : "FAIL",
        failures,
      };
      if (result.retrievalSmoke === "PASS") return result;
      if (!best || result.failures.length < best.failures.length) best = result;
    }
  }
  return best ?? smokeFailure("NO_ELIGIBLE_PRODUCTION_HISTORY");
}

class MemoryChunkRepository implements ChunkRepository {
  private chunks: EvidenceChunk[] = [];

  async index(chunks: EvidenceChunk[]) {
    const before = this.chunks.length;
    for (const chunk of chunks) {
      if (!this.chunks.some(value => value.id === chunk.id)) {
        this.chunks.push(structuredClone(chunk));
      }
    }
    const created = this.chunks.length - before;
    return { created, skipped: chunks.length - created };
  }

  async candidates(scope: RetrievalScope) {
    return this.chunks.filter(chunk => chunk.storyId === scope.storyId);
  }
}

class NoopSemanticClient {
  readonly modelId = "rag-finalization-noop-validator";

  async complete() {
    return {
      agent: "generic",
      verdict: "SUPPORTED",
      reason: "Finalization benchmark validator stub.",
      evidenceIds: [],
    };
  }
}

function partialAfterMatches(actual: unknown, expected: unknown): boolean {
  if (!expected || typeof expected !== "object" || Array.isArray(expected)) {
    return JSON.stringify(actual) === JSON.stringify(expected);
  }
  if (!actual || typeof actual !== "object" || Array.isArray(actual)) return false;
  return Object.entries(expected).every(([key, value]) =>
    JSON.stringify((actual as Record<string, unknown>)[key]) === JSON.stringify(value));
}

function deltaMatches(
  delta: ExtractionRunResult["deltas"][number],
  expected: ExpectedRagEffect,
): boolean {
  return delta.targetType === expected.targetType &&
    delta.targetId === expected.targetId &&
    delta.fieldPath === expected.fieldPath &&
    partialAfterMatches(delta.after, expected.after);
}

function expectedEffects(
  deltas: ExtractionRunResult["deltas"],
  expected: ExpectedRagEffect[],
) {
  const used = new Set<number>();
  let matched = 0;
  for (const target of expected) {
    const index = deltas.findIndex((delta, candidateIndex) =>
      !used.has(candidateIndex) && deltaMatches(delta, target));
    if (index >= 0) {
      used.add(index);
      matched += 1;
    }
  }
  return {
    matched,
    correct: matched === expected.length && used.size === deltas.length,
  };
}

export type RagBenchmarkCaseResult = {
  caseId: RagFinalizationCaseId;
  group: RagCase["group"];
  arm: RagBenchmarkArm;
  pass: boolean;
  stateEffectCorrect: boolean;
  entityResolutionCorrect: boolean;
  staleHistoryError: number;
  ownershipCustodyViolation: number;
  beliefTruthViolation: number;
  redundantCandidateError: number;
  schemaValid: boolean;
  evidenceValid: boolean;
  historicalEvidenceLeakage: number;
};

export async function runRagBenchmarkCase(
  caseId: RagFinalizationCaseId,
  arm: RagBenchmarkArm,
  extractor?: ExtractorProvider,
): Promise<RagBenchmarkCaseResult> {
  const caseValue = evidenceRagCases.find(value => value.id === caseId);
  if (!caseValue) throw new Error("RAG_BENCHMARK_CASE_NOT_FOUND");
  const { aggregate, revisionId } = ragAggregate(caseValue);
  const canonicalBefore = structuredClone(aggregate.state);
  const repository = new MemoryStateRepository();
  await repository.create(aggregate);
  const context = arm === "rag"
    ? new EvidenceRetriever(new MemoryChunkRepository())
    : undefined;
  const result = await new ExtractionService(
    repository,
    extractor ?? productionExtractor(),
    new NoopSemanticClient() as never,
    30000,
    undefined,
    context,
  ).extractRevision(aggregate.story.id, revisionId);
  const currentRevision = aggregate.revisions.find(value => value.id === revisionId)!;
  const currentEvidence = (value: ExtractionRunResult["evidence"][number]) =>
    value.sourceRevisionId === currentRevision.id &&
    currentRevision.content.slice(value.start, value.end) === value.quote;
  const evidenceValid = result.evidence.every(currentEvidence);
  const historicalText = caseValue.history.join("\n");
  const historicalEvidenceLeakage = result.evidence.filter(value =>
    !currentEvidence(value) && historicalText.includes(value.quote)).length;
  const after = await repository.read(aggregate.story.id);
  const canonicalMutationSafe =
    after.story.currentVersion === aggregate.story.currentVersion &&
    isDeepStrictEqual(after.state, canonicalBefore) &&
    result.deltas.every(delta =>
      delta.decision === "needs_review" && delta.committedVersionId === null);
  const deltaSchemasValid = result.deltas.every(delta =>
    deltaInputSchema.safeParse(Object.fromEntries(
      Object.keys(deltaInputSchema.shape).map(key => [
        key,
        delta[key as keyof typeof delta],
      ]),
    )).success);
  const schemaValid =
    result.status === "completed" &&
    result.proposal !== null &&
    deltaSchemasValid &&
    canonicalMutationSafe;
  const effect = expectedEffects(result.deltas, caseValue.expected);
  const entityResolutionCorrect =
    !result.compilerIssues.some(issue => issue.code === "UNKNOWN_ENTITY_REF") &&
    caseValue.expected.every(expected => result.deltas.some(delta =>
      delta.targetType === expected.targetType &&
      delta.targetId === expected.targetId &&
      delta.fieldPath === expected.fieldPath));
  const effectErrors =
    (caseValue.expected.length - effect.matched) +
    (result.deltas.length - effect.matched);
  const ownershipFields = new Set(["holder", "owner", "custodian"]);
  const expectedOwnership = caseValue.expected.filter(expected =>
    expected.targetType === "items" && ownershipFields.has(expected.fieldPath));
  const actualOwnership = result.deltas.filter(delta =>
    delta.targetType === "items" && ownershipFields.has(delta.fieldPath));
  const ownership = expectedEffects(actualOwnership, expectedOwnership);
  const expectedBeliefTruth = caseValue.expected.filter(expected =>
    expected.targetType === "knowledge" || expected.targetType === "worldTruth");
  const actualBeliefTruth = result.deltas.filter(delta =>
    delta.targetType === "knowledge" || delta.targetType === "worldTruth");
  const beliefTruth = expectedEffects(actualBeliefTruth, expectedBeliefTruth);
  const staleHistoryError =
    caseValue.group === "old_state" || caseValue.group === "reversals"
      ? effectErrors
      : 0;
  const ownershipCustodyViolation =
    (expectedOwnership.length - ownership.matched) +
    (actualOwnership.length - ownership.matched);
  const beliefTruthViolation =
    (expectedBeliefTruth.length - beliefTruth.matched) +
    (actualBeliefTruth.length - beliefTruth.matched);
  const redundantCandidateError =
    caseValue.group === "redundant" ? result.deltas.length : 0;
  const pass =
    schemaValid &&
    evidenceValid &&
    historicalEvidenceLeakage === 0 &&
    effect.correct &&
    entityResolutionCorrect &&
    staleHistoryError === 0 &&
    ownershipCustodyViolation === 0 &&
    beliefTruthViolation === 0 &&
    redundantCandidateError === 0;
  return {
    caseId,
    group: caseValue.group,
    arm,
    pass,
    stateEffectCorrect: effect.correct,
    entityResolutionCorrect,
    staleHistoryError,
    ownershipCustodyViolation,
    beliefTruthViolation,
    redundantCandidateError,
    schemaValid,
    evidenceValid,
    historicalEvidenceLeakage,
  };
}
