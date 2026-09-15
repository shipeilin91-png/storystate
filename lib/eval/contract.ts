import { createHash } from "node:crypto";
import type { StateDelta, StoryAggregate } from "../domain/state";
import type { SemanticCheckResult } from "../domain/validation";
import type { ValidationPacket } from "../server/validator/context";

export type Verdict = SemanticCheckResult["verdict"];
export type Routing = NonNullable<StateDelta["validatorResult"]>["recommendation"];
export type Group = "control" | "evidence" | "knowledge" | "temporal";
export type CaseMetadata = {
  caseId: string; set: "anchor" | "holdout"; group: Group; description: string;
  goldSemanticVerdict: Verdict; goldFinalRouting: Routing; rationale: string;
  stabilitySelected: boolean; fixtureReference: string;
};
export type EvidenceAudit = {
  fullEvidenceIds: string[]; removedEvidenceIds: string[]; removedDecisiveEvidenceIds: string[];
  remainingEvidenceIds: string[]; explanation: string;
};
export type BoundCase = {
  metadata: CaseMetadata; aggregate: StoryAggregate; delta: StateDelta;
  packet: ValidationPacket; fullPacket: ValidationPacket; ablation: EvidenceAudit | null;
};
export function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
export function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
export function aggregateSemantic(verdicts: readonly Verdict[]): Verdict {
  if (verdicts.includes("UNSUPPORTED")) return "UNSUPPORTED";
  if (!verdicts.length || verdicts.includes("UNCERTAIN")) return "UNCERTAIN";
  return "SUPPORTED";
}
