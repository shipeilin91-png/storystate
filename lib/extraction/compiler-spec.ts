import { createHash } from "node:crypto";
import type { ExtractionEffect } from "./contract";
import { EFFECT_KINDS, supportKindSchema } from "./contract";

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export const EXTRACTION_TEXT_NORMALIZATION_VERSION = "extraction-text-normalization/v0.1";

export const compilerSlotMapping = deepFreeze({
  character_location: { refFields: ["characterRef"], slot: "location", targetType: "characters", fieldStrategy: "location" },
  item_holder: { refFields: ["itemRef"], slot: "holder", targetType: "items", fieldStrategy: "holder" },
  item_owner: { refFields: ["itemRef"], slot: "owner", targetType: "items", fieldStrategy: "owner" },
  item_custodian: { refFields: ["itemRef"], slot: "custodian", targetType: "items", fieldStrategy: "custodian" },
  item_condition: { refFields: ["itemRef"], slot: "condition", targetType: "items", fieldStrategy: "condition" },
  knowledge_state: { refFields: ["characterRef", "propositionRef"], slot: "knowledge", targetType: "knowledge", fieldStrategy: "whole_record" },
  world_truth_status: { refFields: ["propositionRef"], slot: "world_truth", targetType: "worldTruth", fieldStrategy: "status" },
  plot_thread_status: { refFields: ["threadRef"], slot: "plot_thread", targetType: "plotThreads", fieldStrategy: "whole_record" },
  relationship_value: { refFields: ["relationshipRef"], slot: "relationship", targetType: "relationships", fieldStrategy: "whole_record" },
} satisfies Record<(typeof EFFECT_KINDS)[number], { refFields: readonly string[]; slot: string; targetType: string; fieldStrategy: string }>);

export const compilerCreatePolicy = deepFreeze({
  canonicalEntities: { Character: false, Item: false, Proposition: false, PlotThread: false, Relationship: false },
  assertionRowsOverKnownEntities: { Knowledge: true, WorldTruth: true },
});

export const compilerEffectValueSemantics = deepFreeze({
  item_custodian: {
    null: "NO_CURRENT_CUSTODIAN_ASSERTION",
    epistemic_unresolved: "CUSTODIAN_ASSERTION_PRESENT_WITH_UNRESOLVED_CURRENT_VALUE",
  },
});

export const compilerRiskRules = deepFreeze({
  item_owner: ["ownership_uncertain"],
  knowledge_knows: ["conflict_prone"],
  knowledge_correction: ["conflict_prone"],
  world_truth_confirmed: ["conflict_prone"],
  plot_resolved: ["conflict_prone"],
  default: [],
  explicit_operational_relationship_adds_soft_signal: false,
});

export const issueLevels = ["RUN_FATAL", "EFFECT_REJECTED", "WARNING"] as const;
export const extractionIssueRegistry = deepFreeze({
  OUTPUT_SCHEMA_INVALID: "RUN_FATAL",
  STATE_STALE: "RUN_FATAL",
  SOURCE_STALE: "RUN_FATAL",
  UNKNOWN_ENTITY_REF: "EFFECT_REJECTED",
  EVIDENCE_NOT_FOUND: "EFFECT_REJECTED",
  EVIDENCE_OCCURRENCE_INVALID: "EFFECT_REJECTED",
  EVENT_GROUP_INVALID: "EFFECT_REJECTED",
  UNSUPPORTED_ENTITY_CREATE: "EFFECT_REJECTED",
  CONFLICTING_EFFECTS_SAME_SLOT: "EFFECT_REJECTED",
  KNOWS_INFERENCE_ONLY: "EFFECT_REJECTED",
  WORLD_TRUTH_REVERSAL_REQUIRES_REVIEW: "EFFECT_REJECTED",
  PLOT_RESOLUTION_INSUFFICIENT: "EFFECT_REJECTED",
  PLOT_REVERSAL_REQUIRES_HUMAN: "EFFECT_REJECTED",
  PSYCHOLOGICAL_RELATIONSHIP_REQUIRES_HUMAN: "EFFECT_REJECTED",
  GOVERNANCE_REJECTED: "EFFECT_REJECTED",
  DUPLICATE_EFFECT: "WARNING",
  REDUNDANT_EFFECT: "WARNING",
} as const);

export const compilerSafetyTransitions = deepFreeze({
  knowledge: {
    inferenceOnlyKnows: "KNOWS_INFERENCE_ONLY",
    correctionProvenanceSource: "CURRENT_CANONICAL_STATE",
  },
  worldTruth: {
    allowed: ["unresolved->confirmed_true", "unresolved->confirmed_false"],
    rejected: ["confirmed_true->confirmed_false", "confirmed_false->confirmed_true", "confirmed_true->unresolved", "confirmed_false->unresolved"],
    issue: "WORLD_TRUTH_REVERSAL_REQUIRES_REVIEW",
  },
  plot: {
    allowed: ["open->progressing", "open->resolved:direct_answer", "progressing->resolved:direct_answer"],
    insufficientIssue: "PLOT_RESOLUTION_INSUFFICIENT",
    reversalIssue: "PLOT_REVERSAL_REQUIRES_HUMAN",
  },
  psychologicalRelationshipIssue: "PSYCHOLOGICAL_RELATIONSHIP_REQUIRES_HUMAN",
  noOpIssue: "REDUNDANT_EFFECT",
});

