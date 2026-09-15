import { existsSync, linkSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { runManifestSchema, assertAuthorizedManifest, type RunManifest } from "./manifest";

const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const timestamp = z.string().datetime({ offset: true });
const provenanceSchema = z.strictObject({
  experimentId: z.string().min(1),
  benchmarkVersion: z.string().min(1),
  datasetHash: sha256,
  evaluationConfigHash: sha256,
  reviewedFrozenCommit: z.string().regex(/^[a-f0-9]{40}$/),
  provider: z.string().min(1),
  requestedModelId: z.string().min(1),
  resolvedModelVersion: z.string().min(1),
});

export const rawResultRecordSchema = provenanceSchema.extend({
  caseId: z.string().min(1),
  architecture: z.enum(["generic", "specialist"]),
  phase: z.enum(["primary", "stability"]),
  run: z.number().int().nonnegative(),
  agent: z.enum(["generic", "evidence", "knowledge_boundary", "temporal_state"]),
  packetHash: sha256,
  verdict: z.enum(["SUPPORTED", "UNCERTAIN", "UNSUPPORTED"]),
  reason: z.string().min(1).max(600),
  evidenceIds: z.array(z.string()).max(100),
  latencyMs: z.number().finite().nonnegative(),
  inputTokens: z.number().int().nonnegative().nullable(),
  outputTokens: z.number().int().nonnegative().nullable(),
  providerResponseId: z.string().min(1).nullable(),
  finishReason: z.string().min(1).nullable(),
  errorCategory: z.string().min(1).nullable(),
});

export const metricsArtifactSchema = provenanceSchema.extend({
  generatedAt: timestamp,
  metrics: z.record(z.string(), z.unknown()),
});

export const executionSummarySchema = provenanceSchema.extend({
  status: z.enum(["PARTIAL", "ABORTED", "COMPLETED"]),
  startedAt: timestamp,
  finishedAt: timestamp.nullable(),
  expectedCallCount: z.number().int().positive(),
  completedCallCount: z.number().int().nonnegative(),
  failedCallCount: z.number().int().nonnegative(),
  errorCategory: z.string().min(1).nullable(),
});

export type RawResultRecord = z.infer<typeof rawResultRecordSchema>;
export type MetricsArtifact = z.infer<typeof metricsArtifactSchema>;
export type ExecutionSummary = z.infer<typeof executionSummarySchema>;

export type LiveArtifactBundle = {
  manifest: RunManifest;
  rawResults: RawResultRecord[];
  metrics?: MetricsArtifact;
  report?: string;
  summary: ExecutionSummary;
};

function provenanceFor(manifest: RunManifest, resolvedModelVersion: string) {
  return {
    experimentId: manifest.experimentId,
    benchmarkVersion: manifest.benchmarkVersion,
    datasetHash: manifest.datasetHash,
    evaluationConfigHash: manifest.evaluationConfigHash,
    reviewedFrozenCommit: manifest.reviewedFrozenCommit,
    provider: manifest.provider,
    requestedModelId: manifest.requestedModelId,
    resolvedModelVersion,
  };
}

function writeAtomic(path: string, contents: string, allowReplace: boolean) {
  mkdirSync(dirname(path), { recursive: true });
  if (!allowReplace && existsSync(path)) throw new Error(`ARTIFACT_EXISTS: ${path}`);
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, contents, { encoding: "utf8", flag: "wx", mode: 0o600 });
    if (allowReplace) renameSync(temporary, path);
    else {
      linkSync(temporary, path);
      unlinkSync(temporary);
    }
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

function existingCompleted(directory: string): boolean {
  const path = join(directory, "execution-summary.json");
  if (!existsSync(path)) return false;
  return executionSummarySchema.parse(JSON.parse(readFileSync(path, "utf8"))).status === "COMPLETED";
}

export function writeLiveArtifactBundle(directory: string, bundle: LiveArtifactBundle, options: { replaceIncomplete?: boolean } = {}) {
  assertAuthorizedManifest(bundle.manifest);
  const summary = executionSummarySchema.parse(bundle.summary);
  const rawResults = bundle.rawResults.map(record => rawResultRecordSchema.parse(record));
  const metrics = bundle.metrics ? metricsArtifactSchema.parse(bundle.metrics) : undefined;
  const report = bundle.report === undefined ? undefined : z.string().min(1).parse(bundle.report);
  if (summary.expectedCallCount !== bundle.manifest.expectedCallCount || rawResults.length !== summary.completedCallCount)
    throw new Error("ARTIFACT_CALL_COUNT_MISMATCH");
  const expectedProvenance = provenanceFor(bundle.manifest, summary.resolvedModelVersion);
  for (const artifact of [...rawResults, summary, ...(metrics ? [metrics] : [])]) {
    for (const [key, value] of Object.entries(expectedProvenance))
      if (artifact[key as keyof typeof artifact] !== value) throw new Error(`ARTIFACT_PROVENANCE_MISMATCH: ${key}`);
  }
  if (summary.status === "COMPLETED" && (!metrics || !report || summary.completedCallCount !== summary.expectedCallCount))
    throw new Error("COMPLETED_ARTIFACT_SET_INCOMPLETE");
  if (existingCompleted(directory)) throw new Error("COMPLETED_RUN_IMMUTABLE");
  const replace = options.replaceIncomplete === true;
  writeAtomic(join(directory, "run-manifest.json"), `${JSON.stringify(runManifestSchema.parse(bundle.manifest), null, 2)}\n`, replace);
  writeAtomic(join(directory, "raw-results.jsonl"), `${rawResults.map(record => JSON.stringify(record)).join("\n")}\n`, replace);
  if (metrics) writeAtomic(join(directory, "metrics.json"), `${JSON.stringify(metrics, null, 2)}\n`, replace);
  if (report) writeAtomic(join(directory, "report.md"), report.endsWith("\n") ? report : `${report}\n`, replace);
  writeAtomic(join(directory, "execution-summary.json"), `${JSON.stringify(summary, null, 2)}\n`, replace);
}
