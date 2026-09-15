import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildBenchmark, benchmarkMetadata, benchmarkFingerprint, sourceDigest, evidenceById, minimalPairs } from "./fixtures/live-semantic-benchmark";
import { aggregateSemantic, digest, type BoundCase, type Verdict } from "../lib/eval/contract";
import { datasetHash, decoding, evaluationConfigHash, genericPrompt, parseGeneric, runEvaluation, verifyLiveFreeze, type EvalModelClient, type EvalRequest, type Usage } from "../lib/eval/runner";
import { calculateMetrics, renderReport } from "../lib/eval/metrics";
import { deterministicGate } from "../lib/server/validator/deterministic";
import { packetHash } from "../lib/server/validator/context";
import { routeAgents, specialistPrompts } from "../lib/server/validator/semantic";
import { aggregateChecks } from "../lib/server/validator/aggregate";

const lock = JSON.parse(readFileSync("tests/fixtures/live-semantic-benchmark.lock.json", "utf8"));
const all = buildBenchmark();
class MockClient implements EvalModelClient {
  readonly kind = "mock" as const;
  readonly identity = { provider: "deterministic-fixture", modelId: "harness-only", modelVersion: "v1" };
  requests: EvalRequest[] = [];
  constructor(private respond: (request: EvalRequest) => unknown = request => answer(request), private usage?: Usage) {}
  async complete(request: EvalRequest) {
    this.requests.push(structuredClone({ ...request, signal: undefined }) as unknown as EvalRequest);
    return { output: await this.respond(request), usage: this.usage };
  }
}
function answer(request: EvalRequest, verdict: Verdict = "SUPPORTED") {
  return { agent: request.agent, verdict, reason: "Deterministic harness response only.", evidenceIds: request.packet.primaryEvidence.map(e => e.id) };
}
const runOptions = { expectedDatasetHash: lock.datasetHash, expectedConfigHash: lock.evaluationConfigHash };
const byId = (cases: readonly BoundCase[], id: string) => cases.find(c => c.metadata.caseId === id)!;

test("freeze: exactly 10 Anchor + 20 Holdout, 5 per group, 8/8/4, unique IDs", async () => {
  const cases = await all, holdout = cases.filter(c => c.metadata.set === "holdout");
  assert.equal(cases.length, 30);
  assert.equal(cases.filter(c => c.metadata.set === "anchor").length, 10);
  assert.equal(holdout.length, 20);
  assert.equal(new Set(cases.map(c => c.metadata.caseId)).size, 30);
  for (const group of ["control", "evidence", "knowledge", "temporal"]) assert.equal(holdout.filter(c => c.metadata.group === group).length, 5);
  for (const [verdict, n] of Object.entries(benchmarkMetadata.holdoutDistribution)) assert.equal(holdout.filter(c => c.metadata.goldSemanticVerdict === verdict).length, n);
  assert.equal(datasetHash(cases), lock.datasetHash);
  assert.equal(benchmarkFingerprint(cases), lock.benchmarkFingerprint);
  assert.equal(sourceDigest(), lock.sourceDigest);
  assert.equal(evaluationConfigHash(), lock.evaluationConfigHash);
});

test("freeze is reproducible and rejects changes to Gold, packets or candidate inputs", async () => {
  const cases = await all;
  assert.equal(datasetHash(await buildBenchmark()), datasetHash(cases));
  assert.throws(() => { cases[0].metadata.goldSemanticVerdict = "UNCERTAIN"; }, TypeError);
  assert.throws(() => { cases[0].packet.primaryEvidence.pop(); }, TypeError);
  const changed = structuredClone(cases);
  changed[0].metadata.goldSemanticVerdict = "UNCERTAIN";
  const client = new MockClient();
  await assert.rejects(runEvaluation(changed, client, runOptions), /FREEZE_MISMATCH/);
  assert.equal(client.requests.length, 0);
});

test("all Holdouts pass real production deterministicGate, without fake acceptance or mutation", async (t) => {
  for (const c of (await all).filter(c => c.metadata.set === "holdout")) await t.test(c.metadata.caseId, () => {
    const before = digest(c);
    const gate = deterministicGate(c.aggregate, c.delta, c.aggregate.story.currentVersion);
    assert.equal(gate.terminal, null, gate.check.reason);
    assert.equal(c.delta.decision, "needs_review");
    assert.equal(c.delta.committedVersionId, null);
    assert.deepEqual(c.delta.decisions, []);
    assert.equal(c.packet.provenance.retrievalTruncated, false);
    assert.equal(digest(c), before);
    // Gold is used here only to verify the frozen routing contract, never sent in a request.
    const agents = routeAgents(c.packet);
    assert.equal(aggregateChecks(gate, c.packet, agents, agents.map(agent => ({
      agent, verdict: c.metadata.goldSemanticVerdict, reason: "Harness oracle.", evidenceIds: c.delta.evidenceIds,
    }))).recommendation, c.metadata.goldFinalRouting);
  });
});

