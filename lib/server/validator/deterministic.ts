import { ZodError } from "zod";
import { DomainError, invariant } from "../../domain/errors";
import { applyDelta, equal, rows, validateCanonical, validateDelta } from "../../domain/governance";
import { deltaInputSchema, type StateDelta, type StoryAggregate } from "../../domain/state";
import type { ValidationCheck } from "../../domain/validation";

export type GateResult = { check: ValidationCheck; terminal: "failed" | "conflict" | null };
function changedFields(delta: StateDelta): Map<string, unknown> {
  if (delta.fieldPath !== "$") return new Map([[delta.fieldPath, delta.after]]);
  const before = (delta.before ?? {}) as Record<string, unknown>;
  const after = delta.after as Record<string, unknown>;
  return new Map(Object.entries(after).filter(([field, value]) => !equal(before[field], value)));
}
function incompatibleEffects(candidate: StateDelta, other: StateDelta): boolean {
  const left = changedFields(candidate), right = changedFields(other);
  // Retiring an object cannot coexist with a mutation that expects it to remain active.
  if (left.has("active") !== right.has("active") && (left.get("active") === false || right.get("active") === false)) return true;
  return [...left].some(([field, value]) => right.has(field) && !equal(value, right.get(field)));
}
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
    // Check the candidate's own contract first; a bad reference remains REJECT,
    // even if a different valid proposal happens to be pending for the same path.
    const draft = structuredClone(aggregate);
    applyDelta(draft, { ...structuredClone(delta), decision: "accepted", committedVersionId: null });
    validateCanonical(draft.state);
    const competing = aggregate.deltas.some(other =>
      other.id !== delta.id && !other.committedVersionId && ["accepted", "needs_review"].includes(other.decision) &&
      other.operation !== "NO_CHANGE" && delta.operation !== "NO_CHANGE" &&
      other.targetType === delta.targetType && other.targetId === delta.targetId &&
      incompatibleEffects(delta, other));
    invariant(!competing, "COMPETING_DELTA", "A pending or accepted mutation conflicts with this target", 409);
    return { terminal: null, check: { agent: "deterministic", verdict: "SUPPORTED", reason: "Contract, before-state and canonical reference checks passed.", evidenceIds: [], code: "CONTRACT_VALID" } };
  } catch (error) {
    if (!(error instanceof DomainError) && !(error instanceof ZodError)) throw error;
    const code = error instanceof DomainError ? error.code : "INVALID_INPUT";
    const conflict = ["STALE_VERSION", "STALE_STATE", "COMPETING_DELTA"].includes(code);
    return {
      terminal: conflict ? "conflict" : "failed",
      check: { agent: "deterministic", verdict: "UNSUPPORTED", reason: error instanceof DomainError ? error.message : "Candidate violates the typed contract.", evidenceIds: [], code },
    };
  }
}
