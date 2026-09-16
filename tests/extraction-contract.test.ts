import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { EFFECT_KINDS, extractionContractFingerprint, extractionContractHash, extractionContractSemanticInvariants, extractionProposalSchema, type ExtractionEffect } from "../lib/extraction/contract";
import { compilerBasisRules, compilerCreatePolicy, compilerEffectValueSemantics, compilerRiskRules, compilerSafetyTransitions, compilerSpecHash, compilerSlotMapping, effectSlotIdentity, extractionIssueRegistry, extractionRunPolicy, inspectSameSlotEffects } from "../lib/extraction/compiler-spec";
import { forbiddenEffectSchema, goldEffectSchema } from "../lib/eval/extraction/contract";

const common = { eventKey: "EV", evidenceKeys: ["E"], supportKinds: ["direct_observation"] as ExtractionEffect["supportKinds"], supportSummary: "Direct fixture support.", confidence: 0.5 };
const effects: ExtractionEffect[] = [
  { ...common, kind: "character_location", characterRef: "CHAR_JI", after: { value: "Control Room", status: "resolved", lastConfirmedValue: "Control Room" } },
  { ...common, kind: "item_holder", itemRef: "ITEM_RECORDER", after: { valueRef: "CHAR_CHENG", status: "resolved", lastConfirmedValueRef: "CHAR_CHENG" } },
  { ...common, kind: "item_owner", itemRef: "ITEM_RECORDER", after: { valueRef: "CHAR_CHENG", status: "resolved", lastConfirmedValueRef: "CHAR_CHENG" } },
  { ...common, kind: "item_custodian", itemRef: "ITEM_RECORDER", after: { valueRef: null, status: "unresolved", lastConfirmedValueRef: "CHAR_JI" } },
  { ...common, kind: "item_condition", itemRef: "ITEM_RECORDER", condition: "damaged" },
  { ...common, kind: "knowledge_state", characterRef: "CHAR_JI", propositionRef: "PROP_SHORT", stance: "suspects", believedValue: null },
  { ...common, kind: "world_truth_status", propositionRef: "PROP_SHORT", status: "confirmed_false" },
  { ...common, kind: "plot_thread_status", threadRef: "THREAD_POWER", status: "progressing", resolution: null, resolutionAssessment: null },
  { ...common, kind: "relationship_value", relationshipRef: "REL_COOP", value: "active", scope: "current rescue" },
];
const proposal = { evidence: [{ key: "E", quote: "exact", occurrence: 0, speakerRef: null }], events: [{ key: "EV", kind: "observation", participantRefs: ["CHAR_JI"], evidenceKeys: ["E"] }], effects, unresolvedMentions: [] };

test("strict ExtractionProposal parses exactly nine semantic effect kinds", () => {
  const parsed = extractionProposalSchema.parse(proposal);
  assert.equal(parsed.effects.length, 9);
  assert.deepEqual(parsed.effects.map(effect => effect.kind), EFFECT_KINDS);
  assert.equal(new Set(EFFECT_KINDS).size, 9);
  assert.throws(() => extractionProposalSchema.parse({ ...proposal, extra: true }));
  assert.throws(() => extractionProposalSchema.parse({ ...proposal, effects: [{ ...effects[0], extra: true }] }));
});

test("model-facing schema rejects every formal StateDelta and database control field", () => {
  for (const field of ["before", "targetType", "targetId", "fieldPath", "operation", "sourceKind", "sourceEventId", "id", "deltaId", "eventId", "stateVersion", "validatorResult", "risk", "recommendation", "decision", "committedVersionId", "proposedBy"])
    assert.throws(() => extractionProposalSchema.parse({ ...proposal, effects: [{ ...effects[0], [field]: "forbidden" }] }), field);
  assert.throws(() => extractionProposalSchema.parse({ ...proposal, evidence: [{ ...proposal.evidence[0], start: 0 }] }));
  assert.throws(() => extractionProposalSchema.parse({ ...proposal, events: [{ ...proposal.events[0], sourceRevisionId: "forbidden" }] }));
  assert.ok(!EFFECT_KINDS.some(kind => kind.includes("create")));
});

