import { createHash } from "node:crypto";
import { invariant } from "../domain/errors";
import { extractionContractHash } from "./contract";
import type { CanonicalRow, CanonicalState, StoryAggregate } from "../domain/state";
import type { HistoricalContext } from "../rag/retrieval";

export const EXTRACTION_PACKET_LIMITS = {
  entities: 96,
  rows: 160,
  contentChars: 24000,
  bytes: 48000,
} as const;

export type ExtractionEntity = {
  alias: string;
  id: string;
  kind: "character" | "item" | "thread" | "proposition" | "relationship";
  labels: string[];
};

export type ExtractionPacket = {
  storyId: string;
  sourceRevisionId: string;
  sourceOrder: number;
  chapter: number | null;
  content: string;
  stateVersion: number;
  storyRevision: number;
  contractVersion: string;
  contractHash: string;
  entities: ExtractionEntity[];
  currentState: CanonicalState;
  historicalContext?: HistoricalContext;
};

function label(row: CanonicalRow): string[] {
  if ("name" in row) return [row.name, ...("role" in row ? [row.role] : [])];
  if ("title" in row) return [row.title, ...("coreQuestion" in row ? [row.coreQuestion] : [])];
  if ("statement" in row) return [row.statement];
  if ("fromCharacterId" in row) return [row.predicate, row.category, row.value, row.scope];
  return [];
}

const aliasPrefixes: Record<ExtractionEntity["kind"], string> = {
  character: "CHAR",
  item: "ITEM",
  thread: "THREAD",
  proposition: "PROP",
  relationship: "REL",
};

function aliases(rowsToAlias: readonly CanonicalRow[], kind: ExtractionEntity["kind"]): ExtractionEntity[] {
  return rowsToAlias.filter(row => row.active).sort((a, b) => a.id.localeCompare(b.id)).map((row, index) => ({
    alias: `${aliasPrefixes[kind]}_${String(index + 1).padStart(3, "0")}`,
    id: row.id,
    kind,
    labels: label(row).slice(0, 4),
  }));
}

export function buildExtractionPacket(aggregate: StoryAggregate, sourceRevisionId: string): ExtractionPacket {
  const revision = aggregate.revisions.find(value => value.id === sourceRevisionId);
  invariant(revision, "SOURCE_NOT_FOUND", "Source revision must belong to this story", 404);
  invariant(revision.visibility === "canonical", "AUTHOR_TRUTH_FORBIDDEN", "Author-only source cannot be extracted", 403);
  const document = aggregate.documents.find(value => value.id === revision.documentId);
  invariant(document, "SOURCE_NOT_FOUND", "Source document must belong to this story", 404);
  invariant(revision.content.length <= EXTRACTION_PACKET_LIMITS.contentChars, "EXTRACTION_LIMIT", "Source revision exceeds extraction packet limit", 413);

  const entities = [
    ...aliases(aggregate.state.characters, "character"),
    ...aliases(aggregate.state.items, "item"),
    ...aliases(aggregate.state.plotThreads, "thread"),
    ...aliases(aggregate.state.propositions, "proposition"),
    ...aliases(aggregate.state.relationships, "relationship"),
  ];
  invariant(entities.length <= EXTRACTION_PACKET_LIMITS.entities, "EXTRACTION_LIMIT", "Entity catalog exceeds extraction packet limit", 413);
  invariant(Object.values(aggregate.state).reduce((count, values) => count + values.length, 0) <= EXTRACTION_PACKET_LIMITS.rows, "EXTRACTION_LIMIT", "Canonical state exceeds extraction packet limit", 413);

  const packet: ExtractionPacket = {
    storyId: aggregate.story.id,
    sourceRevisionId,
    sourceOrder: document.sourceOrder,
    chapter: document.chapter,
    content: revision.content,
    stateVersion: aggregate.story.currentVersion,
    storyRevision: aggregate.story.storyRevision,
    contractVersion: "extraction-contract/v0.1",
    contractHash: extractionContractHash,
    entities,
    currentState: structuredClone(aggregate.state),
  };
  invariant(Buffer.byteLength(JSON.stringify(packet)) <= EXTRACTION_PACKET_LIMITS.bytes, "EXTRACTION_LIMIT", "Extraction packet exceeds byte limit", 413);
  return packet;
}

export function extractionPacketHash(packet: ExtractionPacket): string {
  return createHash("sha256").update(JSON.stringify(packet)).digest("hex");
}
