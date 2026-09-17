import { isDeepStrictEqual } from "node:util";
import { deltaInputSchema, type StoryAggregate } from "../domain/state";
import { buildExtractionPacket } from "../extraction/packet";
import { buildExtractionRequest } from "../extraction/prompt";
import { ExtractionService, type ExtractionRunResult } from "../extraction/service";
import { FakeExtractorProvider, type ExtractorProvider } from "../extraction/provider";
import { MemoryStateRepository } from "../repositories/memory-state-repository";
import {
  EvidenceRetriever,
  RAG_LIMITS,
  scopeFor,
  type ChunkRepository,
  type HistoricalContext,
  type RetrievalScope,
} from "./retrieval";
import type { EvidenceChunk } from "./chunks";
import {
  evidenceRagCases,
  ragAggregate,
  type ExpectedRagEffect,
  type RagCase,
} from "../../tests/fixtures/rag-badcases";

export const RAG_BENCHMARK_CASE_IDS = [
  "R01", "R02", "R03", "R04", "R05", "R06",
  "R07", "R08", "R09", "R10", "R11", "R12",
] as const;

export type RagBenchmarkCaseId = (typeof RAG_BENCHMARK_CASE_IDS)[number];
export type RagBenchmarkArm = "baseline" | "rag";
export type RagBenchmarkMode = "deterministic-safety" | "real-model";

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
  readonly modelId = "rag-local-benchmark-noop-validator";

  async complete() {
    return {
      agent: "generic",
      verdict: "SUPPORTED",
      reason: "Deterministic local benchmark validator stub.",
      evidenceIds: [],
    };
  }
}

const emptyProposal = {
  evidence: [],
  events: [],
  effects: [],
  unresolvedMentions: [],
};

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

function matchedEffects(
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
  return { matched, exact: matched === expected.length && used.size === deltas.length };
}

function deterministicExtractor(): ExtractorProvider {
  return new FakeExtractorProvider(emptyProposal, "rag-local-deterministic-noop");
}

function aliasesFor(
  packet: ReturnType<typeof buildExtractionPacket>,
  aggregate: StoryAggregate,
) {
  const character = aggregate.state.characters.find(value => value.active);
  const alias = character && packet.entities.find(value =>
    value.id === character.id && value.kind === "character");
  if (!character || !alias) throw new Error("RAG_BENCHMARK_FIXTURE_ALIAS_MISSING");
  return { character, alias: alias.alias };
}

function historicalQuoteProbe(
  aggregate: StoryAggregate,
  revisionId: string,
): ExtractorProvider {
  const packet = buildExtractionPacket(aggregate, revisionId);
  const { character, alias } = aliasesFor(packet, aggregate);
  const history = aggregate.revisions.find(value => value.id !== revisionId)?.content;
  if (!history) throw new Error("RAG_BENCHMARK_HISTORY_MISSING");
  return new FakeExtractorProvider({
    evidence: [{ key: "HISTORICAL", quote: history, occurrence: 0, speakerRef: null }],
    events: [{
      key: "HISTORICAL_EVENT",
      kind: "observation",
      participantRefs: [alias],
      evidenceKeys: ["HISTORICAL"],
    }],
    effects: [{
      eventKey: "HISTORICAL_EVENT",
      evidenceKeys: ["HISTORICAL"],
      supportKinds: ["direct_observation"],
      supportSummary: "Historical quote leakage probe.",
      confidence: 1,
      kind: "character_location",
      characterRef: alias,
      after: character.location,
    }],
    unresolvedMentions: [],
  }, "rag-local-historical-quote-probe");
}

async function runHistoricalQuoteSafetyProbe(
  caseValue: RagCase,
  aggregate: StoryAggregate,
  revisionId: string,
) {
  const repository = new MemoryStateRepository();
  await repository.create(aggregate);
  const result = await new ExtractionService(
    repository,
    historicalQuoteProbe(aggregate, revisionId),
    new NoopSemanticClient() as never,
    30000,
  ).extractRevision(aggregate.story.id, revisionId);
  const historicalText = caseValue.history.join("\n");
  const leaked = result.evidence.filter(value =>
    historicalText.includes(value.quote)).length;
  const rejected = result.compilerIssues.some(issue => issue.code === "EVIDENCE_NOT_FOUND");
  return { leaked, rejected };
}