test("gate-blocked Holdout stops the entire experiment before any call", async () => {
  const cases = structuredClone(await all);
  const c = byId(cases, "H01");
  c.delta.before = { value: "Home", status: "resolved", lastConfirmedValue: "Home" };
  const client = new MockClient();
  await assert.rejects(runEvaluation(cases, client, { expectedDatasetHash: datasetHash(cases) }), /BENCHMARK_CASE_BLOCKED: H01: STALE_STATE/);
  assert.equal(client.requests.length, 0);
});

test("H09 uses explicit_operational and exactly the bounded-cooperation evidence of H08", async () => {
  const cases = await all, a = byId(cases, "H08"), b = byId(cases, "H09");
  assert.deepEqual(a.packet.primaryEvidence, b.packet.primaryEvidence);
  const after = b.delta.after as Record<string, unknown>;
  assert.equal(after.category, "explicit_operational");
  assert.equal(after.predicate, "cooperation");
  assert.equal(after.scope, "general ongoing beyond current escape");
  assert.deepEqual({ ...after, scope: "current escape" }, a.delta.after);
  assert.equal(b.packet.primaryEvidence[0].quote, "这一次我信你。先带我们离开这里，别替我决定下一步");
});

test("H16/H17 are the same Chen movement with arrival versus direction evidence", async () => {
  const cases = await all, arrived = byId(cases, "H16"), direction = byId(cases, "H17");
  for (const key of ["targetType", "targetId", "fieldPath", "before", "after"] as const) assert.deepEqual(arrived.delta[key], direction.delta[key]);
  assert.equal((direction.delta.before as { value: string }).value, "Maintenance Tunnel");
  assert.equal((direction.delta.after as { value: string }).value, "Old Pump House");
  assert.ok(direction.packet.primaryEvidence.some(e => e.quote === "三个人沿着维护隧道向旧泵房方向撤离"));
  assert.ok(arrived.packet.primaryEvidence.some(e => e.quote.includes("旧泵房的铁门还能从里面插上")));
  assert.equal(direction.metadata.goldSemanticVerdict, "UNSUPPORTED");
  assert.equal(arrived.metadata.goldSemanticVerdict, "SUPPORTED");
});

test("minimal pairs and ten stability cases are preselected independently of outputs", async () => {
  const cases = await all, selected = cases.filter(c => c.metadata.stabilitySelected);
  assert.deepEqual(selected.map(c => c.metadata.caseId), benchmarkMetadata.stabilitySelectedIds);
  for (const [group, n] of [["control", 2], ["evidence", 2], ["knowledge", 3], ["temporal", 3]] as const)
    assert.equal(selected.filter(c => c.metadata.group === group).length, n);
  assert.equal(minimalPairs.length, 6);
  assert.ok(minimalPairs.every(pair => pair.cases.every(id => cases.some(c => c.metadata.caseId === id))));
  const holder = byId(cases, "H06"), owner = byId(cases, "H07");
  assert.deepEqual(holder.packet.primaryEvidence, owner.packet.primaryEvidence);
  assert.deepEqual(holder.delta.before, owner.delta.before);
  assert.deepEqual(holder.delta.after, owner.delta.after);
});

test("ablations preserve sources and exclude decisive IDs everywhere in model packets", async (t) => {
  const cases = await all;
  for (const id of ["H10", "H15", "H19", "H20"]) await t.test(id, () => {
    const c = byId(cases, id), audit = c.ablation!;
    assert.ok(audit && audit.removedDecisiveEvidenceIds.length && audit.remainingEvidenceIds.length);
    assert.equal(c.metadata.goldSemanticVerdict, "UNCERTAIN");
    assert.deepEqual(c.packet.candidateDelta.evidenceIds, audit.remainingEvidenceIds);
    assert.deepEqual(new Set([...c.packet.primaryEvidence, ...c.packet.retrievedEvidence].map(e => e.id)), new Set(audit.remainingEvidenceIds));
    for (const eid of audit.fullEvidenceIds) {
      const e = evidenceById(c, eid), source = c.aggregate.revisions.find(r => r.id === e.sourceRevisionId)!;
      assert.equal(source.content.slice(e.start, e.end), e.quote);
      assert.equal(source.visibility, "canonical");
    }
    for (const eid of audit.removedDecisiveEvidenceIds) {
      assert.ok(audit.fullEvidenceIds.includes(eid));
      assert.ok(audit.removedEvidenceIds.includes(eid));
      assert.ok(!JSON.stringify(c.packet).includes(eid), `Removed ID leaked: ${eid}`);
      assert.ok(!JSON.stringify(c.packet).includes(evidenceById(c, eid).quote));
    }
    assert.equal(sourceDigest(), lock.sourceDigest);
  });
});

