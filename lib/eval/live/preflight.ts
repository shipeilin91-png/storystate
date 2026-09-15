import { readFileSync } from "node:fs";
import type { ValidationPacket } from "../../server/validator/context";
import { routeAgents, specialistPrompts } from "../../server/validator/semantic";
import { buildBenchmark, benchmarkFingerprint, sourceDigest } from "../../../tests/fixtures/live-semantic-benchmark";
import {
  buildDeepSeekRequest,
  DEEPSEEK_PROVIDER,
  DEEPSEEK_REQUESTED_MODEL,
  serializeDeepSeekRequestForBudget,
} from "../providers/deepseek";
import { datasetHash, decoding, evaluationConfigHash, genericPrompt, responseSchemaFor, verifyLiveFreeze, type EvalAgent, type EvalRequest } from "../runner";
import {
  assertPreparedManifest,
  readPreparedManifest,
  REVIEWED_PRE_LIVE_FROZEN_COMMIT,
} from "./manifest";

type PlannedRequest = {
  caseId: string;
  architecture: "generic" | "specialist";
  phase: "primary" | "stability";
  run: number;
  agent: EvalAgent;
  serialized: string;
  chars: number;
  bytes: number;
};

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(sorted.length / 2)]) / 2;
}

function requestFor(agent: EvalAgent, packet: ValidationPacket): EvalRequest {
  return {
    agent,
    system: agent === "generic" ? genericPrompt : specialistPrompts[agent],
    packet,
    identity: { provider: DEEPSEEK_PROVIDER, modelId: DEEPSEEK_REQUESTED_MODEL, modelVersion: "NOT_RESOLVED" },
    decoding,
    responseSchema: responseSchemaFor(agent),
    signal: new AbortController().signal,
  };
}

function estimateTokens(serialized: string) {
  const cjk = [...serialized].filter(character => /[\u3400-\u9fff\uf900-\ufaff]/u.test(character)).length;
  const nonCjk = [...serialized].length - cjk;
  return {
    low: Math.ceil(cjk + nonCjk / 4),
    high: Math.ceil(cjk * 2 + nonCjk / 2),
  };
}

