import type { StateDelta } from "../../domain/state";
import type { SemanticAgent, ValidationCheck } from "../../domain/validation";
import type { ValidationPacket } from "./context";
import type { GateResult } from "./deterministic";

export type ValidatorResult = NonNullable<StateDelta["validatorResult"]>;
export function impactPolicy(packet: ValidationPacket): { risk: "LOW" | "MEDIUM" | "HIGH"; review: boolean } {
  const d = packet.candidateDelta;
  if (d.operation === "NO_CHANGE") return { risk: "LOW", review: false };
  if (d.sourceKind !== "story_event") return { risk: "HIGH", review: true };
  const current = packet.currentStateSlice[d.targetType].find(row => row.id === d.targetId);
  const after = (d.fieldPath === "$" ? d.after : { ...current, [d.fieldPath]: d.after }) as Record<string, unknown>;
  if (d.targetType === "knowledge")
    return { risk: after.stance === "knows" || (after.basis as { correction?: unknown })?.correction ? "HIGH" : "MEDIUM", review: true };
  if (d.targetType === "worldTruth" || d.targetType === "relationships" ||
      (d.targetType === "items" && (d.fieldPath === "owner" || d.fieldPath === "$")) ||
      (d.targetType === "plotThreads" && after.status === "resolved"))
    return { risk: "HIGH", review: true };
  return { risk: d.targetType === "plotThreads" ? "MEDIUM" : "LOW", review: false };
}

export function aggregateChecks(gate: GateResult, packet: ValidationPacket | null, required: SemanticAgent[], checks: ValidationCheck[]): ValidatorResult {
  const all = [gate.check, ...checks];
  if (gate.terminal) return {
    status: gate.terminal, risk: gate.terminal === "conflict" ? "CONFLICT" : "HIGH",
    recommendation: gate.terminal === "conflict" ? "CONFLICT" : "REJECT", reason: gate.check.reason, checks: all,
  };
  const policy = packet ? impactPolicy(packet) : { risk: "HIGH" as const, review: true };
  const complete = packet && required.length > 0 && required.every(agent =>
    checks.filter(check => check.agent === agent).length === 1 &&
    checks.find(check => check.agent === agent)?.verdict === "SUPPORTED");
  const review = !complete || policy.review || packet?.provenance.retrievalTruncated ||
    checks.some(check => check.verdict !== "SUPPORTED" || !required.includes(check.agent as SemanticAgent));
  return {
    status: review ? "needs_review" : "passed",
    recommendation: review ? "NEEDS_REVIEW" : "AUTO_ACCEPT_ELIGIBLE",
    risk: review && policy.risk === "LOW" ? "MEDIUM" : policy.risk,
    reason: review ? "Human review required by semantic checks, context completeness or impact policy." : "All required checks support this low-impact candidate; an explicit decision is still required.",
    checks: all,
  };
}