test("ablation retained text is the prespecified non-contradictory partial context", async () => {
  const cases = await all, quotes = (id: string) => byId(cases, id).packet.primaryEvidence.map(e => e.quote);
  assert.deepEqual(quotes("H10"), ["被篡改的记录把运往十九号冷库的设备改写成了不存在的货船"]);
  assert.deepEqual(quotes("H15"), ["顾言看见徽记随角度变色，也认出证件格式", "市刑侦支队，陈默，警号 071306。"]);
  assert.deepEqual(quotes("H19"), ["林夏在处置室外等了十分钟。", "林夏始终把 USB 握在自己手里"]);
  assert.deepEqual(quotes("H20"), ["她取出货单残页，将背面的三组字符输入 USB 的第二层密钥框。"]);
});

test("Generic is one call; specialists use production routing/prompts; model packets are identical and Gold-free", async () => {
  const cases = await all, client = new MockClient(), before = datasetHash(cases);
  const run = await runEvaluation(cases, client, runOptions);
  for (const c of cases) {
    const results = run.results.filter(r => r.caseId === c.metadata.caseId);
    assert.equal(results.find(r => r.architecture === "generic")!.modelCalls, 1);
    assert.equal(results.find(r => r.architecture === "specialist")!.modelCalls, routeAgents(c.packet).length);
    assert.equal(new Set(results.map(r => r.packetHash)).size, 1);
  }
  for (const request of client.requests) {
    const expected = cases.find(c => packetHash(c.packet) === packetHash(request.packet))!;
    assert.ok(expected);
    assert.deepEqual(request.packet, expected.packet);
    assert.deepEqual(request.identity, client.identity);
    assert.deepEqual(request.decoding, decoding);
    assert.equal(request.system, request.agent === "generic" ? genericPrompt : specialistPrompts[request.agent]);
    for (const forbidden of ["goldSemanticVerdict", "goldFinalRouting", "rationale", "stabilitySelected", "caseId", "fixtureReference", "minimalPairs", "\"group\""])
      assert.ok(!JSON.stringify(request).includes(forbidden), forbidden);
  }
  assert.equal(run.label, "HARNESS TEST ONLY");
  assert.equal(datasetHash(cases), before);
  assert.ok(!genericPrompt.includes("H01"));
});

test("semantic aggregation is evaluation-only UNSUPPORTED > UNCERTAIN > SUPPORTED", () => {
  assert.equal(aggregateSemantic(["SUPPORTED", "UNSUPPORTED", "UNCERTAIN"]), "UNSUPPORTED");
  assert.equal(aggregateSemantic(["SUPPORTED", "UNCERTAIN"]), "UNCERTAIN");
  assert.equal(aggregateSemantic(["SUPPORTED", "SUPPORTED"]), "SUPPORTED");
  assert.equal(aggregateSemantic([]), "UNCERTAIN");
});

test("strict generic schema rejects extra dimensions, risk, recommendations, confidence and fabricated citations", async () => {
  const packet = (await all)[0].packet;
  const valid = { agent: "generic", verdict: "SUPPORTED", reason: "One judgment.", evidenceIds: packet.primaryEvidence.map(e => e.id) };
  assert.deepEqual(parseGeneric(JSON.stringify(valid), packet), valid);
  for (const field of ["risk", "recommendation", "confidence", "knowledgeVerdict"])
    assert.throws(() => parseGeneric({ ...valid, [field]: 1 }, packet));
  assert.throws(() => parseGeneric({ ...valid, evidenceIds: [] }, packet));
  assert.throws(() => parseGeneric("malformed", packet));
});