function contextAudit(
  aggregate: StoryAggregate,
  packet: ReturnType<typeof buildExtractionPacket>,
  context: HistoricalContext | undefined,
  caseValue: RagCase,
) {
  if (!context) {
    return {
      retrievalHitCorrectness: null,
      sameStory: null,
      currentRevisionExcluded: null,
      futureRevisionExcluded: null,
      topKPass: null,
      contextBudgetPass: null,
      recencyBoostPass: null,
      entityBoostPass: null,
      pronounEntityResolution: null,
      retrievedChunks: 0,
    };
  }
  const scope = scopeFor(aggregate, packet);
  const chunks = context.chunks;
  const revisions = new Set(aggregate.revisions.map(value => value.id));
  const documents = new Set(aggregate.documents.map(value => value.id));
  const sameStory = chunks.every(chunk =>
    revisions.has(chunk.sourceRevisionId) && documents.has(chunk.sourceDocumentId));
  const currentRevisionExcluded = chunks.every(chunk =>
    chunk.sourceRevisionId !== packet.sourceRevisionId);
  const futureRevisionExcluded = chunks.every(chunk =>
    chunk.sourceOrder < packet.sourceOrder);
  const contextChars = chunks.reduce((sum, chunk) =>
    sum + Array.from(chunk.content).length, 0);
  const retrievalHitCorrectness = chunks.length > 0 && chunks.every(chunk =>
    caseValue.history.includes(chunk.content));
  const entityBoostPass = chunks.every(chunk =>
    Number.isFinite(chunk.entityBoost) &&
    chunk.entityBoost >= 0 &&
    chunk.entityBoost <= 0.18) &&
    (scope.entityNames.length === 0 || chunks.some(chunk => chunk.entityBoost > 0));
  const pronounEntityResolution = caseValue.group === "pronouns"
    ? retrievalHitCorrectness
    : null;
  return {
    retrievalHitCorrectness,
    sameStory,
    currentRevisionExcluded,
    futureRevisionExcluded,
    topKPass: chunks.length <= RAG_LIMITS.topK,
    contextBudgetPass: contextChars <= RAG_LIMITS.contextChars,
    recencyBoostPass: chunks.every(chunk => chunk.recencyBoost > 0),
    entityBoostPass,
    pronounEntityResolution,
    retrievedChunks: chunks.length,
  };
}

export type RagBenchmarkCaseResult = ReturnType<typeof emptyCaseResult>;

function emptyCaseResult() {
  return {
    caseId: "R01" as RagBenchmarkCaseId,
    group: "old_state" as RagCase["group"],
    arm: "baseline" as RagBenchmarkArm,
    pass: false,
    safetyPass: false,
    stateEffectCorrect: false,
    entityResolutionCorrect: false,
    staleHistoryError: 0,
    ownershipCustodyViolation: 0,
    beliefTruthViolation: 0,
    redundantCandidateError: 0,
    schemaValid: false,
    evidenceValid: false,
    historicalEvidenceLeakage: 0,
    canonicalMutationSafe: false,
    extractorInputShapeValid: false,
    retrievalHitCorrectness: null as boolean | null,
    sameStory: null as boolean | null,
    currentRevisionExcluded: null as boolean | null,
    futureRevisionExcluded: null as boolean | null,
    topKPass: null as boolean | null,
    contextBudgetPass: null as boolean | null,
    recencyBoostPass: null as boolean | null,
    entityBoostPass: null as boolean | null,
    pronounEntityResolution: null as boolean | null,
    retrievedChunks: 0,
    providerCalls: 0,
  };
}

