import { randomUUID } from "node:crypto";
import { invariant } from "../domain/errors";
import { equal, rows, validateDelta } from "../domain/governance";
import { deltaInputSchema, type Character, type DeltaInput, type Event, type Evidence, type Item, type PlotThread, type Relationship, type StateDelta, type StoryAggregate, type TargetType } from "../domain/state";
import { extractionIssueRegistry, inspectSameSlotEffects } from "./compiler-spec";
import type { ExtractionEffect, ExtractionProposal, EventGroup, EvidenceProposal } from "./contract";
import type { ExtractionPacket } from "./packet";

export type CompilerIssue = {
  code: keyof typeof extractionIssueRegistry;
  level: "RUN_FATAL" | "EFFECT_REJECTED" | "WARNING";
  message: string;
  effectIndex?: number;
  eventKey?: string;
};

export type CompiledExtraction = {
  evidence: Evidence[];
  events: Event[];
  deltas: DeltaInput[];
  rejectedEffects: ExtractionEffect[];
  issues: CompilerIssue[];
  warnings: CompilerIssue[];
};

const eventKinds: Record<EventGroup["kind"], string> = {
  movement: "movement",
  transfer: "transfer",
  disclosure: "disclosure",
  observation: "observation",
  document_discovery: "document_discovery",
  state_revelation: "state_revelation",
  plot_revelation: "plot_revelation",
  relationship_action: "relationship_action",
};

function issue(code: keyof typeof extractionIssueRegistry, message: string, effectIndex?: number, eventKey?: string): CompilerIssue {
  const level = extractionIssueRegistry[code] as CompilerIssue["level"];
  return { code, level, message, ...(effectIndex === undefined ? {} : { effectIndex }), ...(eventKey ? { eventKey } : {}) };
}

function aliasId(packet: ExtractionPacket, alias: string, kind: string): string | null {
  return packet.entities.find(value => value.alias === alias && value.kind === kind)?.id ?? null;
}

function evidenceMap(packet: ExtractionPacket, proposal: ExtractionProposal, sourceRevisionId: string): { byKey: Map<string, Evidence>; issues: CompilerIssue[] } {
  const byKey = new Map<string, Evidence>();
  const issues: CompilerIssue[] = [];
  for (const [index, candidate] of proposal.evidence.entries()) {
    const start = occurrenceStart(packet.content, candidate);
    if (start === null) {
      issues.push(issue("EVIDENCE_NOT_FOUND", `Evidence ${candidate.key} does not resolve exactly in the source revision.`));
      continue;
    }
    const speakerId = candidate.speakerRef === null ? null : aliasId(packet, candidate.speakerRef, "character");
    if (candidate.speakerRef !== null && !speakerId) {
      issues.push(issue("UNKNOWN_ENTITY_REF", `Evidence speaker ${candidate.speakerRef} is not a known character.`));
      continue;
    }
    const evidence: Evidence = { id: randomUUID(), sourceRevisionId, quote: candidate.quote, start, end: start + candidate.quote.length, speakerId };
    if (byKey.has(candidate.key)) {
      issues.push(issue("OUTPUT_SCHEMA_INVALID", `Duplicate evidence key at index ${index}.`));
      continue;
    }
    byKey.set(candidate.key, evidence);
  }
  return { byKey, issues };
}

function occurrenceStart(content: string, candidate: EvidenceProposal): number | null {
  let from = 0;
  for (let occurrence = 0; occurrence <= candidate.occurrence; occurrence++) {
    const start = content.indexOf(candidate.quote, from);
    if (start < 0) return null;
    from = start + candidate.quote.length;
    if (occurrence === candidate.occurrence) return start;
  }
  return null;
}

