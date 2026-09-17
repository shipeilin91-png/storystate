import { randomUUID } from "node:crypto";
import { invariant } from "../domain/errors";
import { validateDelta } from "../domain/governance";
import { deltaInputSchema, idSchema, type Event, type Evidence, type StateDelta } from "../domain/state";
import type { StateRepository } from "../repositories/state-repository";
import { RuntimeValidator } from "../server/validator/runtime-validator";
import { productionSemanticClient, type SemanticModelClient } from "../server/validator/semantic";
import { compileExtraction, type CompilerIssue } from "./compiler";
import { buildExtractionPacket, extractionPacketHash, type ExtractionPacket } from "./packet";
import { parseExtractionProposal, requestFor, type ExtractorProvider } from "./provider";
import type { HistoricalContextProvider } from "../rag/retrieval";

export type ExtractionValidationIssue = {
  deltaId: string;
  code: "VALIDATOR_UNAVAILABLE";
};

export type CandidateValidator = Pick<RuntimeValidator, "validate">;
export type CandidateValidatorFactory = (repository: StateRepository, semanticClient: SemanticModelClient) => CandidateValidator;

export type ExtractionRunResult = {
  status: "completed" | "failed";
  sourceRevisionId: string;
  baseStateVersion: number;
  packet: ExtractionPacket | null;
  proposal: ReturnType<typeof parseExtractionProposal> | null;
  evidence: Evidence[];
  events: Event[];
  deltas: StateDelta[];
  rejectedEffects: unknown[];
  compilerIssues: CompilerIssue[];
  warnings: CompilerIssue[];
  validatorResults: Array<StateDelta["validatorResult"]>;
  validationIssues: ExtractionValidationIssue[];
  provider: { modelId: string; calls: number; packetHash: string | null };
  timing: { startedAt: string; completedAt: string; durationMs: number };
  error?: string;
};

export class ExtractionService {
  constructor(
    private readonly repository: StateRepository,
    private readonly extractor: ExtractorProvider,
    private readonly semanticClient: SemanticModelClient = productionSemanticClient(),
    private readonly timeoutMs = 20000,
    private readonly validatorFactory: CandidateValidatorFactory =
      (repository, semanticClient) => new RuntimeValidator(repository, semanticClient),
    private readonly historicalContext?: HistoricalContextProvider,
  ) {}

  async extractRevision(storyId: string, sourceRevisionId: string): Promise<ExtractionRunResult> {
    const started = Date.now();
    const startedAt = new Date(started).toISOString();
    idSchema.parse(storyId);
    idSchema.parse(sourceRevisionId);
    const initial = await this.repository.read(storyId);
    const packet = buildExtractionPacket(initial, sourceRevisionId);
    if (this.historicalContext) packet.historicalContext = await this.historicalContext.retrieve(initial, packet);
    const providerRequest = requestFor(packet, AbortSignal.timeout(this.timeoutMs));
    let proposal: ReturnType<typeof parseExtractionProposal>;
    try {
      const output = await this.extractor.complete(providerRequest);
      proposal = parseExtractionProposal(output);
    } catch (error) {
      const safeError = error instanceof Error && error.message === "EXTRACTION_OUTPUT_INVALID"
        ? "EXTRACTION_OUTPUT_INVALID"
        : "EXTRACTOR_UNAVAILABLE";
      return this.failedResult(sourceRevisionId, packet, started, safeError);
    }

    const compiled = compileExtraction(initial, packet, proposal);
    const persisted = await this.persistCompiled(storyId, packet, compiled);
    const validationIssues: ExtractionValidationIssue[] = [];
    const validator = this.validatorFactory(this.repository, this.semanticClient);
    for (const delta of persisted) {
      try {
        await validator.validate(storyId, delta.id, packet.stateVersion);
      } catch {
        validationIssues.push({ deltaId: delta.id, code: "VALIDATOR_UNAVAILABLE" });
      }
    }
    const completed = Date.now();
    const current = await this.repository.read(storyId);
    const deltas = persisted.map(delta => current.deltas.find(value => value.id === delta.id) ?? delta);
    return {
      status: "completed",
      sourceRevisionId,
      baseStateVersion: packet.stateVersion,
      packet,
      proposal,
      evidence: current.evidence.filter(value => persisted.some(delta => delta.evidenceIds.includes(value.id))),
      events: current.events.filter(value => persisted.some(delta => delta.sourceEventId === value.id)),
      deltas,
      rejectedEffects: compiled.rejectedEffects,
      compilerIssues: compiled.issues,
      warnings: compiled.warnings,
      validatorResults: deltas.map(delta => delta.validatorResult),
      validationIssues,
      provider: { modelId: this.extractor.modelId, calls: 1, packetHash: extractionPacketHash(packet) },
      timing: { startedAt, completedAt: new Date(completed).toISOString(), durationMs: completed - started },
    };
  }

  private async persistCompiled(storyId: string, packet: ExtractionPacket, compiled: ReturnType<typeof compileExtraction>): Promise<StateDelta[]> {
    return this.repository.transaction(storyId, aggregate => {
      invariant(aggregate.story.currentVersion === packet.stateVersion, "STATE_STALE", "Canonical state changed during extraction", 409);
      invariant(aggregate.story.storyRevision === packet.storyRevision, "SOURCE_STALE", "Story revision changed during extraction", 409);
      const revision = aggregate.revisions.find(value => value.id === packet.sourceRevisionId);
      invariant(revision?.content === packet.content && revision.visibility === "canonical", "SOURCE_STALE", "Source revision changed during extraction", 409);
      const deltas = compiled.deltas.map(input => {
        const parsed = deltaInputSchema.parse(input);
        return { ...parsed, id: randomUUID(), decision: "needs_review" as const, validatorResult: null, decisions: [], committedVersionId: null, createdAt: new Date().toISOString() };
      });
      const usedDeltaEventIds = new Set(deltas.map(value => value.sourceEventId).filter((value): value is string => value !== null));
      const usedEvidenceIds = new Set(deltas.flatMap(value => value.evidenceIds));
      const evidence = compiled.evidence.filter(value => usedEvidenceIds.has(value.id));
      const events = compiled.events.filter(value => usedDeltaEventIds.has(value.id));
      for (const value of evidence) {
        invariant(revision.content.slice(value.start, value.end) === value.quote, "INVALID_EVIDENCE", "Compiled evidence must match the exact source span");
        invariant(!aggregate.evidence.some(existing => existing.id === value.id), "DUPLICATE_EVIDENCE", "Compiled evidence already exists");
      }
      const draft = structuredClone(aggregate);
      draft.evidence.push(...evidence);
      draft.events.push(...events);
      for (const delta of deltas) {
        validateDelta(draft, delta);
        draft.deltas.push(delta);
      }
      aggregate.evidence.push(...evidence);
      aggregate.events.push(...events);
      aggregate.deltas.push(...deltas);
      return deltas;
    });
  }

  private failedResult(sourceRevisionId: string, packet: ExtractionPacket, started: number, error: string): ExtractionRunResult {
    const completed = Date.now();
    return {
      status: "failed", sourceRevisionId, baseStateVersion: packet.stateVersion, packet, proposal: null,
      evidence: [], events: [], deltas: [], rejectedEffects: [], compilerIssues: [], warnings: [],
      validatorResults: [], validationIssues: [],
      provider: { modelId: this.extractor.modelId, calls: 1, packetHash: extractionPacketHash(packet) },
      timing: { startedAt: new Date(started).toISOString(), completedAt: new Date(completed).toISOString(), durationMs: completed - started },
      error,
    };
  }
}