test("epistemic, knowledge, plot, condition, support-kind and local reference contracts fail closed", () => {
  const invalidEffects = [
    { ...effects[0], after: { value: null, status: "resolved", lastConfirmedValue: null } },
    { ...effects[1], after: { valueRef: "CHAR_CHENG", status: "unresolved", lastConfirmedValueRef: "CHAR_CHENG" } },
    { ...effects[5], stance: "unaware", believedValue: true },
    { ...effects[5], stance: "knows", believedValue: null },
    { ...effects[5], stance: "suspects", believedValue: true },
    { ...effects[7], status: "resolved", resolution: null, resolutionAssessment: null },
    { ...effects[7], status: "progressing", resolution: "answer", resolutionAssessment: "direct_answer" },
    { ...effects[4], condition: "unknown" },
    { ...effects[0], supportKinds: ["human_confirmation"] },
    { ...effects[0], supportKinds: ["restore"] },
  ];
  for (const effect of invalidEffects) assert.throws(() => extractionProposalSchema.parse({ ...proposal, effects: [effect] }));
  assert.throws(() => extractionProposalSchema.parse({ ...proposal, effects: [{ ...effects[0], eventKey: "MISSING" }] }));
  assert.throws(() => extractionProposalSchema.parse({ ...proposal, effects: [{ ...effects[0], evidenceKeys: ["MISSING"] }] }));
});

test("effects may cite only unique evidence owned by their referenced EventGroup", () => {
  const twoEvidence = [
    { key: "E1", quote: "first", occurrence: 0, speakerRef: null },
    { key: "E2", quote: "second", occurrence: 0, speakerRef: null },
  ];
  const event = { key: "EV1", kind: "observation" as const, participantRefs: ["CHAR_JI"], evidenceKeys: ["E1"] };
  const mismatched = { ...effects[0], eventKey: "EV1", evidenceKeys: ["E2"] };
  assert.throws(() => extractionProposalSchema.parse({ evidence: twoEvidence, events: [event], effects: [mismatched], unresolvedMentions: [] }));
  assert.throws(() => extractionProposalSchema.parse({ ...proposal, events: [{ ...proposal.events[0], evidenceKeys: ["E", "E"] }] }));
  assert.throws(() => extractionProposalSchema.parse({ ...proposal, events: [{ ...proposal.events[0], participantRefs: ["CHAR_JI", "CHAR_JI"] }] }));
  assert.throws(() => extractionProposalSchema.parse({ ...proposal, effects: [{ ...effects[0], evidenceKeys: ["E", "E"] }] }));
});

test("item custodian distinguishes clearing the assertion from an unresolved assertion", () => {
  const cleared = extractionProposalSchema.parse({ ...proposal, effects: [{ ...effects[3], after: null }] }).effects[0];
  const unresolved = extractionProposalSchema.parse({ ...proposal, effects: [effects[3]] }).effects[0];
  assert.equal(cleared.kind, "item_custodian");
  assert.equal(unresolved.kind, "item_custodian");
  if (cleared.kind !== "item_custodian" || unresolved.kind !== "item_custodian") throw new Error("custodian contract drift");
  assert.equal(cleared.after, null);
  assert.deepEqual(unresolved.after, { valueRef: null, status: "unresolved", lastConfirmedValueRef: "CHAR_JI" });
  assert.notDeepEqual(cleared.after, unresolved.after);
  const goldCommon = { effectId: "G-D01-1", kind: "item_custodian", semanticTarget: { itemRef: "ITEM_RECORDER" }, requiredEvidence: [{ quote: "cleared", occurrence: 0 }], evidenceRequirement: "any", impactClass: "low", compilerExpectation: "compile" };
  assert.equal(goldEffectSchema.parse({ ...goldCommon, expectedAfter: null }).expectedAfter, null);
  assert.deepEqual(goldEffectSchema.parse({ ...goldCommon, expectedAfter: unresolved.after }).expectedAfter, unresolved.after);
  assert.equal(forbiddenEffectSchema.parse({ forbiddenId: "F-D01-1", kind: "item_custodian", semanticTarget: { itemRef: "ITEM_RECORDER" }, forbiddenAfter: null, boundary: "unknown_entity_hallucination" }).forbiddenAfter, null);
});

test("item condition rejects epistemic sentinel words while accepting domain values", () => {
  assert.throws(() => extractionProposalSchema.parse({ ...proposal, effects: [{ ...effects[4], condition: "unknown" }] }));
  assert.throws(() => extractionProposalSchema.parse({ ...proposal, effects: [{ ...effects[4], condition: "unresolved" }] }));
  const parsed = extractionProposalSchema.parse({ ...proposal, effects: [{ ...effects[4], condition: "damaged" }] });
  assert.equal(parsed.effects[0].kind, "item_condition");
  if (parsed.effects[0].kind !== "item_condition") throw new Error("item condition contract drift");
  assert.equal(parsed.effects[0].condition, "damaged");
});

