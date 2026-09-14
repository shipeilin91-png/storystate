import { createHash } from "node:crypto";
import { invariant } from "../../domain/errors";
import { rows } from "../../domain/governance";
import { emptyState, type CanonicalRow, type CanonicalState, type DeltaInput, type Evidence, type StateDelta, type StoryAggregate } from "../../domain/state";

export const PACKET_LIMITS = { primary: 12, retrieved: 12, quoteChars: 1600, rows: 32, bytes: 32000 } as const;
export type PacketEvidence = Evidence & { sourceOrder: number; chapter: number | null; eventIds: string[] };
export type ValidationPacket = {
  candidateDelta: Omit<DeltaInput, "confidence" | "proposedBy" | "risk"> & { id: string };
  currentStateSlice: CanonicalState;
  primaryEvidence: PacketEvidence[];
  retrievedEvidence: PacketEvidence[];
  provenance: {
    storyId: string; stateVersion: number; storyRevision: number; currentChapter: number | null;
    sourceEvent: { id: string; sourceOrder: number; storyTime: string | null; participantIds: string[] } | null;
    retrievalTruncated: boolean;
  };
};
export interface ValidationContextProvider {
  build(aggregate: StoryAggregate, delta: StateDelta): ValidationPacket;
}
export function candidateInput(delta: StateDelta): ValidationPacket["candidateDelta"] {
  return {
    id: delta.id, operation: delta.operation, targetType: delta.targetType, targetId: delta.targetId,
    fieldPath: delta.fieldPath, before: delta.before, after: delta.after, sourceKind: delta.sourceKind,
    sourceEventId: delta.sourceEventId, effect: delta.effect, evidenceIds: delta.evidenceIds,
    reason: delta.reason, basis: delta.basis, resolutionSupport: delta.resolutionSupport,
  };
}
export function packetHash(packet: ValidationPacket) {
  return createHash("sha256").update(JSON.stringify(packet)).digest("hex");
}

