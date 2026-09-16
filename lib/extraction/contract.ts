import { z } from "zod";
import { createHash } from "node:crypto";

const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

const localKeySchema = z.string().trim().min(1).max(80).regex(/^[A-Za-z][A-Za-z0-9_-]*$/);
export const entityRefSchema = z.string().trim().min(1).max(120);
const shortTextSchema = z.string().trim().min(1).max(300);

export const supportKindSchema = z.enum([
  "direct_observation",
  "direct_disclosure",
  "credential_inspection",
  "reported_claim",
  "documentary_evidence",
  "inference",
]);
export const effectKindSchema = z.enum([
  "character_location",
  "item_holder",
  "item_owner",
  "item_custodian",
  "item_condition",
  "knowledge_state",
  "world_truth_status",
  "plot_thread_status",
  "relationship_value",
]);
export const EFFECT_KINDS = effectKindSchema.options;

export const evidenceProposalSchema = z.strictObject({
  key: localKeySchema,
  quote: z.string().min(1).max(4000),
  occurrence: z.number().int().nonnegative(),
  speakerRef: entityRefSchema.nullable(),
});
export const eventGroupSchema = z.strictObject({
  key: localKeySchema,
  kind: z.enum([
    "movement",
    "transfer",
    "disclosure",
    "observation",
    "document_discovery",
    "state_revelation",
    "plot_revelation",
    "relationship_action",
  ]),
  participantRefs: z.array(entityRefSchema).max(24),
  evidenceKeys: z.array(localKeySchema).min(1).max(24),
}).superRefine((event, context) => {
  if (new Set(event.participantRefs).size !== event.participantRefs.length)
    context.addIssue({ code: "custom", path: ["participantRefs"], message: "Event participantRefs must be unique" });
  if (new Set(event.evidenceKeys).size !== event.evidenceKeys.length)
    context.addIssue({ code: "custom", path: ["evidenceKeys"], message: "Event evidenceKeys must be unique" });
});
export const unresolvedMentionSchema = z.strictObject({
  mention: z.string().trim().min(1).max(200),
  quote: z.string().min(1).max(4000),
  occurrence: z.number().int().nonnegative(),
  reason: shortTextSchema,
});

export const locationAfterSchema = z.strictObject({
  value: z.string().trim().min(1).max(200).nullable(),
  status: z.enum(["resolved", "unresolved"]),
  lastConfirmedValue: z.string().trim().min(1).max(200).nullable(),
}).superRefine((value, context) => {
  if (value.status === "resolved" && (value.value === null || value.lastConfirmedValue !== value.value))
    context.addIssue({ code: "custom", message: "Resolved location requires an equal value and lastConfirmedValue" });
  if (value.status === "unresolved" && value.value !== null)
    context.addIssue({ code: "custom", message: "Unresolved location requires value=null" });
});
export const epistemicRefSchema = z.strictObject({
  valueRef: entityRefSchema.nullable(),
  status: z.enum(["resolved", "unresolved"]),
  lastConfirmedValueRef: entityRefSchema.nullable(),
}).superRefine((value, context) => {
  if (value.status === "resolved" && (value.valueRef === null || value.lastConfirmedValueRef !== value.valueRef))
    context.addIssue({ code: "custom", message: "Resolved reference requires an equal valueRef and lastConfirmedValueRef" });
  if (value.status === "unresolved" && value.valueRef !== null)
    context.addIssue({ code: "custom", message: "Unresolved reference requires valueRef=null" });
});
export const knowledgeAfterSchema = z.strictObject({
  stance: z.enum(["unaware", "suspects", "believes", "knows"]),
  believedValue: z.boolean().nullable(),
}).superRefine((value, context) => {
  if (value.stance === "unaware" && value.believedValue !== null)
    context.addIssue({ code: "custom", message: "Unaware requires believedValue=null" });
  if (["believes", "knows"].includes(value.stance) && value.believedValue === null)
    context.addIssue({ code: "custom", message: "Believes and knows require a boolean believedValue" });
  if (value.stance === "suspects" && value.believedValue !== null)
    context.addIssue({ code: "custom", message: "Suspects uses believedValue=null in Extraction V0.1" });
});
export const plotAfterSchema = z.strictObject({
  status: z.enum(["open", "progressing", "resolved"]),
  resolution: z.string().trim().min(1).max(2000).nullable(),
  resolutionAssessment: z.enum(["direct_answer", "strong_inference"]).nullable(),
}).superRefine((value, context) => {
  if (value.status === "resolved" && (value.resolution === null || value.resolutionAssessment === null))
    context.addIssue({ code: "custom", message: "Resolved plot requires resolution and assessment" });
  if (value.status !== "resolved" && (value.resolution !== null || value.resolutionAssessment !== null))
    context.addIssue({ code: "custom", message: "Only resolved plots may include resolution details" });
});

