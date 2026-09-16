import type { StoryAggregate } from "../domain/state";

export type ReviewHydrationDto = {
  story: StoryAggregate["story"];
  candidateDeltas: StoryAggregate["deltas"];
  evidence: StoryAggregate["evidence"];
  events: StoryAggregate["events"];
  sourceRevisions: Array<Pick<StoryAggregate["revisions"][number], "id" | "documentId" | "revisionNumber" | "visibility">>;
  sourceDocuments: StoryAggregate["documents"];
};

export function toReviewHydrationDto(aggregate: StoryAggregate): ReviewHydrationDto {
  const candidateDeltas = aggregate.deltas.filter(delta => delta.committedVersionId === null);
  const evidenceIds = new Set(candidateDeltas.flatMap(delta => delta.evidenceIds));
  const eventIds = new Set(candidateDeltas.map(delta => delta.sourceEventId).filter((id): id is string => id !== null));
  const events = aggregate.events.filter(event => eventIds.has(event.id));
  for (const event of events) for (const evidenceId of event.evidenceIds) evidenceIds.add(evidenceId);
  const evidence = aggregate.evidence.filter(value => evidenceIds.has(value.id));
  const revisionIds = new Set([...evidence.map(value => value.sourceRevisionId), ...events.map(value => value.sourceRevisionId)]);
  return {
    story: aggregate.story,
    candidateDeltas,
    evidence,
    events,
    sourceRevisions: aggregate.revisions
      .filter(revision => revisionIds.has(revision.id))
      .map(({ id, documentId, revisionNumber, visibility }) => ({ id, documentId, revisionNumber, visibility })),
    sourceDocuments: aggregate.documents.filter(document => aggregate.revisions.some(revision => revisionIds.has(revision.id) && revision.documentId === document.id)),
  };
}