test("error, malformed, partial and uncertain outputs change routing and are never credited as semantic success", async (t) => {
  const c = byId(await all, "H01"), subset = [c], options = { expectedDatasetHash: datasetHash(subset), timeoutMs: 5 };
  for (const mode of ["throw", "malformed", "partial", "uncertain", "unsupported", "timeout"] as const) await t.test(mode, async () => {
    const client = new MockClient(request => {
      if (mode === "throw" || (mode === "partial" && request.agent === "temporal_state")) throw new Error("secret provider message");
      if (mode === "malformed") return { ...answer(request), confidence: 0.9 };
      if (mode === "timeout") return new Promise(() => {});
      return answer(request, mode === "uncertain" ? "UNCERTAIN" : mode === "unsupported" ? "UNSUPPORTED" : "SUPPORTED");
    });
    const run = await runEvaluation(subset, client, options);
    assert.equal(run.results.find(r => r.architecture === "specialist")!.finalRouting, "NEEDS_REVIEW");
    if (mode !== "partial") assert.equal(run.results.find(r => r.architecture === "generic")!.finalRouting, "NEEDS_REVIEW");
    assert.ok(!JSON.stringify(run).includes("secret provider message"));
  });
});

test("metric math separates anchors, safety, coverage, groups and infrastructure failure", async () => {
  const cases = await all;
  const run = await runEvaluation(cases, new MockClient(), runOptions);
  const m = calculateMetrics(cases, run);
  for (const architecture of ["generic", "specialist"] as const) {
    assert.deepEqual(m.holdout[architecture].semanticAccuracy, { count: 8, total: 20, rate: 0.4 });
    assert.deepEqual(m.holdout[architecture].falseAutoAccept, { count: 6, total: 15, rate: 0.4 });
    assert.deepEqual(m.holdout[architecture].falseAutoAcceptOverAll, { count: 6, total: 20, rate: 0.3 });
    assert.deepEqual(m.holdout[architecture].safeAutoCoverage, { count: 5, total: 5, rate: 1 });
    assert.equal(m.holdout[architecture].reviewRate.count, 9);
    assert.equal(m.holdout[architecture].perGroup.temporal.count, 1);
  }
  assert.equal(m.holdout.generic.averageModelCalls, 1);
  assert.equal(m.holdout.specialist.averageModelCalls, 2.15);
  assert.equal(m.anchor.generic.cases, 10);
  assert.equal(m.architectureEvidence.sampleSize, 20);
  assert.equal(m.allRunsConsumption.estimatedCost, null);
  const changed = structuredClone(run);
  for (const r of changed.results.filter(r => r.caseId.startsWith("Ch"))) r.semanticVerdict = "UNCERTAIN";
  assert.deepEqual(calculateMetrics(cases, changed).holdout, m.holdout);
  assert.ok(renderReport(m).startsWith("# HARNESS TEST ONLY"));
  assert.match(renderReport(m), /No model-performance or architecture conclusion/);
});

test("provider failures returning UNCERTAIN do not inflate accuracy on uncertain Gold", async () => {
  const cases = [byId(await all, "H20")];
  const run = await runEvaluation(cases, new MockClient(() => { throw new Error("unavailable"); }), { expectedDatasetHash: datasetHash(cases) });
  const metrics = calculateMetrics(cases, run);
  assert.equal(metrics.holdout.generic.semanticAccuracy.count, 0);
  assert.equal(metrics.holdout.generic.invalidOrUnavailableResponses, 1);
});

test("latency summaries, optional usage/cost and complete result accounting are deterministic", async () => {
  const cases = await all;
  let tick = 0;
  const run = await runEvaluation(cases, new MockClient(undefined, { inputTokens: 100, outputTokens: 10 }), { ...runOptions, clock: () => ++tick });
  const pricing = { ...run.identity, currency: "TEST", inputPerMillion: 2, outputPerMillion: 4 };
  const m = calculateMetrics(cases, run, pricing);
  assert.equal(m.holdout.generic.latencyMs.mean, 3);
  assert.equal(m.holdout.generic.latencyMs.median, 3);
  assert.equal(m.holdout.generic.latencyMs.p95, 3);
  assert.equal(m.anchor.generic.latencyMs.p95, null);
  assert.equal(m.holdout.generic.consumption.estimatedCost, (2000 * 2 + 200 * 4) / 1e6);
  assert.equal(m.allRunsConsumption.modelCalls, 99);
  assert.throws(() => calculateMetrics(cases, run, { ...pricing, modelVersion: "other" }), /PRICING/);
  const missing = structuredClone(run); missing.results.pop();
  assert.throws(() => calculateMetrics(cases, missing), /INCOMPLETE/);
  const duplicate = structuredClone(run); duplicate.results.push(duplicate.results[0]);
  assert.throws(() => calculateMetrics(cases, duplicate), /DUPLICATE/);
});

