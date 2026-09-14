import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { DomainError } from "../lib/domain/errors";
import type { DeltaInput, TargetType } from "../lib/domain/state";
import { accept, epistemic, proposal } from "./helpers/backend";
import { basis, chapters, fatherQuestion, Pilot, replay, statements, usbAnswer, usbQuestion } from "./fixtures/benchmark-pilot";

const errorCode = (code: string) => (error: unknown) => error instanceof DomainError && error.code === code;
async function knows(p: Pilot, who: string, key: keyof typeof statements, stance = "knows", value: boolean | null = true) {
  const row = await p.row("knowledge", `${who}/${key}`);
  assert.equal(row.propositionId, p.id(key));
  assert.equal(row.stance, stance, `${who}/${key}`);
  assert.equal(row.believedValue, value, `${who}/${key} value`);
}
async function commonState(p: Pilot, chapter: number) {
  const locations: Record<number, (string | null)[]> = {
    12: ["Home", "Dock", "Hospital"], 13: ["Hospital", "Hospital", "Hospital"],
    14: ["Hospital", null, "Hospital"], 15: ["C-19", null, "C-19"],
    16: ["Maintenance Tunnel", "Maintenance Tunnel", "Maintenance Tunnel"],
    17: ["Old Pump House", "Old Pump House", "Old Pump House"],
  };
  for (const [index, who] of ["Lin", "Chen", "Gu"].entries()) {
    const expected = locations[chapter][index];
    assert.deepEqual((await p.row("characters", who)).location, epistemic(expected, expected ?? "Hospital"), `COV-01/02/23 ${who} Ch${chapter}`);
  }
  const usb = await p.row("items", "USB");
  assert.deepEqual(usb.owner, epistemic(p.id("Chen")), "COV-03 owner never follows holder");
  assert.deepEqual(usb.holder, epistemic(p.id(chapter === 12 ? "Chen" : "Lin")));
  assert.equal(usb.condition, chapter <= 13 ? "encrypted" : chapter <= 16 ? "index_unlocked" : "decrypted", "COV-04");
  assert.equal(usb.custodian, null);
  const thread = await p.row("plotThreads", "USB Mystery");
  assert.equal(thread.coreQuestion, usbQuestion);
  assert.equal(thread.status, chapter === 12 ? "open" : chapter === 17 ? "resolved" : "progressing");
  assert.equal(thread.resolution, chapter === 17 ? usbAnswer : null, "COV-07/08 actual perpetrator answer");
  const father = await p.row("plotThreads", "Father Thread");
  assert.equal(father.coreQuestion, fatherQuestion, "Do not substitute a generic mystery");
  assert.equal(father.status, chapter <= 13 ? "open" : "progressing");
  assert.equal(father.resolution, null);
  assert.deepEqual((await p.row("characters", "Father")).location, epistemic(null), "No historical lead becomes current location");
  assert.equal((await p.row("propositions", "P")).statement, "陈默是市刑侦支队警察，并正在港务安保中卧底");
  assert.equal((await p.row("propositions", "F")).statement, "父亲三天前亲自到过 C-19，并亲手留下残页");
  assert.notEqual(p.id("F"), p.id("P"));
  assert.equal((await p.row("worldTruth", "World/P")).status, "confirmed_true", "P is world truth before Ch16");
  assert.equal((await p.row("worldTruth", "World/F")).status, chapter === 17 ? "confirmed_false" : "unresolved");
  await knows(p, "Chen", "P");
  await knows(p, "Gu", "P", chapter >= 16 ? "knows" : "unaware", chapter >= 16 ? true : null);
  await knows(p, "Lin", "P", chapter === 17 ? "knows" : "unaware", chapter === 17 ? true : null);
  await knows(p, "Lin", "Q", chapter >= 13 ? "suspects" : "unaware", null);
  await knows(p, "Lin", "F", chapter < 15 ? "unaware" : chapter < 17 ? "believes" : "knows", chapter < 15 ? null : chapter < 17);
  await knows(p, "Gu", "F", "unaware", null);
  assert.equal((await p.row("relationships", "trust")).value, "distrust", "COV-13 long-term trust unchanged");
  const cooperation = (await p.state()).relationships.find(row => row.id === p.id("cooperation"));
  if (chapter < 17) assert.equal(cooperation, undefined);
  else {
    assert.ok(cooperation);
    assert.equal(cooperation.value, "active");
    assert.equal(cooperation.scope, "current escape");
    assert.equal(cooperation.fromCharacterId, p.id("Lin"));
    assert.equal(cooperation.toCharacterId, p.id("Chen"));
    assert.equal(cooperation.category, "explicit_operational");
    assert.equal((await p.state()).relationships.length, 2, "No automatic reverse relationship");
  }
  const fragment = (await p.state()).items.find(row => row.id === p.id("Fragment"));
  if (chapter < 15) assert.equal(fragment, undefined);
  else {
    assert.ok(fragment);
    assert.deepEqual(fragment.owner, epistemic(null));
    assert.deepEqual(fragment.holder, epistemic(p.id("Lin")));
    assert.equal(fragment.condition, chapter === 17 ? "密钥用途已验证" : "背面有疑似第二层密钥");
  }
  for (const who of ["Lin", "Gu", "Chen"]) {
    await knows(p, who, "currentAlive", "unaware", null);
    await knows(p, who, "currentNorth", "unaware", null);
    await knows(p, who, "destination", "unaware", null);
  }
}

