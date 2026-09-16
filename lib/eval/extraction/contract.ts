import { z } from "zod";
import { canonicalSchema } from "../../domain/state";
import { epistemicRefSchema, knowledgeAfterSchema, locationAfterSchema, plotAfterSchema } from "../../extraction/contract";

const ref = z.string().trim().min(1).max(120);
const evidenceSpanSchema = z.strictObject({ quote: z.string().min(1).max(4000), occurrence: z.number().int().nonnegative() });
const goldCommon = {
  effectId: z.string().regex(/^G-D\d{2}-\d+$/),
  requiredEvidence: z.array(evidenceSpanSchema).min(1).max(8),
  evidenceRequirement: z.enum(["any", "all"]),
  impactClass: z.enum(["low", "high"]),
  compilerExpectation: z.enum(["compile", "compile_with_correction_provenance"]),
};
const forbiddenCommon = {
  forbiddenId: z.string().regex(/^F-D\d{2}-\d+$/),
  boundary: z.enum([
    "direction_vs_arrival",
    "historical_vs_current",
    "holder_vs_owner",
    "reported_vs_underlying",
    "suspicion_vs_belief",
    "belief_vs_knowledge",
    "progress_vs_resolution",
    "bounded_cooperation_vs_trust",
    "unknown_entity_hallucination",
    "soft_interpretation_as_hard_state",
  ]),
};
export const boundarySchema = forbiddenCommon.boundary;

const locationGold = z.strictObject({ ...goldCommon, kind: z.literal("character_location"), semanticTarget: z.strictObject({ characterRef: ref }), expectedAfter: locationAfterSchema });
const itemRefGold = { ...goldCommon, semanticTarget: z.strictObject({ itemRef: ref }), expectedAfter: epistemicRefSchema };
const itemHolderGold = z.strictObject({ ...itemRefGold, kind: z.literal("item_holder") });
const itemOwnerGold = z.strictObject({ ...itemRefGold, kind: z.literal("item_owner") });
const itemCustodianGold = z.strictObject({ ...goldCommon, kind: z.literal("item_custodian"), semanticTarget: z.strictObject({ itemRef: ref }), expectedAfter: epistemicRefSchema.nullable() });
const itemConditionGold = z.strictObject({ ...goldCommon, kind: z.literal("item_condition"), semanticTarget: z.strictObject({ itemRef: ref }), expectedAfter: z.strictObject({ condition: z.string().trim().min(1).max(120) }) });
const knowledgeGold = z.strictObject({ ...goldCommon, kind: z.literal("knowledge_state"), semanticTarget: z.strictObject({ characterRef: ref, propositionRef: ref }), expectedAfter: knowledgeAfterSchema });
const worldGold = z.strictObject({ ...goldCommon, kind: z.literal("world_truth_status"), semanticTarget: z.strictObject({ propositionRef: ref }), expectedAfter: z.strictObject({ status: z.enum(["unresolved", "confirmed_true", "confirmed_false"]) }) });
const plotGold = z.strictObject({ ...goldCommon, kind: z.literal("plot_thread_status"), semanticTarget: z.strictObject({ threadRef: ref }), expectedAfter: plotAfterSchema });
const relationshipGold = z.strictObject({ ...goldCommon, kind: z.literal("relationship_value"), semanticTarget: z.strictObject({ relationshipRef: ref }), expectedAfter: z.strictObject({ value: z.string().trim().min(1).max(200), scope: z.string().trim().min(1).max(300) }) });
export const goldEffectSchema = z.discriminatedUnion("kind", [locationGold, itemHolderGold, itemOwnerGold, itemCustodianGold, itemConditionGold, knowledgeGold, worldGold, plotGold, relationshipGold]);

const locationForbidden = z.strictObject({ ...forbiddenCommon, kind: z.literal("character_location"), semanticTarget: z.strictObject({ characterRef: ref }), forbiddenAfter: locationAfterSchema });
const itemRefForbidden = { ...forbiddenCommon, semanticTarget: z.strictObject({ itemRef: ref }), forbiddenAfter: epistemicRefSchema };
const itemHolderForbidden = z.strictObject({ ...itemRefForbidden, kind: z.literal("item_holder") });
const itemOwnerForbidden = z.strictObject({ ...itemRefForbidden, kind: z.literal("item_owner") });
const itemCustodianForbidden = z.strictObject({ ...forbiddenCommon, kind: z.literal("item_custodian"), semanticTarget: z.strictObject({ itemRef: ref }), forbiddenAfter: epistemicRefSchema.nullable() });
const itemConditionForbidden = z.strictObject({ ...forbiddenCommon, kind: z.literal("item_condition"), semanticTarget: z.strictObject({ itemRef: ref }), forbiddenAfter: z.strictObject({ condition: z.string().trim().min(1).max(120) }) });
const knowledgeForbidden = z.strictObject({ ...forbiddenCommon, kind: z.literal("knowledge_state"), semanticTarget: z.strictObject({ characterRef: ref, propositionRef: ref }), forbiddenAfter: knowledgeAfterSchema });
const worldForbidden = z.strictObject({ ...forbiddenCommon, kind: z.literal("world_truth_status"), semanticTarget: z.strictObject({ propositionRef: ref }), forbiddenAfter: z.strictObject({ status: z.enum(["unresolved", "confirmed_true", "confirmed_false"]) }) });
const plotForbidden = z.strictObject({ ...forbiddenCommon, kind: z.literal("plot_thread_status"), semanticTarget: z.strictObject({ threadRef: ref }), forbiddenAfter: plotAfterSchema });
const relationshipForbidden = z.strictObject({ ...forbiddenCommon, kind: z.literal("relationship_value"), semanticTarget: z.strictObject({ relationshipRef: ref }), forbiddenAfter: z.strictObject({ value: z.string().trim().min(1).max(200), scope: z.string().trim().min(1).max(300) }) });
export const forbiddenEffectSchema = z.discriminatedUnion("kind", [locationForbidden, itemHolderForbidden, itemOwnerForbidden, itemCustodianForbidden, itemConditionForbidden, knowledgeForbidden, worldForbidden, plotForbidden, relationshipForbidden]);

export const aliasEntrySchema = z.strictObject({
  alias: ref,
  id: z.uuid(),
  kind: z.enum(["character", "item", "thread", "proposition", "relationship"]),
  labels: z.array(z.string().trim().min(1).max(120)).min(1),
});
export const extractionCaseSchema = z.strictObject({
  caseId: z.string().regex(/^D(?:0[1-9]|1[0-4])$/),
  title: z.string().trim().min(1).max(120),
  passage: z.string().min(1).max(10000),
  baseState: canonicalSchema,
  goldEffects: z.array(goldEffectSchema),
  forbiddenEffects: z.array(forbiddenEffectSchema),
  metadata: z.strictObject({
    negative: z.boolean(),
    boundaryTags: z.array(boundarySchema),
    minimalPairIds: z.array(z.string().regex(/^MP\d{2}$/)),
  }),
});
export const minimalPairSchema = z.strictObject({
  pairId: z.string().regex(/^MP\d{2}$/),
  caseIds: z.tuple([z.string().regex(/^D\d{2}$/), z.string().regex(/^D\d{2}$/)]),
  boundary: z.string().trim().min(1).max(200),
});

export type GoldEffect = z.infer<typeof goldEffectSchema>;
export type ForbiddenEffect = z.infer<typeof forbiddenEffectSchema>;
export type ExtractionDevelopmentCase = z.infer<typeof extractionCaseSchema>;
export type AliasEntry = z.infer<typeof aliasEntrySchema>;
