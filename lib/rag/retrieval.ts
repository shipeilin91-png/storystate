import type { StoryAggregate, SourceRevision } from "../domain/state";
import { invariant } from "../domain/errors";
import type { ExtractionPacket } from "../extraction/packet";
import { chunksForRevision, contentHash, type EvidenceChunk } from "./chunks";
import { normalizeRetrievalText, similarity, vectorize } from "./vectorizer";

export const RAG_LIMITS = { topK: 5, contextChars: 3600, poolPerSignal: 20, recentReserved: 1 } as const;
export const ragEnabled = (value = process.env.STORYSTATE_RAG_ENABLED) => value === "1" || value === "true";
export type HistoricalContext = {
  label: "HISTORICAL_CONTEXT_ONLY";
  chunks: Array<Pick<EvidenceChunk, "id" | "sourceRevisionId" | "sourceDocumentId" | "sourceOrder" | "chapter" | "content" | "contentHash"> & {
    score: number; vectorScore: number; recencyBoost: number; entityBoost: number;
  }>;
};
export type RetrievalScope = {
  storyId: string; currentRevisionId: string; beforeSourceOrder: number;
  eligibleRevisionIds: string[]; queryVector: number[]; entityNames: string[];
};
export interface ChunkRepository {
  index(chunks: EvidenceChunk[]): Promise<{ created: number; skipped: number }>;
  candidates(scope: RetrievalScope): Promise<EvidenceChunk[]>;
}
export interface HistoricalContextProvider {
  retrieve(aggregate: StoryAggregate, packet: ExtractionPacket): Promise<HistoricalContext>;
}

export function eligibleHistory(aggregate: StoryAggregate, packet: ExtractionPacket): SourceRevision[] {
  invariant(aggregate.story.id === packet.storyId, "RAG_STORY_MISMATCH", "Retrieval must use the current story");
  const current = aggregate.revisions.find(r => r.id === packet.sourceRevisionId);
  invariant(current, "SOURCE_NOT_FOUND", "Current source revision not found", 404);
  return aggregate.revisions.filter(r => {
    const document = aggregate.documents.find(d => d.id === r.documentId);
    return r.visibility === "canonical" && r.id !== current.id && r.documentId !== current.documentId &&
      document && document.sourceOrder < packet.sourceOrder &&
      !aggregate.revisions.some(newer => newer.documentId === r.documentId && newer.revisionNumber > r.revisionNumber);
  });
}

export function scopeFor(aggregate: StoryAggregate, packet: ExtractionPacket): RetrievalScope {
  const query = normalizeRetrievalText(packet.content);
  const names = packet.entities.flatMap(e => e.labels).filter(name => {
    const normalized = normalizeRetrievalText(name);
    return normalized.length >= 2 && query.includes(normalized);
  });
  return {
    storyId: packet.storyId, currentRevisionId: packet.sourceRevisionId,
    beforeSourceOrder: packet.sourceOrder,
    eligibleRevisionIds: eligibleHistory(aggregate, packet).map(r => r.id),
    queryVector: vectorize(packet.content),
    entityNames: [...new Set(names)].sort().slice(0, 24),
  };
}

function recentOrder(a: EvidenceChunk, b: EvidenceChunk) {
  return b.sourceOrder - a.sourceOrder || b.chunkIndex - a.chunkIndex || a.id.localeCompare(b.id);
}
export function selectHistoricalContext(candidates: EvidenceChunk[], scope: RetrievalScope): HistoricalContext {
  const eligible = new Set(scope.eligibleRevisionIds);
  const seenIds = new Set<string>(), seenContent = new Set<string>();
  const unique = [...candidates].sort(recentOrder).filter(c => {
    if (c.storyId !== scope.storyId || c.sourceRevisionId === scope.currentRevisionId ||
      c.sourceOrder >= scope.beforeSourceOrder || !eligible.has(c.sourceRevisionId) ||
      c.contentHash !== contentHash(c.content) || seenIds.has(c.id) || seenContent.has(c.contentHash)) return false;
    seenIds.add(c.id); seenContent.add(c.contentHash); return true;
  });
  const recentOrders = [...new Set(unique.map(c => c.sourceOrder))];
  const scored = unique.map(chunk => {
    const vectorScore = similarity(scope.queryVector, chunk.vector);
    const recencyBoost = 0.12 / (1 + recentOrders.indexOf(chunk.sourceOrder));
    const text = normalizeRetrievalText(chunk.content);
    const matches = scope.entityNames.filter(name => text.includes(normalizeRetrievalText(name))).length;
    const entityBoost = Math.min(0.18, matches * 0.06);
    return { ...chunk, vectorScore, recencyBoost, entityBoost, score: vectorScore + recencyBoost + entityBoost };
  });
  // Always reserve the nearest previous chunk for pronouns/ellipsis even with no
  // lexical overlap. All other slots use the same deterministic three-signal rank.
  const order = [
    ...scored.slice(0, RAG_LIMITS.recentReserved),
    ...scored.slice(RAG_LIMITS.recentReserved).sort((a, b) => b.score - a.score || recentOrder(a, b)),
  ];
  const chunks: HistoricalContext["chunks"] = [];
  let budget = RAG_LIMITS.contextChars;
  for (const c of order) {
    const size = Array.from(c.content).length;
    if (size > budget || !c.content.trim()) continue;
    const { id, sourceRevisionId, sourceDocumentId, sourceOrder, chapter, content, contentHash: hash, score, vectorScore, recencyBoost, entityBoost } = c;
    chunks.push({ id, sourceRevisionId, sourceDocumentId, sourceOrder, chapter, content, contentHash: hash, score, vectorScore, recencyBoost, entityBoost });
    budget -= size;
    if (chunks.length === RAG_LIMITS.topK) break;
  }
  return { label: "HISTORICAL_CONTEXT_ONLY", chunks };
}

export class EvidenceRetriever implements HistoricalContextProvider {
  constructor(private readonly repository: ChunkRepository) {}
  async retrieve(aggregate: StoryAggregate, packet: ExtractionPacket): Promise<HistoricalContext> {
    const scope = scopeFor(aggregate, packet);
    const history = eligibleHistory(aggregate, packet);
    const chunks = history.flatMap(revision =>
      chunksForRevision(aggregate.story.id, aggregate.documents.find(d => d.id === revision.documentId)!, revision));
    await this.repository.index(chunks);
    const candidates = await this.repository.candidates(scope);
    // Storage is not authority: only return chunks matching this captured source
    // snapshot exactly, including chronology and literal source offsets.
    const expected = new Map(chunks.map(c => [c.id, c]));
    return selectHistoricalContext(candidates.flatMap(c => {
      const original = expected.get(c.id);
      return original && original.storyId === c.storyId &&
        original.sourceRevisionId === c.sourceRevisionId && original.sourceDocumentId === c.sourceDocumentId &&
        original.sourceOrder === c.sourceOrder && original.content === c.content &&
        original.contentHash === c.contentHash && original.start === c.start && original.end === c.end
        ? [original] : [];
    }), scope);
  }
}