test("Exact Frozen Benchmark: continuous Ch12 baseline through Ch13-17 (not AI extraction)", async (t) => {
  const p = new Pilot();
  await p.seed();
  await commonState(p, 12);
  for (const [index, run] of chapters.entries()) await t.test(`Ch${index + 13}: exact before/after, knowledge, evidence and version`, async () => {
    const chapter = index + 13;
    await commonState(p, chapter - 1);
    await run(p);
    await commonState(p, chapter);
    const versions = await p.service.getVersions(p.storyId), version = versions.at(-1)!;
    assert.equal(version.versionNumber, chapter - 11, "State Version is not the chapter number");
    assert.equal(version.chapter, chapter);
    assert.equal(version.storyRevision, chapter - 12);
    assert.deepEqual(version.snapshot, await p.state());
    const aggregate = await p.repository.read(p.storyId);
    for (const id of version.deltaIds) {
      const d = aggregate.deltas.find(row => row.id === id)!;
      const event = aggregate.events.find(row => row.id === d.sourceEventId)!;
      assert.equal(d.decision, "accepted");
      assert.equal(d.decisions.at(-1)?.decision, "accepted");
      assert.equal(d.validatorResult?.recommendation, "NEEDS_REVIEW");
      assert.equal(d.committedVersionId, version.id);
      assert.equal(event.sourceOrder, chapter);
      assert.ok(d.effect);
      for (const evidenceId of d.evidenceIds) {
        const evidence = aggregate.evidence.find(row => row.id === evidenceId)!;
        assert.ok(event.evidenceIds.includes(evidenceId));
        assert.equal(evidence.sourceRevisionId, p.revisionId);
        assert.equal(p.source.slice(evidence.start, evidence.end), evidence.quote, "COV-20 literal source anchor");
      }
    }
    if (chapter === 13) {
      for (const key of ["handoff", "ship"] as const) await knows(p, "Lin", key);
      assert.deepEqual(p.deltas.get("D13-01")?.before, epistemic("Home"));
      assert.deepEqual(p.deltas.get("D13-02")?.before, epistemic("Dock"));
      assert.deepEqual(p.deltas.get("D13-03")?.before, epistemic(p.id("Chen")));
      assert.equal(p.deltas.get("D13-04")?.before, "open");
      assert.equal(p.deltas.get("N13-06/NO_CHANGE")?.operation, "NO_CHANGE");
    } else if (chapter === 14) {
      assert.deepEqual(p.deltas.get("D14-01/02")?.before, epistemic("Hospital"));
      assert.equal(p.deltas.get("D14-03")?.before, "encrypted");
      assert.equal(p.deltas.get("D14-04")?.before, "open");
      for (const who of ["Lin", "Gu"]) {
        for (const key of ["code", "directory", "RHe"] as const) await knows(p, who, key);
        await knows(p, who, "entrusted", "unaware", null);
        await knows(p, who, "contents", "unaware", null);
      }
      const report = await p.row("propositions", "RHe");
      assert.equal(report.reporterId, p.id("He"));
      assert.equal(report.reportedPropositionId, p.id("entrusted"));
      assert.equal((await p.row("worldTruth", "World/entrusted")).status, "unresolved");
      assert.equal(p.events.get("E14-04")?.payload.lead, "C-19");
    } else if (chapter === 15) {
      const creation = p.deltas.get("D15-03/04/05")!;
      assert.equal(creation.operation, "CREATE");
      assert.equal(creation.before, null);
      assert.equal(creation.targetId, p.id("Fragment"));
      await knows(p, "Lin", "markings");
      await knows(p, "Gu", "RMarker");
      await knows(p, "Gu", "RF");
      await knows(p, "Gu", "marker", "unaware", null);
      const report = await p.row("propositions", "RF");
      assert.equal(report.kind, "reported");
      assert.equal(report.reportedPropositionId, p.id("F"));
      assert.equal(report.reporterId, p.id("Lin"));
      for (const who of ["Lin", "Gu"]) {
        await knows(p, who, "keyLength");
        await knows(p, who, "sms");
        await knows(p, who, "sender", "unaware", null);
      }
      assert.equal(p.events.get("E15-04")?.payload.senderVerified, false);
      assert.ok(!JSON.stringify(aggregate.state).includes("hidden_author_truth"));
      assert.ok(aggregate.revisions.every(row => !row.content.includes("hidden_author_truth")));
    } else if (chapter === 16) {
      assert.deepEqual((await p.row("knowledge", "Gu/P")).basis.kinds, ["direct_disclosure", "credential_inspection"]);
      assert.deepEqual(p.events.get("E16-03")?.participantIds, [p.id("Chen"), p.id("Gu")]);
      await knows(p, "Gu", "credential");
      await knows(p, "Lin", "sender");
      await knows(p, "Gu", "disclosurePlan");
      assert.deepEqual(p.deltas.get("D16-03")?.before, epistemic(null, "Hospital"));
      const d = p.deltas.get("K16-01")!;
      assert.equal((d.before as Record<string, unknown>).stance, "unaware");
      assert.equal((d.after as Record<string, unknown>).stance, "knows");
    } else {
      assert.equal(p.deltas.get("D17-04")?.before, "index_unlocked");
      const resolution = p.deltas.get("D17-05/06")!;
      assert.equal((resolution.before as Record<string, unknown>).status, "progressing");
      assert.equal(resolution.resolutionSupport?.answer, usbAnswer);
      const quotes = resolution.evidenceIds.map(id => aggregate.evidence.find(row => row.id === id)!.quote).join("\n");
      for (const phrase of ["ZQ-OFFICE-01", "不接受远程登录", "现场人脸活体挑战", "指纹动态认证", "摄像审计帧", "ZQ-MSA-01"])
        assert.ok(quotes.includes(phrase), `COV-24 full combination includes ${phrase}`);
      assert.equal(p.deltas.get("D17-09")?.before, "unresolved");
      const corrected = await p.row("knowledge", "Lin/F"), correction = p.deltas.get("K17-10")!;
      assert.equal(corrected.stance, "knows");
      assert.equal(corrected.believedValue, false);
      assert.equal(corrected.basis.correction?.previousStance, "believes");
      assert.equal(corrected.basis.correction?.previousBelievedValue, true);
      assert.equal((correction.before as Record<string, unknown>).stance, "believes");
      assert.equal((correction.before as Record<string, unknown>).believedValue, true);
      assert.deepEqual(corrected.basis.correction?.evidenceIds, correction.evidenceIds);
      assert.equal(versions[3].snapshot.knowledge.find(row => row.id === p.id("Lin/F"))?.stance, "believes", "Ch15 snapshot remains intact");
      for (const who of ["Lin", "Gu", "Chen"]) for (const key of ["tampering", "equipment", "historicalAlive", "RDestination", "RFatherAccount", "placement"] as const) await knows(p, who, key);
      for (const who of ["Lin", "Gu"]) await knows(p, who, "target");
      assert.equal((await p.row("propositions", "RDestination")).reportedPropositionId, p.id("destination"));
      assert.equal(p.events.get("E17-05/06")?.payload.lead, "North Embankment Transfer Station");
      assert.equal(p.events.get("E17-05/06")?.payload.currentLocationConfirmed, false);
      assert.equal(p.events.get("E17-07")?.payload.temporalClass, "future_intent");
    }
  });
});