export async function runRagBenchmarkCase(
  caseId: RagBenchmarkCaseId,
  arm: RagBenchmarkArm,
  extractor: ExtractorProvider = deterministicExtractor(),
): Promise<RagBenchmarkCaseResult> {
  const caseValue = evidenceRagCases.find(value => value.id === caseId);
  if (!caseValue) throw new Error("RAG_BENCHMARK_CASE_NOT_FOUND");
  const { aggregate, revisionId } = ragAggregate(caseValue);
  const canonicalBefore = structuredClone(aggregate.state);
  const repository = new MemoryStateRepository();
  await repository.create(aggregate);
  const contextProvider = arm === "rag"
    ? new EvidenceRetriever(new MemoryChunkRepository())
    : undefined;
  const result = await new ExtractionService(
    repository,
    extractor,
    new NoopSemanticClient() as never,
    30000,
    undefined,
    contextProvider,
  ).extractRevision(aggregate.story.id, revisionId);
  const packet = result.packet!;
  const currentRevision = aggregate.revisions.find(value => value.id === revisionId)!;
  const input = result.packet ? buildExtractionRequest(result.packet) : null;
  const currentEvidence = (value: ExtractionRunResult["evidence"][number]) =>
    value.sourceRevisionId === currentRevision.id &&
    currentRevision.content.slice(value.start, value.end) === value.quote;
  const evidenceValid = result.evidence.every(currentEvidence);
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
  const effect = matchedEffects(result.deltas, caseValue.expected);
  const entityResolutionCorrect =
    !result.compilerIssues.some(issue => issue.code === "UNKNOWN_ENTITY_REF") &&
    (caseValue.expected.length === 0 || effect.matched > 0);
  const effectErrors =
    (caseValue.expected.length - effect.matched) +
    (result.deltas.length - effect.matched);
  const ownershipExpected = caseValue.expected.filter(value =>
    value.targetType === "items" &&
    ["holder", "owner", "custodian"].includes(value.fieldPath));
  const ownershipActual = result.deltas.filter(value =>
    value.targetType === "items" &&
    ["holder", "owner", "custodian"].includes(value.fieldPath));
  const ownershipMatch = matchedEffects(ownershipActual, ownershipExpected);
  const beliefExpected = caseValue.expected.filter(value =>
    value.targetType === "knowledge" || value.targetType === "worldTruth");
  const beliefActual = result.deltas.filter(value =>
    value.targetType === "knowledge" || value.targetType === "worldTruth");
  const beliefMatch = matchedEffects(beliefActual, beliefExpected);
  const historicalProbe = await runHistoricalQuoteSafetyProbe(
    caseValue,
    aggregate,
    revisionId,
  );
  const audit = contextAudit(aggregate, packet, packet.historicalContext, caseValue);
  const staleHistoryError =
    (caseValue.group === "old_state" || caseValue.group === "reversals") &&
    result.deltas.length > 0 ? effectErrors : 0;
  const ownershipCustodyViolation =
    ownershipActual.length > 0 && !ownershipMatch.exact
      ? ownershipActual.length - ownershipMatch.matched
      : 0;
  const beliefTruthViolation =
    beliefActual.length > 0 && !beliefMatch.exact
      ? beliefActual.length - beliefMatch.matched
      : 0;
  const redundantCandidateError =
    caseValue.group === "redundant" ? result.deltas.length : 0;
  const commonInputShape =
    input !== null &&
    input.input.includes("CURRENT_SOURCE") &&
    input.input.includes("CURRENT_CANONICAL_STATE");
  const extractorInputShapeValid = arm === "baseline"
    ? commonInputShape && !input!.system.includes("CURRENT SOURCE is the only authoritative source")
    : commonInputShape &&
      input!.input.includes("RETRIEVED_HISTORICAL_CONTEXT") &&
      input!.system.includes("CURRENT SOURCE is the only authoritative source");
  const safetyPass =
    schemaValid &&
    evidenceValid &&
    canonicalMutationSafe &&
    extractorInputShapeValid &&
    historicalProbe.leaked === 0 &&
    historicalProbe.rejected &&
    staleHistoryError === 0 &&
    ownershipCustodyViolation === 0 &&
    beliefTruthViolation === 0 &&
    redundantCandidateError === 0 &&
    (arm === "baseline" || (
      audit.retrievalHitCorrectness === true &&
      audit.sameStory === true &&
      audit.currentRevisionExcluded === true &&
      audit.futureRevisionExcluded === true &&
      audit.topKPass === true &&
      audit.contextBudgetPass === true &&
      audit.recencyBoostPass === true &&
      audit.entityBoostPass === true
    ));
  const stateEffectCorrect = effect.exact;
  return {
    ...emptyCaseResult(),
    caseId,
    group: caseValue.group,
    arm,
    pass: safetyPass && stateEffectCorrect,
    safetyPass,
    stateEffectCorrect,
    entityResolutionCorrect,
    staleHistoryError,
    ownershipCustodyViolation,
    beliefTruthViolation,
    redundantCandidateError,
    schemaValid,
    evidenceValid,
    historicalEvidenceLeakage: historicalProbe.leaked,
    canonicalMutationSafe,
    extractorInputShapeValid,
    ...audit,
    providerCalls: result.provider.calls,
  };
}

export function localExtractorConfigAvailable(
  env: Record<string, string | undefined> = process.env,
) {
  return ["STORYSTATE_EXTRACTOR_API_KEY", "STORYSTATE_EXTRACTOR_ENDPOINT", "STORYSTATE_EXTRACTOR_MODEL"]
    .every(name => Boolean(env[name]) && env[name] !== "[SENSITIVE]");
}