export const extractionRunPolicy = deepFreeze({
  phases: ["MODEL_CALL", "COMPILE_IN_MEMORY", "FRESHNESS_RECHECK", "ATOMIC_TRANSACTION"],
  staleInputs: ["CANONICAL_STATE_VERSION", "STORY_REVISION", "SOURCE_REVISION"],
  staleResult: "EXTRACTION_STALE",
  partialPersistenceAllowed: false,
  persistedUnits: ["Evidence", "Event", "CandidateDelta"],
  persistEventWithoutCompiledEffects: false,
});

export const compilerBasisRules = deepFreeze({
  acceptedSupportKinds: supportKindSchema.options,
  aiForbiddenSupportKinds: ["human_confirmation", "restore"],
  confidenceUse: "TELEMETRY_ONLY",
  beforeStateSource: "CURRENT_CANONICAL_STATE",
});

export function effectSlotIdentity(effect: ExtractionEffect): string {
  switch (effect.kind) {
    case "character_location": return `${effect.kind}/${effect.characterRef}/location`;
    case "item_holder": return `${effect.kind}/${effect.itemRef}/holder`;
    case "item_owner": return `${effect.kind}/${effect.itemRef}/owner`;
    case "item_custodian": return `${effect.kind}/${effect.itemRef}/custodian`;
    case "item_condition": return `${effect.kind}/${effect.itemRef}/condition`;
    case "knowledge_state": return `${effect.kind}/${effect.characterRef}/${effect.propositionRef}`;
    case "world_truth_status": return `${effect.kind}/${effect.propositionRef}`;
    case "plot_thread_status": return `${effect.kind}/${effect.threadRef}`;
    case "relationship_value": return `${effect.kind}/${effect.relationshipRef}`;
  }
}

function semanticPayload(effect: ExtractionEffect): unknown {
  switch (effect.kind) {
    case "character_location": return { kind: effect.kind, characterRef: effect.characterRef, after: effect.after };
    case "item_holder":
    case "item_owner":
    case "item_custodian": return { kind: effect.kind, itemRef: effect.itemRef, after: effect.after };
    case "item_condition": return { kind: effect.kind, itemRef: effect.itemRef, condition: effect.condition };
    case "knowledge_state": return { kind: effect.kind, characterRef: effect.characterRef, propositionRef: effect.propositionRef, stance: effect.stance, believedValue: effect.believedValue };
    case "world_truth_status": return { kind: effect.kind, propositionRef: effect.propositionRef, status: effect.status };
    case "plot_thread_status": return { kind: effect.kind, threadRef: effect.threadRef, status: effect.status, resolution: effect.resolution, resolutionAssessment: effect.resolutionAssessment };
    case "relationship_value": return { kind: effect.kind, relationshipRef: effect.relationshipRef, value: effect.value, scope: effect.scope };
  }
}

export type SameSlotFinding = { effectIndex: number; slot: string; level: "EFFECT_REJECTED" | "WARNING"; code: "CONFLICTING_EFFECTS_SAME_SLOT" | "DUPLICATE_EFFECT" };
export function inspectSameSlotEffects(effects: readonly ExtractionEffect[]): SameSlotFinding[] {
  const first = new Map<string, { payload: string; index: number }>();
  const findings: SameSlotFinding[] = [];
  effects.forEach((effect, effectIndex) => {
    const slot = effectSlotIdentity(effect), payload = JSON.stringify(semanticPayload(effect));
    const prior = first.get(slot);
    if (!prior) first.set(slot, { payload, index: effectIndex });
    else findings.push({ effectIndex, slot, level: prior.payload === payload ? "WARNING" : "EFFECT_REJECTED",
      code: prior.payload === payload ? "DUPLICATE_EFFECT" : "CONFLICTING_EFFECTS_SAME_SLOT" });
  });
  return findings;
}

export const compilerSpecHash = digest({
  effectKinds: EFFECT_KINDS,
  slotMapping: compilerSlotMapping,
  createPolicy: compilerCreatePolicy,
  effectValueSemantics: compilerEffectValueSemantics,
  riskRules: compilerRiskRules,
  basisRules: compilerBasisRules,
  issueRegistry: extractionIssueRegistry,
  safetyTransitions: compilerSafetyTransitions,
  normalizationVersion: EXTRACTION_TEXT_NORMALIZATION_VERSION,
  sameSlotRule: { duplicate: "WARNING:DUPLICATE_EFFECT", conflict: "EFFECT_REJECTED:CONFLICTING_EFFECTS_SAME_SLOT" },
  runPolicy: extractionRunPolicy,
});