// These verdicts are explicit benchmark fixtures, not automatic semantic validation.
// Assert that known SHOULD NOT COMMIT candidates cannot override admission by acceptance.
async function rejectCandidate(p: Pilot, ref: string, event: string, type: TargetType, key: string, field: string, after: DeltaInput["after"]) {
  const row = await p.row(type, key);
  const before = field === "$" ? row : (row as unknown as Record<string, DeltaInput["before"]>)[field];
  const d = await p.propose(ref, event, proposal(type, row.id, before, after, field));
  await p.service.setValidatorResult(p.storyId, d.id, { status: "passed", recommendation: "REJECT", risk: "HIGH", reason: `${ref}: Frozen Benchmark SHOULD NOT COMMIT judgment` });
  const baseline = await p.service.getCurrentState(p.storyId);
  await assert.rejects(accept(p.service, p.storyId, d.id), errorCode("VALIDATOR_REJECTED"));
  await p.service.decideDelta(p.storyId, d.id, { decision: "rejected", actor: "benchmark reviewer", reason: ref });
  await assert.rejects(p.service.commitAcceptedDeltas(p.storyId, { deltaIds: [d.id], expectedVersion: baseline.story.currentVersion }), errorCode("NOT_ACCEPTED"));
  assert.deepEqual(await p.service.getCurrentState(p.storyId), baseline);
  assert.equal((await p.service.getDeltas(p.storyId)).find(row => row.id === d.id)?.committedVersionId, null);
}

