// Hashed lexical features, NOT a neural embedding. No downloads or external calls.
export const VECTOR_DIMENSIONS = 384;
export const VECTORIZER_VERSION = "signed-ngram-384/v0.1";

export function normalizeRetrievalText(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function hash(text: string): number {
  let value = 2166136261;
  for (const point of text) value = Math.imul(value ^ point.codePointAt(0)!, 16777619);
  return value >>> 0;
}

export function vectorize(text: string): number[] {
  const vector = Array<number>(VECTOR_DIMENSIONS).fill(0);
  const points = Array.from(normalizeRetrievalText(text));
  for (const size of [2, 3]) {
    for (let i = 0; i + size <= points.length; i++) {
      const feature = points.slice(i, i + size).join("");
      const value = hash(`${size}:${feature}`);
      vector[value % VECTOR_DIMENSIONS] += value & 0x80000000 ? -1 : 1;
    }
  }
  const norm = Math.hypot(...vector);
  return norm ? vector.map(value => value / norm) : vector;
}

export function similarity(left: number[], right: number[]): number {
  return left.reduce((sum, value, index) => sum + value * right[index], 0);
}