test("Compiler specification is declarative, complete and preserves CREATE boundaries", () => {
  assert.deepEqual(Object.keys(compilerSlotMapping), [...EFFECT_KINDS]);
  assert.deepEqual(compilerCreatePolicy.canonicalEntities, { Character: false, Item: false, Proposition: false, PlotThread: false, Relationship: false });
  assert.deepEqual(compilerCreatePolicy.assertionRowsOverKnownEntities, { Knowledge: true, WorldTruth: true });
  assert.equal(Object.keys(extractionIssueRegistry).length, 17);
  assert.equal(extractionIssueRegistry.DUPLICATE_EFFECT, "WARNING");
  assert.equal(extractionIssueRegistry.CONFLICTING_EFFECTS_SAME_SLOT, "EFFECT_REJECTED");
  assert.deepEqual(compilerRiskRules.item_owner, ["ownership_uncertain"]);
  assert.deepEqual(compilerRiskRules.knowledge_knows, ["conflict_prone"]);
  assert.deepEqual(compilerRiskRules.world_truth_confirmed, ["conflict_prone"]);
  assert.equal(compilerRiskRules.explicit_operational_relationship_adds_soft_signal, false);
  assert.equal(compilerBasisRules.confidenceUse, "TELEMETRY_ONLY");
  assert.equal(compilerSafetyTransitions.knowledge.correctionProvenanceSource, "CURRENT_CANONICAL_STATE");
  assert.equal(compilerSafetyTransitions.worldTruth.issue, "WORLD_TRUTH_REVERSAL_REQUIRES_REVIEW");
  assert.equal(compilerSafetyTransitions.plot.insufficientIssue, "PLOT_RESOLUTION_INSUFFICIENT");
  assert.equal(extractionRunPolicy.partialPersistenceAllowed, false);
  assert.equal(extractionRunPolicy.persistEventWithoutCompiledEffects, false);
  assert.equal(compilerEffectValueSemantics.item_custodian.null, "NO_CURRENT_CUSTODIAN_ASSERTION");
  assert.equal(compilerEffectValueSemantics.item_custodian.epistemic_unresolved, "CUSTODIAN_ASSERTION_PRESENT_WITH_UNRESOLVED_CURRENT_VALUE");
  assert.match(extractionContractHash, /^[a-f0-9]{64}$/);
  assert.match(compilerSpecHash, /^[a-f0-9]{64}$/);
});

test("same-slot helper warns on exact duplicates and rejects conflicting effects", () => {
  const holder = effects[1] as Extract<ExtractionEffect, { kind: "item_holder" }>;
  const duplicate: ExtractionEffect = { ...holder, confidence: 0.1, supportSummary: "Different telemetry." };
  const conflict = { ...holder, after: { valueRef: "CHAR_TANG", status: "resolved" as const, lastConfirmedValueRef: "CHAR_TANG" } };
  assert.equal(effectSlotIdentity(holder), "item_holder/ITEM_RECORDER/holder");
  assert.deepEqual(inspectSameSlotEffects([holder, duplicate, conflict]).map(value => [value.level, value.code]), [
    ["WARNING", "DUPLICATE_EFFECT"], ["EFFECT_REJECTED", "CONFLICTING_EFFECTS_SAME_SLOT"],
  ]);
});

test("contract hash explicitly fingerprints frozen cross-field semantic invariants", () => {
  assert.ok(Object.isFrozen(extractionContractSemanticInvariants));
  assert.ok(Object.isFrozen(extractionContractSemanticInvariants.referenceIntegrity));
  assert.equal(extractionContractFingerprint.semanticInvariants, extractionContractSemanticInvariants);
  assert.equal(extractionContractSemanticInvariants.referenceIntegrity.effectEvidenceOwnership, "MUST_BE_SUBSET_OF_REFERENCED_EVENT_GROUP_EVIDENCE_KEYS");
  assert.equal(extractionContractSemanticInvariants.crossFieldSemantics.itemCustodianNull, "NO_CURRENT_ASSERTION_DISTINCT_FROM_EPISTEMIC_UNRESOLVED");
  assert.equal(extractionContractSemanticInvariants.crossFieldSemantics.itemConditionDomainValue, "UNKNOWN_AND_UNRESOLVED_EPISTEMIC_SENTINELS_FORBIDDEN");
  const fingerprintHash = createHash("sha256").update(JSON.stringify(extractionContractFingerprint)).digest("hex");
  assert.equal(extractionContractHash, fingerprintHash);
});
