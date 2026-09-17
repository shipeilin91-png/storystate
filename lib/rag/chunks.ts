import { createHash } from "node:crypto";
import type { SourceDocument, SourceRevision } from "../domain/state";
import { vectorize, VECTORIZER_VERSION } from "./vectorizer";

export const CHUNK_MAX_CHARS = 800;
export const CHUNKER_VERSION = "paragraph-exact/v0.1";
export const contentHash = (text: string) => createHash("sha256").update(text).digest("hex");
export function stableUuid(key: string): string {
  const hex = contentHash(key).slice(0, 32).split("");
  hex[12] = "4"; hex[16] = "8";
  const s = hex.join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

export type TextChunk = { chunkIndex: number; start: number; end: number; content: string; contentHash: string };
export type EvidenceChunk = TextChunk & {
  id: string; storyId: string; sourceDocumentId: string; sourceRevisionId: string;
  sourceOrder: number; chapter: number | null; vector: number[]; vectorizerVersion: string;
};

// Preserve literal substrings and UTF-16 offsets. Paragraph boundary first; then
// sentence boundary near the target; finally code-point-safe length splitting.
// Non-overlapping chunks avoid duplicate authority and preserve exact source text.
export function chunkText(content: string): TextChunk[] {
  const chunks: TextChunk[] = [];
  let start = 0;
  while (start < content.length) {
    const remaining = Array.from(content.slice(start));
    let end = start + remaining.slice(0, CHUNK_MAX_CHARS).join("").length;
    if (remaining.length > CHUNK_MAX_CHARS) {
      const window = content.slice(start, end);
      const lower = remaining.slice(0, 500).join("").length;
      const paragraphs = [...window.matchAll(/\r?\n[ \t]*\r?\n/gu)];
      const sentences = [...window.matchAll(/[。！？.!?](?:[”"’']?)(?:\s|$)?/gu)];
      const boundary = paragraphs.filter(m => m.index! >= lower).at(-1)
        ?? sentences.filter(m => m.index! >= lower).at(-1);
      if (boundary) end = start + boundary.index! + boundary[0].length;
    }
    const text = content.slice(start, end);
    if (text.trim()) chunks.push({ chunkIndex: chunks.length, start, end, content: text, contentHash: contentHash(text) });
    start = end;
  }
  return chunks;
}

export function chunksForRevision(storyId: string, document: SourceDocument, revision: SourceRevision): EvidenceChunk[] {
  if (revision.documentId !== document.id) throw new Error("RAG_SOURCE_MISMATCH");
  if (revision.visibility !== "canonical") return [];
  return chunkText(revision.content).map(chunk => ({
    ...chunk,
    id: stableUuid(`${CHUNKER_VERSION}/${storyId}/${revision.id}/${chunk.chunkIndex}/${chunk.contentHash}`),
    storyId, sourceDocumentId: document.id, sourceRevisionId: revision.id,
    sourceOrder: document.sourceOrder, chapter: document.chapter,
    vector: vectorize(chunk.content), vectorizerVersion: VECTORIZER_VERSION,
  }));
}