test("Ch13 negatives: N13-01/02/03/04/05/06, owner != holder, reader != character", async () => {
  const p = await replay(13);
  for (const who of ["Lin", "Gu"]) {
    const row = await p.row("knowledge", `${who}/P`);
    await rejectCandidate(p, who === "Lin" ? "N13-01" : "N13-04", "E13-03", "knowledge", `${who}/P`, "$", { ...row, stance: "knows", believedValue: true });
  }
  await rejectCandidate(p, "N13-02", "E13-03", "relationships", "trust", "value", "trust");
  await rejectCandidate(p, "N13-03", "E13-02", "items", "USB", "condition", "decrypted");
  await rejectCandidate(p, "N13-05", "E13-01", "characters", "Chen", "location", epistemic("Dock"));
  await rejectCandidate(p, "N13-06", "E13-02", "items", "USB", "owner", epistemic(p.id("Lin")));
  // Existing structural soft boundary also rejects a manually accepted event inference.
  const d = await p.propose("S13-03", "E13-03", proposal("relationships", p.id("trust"), "distrust", "trust", "value", { basis: basis("inference") }));
  await accept(p.service, p.storyId, d.id);
  await assert.rejects(p.service.commitAcceptedDeltas(p.storyId, { deltaIds: [d.id], expectedVersion: 2 }), errorCode("SOFT_INTERPRETATION"));
  const before = await p.service.getCurrentState(p.storyId);
  await p.service.addAnnotation(p.storyId, { id: randomUUID(), sourceRevisionId: p.revisionId, targetType: "relationships", targetId: p.id("trust"), evidenceIds: p.events.get("E13-03")!.evidenceIds, content: "林夏对陈默的敌意有所缓和", confidence: 0.3, basis: basis("inference"), scope: { benchmarkId: "S13-03" } });
  assert.deepEqual(await p.service.getCurrentState(p.storyId), before, "Soft annotation creates no canonical version");
});

