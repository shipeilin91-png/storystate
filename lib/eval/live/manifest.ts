import { readFileSync } from "node:fs";
import { z } from "zod";
import { decoding } from "../runner";
import { DEEPSEEK_PROVIDER, DEEPSEEK_REQUESTED_MODEL } from "../providers/deepseek";

export const REVIEWED_PRE_LIVE_FROZEN_COMMIT = "fe620a3d8e36cf81d70d39c426a22783c555379a";
export const FROZEN_BENCHMARK_VERSION = "stage-2.2.1/v0.1";
export const FROZEN_DATASET_HASH = "992db12b706414bec4b9dadb2e591e1c220a90af6962853cb5b3d89af6dda53e";
export const FROZEN_CONFIG_HASH = "f7c3ec971e427cf32a936d8b1f1f5f0ec813afdc60d2329cf261aa7c447c6420";
export const PREPARED_MANIFEST_PATH = "config/live-semantic/run-manifest.prepared.json";
export const DEEPSEEK_OBSERVED_PROVIDER_MODEL = "deepseek-flash";
export const PROVIDER_MODEL_ALIAS_ONLY = "PROVIDER_MODEL_ALIAS_ONLY";

const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const commit = z.string().regex(/^[a-f0-9]{40}$/);
const timestamp = z.string().datetime({ offset: true });
const probeAttestationSchema = z.strictObject({
  status: z.literal("PASS"),
  providerStatus: z.literal("completed"),
  realProbeCalls: z.literal(1),
  benchmarkCalls: z.literal(0),
  requestedModelId: z.literal(DEEPSEEK_REQUESTED_MODEL),
  observedProviderModel: z.literal(DEEPSEEK_OBSERVED_PROVIDER_MODEL),
  modelIdentityClass: z.literal(PROVIDER_MODEL_ALIAS_ONLY),
  inputTokens: z.literal(939),
  outputTokens: z.literal(85),
  reasoningTokens: z.literal(0),
  semanticVerdict: z.literal("SUPPORTED"),
  structuredParser: z.literal("PASS"),
});

export const runManifestSchema = z.strictObject({
  experimentId: z.string().regex(/^[a-z0-9][a-z0-9.-]+$/),
  benchmarkVersion: z.literal(FROZEN_BENCHMARK_VERSION),
  datasetHash: sha256,
  evaluationConfigHash: sha256,
  reviewedFrozenCommit: commit,
  provider: z.literal(DEEPSEEK_PROVIDER),
  requestedModelId: z.literal(DEEPSEEK_REQUESTED_MODEL),
  observedProviderModel: z.literal(DEEPSEEK_OBSERVED_PROVIDER_MODEL),
  modelIdentityClass: z.literal(PROVIDER_MODEL_ALIAS_ONLY),
  expectedResolvedModelVersion: z.literal(DEEPSEEK_OBSERVED_PROVIDER_MODEL).nullable(),
  probeAttestation: probeAttestationSchema,
  temperature: z.number(),
  maxOutputTokens: z.number().int().positive(),
  primaryEnabled: z.boolean(),
  stabilityEnabled: z.boolean(),
  expectedCallCount: z.number().int().positive(),
  createdAt: timestamp,
  authorizedAt: timestamp.nullable(),
  authorizedBy: z.string().min(1).nullable(),
  liveRunCodeGitSha: commit.nullable(),
  singleSessionRequired: z.literal(true),
  requireCleanWorktree: z.literal(true),
  resultDirectory: z.string().regex(/^results\/live-semantic\/[a-z0-9][a-z0-9.-]+$/),
  status: z.enum(["PREPARED_NOT_AUTHORIZED", "AUTHORIZED"]),
});

export type RunManifest = z.infer<typeof runManifestSchema>;

export function readPreparedManifest(path = PREPARED_MANIFEST_PATH): RunManifest {
  return readRunManifest(path);
}

export function readRunManifest(path: string): RunManifest {
  return runManifestSchema.parse(JSON.parse(readFileSync(path, "utf8")));
}

export function assertPreparedManifest(manifest: RunManifest): void {
  if (manifest.status !== "PREPARED_NOT_AUTHORIZED" || manifest.requestedModelId !== DEEPSEEK_REQUESTED_MODEL ||
      manifest.observedProviderModel !== DEEPSEEK_OBSERVED_PROVIDER_MODEL ||
      manifest.modelIdentityClass !== PROVIDER_MODEL_ALIAS_ONLY ||
      manifest.expectedResolvedModelVersion !== DEEPSEEK_OBSERVED_PROVIDER_MODEL ||
      manifest.authorizedAt !== null || manifest.authorizedBy !== null || manifest.liveRunCodeGitSha !== null)
    throw new Error("PREPARED_MANIFEST_MUST_NOT_AUTHORIZE_LIVE_RUN");
  if (manifest.datasetHash !== FROZEN_DATASET_HASH || manifest.evaluationConfigHash !== FROZEN_CONFIG_HASH ||
      manifest.reviewedFrozenCommit !== REVIEWED_PRE_LIVE_FROZEN_COMMIT ||
      manifest.temperature !== decoding.temperature || manifest.maxOutputTokens !== decoding.maxTokens ||
      !manifest.primaryEnabled || !manifest.stabilityEnabled)
    throw new Error("PREPARED_MANIFEST_FREEZE_MISMATCH");
}

export function assertAuthorizedManifest(manifest: RunManifest): asserts manifest is RunManifest & {
  status: "AUTHORIZED"; requestedModelId: typeof DEEPSEEK_REQUESTED_MODEL;
  expectedResolvedModelVersion: typeof DEEPSEEK_OBSERVED_PROVIDER_MODEL;
  authorizedAt: string; authorizedBy: string; liveRunCodeGitSha: string;
} {
  if (manifest.status !== "AUTHORIZED" || !manifest.requestedModelId || !manifest.expectedResolvedModelVersion ||
      !manifest.authorizedAt || !manifest.authorizedBy || !manifest.liveRunCodeGitSha)
    throw new Error("LIVE_RUN_NOT_AUTHORIZED: reviewed model, resolved version and Product Owner authorization required");
  if (manifest.datasetHash !== FROZEN_DATASET_HASH || manifest.evaluationConfigHash !== FROZEN_CONFIG_HASH ||
      manifest.reviewedFrozenCommit !== REVIEWED_PRE_LIVE_FROZEN_COMMIT ||
      manifest.observedProviderModel !== DEEPSEEK_OBSERVED_PROVIDER_MODEL ||
      manifest.modelIdentityClass !== PROVIDER_MODEL_ALIAS_ONLY ||
      manifest.expectedResolvedModelVersion !== manifest.observedProviderModel ||
      manifest.temperature !== decoding.temperature || manifest.maxOutputTokens !== decoding.maxTokens ||
      !manifest.primaryEnabled || !manifest.stabilityEnabled)
    throw new Error("LIVE_RUN_NOT_AUTHORIZED: manifest does not match frozen benchmark/config");
}

export function assertB0ExecutionDisabled(): never {
  throw new Error("LIVE_RUN_NOT_AUTHORIZED: DeepSeek probe and Stage 2.2.1B require separate Product Owner authorization");
}