export async function buildLivePreflight() {
  const lock = JSON.parse(readFileSync("tests/fixtures/live-semantic-benchmark.lock.json", "utf8"));
  const manifest = readPreparedManifest();
  assertPreparedManifest(manifest);
  const cases = await buildBenchmark();
  const actualDatasetHash = datasetHash(cases);
  const actualConfigHash = evaluationConfigHash();
  verifyLiveFreeze(actualDatasetHash, actualConfigHash, REVIEWED_PRE_LIVE_FROZEN_COMMIT);
  if (actualDatasetHash !== lock.datasetHash || actualConfigHash !== lock.evaluationConfigHash ||
      benchmarkFingerprint(cases) !== lock.benchmarkFingerprint || sourceDigest() !== lock.sourceDigest)
    throw new Error("LIVE_PREFLIGHT_FREEZE_MISMATCH");

  const requests: PlannedRequest[] = [];
  function plan(caseId: string, packet: ValidationPacket, architecture: PlannedRequest["architecture"], phase: PlannedRequest["phase"], run: number, agent: EvalAgent) {
    const serialized = serializeDeepSeekRequestForBudget(buildDeepSeekRequest(requestFor(agent, packet)));
    requests.push({ caseId, architecture, phase, run, agent, serialized, chars: [...serialized].length, bytes: Buffer.byteLength(serialized, "utf8") });
  }
  for (const benchmarkCase of cases) {
    plan(benchmarkCase.metadata.caseId, benchmarkCase.packet, "generic", "primary", 0, "generic");
    for (const agent of routeAgents(benchmarkCase.packet)) plan(benchmarkCase.metadata.caseId, benchmarkCase.packet, "specialist", "primary", 0, agent);
  }
  for (const benchmarkCase of cases.filter(item => item.metadata.set === "holdout" && item.metadata.stabilitySelected)) {
    for (let run = 1; run <= 3; run++) {
      plan(benchmarkCase.metadata.caseId, benchmarkCase.packet, "generic", "stability", run, "generic");
      for (const agent of routeAgents(benchmarkCase.packet)) plan(benchmarkCase.metadata.caseId, benchmarkCase.packet, "specialist", "stability", run, agent);
    }
  }
  if (manifest.expectedCallCount !== requests.length) throw new Error("PREPARED_MANIFEST_CALL_COUNT_MISMATCH");
  const inputEstimate = requests.map(request => estimateTokens(request.serialized));
  const bytes = requests.map(request => request.bytes);
  const primaryGenericCalls = requests.filter(request => request.phase === "primary" && request.agent === "generic").length;
  const primarySpecialistCalls = requests.filter(request => request.phase === "primary" && request.agent !== "generic").length;
  const stabilityGenericCalls = requests.filter(request => request.phase === "stability" && request.agent === "generic").length;
  const stabilitySpecialistCalls = requests.filter(request => request.phase === "stability" && request.agent !== "generic").length;
  return {
    label: "OFFLINE PREFLIGHT — ZERO PROVIDER CALLS",
    benchmark: {
      version: manifest.benchmarkVersion,
      datasetHash: actualDatasetHash,
      evaluationConfigHash: actualConfigHash,
      reviewedFrozenCommit: manifest.reviewedFrozenCommit,
      lockMatched: true,
    },
    provider: DEEPSEEK_PROVIDER,
    requestedModelId: DEEPSEEK_REQUESTED_MODEL,
    observedProviderModel: manifest.observedProviderModel,
    modelIdentityClass: manifest.modelIdentityClass,
    calls: {
      total: requests.length,
      primary: { generic: primaryGenericCalls, specialist: primarySpecialistCalls },
      stability: { generic: stabilityGenericCalls, specialist: stabilitySpecialistCalls },
      byAgent: Object.fromEntries(["generic", "evidence", "knowledge_boundary", "temporal_state"].map(agent =>
        [agent, requests.filter(request => request.agent === agent).length])),
    },
    requestSize: {
      totalChars: requests.reduce((sum, request) => sum + request.chars, 0),
      totalBytes: bytes.reduce((sum, value) => sum + value, 0),
      meanBytes: bytes.reduce((sum, value) => sum + value, 0) / bytes.length,
      medianBytes: median(bytes),
      maxBytes: Math.max(...bytes),
    },
    roughLocalTokenBudgetEstimate: {
      label: "NOT PROVIDER TOKEN COUNT — FOR QUOTA PLANNING ONLY",
      estimatedTotalInputTokens: {
        low: inputEstimate.reduce((sum, estimate) => sum + estimate.low, 0),
        high: inputEstimate.reduce((sum, estimate) => sum + estimate.high, 0),
      },
      estimatedOutputTokenCeiling: requests.length * decoding.maxTokens,
      method: "Per serialized mixed Chinese/English/JSON request: CJK + non-CJK/4 (low), 2*CJK + non-CJK/2 (conservative high). Output is calls * frozen maxOutputTokens.",
    },
    quotaWorksheet: {
      requiredCalls: requests.length,
      actualProviderRequestLimits: "TO_BE_FILLED_AFTER_PO_REVIEW",
      actualApplicableTokenLimits: "TO_BE_FILLED_AFTER_PO_REVIEW",
      reviewedPricingConfiguration: "NOT_AUTHORIZED",
      estimatedRequestTokenNeed: "See roughLocalTokenBudgetEstimate; not a provider token count.",
      decision: "PENDING_SEPARATE_OFFICIAL_RUN_AUTHORIZATION",
      rule: "Do not start or switch provider/model without a reviewed manifest and separate Product Owner authorization.",
    },
    realProviderCalls: 0,
  } as const;
}
