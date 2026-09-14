import { randomUUID } from "node:crypto";
import { z } from "zod";
import { invariant } from "../domain/errors";
import { applyDelta, equal, evidenceFor, rows, validateCanonical, validateDelta } from "../domain/governance";
import { annotationSchema, commitInputSchema, decisionInputSchema, deltaInputSchema, emptyState, eventInputSchema, evidenceSchema, idSchema, restoreInputSchema, sourceDocumentSchema, sourceRevisionSchema, targetTypeSchema, validatorInputSchema, type StateDelta, type StoryAggregate, type StateVersion } from "../domain/state";
import type { StateRepository } from "../repositories/state-repository";
const now = () => new Date().toISOString();
export class StateService {
  constructor(private repository: StateRepository) {}
  async createStory(input: unknown) {
    const story = z.strictObject({ id: idSchema, title: z.string().trim().min(1).max(500) }).parse(input);
    await this.repository.create({ story: { ...story, currentVersion: 0, currentChapter: null, storyRevision: 0, createdAt: now() }, state: emptyState(), documents: [], revisions: [], evidence: [], events: [], deltas: [], versions: [], annotations: [] });
    return story;
  }
  async getCurrentState(id: string) { const a = await this.repository.read(idSchema.parse(id)); return { story: a.story, state: a.state }; }
  async getEvents(id: string) { return (await this.repository.read(idSchema.parse(id))).events.sort((a,b)=>a.sourceOrder-b.sourceOrder || a.createdAt.localeCompare(b.createdAt)); }
  async getDeltas(id: string) { return (await this.repository.read(idSchema.parse(id))).deltas; }
  async getVersions(id: string) { return (await this.repository.read(idSchema.parse(id))).versions; }
  async getAnnotations(id: string) { return (await this.repository.read(idSchema.parse(id))).annotations; }
  addSourceDocument(id: string, input: unknown) {
    const doc = sourceDocumentSchema.parse(input);
    return this.repository.transaction(idSchema.parse(id), a => { invariant(!a.documents.some(d=>d.id===doc.id || d.sourceOrder===doc.sourceOrder), "DUPLICATE_SOURCE", "Source id/order already exists", 409); a.documents.push(doc); return doc; });
  }
  addSourceRevision(id: string, input: unknown) {
    const revision = sourceRevisionSchema.parse(input);
    return this.repository.transaction(idSchema.parse(id), a => {
      invariant(a.documents.some(d=>d.id===revision.documentId), "SOURCE_NOT_FOUND", "Owned source document required");
      invariant(!a.revisions.some(r=>r.id===revision.id || (r.documentId===revision.documentId && r.revisionNumber===revision.revisionNumber)), "DUPLICATE_REVISION", "Revision already exists", 409);
      for (const annotation of a.annotations) if (a.revisions.some(r=>r.id===annotation.sourceRevisionId && r.documentId===revision.documentId) && !annotation.invalidatedAt) annotation.invalidatedAt = now();
      a.revisions.push(revision); a.story.storyRevision += 1;
      a.story.currentChapter = a.documents.find(d=>d.id===revision.documentId)?.chapter ?? a.story.currentChapter;
      return revision;
    });
  }
  addEvidence(id: string, input: unknown) {
    const evidence = evidenceSchema.parse(input);
    return this.repository.transaction(idSchema.parse(id), a => {
      const revision = a.revisions.find(r=>r.id===evidence.sourceRevisionId);
      invariant(revision && revision.content.slice(evidence.start, evidence.end) === evidence.quote, "INVALID_EVIDENCE", "Evidence must match an exact UTF-16 source span");
      invariant(!a.evidence.some(e=>e.id===evidence.id), "DUPLICATE_EVIDENCE", "Evidence already exists", 409);
      invariant(!evidence.speakerId || a.state.characters.some(c=>c.id===evidence.speakerId), "FOREIGN_REFERENCE", "Speaker must belong to story");
      a.evidence.push(evidence); return evidence;
    });
  }
  appendEvent(id: string, input: unknown) {
    const data = eventInputSchema.parse(input);
    return this.repository.transaction(idSchema.parse(id), a => {
      const revision = a.revisions.find(r=>r.id===data.sourceRevisionId);
      invariant(revision && a.documents.find(d=>d.id===revision.documentId)?.sourceOrder === data.sourceOrder, "SOURCE_ORDER", "Event source order must match its document");
      invariant(evidenceFor(a, data.evidenceIds).every(e=>e.sourceRevisionId===data.sourceRevisionId), "EVENT_EVIDENCE_MISMATCH", "Event evidence must use its revision");
      invariant(data.participantIds.every(id=>a.state.characters.some(c=>c.id===id && c.active)), "FOREIGN_REFERENCE", "Participants must belong to this story");
      const event = { ...data, id: randomUUID(), createdAt: now() }; a.events.push(event); return event;
    });
  }
  proposeDelta(id: string, input: unknown) {
    const parsed = deltaInputSchema.parse(input);
    return this.repository.transaction(idSchema.parse(id), a => {
      const d = this.proposal(parsed); validateDelta(a, d); a.deltas.push(d); return d;
    });
  }
  decideDelta(id: string, deltaId: string, input: unknown) {
    const decision = decisionInputSchema.parse(input); idSchema.parse(deltaId);
    return this.repository.transaction(idSchema.parse(id), a => {
      const d = a.deltas.find(d=>d.id===deltaId);
      invariant(d, "NOT_FOUND", "Delta not found", 404);
      invariant(!d.committedVersionId, "ALREADY_COMMITTED", "Committed delta is immutable", 409);
      invariant(decision.decision !== "accepted" || d.validatorResult?.status !== "conflict", "UNRESOLVED_CONFLICT", "Resolve conflict with a corrected delta", 409);
      d.decision = decision.decision; d.decisions.push({ ...decision, createdAt: now() }); return d;
    });
  }
  setValidatorResult(id: string, deltaId: string, input: unknown) {
    const result = validatorInputSchema.parse(input); idSchema.parse(deltaId);
    return this.repository.transaction(idSchema.parse(id), a => {
      const d = a.deltas.find(d=>d.id===deltaId);
      invariant(d && !d.committedVersionId, "NOT_FOUND", "Open delta not found", 404);
      d.validatorResult = result; return d;
    });
  }
  commitAcceptedDeltas(id: string, input: unknown) {
    const { deltaIds, expectedVersion } = commitInputSchema.parse(input);
    return this.repository.transaction(idSchema.parse(id), a => this.commit(a, deltaIds, expectedVersion, null));
  }
  restoreVersion(id: string, versionId: string, input: unknown) {
    const options = restoreInputSchema.parse(input); idSchema.parse(versionId);
    return this.repository.transaction(idSchema.parse(id), a => {
      invariant(a.story.currentVersion === options.expectedVersion, "STALE_VERSION", "Current state version changed", 409);
      const source = a.versions.find(v=>v.id===versionId);
      invariant(source, "NOT_FOUND", "Restore version must belong to story", 404);
      const generated: StateDelta[] = [];
      for (const type of targetTypeSchema.options) {
        const current = rows(a.state, type), target = rows(source.snapshot, type);
        for (const rowId of new Set([...current, ...target].map(r=>r.id))) {
          const before = current.find(r=>r.id===rowId) ?? null;
          const after = target.find(r=>r.id===rowId) ?? (before?.active ? { ...before, active: false } : before);
          if (equal(before, after)) continue;
          const delta = this.proposal(deltaInputSchema.parse({ operation: !before ? "CREATE" : !target.some(r=>r.id===rowId) ? "INVALIDATE" : "UPDATE", targetType: type, targetId: rowId, fieldPath: "$", before, after, sourceKind: "restore", sourceEventId: null, effect: null, evidenceIds: [], reason: options.reason, confidence: 1, risk: [], proposedBy: options.actor, basis: { kinds: ["restore"], note: `Restore version ${source.versionNumber} (${source.id})` }, resolutionSupport: null }));
          validateDelta(a, delta, true);
          delta.decision = "accepted"; delta.decisions.push({ decision: "accepted", actor: options.actor, reason: options.reason, createdAt: now() }); generated.push(delta);
        }
      }
      a.deltas.push(...generated);
      invariant(generated.length > 0, "NO_STATE_CHANGE", "Restoring the identical snapshot creates no state version", 409);
      return this.commit(a, generated.map(d=>d.id), options.expectedVersion, source.id);
    });
  }
  addAnnotation(id: string, input: unknown) {
    const annotation = annotationSchema.parse(input);
    return this.repository.transaction(idSchema.parse(id), a => {
      invariant(a.revisions.some(r=>r.id===annotation.sourceRevisionId) && rows(a.state, annotation.targetType).some(r=>r.id===annotation.targetId), "FOREIGN_REFERENCE", "Annotation target/source must belong to story");
      invariant(evidenceFor(a, annotation.evidenceIds).every(e=>e.sourceRevisionId===annotation.sourceRevisionId), "INVALID_EVIDENCE", "Annotation evidence revision mismatch");
      invariant(!a.annotations.some(n=>n.id===annotation.id), "DUPLICATE_ANNOTATION", "Annotation exists", 409);
      const saved = { ...annotation, createdAt: now(), invalidatedAt: null, supersededBy: null };
      a.annotations.push(saved); return saved;
    });
  }
  private proposal(data: ReturnType<typeof deltaInputSchema.parse>): StateDelta { return { ...data, id: randomUUID(), decision: "needs_review", validatorResult: null, decisions: [], committedVersionId: null, createdAt: now() }; }
  private commit(a: StoryAggregate, deltaIds: string[], expectedVersion: number, restoredFrom: string | null) {
    invariant(a.story.currentVersion === expectedVersion, "STALE_VERSION", "Current state version changed", 409);
    invariant(new Set(deltaIds).size === deltaIds.length, "DUPLICATE_DELTA", "Duplicate delta in commit");
    const deltas = deltaIds.map(id => { const d = a.deltas.find(d=>d.id===id); invariant(d, "NOT_FOUND", "Delta must belong to this story", 404); return d; });
    invariant(deltas.length > 0 && deltas.some(d=>d.operation !== "NO_CHANGE"), "NO_STATE_CHANGE", "At least one real canonical mutation is required", 409);
    for (const d of deltas) {
      invariant(d.decision === "accepted" && !d.committedVersionId, "NOT_ACCEPTED", "Only uncommitted accepted deltas can commit", 409);
      invariant(d.validatorResult?.status !== "conflict", "UNRESOLVED_CONFLICT", "Conflict needs a corrected delta", 409);
    }
    // Validate all initial before values, then also check sequential overlap during apply.
    for (const d of deltas) {
      const current = rows(a.state, d.targetType).find(r=>r.id===d.targetId);
      const before = d.fieldPath === "$" ? current ?? null : current ? (current as unknown as Record<string, unknown>)[d.fieldPath] : undefined;
      invariant(equal(before, d.before), "STALE_STATE", "Canonical before value has changed", 409);
    }
    for (const d of deltas) applyDelta(a, d, restoredFrom !== null);
    validateCanonical(a.state);
    const source = restoredFrom ? a.versions.find(v=>v.id===restoredFrom) : null;
    const chapter = source ? source.chapter : a.story.currentChapter;
    const version: StateVersion = { id: randomUUID(), versionNumber: a.story.currentVersion + 1, parentVersionId: a.versions.at(-1)?.id ?? null, commitKind: restoredFrom ? "restore" : "delta_commit", createdAt: now(), deltaIds, snapshot: structuredClone(a.state), restoredFromVersionId: restoredFrom, chapter, storyRevision: a.story.storyRevision };
    for (const d of deltas) d.committedVersionId = version.id;
    a.versions.push(version); a.story.currentVersion = version.versionNumber; a.story.currentChapter = chapter; return version;
  }
}