function resolveEventGroups(
  packet: ExtractionPacket,
  proposal: ExtractionProposal,
  evidence: Map<string, Evidence>,
  sourceRevisionId: string,
  sourceOrder: number,
): { events: Event[]; ids: Map<string, string>; valid: Set<string>; issues: CompilerIssue[] } {
  const events: Event[] = [];
  const ids = new Map<string, string>();
  const valid = new Set<string>();
  const issues: CompilerIssue[] = [];
  for (const event of proposal.events) {
    const participantIds = event.participantRefs.map(ref => aliasId(packet, ref, "character"));
    const eventEvidence = event.evidenceKeys.map(key => evidence.get(key));
    if (participantIds.some(value => !value) || eventEvidence.some(value => !value)) {
      issues.push(issue("EVENT_GROUP_INVALID", `Event ${event.key} has an unknown participant or unresolved evidence.`, undefined, event.key));
      continue;
    }
    const id = randomUUID();
    ids.set(event.key, id);
    valid.add(event.key);
    events.push({
      id,
      sourceRevisionId,
      sourceOrder,
      storyTime: null,
      eventType: eventKinds[event.kind],
      summary: `Extracted ${event.kind} event`,
      payload: {},
      participantIds: participantIds as string[],
      evidenceIds: eventEvidence.map(value => value!.id),
      createdAt: new Date().toISOString(),
    });
  }
  return { events, ids, valid, issues };
}

function targetRow(aggregate: StoryAggregate, type: "characters", id: string): Character | undefined;
function targetRow(aggregate: StoryAggregate, type: "items", id: string): Item | undefined;
function targetRow(aggregate: StoryAggregate, type: "plotThreads", id: string): PlotThread | undefined;
function targetRow(aggregate: StoryAggregate, type: "relationships", id: string): Relationship | undefined;
function targetRow(aggregate: StoryAggregate, type: TargetType, id: string): Character | Item | PlotThread | Relationship | undefined {
  return rows(aggregate.state, type).find(row => row.id === id && row.active) as Character | Item | PlotThread | Relationship | undefined;
}

function basis(effect: ExtractionEffect, correction?: { previousStance: "unaware" | "suspects" | "believes" | "knows"; previousBelievedValue: boolean | null; evidenceIds: string[] }) {
  const kinds = effect.supportKinds.filter(value => value !== "inference") as Array<"direct_observation" | "direct_disclosure" | "credential_inspection" | "reported_claim" | "documentary_evidence" | "inference">;
  return { kinds: kinds.length ? kinds : ["inference"], note: effect.supportSummary, ...(correction ? { correction } : {}) };
}

function sourceEventId(eventIds: Map<string, string>, effect: ExtractionEffect): string {
  const id = eventIds.get(effect.eventKey);
  invariant(id, "EVENT_GROUP_INVALID", "Effect must reference a compiled EventGroup");
  return id;
}

