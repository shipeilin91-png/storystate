import { z } from "zod";
import { execFileSync } from "node:child_process";
import { genericSemanticCheckSchema, semanticCheckSchema, type Specialist, type ValidationCheck } from "../domain/validation";
import { aggregateChecks, impactPolicy } from "../server/validator/aggregate";
import { deterministicGate } from "../server/validator/deterministic";
import { packetHash, type ValidationPacket } from "../server/validator/context";
import { parseGenericSemanticOutput, parseSemanticOutput, routeAgents, specialistPrompts } from "../server/validator/semantic";
import { genericSemanticPrompt } from "../server/validator/generic-contract";
import { aggregateSemantic, deepFreeze, digest, type BoundCase, type Routing, type Verdict } from "./contract";

export const genericPrompt = genericSemanticPrompt;
export const genericCheckSchema = genericSemanticCheckSchema;
export const decoding = deepFreeze({ temperature: 0, maxTokens: 500, responses: 1, retries: 0, tools: false });
export type EvalAgent = Specialist | "generic";
export type ModelIdentity = { provider: string; modelId: string; modelVersion: string };
export type Usage = { inputTokens: number; outputTokens: number };
export function responseSchemaFor(agent: EvalAgent) { return z.toJSONSchema(agent === "generic" ? genericCheckSchema : semanticCheckSchema); }
export function evaluationConfigHash(): string {
  return digest({ genericPrompt, specialistPrompts, decoding, genericSchema: responseSchemaFor("generic"), specialistSchema: responseSchemaFor("evidence") });
}
export type EvalRequest = {
  agent: EvalAgent; system: string; packet: ValidationPacket; identity: ModelIdentity;
  decoding: typeof decoding; responseSchema: ReturnType<typeof responseSchemaFor>; signal: AbortSignal;
};
export type ProviderMetadata = { responseId?: string; finishReason?: string };
export interface EvalModelClient {
  readonly kind: "mock" | "live";
  readonly identity: ModelIdentity;
  complete(request: EvalRequest): Promise<{ output: unknown; usage?: Usage | null; resolvedIdentity?: ModelIdentity; providerMetadata?: ProviderMetadata }>;
}
export type CallRecord = {
  agent: EvalAgent; latencyMs: number; usage: Usage | null; error: string | null;
  providerResponseId: string | null; finishReason: string | null;
  check: { agent: EvalAgent; verdict: Verdict; reason: string; evidenceIds: string[] };
};
export type CaseResult = {
  caseId: string; architecture: "generic" | "specialist"; run: number; phase: "primary" | "stability";
  semanticVerdict: Verdict | null; finalRouting: Routing; modelCalls: number; latencyMs: number;
  calls: CallRecord[]; packetHash: string; gateCode: string; eligible: boolean;
};
export type EvaluationRun = {
  label: "HARNESS TEST ONLY" | "LIVE MODEL EVALUATION"; identity: ModelIdentity;
  decoding: typeof decoding; datasetHash: string; evaluationConfigHash: string; frozenCommit: string | null; results: CaseResult[];
};
export function datasetHash(cases: readonly BoundCase[]): string { return digest(cases); }
const freezeLockSchema = z.strictObject({
  benchmarkVersion: z.string().min(1), status: z.literal("FROZEN_BEFORE_LIVE_RUN"),
  datasetHash: z.string().regex(/^[a-f0-9]{64}$/), benchmarkFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  evaluationConfigHash: z.string().regex(/^[a-f0-9]{64}$/), sourceDigest: z.string().regex(/^[a-f0-9]{64}$/),
  caseCount: z.number().int().positive(), anchorCount: z.number().int().nonnegative(), holdoutCount: z.number().int().positive(),
  realProviderCalls: z.literal(0),
});
export function verifyLiveFreeze(dataset: string, config: string, frozenCommit: string) {
  try {
    if (!/^[a-f0-9]{40}$/.test(frozenCommit)) throw new Error("invalid commit");
    const git = (args: string[]) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 128 * 1024 }).trim();
    const root = git(["rev-parse", "--show-toplevel"]);
    const resolved = git(["-C", root, "rev-parse", "--verify", `${frozenCommit}^{commit}`]);
    if (resolved !== frozenCommit) throw new Error("commit mismatch");
    const lock = freezeLockSchema.parse(JSON.parse(git(["-C", root, "show", `${resolved}:tests/fixtures/live-semantic-benchmark.lock.json`])));
    if (lock.datasetHash !== dataset || lock.evaluationConfigHash !== config || lock.caseCount !== lock.anchorCount + lock.holdoutCount)
      throw new Error("lock mismatch");
    return lock;
  } catch {
    throw new Error("LIVE_RUN_NOT_AUTHORIZED: frozen Git commit and lock manifest must match the reviewed dataset/config");
  }
}
export function parseGeneric(raw: unknown, packet: ValidationPacket) {
  return parseGenericSemanticOutput(raw, packet);
}
const usageSchema = z.strictObject({ inputTokens: z.number().int().nonnegative(), outputTokens: z.number().int().nonnegative() });
export async function runEvaluation(cases: readonly BoundCase[], client: EvalModelClient, options: {
  expectedDatasetHash: string; expectedConfigHash?: string; stability?: boolean; allowLive?: boolean; frozenCommit?: string;
  timeoutMs?: number; clock?: () => number;
}): Promise<EvaluationRun> {
  if (datasetHash(cases) !== options.expectedDatasetHash) throw new Error("BENCHMARK_FREEZE_MISMATCH");
  const configHash = evaluationConfigHash();
  if (options.expectedConfigHash && configHash !== options.expectedConfigHash) throw new Error("EVALUATION_CONFIG_MISMATCH");
  if (client.kind === "live") {
    if (!options.allowLive || !options.expectedConfigHash || !options.frozenCommit)
      throw new Error("LIVE_RUN_NOT_AUTHORIZED: explicit approval and pre-run freeze commit required");
    verifyLiveFreeze(options.expectedDatasetHash, configHash, options.frozenCommit);
  }
  const identity = z.strictObject({ provider: z.string().min(1), modelId: z.string().min(1), modelVersion: z.string().min(1) }).parse(client.identity);
  const identityKey = digest(identity);
  const clock = options.clock ?? (() => performance.now());
  const results: CaseResult[] = [];
  const casesBefore = datasetHash(cases);
  // Validate the complete Holdout before any calls. No semantic-only gate bypass.
  for (const c of cases) {
    const gate = deterministicGate(c.aggregate, c.delta, c.aggregate.story.currentVersion);
    if (c.metadata.set === "holdout" && gate.terminal) throw new Error(`BENCHMARK_CASE_BLOCKED: ${c.metadata.caseId}: ${gate.check.code}: ${gate.check.reason}`);
  }
  async function call(agent: EvalAgent, packet: ValidationPacket): Promise<CallRecord> {
    const started = clock(), controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined, usage: Usage | null = null;
    try {
      if (digest(client.identity) !== identityKey) throw new Error("MODEL_IDENTITY_CHANGED");
      const request: EvalRequest = {
        agent, system: agent === "generic" ? genericPrompt : specialistPrompts[agent],
        packet: structuredClone(packet), identity: structuredClone(identity), decoding: structuredClone(decoding),
        responseSchema: responseSchemaFor(agent), signal: controller.signal,
      };
      const timedOut = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("TIMEOUT")); }, options.timeoutMs ?? 15000); });
      const response = await Promise.race([client.complete(request), timedOut]);
      if (digest(client.identity) !== identityKey || (response.resolvedIdentity && digest(response.resolvedIdentity) !== identityKey) ||
          (client.kind === "live" && !response.resolvedIdentity)) throw new Error("MODEL_IDENTITY_CHANGED");
      if (response.usage) usage = usageSchema.parse(response.usage);
      const check = agent === "generic" ? parseGeneric(response.output, packet) : parseSemanticOutput(response.output, agent, packet);
      return { agent, check, usage, error: null, latencyMs: Math.max(0, clock() - started),
        providerResponseId: response.providerMetadata?.responseId ?? null, finishReason: response.providerMetadata?.finishReason ?? null };
    } catch (error) {
      if (error instanceof Error && error.message === "MODEL_IDENTITY_CHANGED") throw error;
      return { agent, check: { agent, verdict: "UNCERTAIN", reason: "Semantic check unavailable or invalid; review required.", evidenceIds: [] },
        error: "SEMANTIC_UNAVAILABLE", usage, latencyMs: Math.max(0, clock() - started), providerResponseId: null, finishReason: null };
    } finally { clearTimeout(timer); }
  }
  async function evaluate(c: BoundCase, architecture: CaseResult["architecture"], run: number, phase: CaseResult["phase"]) {
    const started = clock(), gate = deterministicGate(c.aggregate, c.delta, c.aggregate.story.currentVersion);
    const packet = structuredClone(c.packet), calls: CallRecord[] = [];
    let finalRouting: Routing, semanticVerdict: Verdict | null = null;
    if (gate.terminal) finalRouting = aggregateChecks(gate, null, [], []).recommendation;
    else if (architecture === "generic") {
      calls.push(await call("generic", packet));
      semanticVerdict = calls[0].check.verdict;
      const policy = impactPolicy(packet);
      finalRouting = semanticVerdict !== "SUPPORTED" || policy.review || packet.provenance.retrievalTruncated ? "NEEDS_REVIEW" : "AUTO_ACCEPT_ELIGIBLE";
    } else {
      const agents = routeAgents(packet);
      for (const agent of agents) calls.push(await call(agent, packet));
      semanticVerdict = aggregateSemantic(calls.map(c => c.check.verdict));
      finalRouting = aggregateChecks(gate, packet, agents, calls.map(c => c.check) as ValidationCheck[]).recommendation;
    }
    results.push({ caseId: c.metadata.caseId, architecture, run, phase, semanticVerdict, finalRouting,
      modelCalls: calls.length, latencyMs: Math.max(0, clock() - started), calls,
      packetHash: packetHash(packet), gateCode: gate.check.code!, eligible: !gate.terminal });
  }
  async function round(selected: readonly BoundCase[], run: number, phase: CaseResult["phase"]) {
    for (const [index, c] of selected.entries()) {
      const order = (index + run) % 2 ? ["specialist", "generic"] as const : ["generic", "specialist"] as const;
      for (const architecture of order) await evaluate(c, architecture, run, phase);
    }
  }
  await round(cases, 0, "primary");
  if (options.stability) for (let run = 1; run <= 3; run++)
    await round(cases.filter(c => c.metadata.set === "holdout" && c.metadata.stabilitySelected), run, "stability");
  if (datasetHash(cases) !== casesBefore) throw new Error("BENCHMARK_MUTATED");
  return deepFreeze({ label: client.kind === "mock" ? "HARNESS TEST ONLY" : "LIVE MODEL EVALUATION", identity, decoding,
    datasetHash: casesBefore, evaluationConfigHash: configHash, frozenCommit: options.frozenCommit ?? null, results });
}