test("stability runs are exactly ten holdouts times three per architecture, excluding primary runs", async () => {
  const cases = await all;
  const run = await runEvaluation(cases, new MockClient(), { ...runOptions, stability: true });
  assert.equal(run.results.filter(r => r.phase === "stability").length, 60);
  const m = calculateMetrics(cases, run);
  assert.deepEqual(m.stability.generic.exactAgreement, { count: 10, total: 10, rate: 1 });
  assert.equal(m.stability.specialist.exactAgreement!.count, 10);
  const changed = structuredClone(run);
  changed.results.find(r => r.caseId === "H04" && r.architecture === "generic" && r.phase === "stability")!.semanticVerdict = "UNSUPPORTED";
  assert.equal(calculateMetrics(cases, changed).stability.generic.exactAgreement!.count, 9);
});

test("live clients are forbidden by default and model-version drift aborts the comparison", async () => {
  const cases = await all;
  let calls = 0;
  const live: EvalModelClient = { kind: "live", identity: { provider: "none", modelId: "none", modelVersion: "none" },
    complete: async () => { calls++; throw new Error("must never run"); } };
  await assert.rejects(runEvaluation(cases, live, runOptions), /LIVE_RUN_NOT_AUTHORIZED/);
  assert.equal(calls, 0);
  assert.equal(verifyLiveFreeze(lock.datasetHash, lock.evaluationConfigHash, "ddfb19260853b441b11934420ec5bce4feab76dd").datasetHash, lock.datasetHash);
  await assert.rejects(runEvaluation(cases, live, { ...runOptions, allowLive: true, frozenCommit: "0".repeat(40) }), /LIVE_RUN_NOT_AUTHORIZED/);
  const changed = structuredClone(cases);
  changed[0].metadata.goldSemanticVerdict = "UNCERTAIN";
  await assert.rejects(runEvaluation(changed, live, {
    ...runOptions, expectedDatasetHash: datasetHash(changed), allowLive: true,
    frozenCommit: "ddfb19260853b441b11934420ec5bce4feab76dd",
  }), /LIVE_RUN_NOT_AUTHORIZED/);
  assert.equal(calls, 0);
  const drift: EvalModelClient = { kind: "mock", identity: live.identity,
    complete: async request => ({ output: answer(request), resolvedIdentity: { ...live.identity, modelVersion: "changed" } }) };
  await assert.rejects(runEvaluation(cases, drift, runOptions), /MODEL_IDENTITY_CHANGED/);
});

test("all bound evidence is literal frozen Chapter Text, not generated prose or hidden author annotations", async () => {
  const frozen = readFileSync("docs/BENCHMARK_PILOT_V0.2.2.md", "utf8");
  for (const c of await all) for (const e of [...c.fullPacket.primaryEvidence, ...c.fullPacket.retrievedEvidence]) {
    const revision = c.aggregate.revisions.find(r => r.id === e.sourceRevisionId)!;
    assert.equal(revision.content.slice(e.start, e.end), e.quote);
    assert.ok(frozen.includes(revision.content));
    assert.ok(!revision.content.includes("hidden_author_truth"));
  }
});

test("model-side packet mutation and extra state edits cannot alter frozen candidates or Canonical State", async () => {
  const cases = [byId(await all, "H01")], before = datasetHash(cases);
  const client = new MockClient(request => {
    request.packet.candidateDelta.after = "untrusted edit";
    request.packet.currentStateSlice.characters.length = 0;
    return { ...answer(request), canonicalMutation: { trusted: true } };
  });
  const run = await runEvaluation(cases, client, { expectedDatasetHash: before });
  assert.equal(datasetHash(cases), before);
  assert.ok(run.results.every(r => r.finalRouting === "NEEDS_REVIEW"));
  await assert.rejects(runEvaluation(cases, client, { expectedDatasetHash: before, expectedConfigHash: "changed" }), /CONFIG_MISMATCH/);
});

test("missing pricing or partial usage never becomes a fabricated zero cost; incomplete stability is unavailable", async () => {
  const cases = await all;
  const run = await runEvaluation(cases, new MockClient(undefined, { inputTokens: 1, outputTokens: 1 }), runOptions);
  const changed = structuredClone(run); changed.results[0].calls[0].usage = null;
  const m = calculateMetrics(cases, changed, { ...run.identity, currency: "TEST", inputPerMillion: 1, outputPerMillion: 1 });
  assert.equal(m.allRunsConsumption.estimatedCost, null);
  assert.equal(m.stability.generic.exactAgreement, null);
  assert.equal(calculateMetrics(cases, run).allRunsConsumption.estimatedCost, null);
});