const commonEffect = {
  eventKey: localKeySchema,
  evidenceKeys: z.array(localKeySchema).min(1).max(24),
  supportKinds: z.array(supportKindSchema).min(1).max(8),
  supportSummary: shortTextSchema,
  confidence: z.number().min(0).max(1),
};
export const characterLocationEffectSchema = z.strictObject({
  ...commonEffect, kind: z.literal("character_location"), characterRef: entityRefSchema, after: locationAfterSchema,
});
const itemReferenceEffect = { ...commonEffect, itemRef: entityRefSchema, after: epistemicRefSchema };
export const itemHolderEffectSchema = z.strictObject({ ...itemReferenceEffect, kind: z.literal("item_holder") });
export const itemOwnerEffectSchema = z.strictObject({ ...itemReferenceEffect, kind: z.literal("item_owner") });
export const itemCustodianEffectSchema = z.strictObject({
  ...commonEffect, kind: z.literal("item_custodian"), itemRef: entityRefSchema, after: epistemicRefSchema.nullable(),
});
export const itemConditionEffectSchema = z.strictObject({
  ...commonEffect,
  kind: z.literal("item_condition"),
  itemRef: entityRefSchema,
  condition: z.string().trim().min(1).max(120).refine(value => !/^(unknown|unresolved)$/iu.test(value), "Epistemic placeholder is not an item condition"),
});
export const knowledgeStateEffectSchema = z.strictObject({
  ...commonEffect,
  kind: z.literal("knowledge_state"),
  characterRef: entityRefSchema,
  propositionRef: entityRefSchema,
  ...knowledgeAfterSchema.shape,
}).superRefine((value, context) => {
  const checked = knowledgeAfterSchema.safeParse({ stance: value.stance, believedValue: value.believedValue });
  if (!checked.success) for (const issue of checked.error.issues) context.addIssue({ ...issue, path: issue.path });
});
export const worldTruthStatusEffectSchema = z.strictObject({
  ...commonEffect, kind: z.literal("world_truth_status"), propositionRef: entityRefSchema,
  status: z.enum(["unresolved", "confirmed_true", "confirmed_false"]),
});
export const plotThreadStatusEffectSchema = z.strictObject({
  ...commonEffect, kind: z.literal("plot_thread_status"), threadRef: entityRefSchema,
  ...plotAfterSchema.shape,
}).superRefine((value, context) => {
  const checked = plotAfterSchema.safeParse({ status: value.status, resolution: value.resolution, resolutionAssessment: value.resolutionAssessment });
  if (!checked.success) for (const issue of checked.error.issues) context.addIssue({ ...issue, path: issue.path });
});
export const relationshipValueEffectSchema = z.strictObject({
  ...commonEffect, kind: z.literal("relationship_value"), relationshipRef: entityRefSchema,
  value: z.string().trim().min(1).max(200), scope: z.string().trim().min(1).max(300),
});
export const extractionEffectSchema = z.discriminatedUnion("kind", [
  characterLocationEffectSchema,
  itemHolderEffectSchema,
  itemOwnerEffectSchema,
  itemCustodianEffectSchema,
  itemConditionEffectSchema,
  knowledgeStateEffectSchema,
  worldTruthStatusEffectSchema,
  plotThreadStatusEffectSchema,
  relationshipValueEffectSchema,
]).superRefine((effect, context) => {
  if (new Set(effect.evidenceKeys).size !== effect.evidenceKeys.length)
    context.addIssue({ code: "custom", path: ["evidenceKeys"], message: "Effect evidenceKeys must be unique" });
});

