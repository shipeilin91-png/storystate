import { z } from "zod";

// Formal backend contract. Intentionally independent of lib/mock-story.ts.
export const idSchema = z.uuid();
const text = z.string().trim().min(1).max(20000);
const ids = z.array(idSchema).max(500);
export const stanceSchema = z.enum(["unaware", "suspects", "believes", "knows"]);
export const decisionSchema = z.enum(["accepted", "rejected", "needs_review", "deferred"]);
export const basisSchema = z.strictObject({
  kinds: z.array(z.enum(["direct_observation", "direct_disclosure", "credential_inspection", "reported_claim", "documentary_evidence", "human_confirmation", "inference", "restore"])).min(1),
  note: text,
  correction: z.strictObject({ previousStance: stanceSchema, previousBelievedValue: z.boolean().nullable(), evidenceIds: ids.min(1) }).optional(),
});
export const epistemicSchema = z.strictObject({
  value: text.nullable(), status: z.enum(["resolved", "unresolved"]), lastConfirmedValue: text.nullable(),
}).superRefine((v, c) => {
  if ((v.status === "resolved") !== (v.value !== null) || (v.status === "resolved" && v.lastConfirmedValue !== v.value))
    c.addIssue({ code: "custom", message: "Resolved values must be present and last confirmed; unresolved values must be null" });
  if ([v.value, v.lastConfirmedValue].some(v => v && /^(unknown|unresolved)$/i.test(v)))
    c.addIssue({ code: "custom", message: "Epistemic conditions are not domain values" });
});
const row = { id: idSchema, active: z.boolean() };
export const characterSchema = z.strictObject({ ...row, name: text, role: text, location: epistemicSchema });
const itemConditionSchema = z.string().trim().min(1).max(120).refine(v => !/^(unknown|unresolved)$/i.test(v), "Epistemic status is not an item condition");
export const itemSchema = z.strictObject({ ...row, name: text, owner: epistemicSchema, holder: epistemicSchema, custodian: epistemicSchema.nullable().default(null), condition: itemConditionSchema });
export const plotThreadSchema = z.strictObject({ ...row, title: text, coreQuestion: text, status: z.enum(["open", "progressing", "resolved"]), resolution: text.nullable() });
export const propositionSchema = z.strictObject({ ...row, statement: text, kind: z.enum(["assertion", "reported"]), reportedPropositionId: idSchema.nullable(), reporterId: idSchema.nullable() });
export const worldTruthSchema = z.strictObject({ ...row, propositionId: idSchema, status: z.enum(["confirmed_true", "confirmed_false", "unresolved"]) });
export const knowledgeSchema = z.strictObject({ ...row, characterId: idSchema, propositionId: idSchema, stance: stanceSchema, believedValue: z.boolean().nullable(), basis: basisSchema });
export const relationshipSchema = z.strictObject({ ...row, fromCharacterId: idSchema, toCharacterId: idSchema, category: z.enum(["structural", "explicit_operational", "human_confirmed_psychological"]), predicate: text, value: text, scope: text, basis: basisSchema });
export const targetSchemas = { characters: characterSchema, items: itemSchema, plotThreads: plotThreadSchema, propositions: propositionSchema, worldTruth: worldTruthSchema, knowledge: knowledgeSchema, relationships: relationshipSchema };
export const targetTypeSchema = z.enum(["characters", "items", "plotThreads", "propositions", "worldTruth", "knowledge", "relationships"]);
export type TargetType = z.infer<typeof targetTypeSchema>;
export const canonicalSchema = z.strictObject({ characters: z.array(characterSchema), items: z.array(itemSchema), plotThreads: z.array(plotThreadSchema), propositions: z.array(propositionSchema), worldTruth: z.array(worldTruthSchema), knowledge: z.array(knowledgeSchema), relationships: z.array(relationshipSchema) });
export type CanonicalState = z.infer<typeof canonicalSchema>;
export type CanonicalRow = CanonicalState[TargetType][number];
export const emptyState = (): CanonicalState => ({ characters: [], items: [], plotThreads: [], propositions: [], worldTruth: [], knowledge: [], relationships: [] });
export type Character = z.infer<typeof characterSchema>;
export type Item = z.infer<typeof itemSchema>;
export type PlotThread = z.infer<typeof plotThreadSchema>;
export type Proposition = z.infer<typeof propositionSchema>;
export type WorldTruthState = z.infer<typeof worldTruthSchema>;
export type CharacterKnowledgeState = z.infer<typeof knowledgeSchema>;
export type Relationship = z.infer<typeof relationshipSchema>;
export type Story = { id: string; title: string; currentVersion: number; currentChapter: number | null; storyRevision: number; createdAt: string };
export const sourceDocumentSchema = z.strictObject({ id: idSchema, title: text, sourceOrder: z.number().int().nonnegative(), chapter: z.number().int().nonnegative().nullable() });
export const sourceRevisionSchema = z.strictObject({ id: idSchema, documentId: idSchema, revisionNumber: z.number().int().positive(), content: text, visibility: z.enum(["canonical", "author_only"]) });
export const evidenceSchema = z.strictObject({ id: idSchema, sourceRevisionId: idSchema, quote: text, start: z.number().int().nonnegative(), end: z.number().int().positive(), speakerId: idSchema.nullable() });
export type SourceDocument = z.infer<typeof sourceDocumentSchema>;
export type SourceRevision = z.infer<typeof sourceRevisionSchema>;
export type Evidence = z.infer<typeof evidenceSchema>;
export const eventInputSchema = z.strictObject({ sourceRevisionId: idSchema, sourceOrder: z.number().int().nonnegative(), storyTime: text.nullable(), eventType: text, summary: text, payload: z.record(z.string(), z.json()), participantIds: ids, evidenceIds: ids.min(1) });
export type Event = z.infer<typeof eventInputSchema> & { id: string; createdAt: string };
export const deltaInputSchema = z.strictObject({
  operation: z.enum(["CREATE", "UPDATE", "CLOSE", "RESOLVE", "INVALIDATE", "NO_CHANGE"]), targetType: targetTypeSchema, targetId: idSchema,
  fieldPath: z.string().min(1).max(80), before: z.json(), after: z.json(),
  sourceKind: z.enum(["story_event", "human_correction", "canonical_override", "retcon", "import_migration", "restore"]),
  sourceEventId: idSchema.nullable(), effect: z.strictObject({ id: idSchema, description: text }).nullable(),
  evidenceIds: ids, reason: text, confidence: z.number().min(0).max(1), risk: z.array(z.enum(["conflict_prone", "ownership_uncertain", "soft_signal"])), proposedBy: text,
  basis: basisSchema,
  resolutionSupport: z.strictObject({ coreQuestion: text, answer: text, evidenceIds: ids.min(1), assessment: z.enum(["direct_answer", "strong_inference"]) }).nullable(),
});
export type DeltaInput = z.infer<typeof deltaInputSchema>;
export const validatorResultSchema = z.strictObject({ status: z.enum(["passed", "failed", "conflict", "needs_review"]), recommendation: z.enum(["AUTO_ACCEPT_ELIGIBLE", "NEEDS_REVIEW", "REJECT", "CONFLICT"]), reason: text, risk: z.enum(["LOW", "MEDIUM", "HIGH", "CONFLICT"]) });
export type StateDelta = DeltaInput & { id: string; decision: z.infer<typeof decisionSchema>; validatorResult: z.infer<typeof validatorResultSchema> | null; decisions: { decision: z.infer<typeof decisionSchema>; actor: string; reason: string; createdAt: string }[]; committedVersionId: string | null; createdAt: string };
export type StateVersion = { id: string; versionNumber: number; parentVersionId: string | null; commitKind: "delta_commit" | "restore"; createdAt: string; deltaIds: string[]; snapshot: CanonicalState; restoredFromVersionId: string | null; chapter: number | null; storyRevision: number };
export const annotationSchema = z.strictObject({ id: idSchema, sourceRevisionId: idSchema, targetType: targetTypeSchema, targetId: idSchema, evidenceIds: ids.min(1), content: text, confidence: z.number().min(0).max(1), basis: basisSchema, scope: z.record(z.string(), z.json()).default({}) });
export type DerivedAnnotation = z.infer<typeof annotationSchema> & { createdAt: string; invalidatedAt: string | null; supersededBy: string | null };
export type StoryAggregate = { story: Story; state: CanonicalState; documents: SourceDocument[]; revisions: SourceRevision[]; evidence: Evidence[]; events: Event[]; deltas: StateDelta[]; versions: StateVersion[]; annotations: DerivedAnnotation[] };
export const decisionInputSchema = z.strictObject({ decision: decisionSchema, actor: text, reason: text });
export const commitInputSchema = z.strictObject({ deltaIds: ids.min(1), expectedVersion: z.number().int().nonnegative() });
export const restoreInputSchema = z.strictObject({ expectedVersion: z.number().int().nonnegative(), actor: text, reason: text });
export const validatorInputSchema = validatorResultSchema.nullable();