export class StructuredValidationContextProvider implements ValidationContextProvider {
  build(a: StoryAggregate, d: StateDelta): ValidationPacket {
    const sourceEvent = a.events.find(event => event.id === d.sourceEventId);
    const current = rows(a.state, d.targetType).find(row => row.id === d.targetId);
    const proposed = d.fieldPath === "$" ? d.after : { ...current, [d.fieldPath]: d.after };
    const characterIds = new Set<string>();
    const propositionIds = new Set<string>();
    const references = (value: unknown) => {
      if (!value || typeof value !== "object") return;
      const row = value as Record<string, unknown>;
      for (const key of ["characterId", "fromCharacterId", "toCharacterId", "reporterId"])
        if (typeof row[key] === "string") characterIds.add(row[key]);
      for (const key of ["propositionId", "reportedPropositionId"])
        if (typeof row[key] === "string") propositionIds.add(row[key]);
      for (const key of ["owner", "holder", "custodian"]) {
        const slot = row[key] as { value?: string | null; lastConfirmedValue?: string | null } | null;
        if (slot?.value) characterIds.add(slot.value);
        if (slot?.lastConfirmedValue) characterIds.add(slot.lastConfirmedValue);
      }
    };
    references(current); references(proposed);
    if (d.targetType === "characters") characterIds.add(d.targetId);
    if (d.targetType === "propositions") propositionIds.add(d.targetId);
    for (const id of sourceEvent?.participantIds ?? []) characterIds.add(id);
    // One-hop claim relationships expose R vs P without importing unrelated knowledge.
    const directPropositions = new Set(propositionIds);
    for (const p of a.state.propositions.filter(p => p.active && (directPropositions.has(p.id) || (p.reportedPropositionId && directPropositions.has(p.reportedPropositionId))))) {
      propositionIds.add(p.id); references(p);
    }
    const slice = emptyState();
    if (current) rows(slice, d.targetType).push(structuredClone(current));
    const include = (type: keyof CanonicalState, row: CanonicalRow) => {
      if (!rows(slice, type).some(value => value.id === row.id)) rows(slice, type).push(structuredClone(row));
    };
    for (const row of a.state.characters) if (row.active && characterIds.has(row.id)) include("characters", row);
    for (const row of a.state.propositions) if (row.active && propositionIds.has(row.id)) include("propositions", row);
    for (const row of a.state.worldTruth) if (row.active && propositionIds.has(row.propositionId)) include("worldTruth", row);
    for (const row of a.state.knowledge) if (row.active && propositionIds.has(row.propositionId) && characterIds.has(row.characterId)) include("knowledge", row);
    invariant(Object.values(slice).reduce((count, list) => count + list.length, 0) <= PACKET_LIMITS.rows, "CONTEXT_LIMIT", "Relevant canonical slice exceeds packet limit");

    const invalidatedEvidence = new Set(a.deltas.filter(delta => delta.committedVersionId && delta.operation === "INVALIDATE").flatMap(delta =>
      a.deltas.filter(prior => prior.targetType === delta.targetType && prior.targetId === delta.targetId &&
        prior.committedVersionId && prior.operation !== "INVALIDATE").flatMap(prior => prior.evidenceIds)));
    const usable = (e: Evidence): boolean => {
      if (invalidatedEvidence.has(e.id)) return false;
      const revision = a.revisions.find(r => r.id === e.sourceRevisionId);
      if (!revision || revision.visibility !== "canonical") return false;
      const latest = a.revisions.filter(r => r.documentId === revision.documentId && r.visibility === "canonical").sort((x, y) => y.revisionNumber - x.revisionNumber)[0];
      return latest?.id === revision.id && revision.content.slice(e.start, e.end) === e.quote;
    };
    const enrich = (e: Evidence): PacketEvidence => {
      const revision = a.revisions.find(r => r.id === e.sourceRevisionId)!;
      const doc = a.documents.find(doc => doc.id === revision.documentId)!;
      invariant(doc, "CONTEXT_SOURCE", "Evidence document missing");
      return { ...e, sourceOrder: doc.sourceOrder, chapter: doc.chapter, eventIds: a.events.filter(event => event.evidenceIds.includes(e.id)).map(event => event.id).slice(0, 8) };
    };
    invariant(d.evidenceIds.length <= PACKET_LIMITS.primary, "CONTEXT_LIMIT", "Primary evidence exceeds packet limit");
    const primary = d.evidenceIds.map(id => {
      const evidence = a.evidence.find(e => e.id === id);
      invariant(evidence && usable(evidence), "CONTEXT_SOURCE", "Primary evidence is unavailable or superseded");
      invariant(evidence.quote.length <= PACKET_LIMITS.quoteChars, "CONTEXT_LIMIT", "Primary evidence span exceeds packet limit");
      return enrich(evidence);
    });
    const sourceOrder = sourceEvent?.sourceOrder ?? (primary.length ? Math.max(...primary.map(e => e.sourceOrder)) : Math.max(0, ...a.documents.map(doc => doc.sourceOrder)));
    const linked = sourceEvent?.evidenceIds ?? [];
    const historical = a.events.filter(event => event.sourceOrder <= sourceOrder && event.sourceOrder >= sourceOrder - 4 &&
      event.participantIds.some(id => characterIds.has(id)))
      .sort((x, y) => y.sourceOrder - x.sourceOrder || x.id.localeCompare(y.id)).flatMap(event => event.evidenceIds);
    const committed = a.deltas.filter(delta => delta.committedVersionId && delta.decision === "accepted" && delta.operation !== "INVALIDATE" &&
      delta.targetType === d.targetType && delta.targetId === d.targetId).flatMap(delta => delta.evidenceIds);
    const primaryIds = new Set(d.evidenceIds);
    const retrieved: PacketEvidence[] = [];
    let truncated = false;
    for (const id of new Set([...linked, ...historical, ...committed])) {
      if (primaryIds.has(id)) continue;
      const evidence = a.evidence.find(e => e.id === id);
      if (!evidence || !usable(evidence)) continue;
      const value = enrich(evidence);
      if (value.sourceOrder > sourceOrder) continue;
      if (retrieved.length === PACKET_LIMITS.retrieved || evidence.quote.length > PACKET_LIMITS.quoteChars) { truncated = true; continue; }
      retrieved.push(value);
    }
    const packet: ValidationPacket = {
      candidateDelta: candidateInput(d), currentStateSlice: slice, primaryEvidence: primary, retrievedEvidence: retrieved,
      provenance: {
        storyId: a.story.id, stateVersion: a.story.currentVersion, storyRevision: a.story.storyRevision, currentChapter: a.story.currentChapter,
        sourceEvent: sourceEvent ? { id: sourceEvent.id, sourceOrder: sourceEvent.sourceOrder, storyTime: sourceEvent.storyTime, participantIds: sourceEvent.participantIds } : null,
        retrievalTruncated: truncated,
      },
    };
    invariant(Buffer.byteLength(JSON.stringify(packet)) <= PACKET_LIMITS.bytes, "CONTEXT_LIMIT", "Validation packet exceeds byte limit");
    return packet;
  }
}
