import { ZodError } from "zod";
import { DomainError, invariant } from "../../domain/errors";
import { applyDelta, equal, rows, validateCanonical, validateDelta } from "../../domain/governance";
import { deltaInputSchema, type StateDelta, type StoryAggregate } from "../../domain/state";
import type { ValidationCheck } from "../../domain/validation";

export type GateResult = { check: ValidationCheck; terminal: "failed" | "conflict" | null };
export function deterministicGate(aggregate: StoryAggregate, delta: StateDelta, expectedVersion: number): GateResult {
  try {
    // Project the public input fields; audit fields are not DeltaInput.
    const input = Object.fromEntries(Object.keys(deltaInputSchema.shape).map(key => [key, delta[key as keyof StateDelta]]));
    deltaInputSchema.parse(input);
    validateDelta(aggregate, delta);
    validateCanonical(aggregate.state);
    invariant(aggregate.story.currentVersion === expectedVersion, "STALE_VERSION", "Canonical version changed", 409);
    const current = rows(aggregate.state, delta.targetType).find(row => row.id === delta.targetId);
    invariant(delta.operation === "CREATE" || current?.active, "TARGET_NOT_ACTIVE", "Existing active canonical target required");
    const before = delta.fieldPath === "$" ? current ?? null : current ? (current as unknown as Record<string, unknown>)[delta.fieldPath] : undefined;
    invariant(equal(before, delta.before), "STALE_STATE", "Canonical before value changed", 409);
    const competing = aggregate.deltas.some(other =>
      other.id !== delta.id && !other.committedVersionId && other.decision === "accepted" &&
      other.operation !== "NO_CHANGE" && delta.operation !== "NO_CHANGE" &&
      other.targetType === delta.targetType && other.targetId === delta.targetId &&
      (other.fieldPath === "$" || delta.fieldPath === "$" || other.fieldPath === delta.fieldPath) &&
      !equal(other.after, delta.after));
    invariant(!competing, "COMPETING_ACCEPTED_DELTA", "An accepted mutation conflicts with this target", 409);
    // Dry-run only: existing apply/contract logic runs on a private clone, never repository state.
    const draft = structuredClone(aggregate);
    applyDelta(draft, { ...structuredClone(delta), decision: "accepted", committedVersionId: null });
    validateCanonical(draft.state);
    return { terminal: null, check: { agent: "deterministic", verdict: "SUPPORTED", reason: "Contract, before-state and canonical reference checks passed.", evidenceIds: [], code: "CONTRACT_VALID" } };
  } catch (error) {
    if (!(error instanceof DomainError) && !(error instanceof ZodError)) throw error;
    const code = error instanceof DomainError ? error.code : "INVALID_INPUT";
    const conflict = ["STALE_VERSION", "STALE_STATE", "COMPETING_ACCEPTED_DELTA"].includes(code);
    return {
      terminal: conflict ? "conflict" : "failed",
      check: { agent: "deterministic", verdict: "UNSUPPORTED", reason: error instanceof DomainError ? error.message : "Candidate violates the typed contract.", evidenceIds: [], code },
    };
  }
}