test("Ch14 negatives: N14-01/02/03/05/06, reported != world truth; strong clue != resolution", async () => {
  const p = await replay(14);
  await rejectCandidate(p, "N14-01", "E14-05", "items", "USB", "condition", "decrypted");
  await rejectCandidate(p, "N14-02", "E14-02", "items", "USB", "holder", epistemic(p.id("Gu")));
  await rejectCandidate(p, "N14-05", "E14-01", "characters", "Chen", "location", epistemic("Dock"));
  await rejectCandidate(p, "K14-03/04 reported boundary", "E14-04", "worldTruth", "World/entrusted", "status", "confirmed_true");
  const gu = await p.row("knowledge", "Gu/P");
  await rejectCandidate(p, "N14-06", "E14-04", "knowledge", "Gu/P", "$", { ...gu, stance: "knows", believedValue: true });
  const thread = await p.row("plotThreads", "Father Thread");
  const d = await p.propose("N14-03", "E14-04", proposal("plotThreads", thread.id, thread, { ...thread, status: "resolved", resolution: "父亲在 C-19" }, "$", {
    operation: "RESOLVE", resolutionSupport: { coreQuestion: fatherQuestion, answer: "父亲在 C-19", evidenceIds: p.events.get("E14-04")!.evidenceIds, assessment: "strong_inference" },
  }));
  await accept(p.service, p.storyId, d.id);
  const before = await p.service.getCurrentState(p.storyId);
  await assert.rejects(p.service.commitAcceptedDeltas(p.storyId, { deltaIds: [d.id], expectedVersion: 3 }), errorCode("INSUFFICIENT_RESOLUTION"));
  assert.deepEqual(await p.service.getCurrentState(p.storyId), before);
  await assert.rejects(p.service.proposeDelta(p.storyId, proposal("characters", p.id("Chen"), epistemic(null, "Hospital"), epistemic("Unknown"), "location")), /Epistemic/);
});

test("Ch15 negatives: false belief and reported claim cannot confirm F; hidden truth forbidden", async () => {
  const p = await replay(15);
  await rejectCandidate(p, "N15-01", "E15-03", "items", "USB", "condition", "decrypted");
  for (const status of ["confirmed_true", "confirmed_false"])
    await rejectCandidate(p, `N15-03/${status}`, "E15-02", "worldTruth", "World/F", "status", status);
  await rejectCandidate(p, "N15-04", "E15-05", "relationships", "trust", "value", "trust");
  await rejectCandidate(p, "N15-05", "E15-04", "characters", "Chen", "location", epistemic("C-19"));
  for (const who of ["Lin", "Gu"]) await rejectCandidate(p, `N15-06/${who}`, "E15-03", "items", "Fragment", "owner", epistemic(p.id(who)));
  const gu = await p.row("knowledge", "Gu/F");
  for (const stance of ["believes", "knows"]) await rejectCandidate(p, `K15-09/${stance}`, "E15-02", "knowledge", "Gu/F", "$", { ...gu, stance, believedValue: true });
  await rejectCandidate(p, "COV-17 preparation is not arrival", "E15-05", "characters", "Lin", "location", epistemic("Maintenance Tunnel"));
  const revisionId = randomUUID(), evidenceId = randomUUID(), content = "hidden_author_truth = false";
  await p.service.addSourceRevision(p.storyId, { id: revisionId, documentId: p.id("Document/15"), revisionNumber: 2, content, visibility: "author_only" });
  await p.service.addEvidence(p.storyId, { id: evidenceId, sourceRevisionId: revisionId, quote: content, start: 0, end: content.length, speakerId: null });
  const before = await p.service.getCurrentState(p.storyId);
  await assert.rejects(p.service.proposeDelta(p.storyId, proposal("worldTruth", p.id("World/F"), "unresolved", "confirmed_false", "status", { evidenceIds: [evidenceId] })), errorCode("AUTHOR_TRUTH_FORBIDDEN"));
  await assert.rejects(p.service.appendEvent(p.storyId, { sourceRevisionId: revisionId, sourceOrder: 15, storyTime: null, eventType: "hidden", summary: "Forbidden author input", payload: {}, participantIds: [], evidenceIds: [evidenceId] }), errorCode("AUTHOR_TRUTH_FORBIDDEN"));
  assert.deepEqual(await p.service.getCurrentState(p.storyId), before);
});