export function compileExtraction(
  aggregate: StoryAggregate,
  packet: ExtractionPacket,
  proposal: ExtractionProposal,
): CompiledExtraction {
  const evidenceResult = evidenceMap(packet, proposal, packet.sourceRevisionId);
  const eventResult = resolveEventGroups(packet, proposal, evidenceResult.byKey, packet.sourceRevisionId, packet.sourceOrder);
  const issues = [...evidenceResult.issues, ...eventResult.issues];
  const warnings: CompilerIssue[] = [];
  const deltas: DeltaInput[] = [];
  const rejectedEffects: ExtractionEffect[] = [];
  const slotFindings = inspectSameSlotEffects(proposal.effects);
  const rejectedIndexes = new Set(slotFindings.filter(value => value.level === "EFFECT_REJECTED").map(value => value.effectIndex));
  for (const finding of slotFindings) {
    const target = finding.level === "WARNING" ? warnings : issues;
    target.push(issue(finding.code, `Same-slot ${finding.slot} effect ${finding.code.toLowerCase()}.`, finding.effectIndex));
    if (finding.code === "DUPLICATE_EFFECT") rejectedIndexes.add(finding.effectIndex);
  }
  const validationAggregate = structuredClone(aggregate);
  validationAggregate.evidence.push(...evidenceResult.byKey.values());
  validationAggregate.events.push(...eventResult.events);

  for (const [effectIndex, effect] of proposal.effects.entries()) {
    if (rejectedIndexes.has(effectIndex)) {
      rejectedEffects.push(effect);
      continue;
    }
    const eventId = eventResult.ids.get(effect.eventKey);
    const evidenceValues = effect.evidenceKeys.map(key => evidenceResult.byKey.get(key));
    const event = proposal.events.find(value => value.key === effect.eventKey);
    if (!eventId || !event || !eventResult.valid.has(effect.eventKey) || evidenceValues.some(value => !value) ||
      effect.evidenceKeys.some(key => !event.evidenceKeys.includes(key))) {
      issues.push(issue("EVENT_GROUP_INVALID", `Effect ${effectIndex} does not have valid Event and owned evidence.`, effectIndex, effect.eventKey));
      rejectedEffects.push(effect);
      continue;
    }
    try {
      const delta = compileEffect(aggregate, packet, effect, effectIndex, sourceEventId(eventResult.ids, effect), evidenceValues.map(value => value!.id));
      if (equal(delta.before, delta.after)) throw new Error("REDUNDANT_EFFECT");
      validateDelta(validationAggregate, { ...delta, id: randomUUID(), decision: "needs_review", validatorResult: null, decisions: [], committedVersionId: null, createdAt: new Date().toISOString() } as StateDelta);
      deltas.push(delta);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Effect rejected by deterministic compiler.";
      const code = (Object.keys(extractionIssueRegistry).find(value => message.includes(value)) ?? "GOVERNANCE_REJECTED") as keyof typeof extractionIssueRegistry;
      issues.push(issue(code, message, effectIndex));
      rejectedEffects.push(effect);
    }
  }

  return {
    evidence: [...evidenceResult.byKey.values()],
    events: eventResult.events,
    deltas,
    rejectedEffects,
    issues,
    warnings,
  };
}

