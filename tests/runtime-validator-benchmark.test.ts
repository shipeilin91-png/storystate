import test from "node:test";
import assert from "node:assert/strict";
import { benchmarkClient, caseIds, expected, runtimeFixture, withoutValidatorResults } from "./fixtures/runtime-validator";
import type { Specialist } from "../lib/domain/validation";

test("Stage 2.2 ten-candidate deterministic fake benchmark (not real model accuracy)", async (t) => {
  let routingCorrect = 0, falseAuto = 0, grounded = 0, citationCount = 0;
  const accuracy: Record<Specialist, { correct: number; total: number }> = {
    evidence: { correct: 0, total: 0 }, knowledge_boundary: { correct: 0, total: 0 }, temporal_state: { correct: 0, total: 0 },
  };
  for (const id of caseIds) await t.test(id, async () => {
    const client = benchmarkClient(id), f = await runtimeFixture(id, undefined, client), oracle = expected[id];
    const before = await f.repository.read(f.storyId);
    const result = await f.service.validateDelta(f.storyId, f.delta.id, { expectedVersion: 1 });
    assert.deepEqual(client.requests.map(r => r.agent), oracle.route);
    routingCorrect++;
    assert.equal(result.recommendation, oracle.recommendation, id);
    assert.equal(result.status, oracle.recommendation === "AUTO_ACCEPT_ELIGIBLE" ? "passed" : "needs_review");
    for (const [index, agent] of oracle.route.entries()) {
      const check = result.checks!.find(c => c.agent === agent)!;
      accuracy[agent].total++;
      if (check.verdict === oracle.verdicts[index]) accuracy[agent].correct++;
      assert.equal(check.verdict, oracle.verdicts[index]);
      for (const evidenceId of check.evidenceIds) {
        citationCount++;
        if (f.evidenceIds.includes(evidenceId)) grounded++;
        assert.ok(f.evidenceIds.includes(evidenceId));
      }
    }
    if (oracle.unsafe && result.recommendation === "AUTO_ACCEPT_ELIGIBLE") falseAuto++;
    const after = await f.repository.read(f.storyId);
    assert.deepEqual(withoutValidatorResults(after), withoutValidatorResults(before), "Only validatorResult changed, no decision, event or state mutation");
    assert.equal(after.deltas.find(d => d.id === f.delta.id)?.decision, "needs_review");
    assert.equal(after.deltas.find(d => d.id === f.delta.id)?.decisions.length, 0);
    await assert.rejects(f.service.commitAcceptedDeltas(f.storyId, { deltaIds: [f.delta.id], expectedVersion: 1 }), /accepted/);
    if (id === "Ch17-B") assert.deepEqual(after.deltas.find(d => d.id === f.delta.id)?.after, f.delta.after, "Correction provenance retained");
    t.diagnostic(`${id}: ${result.recommendation}`);
  });
  assert.equal(falseAuto, 0);
  const unsafeCount = caseIds.filter(id => expected[id].unsafe).length;
  t.diagnostic(JSON.stringify({
    evaluation: "deterministic fake routing/aggregation/citation compliance ONLY; semantic accuracy of a real model NOT measured",
    overallRouting: `${routingCorrect}/${caseIds.length}`,
    falseAutoAccept: { count: falseAuto, allCandidateRate: `${falseAuto}/${caseIds.length}`, unsafeCandidateRate: `${falseAuto}/${unsafeCount}` },
    specialistFixtureAgreement: accuracy, evidenceIdGrounding: `${grounded}/${citationCount}`,
    genericBaseline: "interface only; no comparative model experiment",
  }));
});