export const extractionProposalSchema = z.strictObject({
  evidence: z.array(evidenceProposalSchema).max(64),
  events: z.array(eventGroupSchema).max(32),
  effects: z.array(extractionEffectSchema).max(64),
  unresolvedMentions: z.array(unresolvedMentionSchema).max(32),
}).superRefine((proposal, context) => {
  const unique = (values: string[], path: string) => {
    if (new Set(values).size !== values.length) context.addIssue({ code: "custom", path: [path], message: `${path} keys must be unique` });
  };
  unique(proposal.evidence.map(value => value.key), "evidence");
  unique(proposal.events.map(value => value.key), "events");
  const evidence = new Set(proposal.evidence.map(value => value.key));
  const events = new Map(proposal.events.map(value => [value.key, value]));
  proposal.events.forEach((event, index) => event.evidenceKeys.forEach(key => {
    if (!evidence.has(key)) context.addIssue({ code: "custom", path: ["events", index, "evidenceKeys"], message: "Unknown evidence key" });
  }));
  proposal.effects.forEach((effect, index) => {
    const event = events.get(effect.eventKey);
    if (!event) context.addIssue({ code: "custom", path: ["effects", index, "eventKey"], message: "Unknown event key" });
    effect.evidenceKeys.forEach(key => {
      if (!evidence.has(key)) context.addIssue({ code: "custom", path: ["effects", index, "evidenceKeys"], message: "Unknown evidence key" });
      else if (event && !event.evidenceKeys.includes(key))
        context.addIssue({ code: "custom", path: ["effects", index, "evidenceKeys"], message: "Effect evidence must belong to its referenced event" });
    });
  });
});

export type EvidenceProposal = z.infer<typeof evidenceProposalSchema>;
export type EventGroup = z.infer<typeof eventGroupSchema>;
export type ExtractionEffect = z.infer<typeof extractionEffectSchema>;
export type ExtractionProposal = z.infer<typeof extractionProposalSchema>;

export const extractionContractSemanticInvariants = deepFreeze({
  version: "extraction-contract-semantic-invariants/v0.1",
  uniqueness: {
    evidenceProposalKeys: "UNIQUE_WITHIN_PROPOSAL",
    eventKeys: "UNIQUE_WITHIN_PROPOSAL",
    eventParticipantRefs: "UNIQUE_WITHIN_EVENT_GROUP",
    eventEvidenceKeys: "UNIQUE_WITHIN_EVENT_GROUP",
    effectEvidenceKeys: "UNIQUE_WITHIN_EFFECT",
  },
  referenceIntegrity: {
    eventEvidenceKeys: "MUST_REFERENCE_DECLARED_EVIDENCE",
    effectEventKey: "MUST_REFERENCE_DECLARED_EVENT_GROUP",
    effectEvidenceKeys: "MUST_REFERENCE_DECLARED_EVIDENCE",
    effectEvidenceOwnership: "MUST_BE_SUBSET_OF_REFERENCED_EVENT_GROUP_EVIDENCE_KEYS",
  },
  crossFieldSemantics: {
    resolvedLocation: "VALUE_REQUIRED_AND_LAST_CONFIRMED_VALUE_MUST_MATCH",
    unresolvedLocation: "VALUE_MUST_BE_NULL",
    resolvedEpistemicRef: "VALUE_REF_REQUIRED_AND_LAST_CONFIRMED_VALUE_REF_MUST_MATCH",
    unresolvedEpistemicRef: "VALUE_REF_MUST_BE_NULL",
    unaware: "BELIEVED_VALUE_MUST_BE_NULL",
    suspects: "BELIEVED_VALUE_MUST_BE_NULL_IN_EXTRACTION_V0_1",
    believesAndKnows: "BELIEVED_VALUE_MUST_BE_BOOLEAN",
    resolvedPlot: "RESOLUTION_AND_ASSESSMENT_REQUIRED",
    nonResolvedPlot: "RESOLUTION_AND_ASSESSMENT_MUST_BE_NULL",
    itemCustodianNull: "NO_CURRENT_ASSERTION_DISTINCT_FROM_EPISTEMIC_UNRESOLVED",
  },
});

export const extractionContractFingerprint = deepFreeze({
  proposal: z.toJSONSchema(extractionProposalSchema),
  effects: z.toJSONSchema(extractionEffectSchema),
  evidence: z.toJSONSchema(evidenceProposalSchema),
  events: z.toJSONSchema(eventGroupSchema),
  unresolvedMentions: z.toJSONSchema(unresolvedMentionSchema),
  supportKinds: [...supportKindSchema.options],
  semanticInvariants: extractionContractSemanticInvariants,
});

export const extractionContractHash = digest(extractionContractFingerprint);
