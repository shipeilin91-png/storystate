import { execFileSync } from "node:child_process";
import { calculateMetrics, renderReport } from "../metrics";
import { createDeepSeekEvalClient, createOfficialDeepSeekTransportFromEnv } from "../providers/deepseek";
import { runEvaluation, type EvaluationRun } from "../runner";
import { routeAgents } from "../../server/validator/semantic";
import { buildBenchmark } from "../../../tests/fixtures/live-semantic-benchmark";
import { writeLiveArtifactBundle, type RawResultRecord } from "./artifacts";
import { assertAuthorizedManifest, readRunManifest, type RunManifest } from "./manifest";

export type GitInspector = (args: string[]) => string;

const inspectGit: GitInspector = args => execFileSync("git", args, {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "ignore"],
  maxBuffer: 128 * 1024,
}).trim();

export function assertOfficialRunPreconditions(manifest: RunManifest, git: GitInspector = inspectGit) {
  assertAuthorizedManifest(manifest);
  const worktree = git(["status", "--porcelain=v1", "--untracked-files=normal"]);
  if (worktree.trim()) throw new Error("LIVE_RUN_DIRTY_WORKTREE");
  const liveRunCodeGitSha = git(["rev-parse", "HEAD"]).trim();
  if (liveRunCodeGitSha !== manifest.liveRunCodeGitSha) throw new Error("LIVE_RUN_CODE_SHA_MISMATCH");
  return {
    liveRunCodeGitSha,
    gitWorktreeState: "CLEAN" as const,
    singleSessionRequired: true as const,
  };
}

function expectedCallCount(cases: Awaited<ReturnType<typeof buildBenchmark>>): number {
  const primary = cases.reduce((sum, item) => sum + 1 + routeAgents(item.packet).length, 0);
  const stability = cases
    .filter(item => item.metadata.set === "holdout" && item.metadata.stabilitySelected)
    .reduce((sum, item) => sum + 3 * (1 + routeAgents(item.packet).length), 0);
  return primary + stability;
}

function rawResults(run: EvaluationRun, manifest: RunManifest, runStartedAt: string, runFinishedAt: string): RawResultRecord[] {
  const provenance = {
    experimentId: manifest.experimentId,
    benchmarkVersion: manifest.benchmarkVersion,
    datasetHash: manifest.datasetHash,
    evaluationConfigHash: manifest.evaluationConfigHash,
    reviewedFrozenCommit: manifest.reviewedFrozenCommit,
    provider: manifest.provider,
    requestedModelId: manifest.requestedModelId,
    observedProviderModel: manifest.observedProviderModel,
    modelIdentityClass: manifest.modelIdentityClass,
    liveRunCodeGitSha: manifest.liveRunCodeGitSha!,
    gitWorktreeState: "CLEAN" as const,
    runStartedAt,
    runFinishedAt,
  };
  return run.results.flatMap(result => result.calls.map(call => ({
    ...provenance,
    caseId: result.caseId,
    architecture: result.architecture,
    phase: result.phase,
    run: result.run,
    agent: call.agent,
    packetHash: result.packetHash,
    verdict: call.check.verdict,
    reason: call.check.reason,
    evidenceIds: call.check.evidenceIds,
    latencyMs: call.latencyMs,
    inputTokens: call.usage?.inputTokens ?? null,
    outputTokens: call.usage?.outputTokens ?? null,
    providerResponseId: call.providerResponseId,
    finishReason: call.finishReason,
    errorCategory: call.error,
  })));
}

export async function executeOfficialDeepSeekRun(manifestPath: string) {
  const manifest = readRunManifest(manifestPath);
  assertAuthorizedManifest(manifest);
  const git = assertOfficialRunPreconditions(manifest);
  const cases = await buildBenchmark();
  if (expectedCallCount(cases) !== manifest.expectedCallCount) throw new Error("AUTHORIZED_MANIFEST_CALL_COUNT_MISMATCH");

  const client = createDeepSeekEvalClient({
    requestedModelId: manifest.requestedModelId,
    expectedResolvedModelVersion: manifest.expectedResolvedModelVersion,
    transport: createOfficialDeepSeekTransportFromEnv(),
  });
  const runStartedAt = new Date().toISOString();
  const run = await runEvaluation(cases, client, {
    expectedDatasetHash: manifest.datasetHash,
    expectedConfigHash: manifest.evaluationConfigHash,
    frozenCommit: manifest.reviewedFrozenCommit,
    stability: true,
    allowLive: true,
  });
  const runFinishedAt = new Date().toISOString();
  const raw = rawResults(run, manifest, runStartedAt, runFinishedAt);
  if (raw.length !== manifest.expectedCallCount) throw new Error("LIVE_RUN_CALL_COUNT_MISMATCH");
  const metrics = calculateMetrics(cases, run);
  const provenance = {
    experimentId: manifest.experimentId,
    benchmarkVersion: manifest.benchmarkVersion,
    datasetHash: manifest.datasetHash,
    evaluationConfigHash: manifest.evaluationConfigHash,
    reviewedFrozenCommit: manifest.reviewedFrozenCommit,
    provider: manifest.provider,
    requestedModelId: manifest.requestedModelId,
    observedProviderModel: manifest.observedProviderModel,
    modelIdentityClass: manifest.modelIdentityClass,
    liveRunCodeGitSha: git.liveRunCodeGitSha,
    gitWorktreeState: git.gitWorktreeState,
    runStartedAt,
    runFinishedAt,
  };
  const failedCallCount = raw.filter(record => record.errorCategory !== null).length;
  writeLiveArtifactBundle(manifest.resultDirectory, {
    manifest,
    rawResults: raw,
    metrics: { ...provenance, generatedAt: runFinishedAt, metrics: metrics as unknown as Record<string, unknown> },
    report: renderReport(metrics),
    summary: {
      ...provenance,
      status: "COMPLETED",
      expectedCallCount: manifest.expectedCallCount,
      completedCallCount: raw.length,
      failedCallCount,
      errorCategory: failedCallCount ? "SEMANTIC_UNAVAILABLE" : null,
    },
  });
  return { manifest, run, metrics, runStartedAt, runFinishedAt };
}