function compileEffect(
  aggregate: StoryAggregate,
  packet: ExtractionPacket,
  effect: ExtractionEffect,
  effectIndex: number,
  sourceEventIdValue: string,
  evidenceIds: string[],
): DeltaInput {
  const common = {
    operation: "UPDATE" as const,
    sourceKind: "story_event" as const,
    sourceEventId: sourceEventIdValue,
    effect: { id: randomUUID(), description: effect.supportSummary },
    evidenceIds,
    reason: effect.supportSummary,
    confidence: effect.confidence,
    risk: [] as Array<"conflict_prone" | "ownership_uncertain" | "soft_signal">,
    proposedBy: "extractor",
    resolutionSupport: null,
  };
  if (effect.kind === "character_location") {
    const targetId = aliasId(packet, effect.characterRef, "character");
    if (!targetId) throw new Error(`UNKNOWN_ENTITY_REF: ${effect.characterRef}`);
    const row = targetRow(aggregate, "characters", targetId);
    invariant(row, "UNKNOWN_ENTITY_REF", "Character target is not active");
    return deltaInputSchema.parse({ ...common, targetType: "characters", targetId, fieldPath: "location", before: row.location, after: effect.after, basis: basis(effect) });
  }
  if (effect.kind === "item_holder" || effect.kind === "item_owner" || effect.kind === "item_custodian" || effect.kind === "item_condition") {
    const targetId = aliasId(packet, effect.itemRef, "item");
    if (!targetId) throw new Error(`UNKNOWN_ENTITY_REF: ${effect.itemRef}`);
    const row = targetRow(aggregate, "items", targetId);
    invariant(row, "UNKNOWN_ENTITY_REF", "Item target is not active");
    if (effect.kind === "item_condition") return deltaInputSchema.parse({ ...common, targetType: "items", targetId, fieldPath: "condition", before: row.condition, after: effect.condition, basis: basis(effect) });
    const fieldPath = effect.kind === "item_holder" ? "holder" : effect.kind === "item_owner" ? "owner" : "custodian";
    const after = effect.kind === "item_custodian" ? effect.after : effect.after;
    if (fieldPath === "owner") common.risk = ["ownership_uncertain"];
    return deltaInputSchema.parse({ ...common, targetType: "items", targetId, fieldPath, before: row[fieldPath], after, basis: basis(effect) });
  }
  if (effect.kind === "knowledge_state") {
    const characterId = aliasId(packet, effect.characterRef, "character");
    const propositionId = aliasId(packet, effect.propositionRef, "proposition");
    if (!characterId || !propositionId) throw new Error("UNKNOWN_ENTITY_REF");
    if (effect.stance === "knows" && effect.supportKinds.every(value => value === "inference")) throw new Error("KNOWS_INFERENCE_ONLY");
    const row = aggregate.state.knowledge.find(value => value.active && value.characterId === characterId && value.propositionId === propositionId);
    const after = { id: row?.id ?? randomUUID(), active: true, characterId, propositionId, stance: effect.stance, believedValue: effect.believedValue, basis: basis(effect, row && row.stance === "believes" && row.believedValue !== effect.believedValue ? { previousStance: row.stance, previousBelievedValue: row.believedValue, evidenceIds } : undefined) };
    return deltaInputSchema.parse({ ...common, operation: row ? "UPDATE" : "CREATE", targetType: "knowledge", targetId: after.id, fieldPath: "$", before: row ?? null, after, basis: after.basis });
  }
  if (effect.kind === "world_truth_status") {
    const propositionId = aliasId(packet, effect.propositionRef, "proposition");
    if (!propositionId) throw new Error("UNKNOWN_ENTITY_REF");
    const row = aggregate.state.worldTruth.find(value => value.active && value.propositionId === propositionId);
    if (row && row.status !== "unresolved" && row.status !== effect.status) throw new Error("WORLD_TRUTH_REVERSAL_REQUIRES_REVIEW");
    const after = { id: row?.id ?? randomUUID(), active: true, propositionId, status: effect.status };
    return deltaInputSchema.parse({ ...common, operation: row ? "UPDATE" : "CREATE", targetType: "worldTruth", targetId: after.id, fieldPath: "$", before: row ?? null, after, basis: basis(effect) });
  }
  if (effect.kind === "plot_thread_status") {
    const targetId = aliasId(packet, effect.threadRef, "thread");
    if (!targetId) throw new Error("UNKNOWN_ENTITY_REF");
    const row = targetRow(aggregate, "plotThreads", targetId);
    invariant(row, "UNKNOWN_ENTITY_REF", "Plot thread target is not active");
    if (effect.status === "resolved" && effect.resolutionAssessment !== "direct_answer") throw new Error("PLOT_RESOLUTION_INSUFFICIENT");
    if (row.status === "resolved" && effect.status !== "resolved") throw new Error("PLOT_REVERSAL_REQUIRES_HUMAN");
    const after = { ...row, status: effect.status, resolution: effect.resolution };
    return deltaInputSchema.parse({ ...common, targetType: "plotThreads", targetId, fieldPath: "$", before: row, after, basis: basis(effect), resolutionSupport: effect.status === "resolved" ? { coreQuestion: row.coreQuestion, answer: effect.resolution!, evidenceIds, assessment: "direct_answer" as const } : null });
  }
  const targetId = aliasId(packet, effect.relationshipRef, "relationship");
  if (!targetId) throw new Error("UNKNOWN_ENTITY_REF");
  const row = targetRow(aggregate, "relationships", targetId);
  invariant(row, "UNKNOWN_ENTITY_REF", "Relationship target is not active");
  if (row.category === "human_confirmed_psychological") throw new Error("PSYCHOLOGICAL_RELATIONSHIP_REQUIRES_HUMAN");
  const after = { ...row, value: effect.value, scope: effect.scope };
  return deltaInputSchema.parse({ ...common, targetType: "relationships", targetId, fieldPath: "$", before: row, after, basis: basis(effect) });
}