test("Ch16 negatives: N16-01/02/03/05/06, future disclosure and destination are not accomplished", async () => {
  const p = await replay(16), lin = await p.row("knowledge", "Lin/P");
  for (const stance of ["suspects", "believes", "knows"])
    await rejectCandidate(p, `N16-01/${stance}`, "E16-03", "knowledge", "Lin/P", "$", { ...lin, stance, believedValue: stance === "suspects" ? null : true });
  await rejectCandidate(p, "N16-02", "E16-06", "relationships", "trust", "value", "trust");
  for (const who of ["Lin", "Gu", "Chen"]) await rejectCandidate(p, `N16-03/${who}`, "E16-05", "characters", who, "location", epistemic("Old Pump House"));
  await rejectCandidate(p, "N16-05", "E16-05", "items", "USB", "condition", "decrypted");
  for (const who of ["Chen", "Gu"]) await rejectCandidate(p, `N16-06/${who}`, "E16-05", "items", "Fragment", "holder", epistemic(p.id(who)));
});

test("Ch17 negatives: N17-01/02/03/04/06/07/08, historical evidence != current truth", async () => {
  const p = await replay(17);
  const thread = await p.row("plotThreads", "Father Thread");
  await rejectCandidate(p, "N17-01", "E17-05/06", "plotThreads", "Father Thread", "$", { ...thread, status: "resolved", resolution: "父亲在北堤" });
  await rejectCandidate(p, "N17-02", "E17-05/06", "characters", "Father", "location", epistemic("North Embankment Transfer Station"));
  for (const who of ["Lin", "Gu", "Chen"]) {
    const currentAlive = await p.row("knowledge", `${who}/currentAlive`);
    await rejectCandidate(p, `N17-03/${who}`, "E17-05/06", "knowledge", `${who}/currentAlive`, "$", { ...currentAlive, stance: "knows", believedValue: true });
    await rejectCandidate(p, `N17-06/${who}`, "E17-07", "characters", who, "location", epistemic("Drainage Passage"));
  }
  await rejectCandidate(p, "N17-04", "E17-04", "relationships", "trust", "value", "full_trust");
  await rejectCandidate(p, "N17-07", "E17-01", "items", "USB", "owner", epistemic(p.id("Lin")));
  // Replay pre-resolution state to test insufficient attribution, not a no-op on an already resolved thread.
  const before17 = await replay(16);
  await before17.begin(17);
  await before17.event("N17-08-evidence", "Credential ownership alone", ["唯一授权日志把这些操作绑定到只配发给他的密钥 `ZQ-MSA-01`"], ["Lin", "Gu", "Chen"]);
  const unresolved = await before17.row("plotThreads", "USB Mystery");
  const d = await before17.propose("N17-08", "N17-08-evidence", proposal("plotThreads", unresolved.id, unresolved, { ...unresolved, status: "resolved", resolution: usbAnswer }, "$", {
    operation: "RESOLVE", resolutionSupport: { coreQuestion: usbQuestion, answer: usbAnswer, evidenceIds: before17.events.get("N17-08-evidence")!.evidenceIds, assessment: "strong_inference" },
  }));
  await accept(before17.service, before17.storyId, d.id);
  await assert.rejects(before17.service.commitAcceptedDeltas(before17.storyId, { deltaIds: [d.id], expectedVersion: 5 }), errorCode("INSUFFICIENT_RESOLUTION"));
  assert.equal((await before17.row("plotThreads", "USB Mystery")).status, "progressing");
  const belief = await p.row("knowledge", "Lin/F");
  await assert.rejects(p.service.proposeDelta(p.storyId, proposal("knowledge", belief.id, belief, { ...belief, stance: "corrected" })), /Invalid option/);
});
