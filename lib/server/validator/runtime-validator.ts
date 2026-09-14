import { createHash } from "node:crypto";
import { DomainError, invariant } from "../../domain/errors";
import { idSchema, validatorResultSchema, type StoryAggregate } from "../../domain/state";
import type { StateRepository } from "../../repositories/state-repository";
import { aggregateChecks, type ValidatorResult } from "./aggregate";
import { candidateInput, packetHash, StructuredValidationContextProvider, type ValidationContextProvider, type ValidationPacket } from "./context";
import { deterministicGate } from "./deterministic";
import { routeAgents, ValidationOrchestrator, type SemanticModelClient } from "./semantic";

const VERSION = "runtime-validator/0.1";
function inputFingerprint(a: StoryAggregate) {
  // Do not hold a DB transaction while awaiting a model. Changes to inputs or
  // human decisions invalidate the in-flight run, including an ABA state change.
  return createHash("sha256").update(JSON.stringify({
    story: a.story, state: a.state, documents: a.documents, revisions: a.revisions, evidence: a.evidence, events: a.events,
    deltas: a.deltas.map(d => ({ ...candidateInput(d), decision: d.decision, decisions: d.decisions, committedVersionId: d.committedVersionId, validatorResult: d.validatorResult })),
  })).digest("hex");
}
export class RuntimeValidator {
  private orchestrator: ValidationOrchestrator;
  constructor(private repository: StateRepository, private client: SemanticModelClient,
    private context: ValidationContextProvider = new StructuredValidationContextProvider(), timeoutMs = 15000) {
    this.orchestrator = new ValidationOrchestrator(client, timeoutMs);
  }
  async validate(storyId: string, deltaId: string, expectedVersion: number): Promise<ValidatorResult> {
    idSchema.parse(storyId); idSchema.parse(deltaId);
    const a = await this.repository.read(storyId);
    const d = a.deltas.find(d => d.id === deltaId);
    invariant(d, "NOT_FOUND", "Delta not found", 404);
    invariant(!d.committedVersionId, "ALREADY_COMMITTED", "Committed delta is immutable", 409);
    const fingerprint = inputFingerprint(a);
    const gate = deterministicGate(a, d, expectedVersion);
    let packet: ValidationPacket | null = null;
    let result: ValidatorResult;
    if (gate.terminal) result = aggregateChecks(gate, null, [], []);
    else {
      try { packet = this.context.build(a, d); }
      catch (error) {
        if (!(error instanceof DomainError)) throw error;
      }
      if (!packet) result = aggregateChecks(gate, null, [], [{
        agent: "context", verdict: "UNCERTAIN", reason: "Trusted bounded validation context is unavailable; review the source and packet limits.", evidenceIds: [], code: "CONTEXT_UNAVAILABLE",
      }]);
      else {
        const agents = routeAgents(packet);
        const checks = await this.orchestrator.run(packet, agents);
        result = aggregateChecks(gate, packet, agents, checks);
      }
    }
    const audit = {
      validatorVersion: VERSION, modelId: this.client.modelId.slice(0, 200), evaluatedAt: new Date().toISOString(),
      evaluatedAgainstVersion: a.story.currentVersion, evaluatedAgainstStoryRevision: a.story.storyRevision,
      ...(packet ? { packetHash: packetHash(packet) } : {}),
    };
    return this.repository.transaction(storyId, draft => {
      const current = draft.deltas.find(value => value.id === d.id);
      invariant(current && !current.committedVersionId, "ALREADY_COMMITTED", "Delta committed during validation; result discarded", 409);
      // A newer validation or human decision must not be overwritten by an older request.
      invariant(inputFingerprint(draft) === fingerprint, "VALIDATION_STALE", "Validation inputs changed; run validation again", 409);
      current.validatorResult = validatorResultSchema.parse({ ...result, ...audit });
      return current.validatorResult;
    });
  }
}
