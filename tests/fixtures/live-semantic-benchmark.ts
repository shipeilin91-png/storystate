import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { CanonicalState, DeltaInput, Evidence, StateDelta, StoryAggregate, TargetType } from "../../lib/domain/state";
import { deltaInputSchema } from "../../lib/domain/state";
import { validateCanonical, validateDelta } from "../../lib/domain/governance";
import { StructuredValidationContextProvider } from "../../lib/server/validator/context";
import { deterministicGate } from "../../lib/server/validator/deterministic";
import { aggregateSemantic, deepFreeze, digest, type BoundCase, type CaseMetadata, type Group, type Routing, type Verdict } from "../../lib/eval/contract";
import { Pilot, chapters } from "./benchmark-pilot";
import { caseIds, expected, runtimeFixture } from "./runtime-validator";
import { epistemic, proposal } from "../helpers/backend";

export const benchmarkMetadata = deepFreeze({
  benchmarkVersion: "stage-2.2.1/v0.1", status: "FROZEN_BEFORE_LIVE_RUN",
  frozenAt: "2026-09-15", baseMain: "f7f3b29e86723e1c43a381ffef49194ac631b379",
  caseCount: 30, anchorCount: 10, holdoutCount: 20,
  holdoutDistribution: { SUPPORTED: 8, UNSUPPORTED: 8, UNCERTAIN: 4 },
  stabilitySelectedIds: ["H04", "H05", "H07", "H10", "H11", "H13", "H15", "H17", "H19", "H20"],
  caseOrder: "fixed listed order; alternate generic/specialist first by case index and repetition",
  architectureDecisionSet: "holdout", liveRun: false,
});
export const minimalPairs = deepFreeze([
  { cases: ["H06", "H07"], boundary: "holder vs owner" },
  { cases: ["H08", "H09"], boundary: "current escape vs general ongoing cooperation" },
  { cases: ["H12", "Ch15-B"], boundary: "reported R vs underlying F" },
  { cases: ["H13", "H14"], boundary: "Lin / exact P before vs after receipt" },
  { cases: ["H17", "H16"], boundary: "Chen same movement before vs after arrival" },
  { cases: ["H19", "Ch14-A"], boundary: "departure ablation vs full departure evidence" },
]);
const S = "SUPPORTED", U = "UNSUPPORTED", Q = "UNCERTAIN", AUTO = "AUTO_ACCEPT_ELIGIBLE", REVIEW = "NEEDS_REVIEW";
const definitions: [string, Group, string, Verdict, Routing, string, string][] = [
  ["H01", "control", "Chen Dock -> Hospital", S, AUTO, "Explicit hospital observation supports this exact location.", "D13-02/E13-01"],
  ["H02", "control", "USB encrypted -> index_unlocked", S, AUTO, "Directory opens while body files remain locked.", "D14-03/E14-05"],
  ["H03", "control", "Lin C-19 -> Maintenance Tunnel", S, AUTO, "The characters enter and move along the tunnel.", "D16-01/E16-05"],
  ["H04", "control", "Chen Dock -> Home", U, REVIEW, "The observation is at Hospital, not Home.", "D13-02/E13-01"],
  ["H05", "control", "USB index_unlocked -> encrypted", U, REVIEW, "New evidence explicitly establishes decryption, not regression.", "D17-04/E17-01"],
  ["H06", "evidence", "Fragment holder unresolved -> Lin", S, AUTO, "Discovery and holder effects are separate; handoff supports possession.", "D15-03 checkpoint then D15-05/E15-03"],
  ["H07", "evidence", "Fragment owner unresolved -> Lin", U, REVIEW, "The same handoff does not establish ownership.", "D15-03 checkpoint/N15-06/E15-03"],
  ["H08", "evidence", "Cooperation active within current escape", S, REVIEW, "Explicit statement establishes bounded operational cooperation.", "D17-07/E17-04"],
  ["H09", "evidence", "Cooperation active generally beyond current escape", U, REVIEW, "The statement limits cooperation to this escape, not ongoing general cooperation.", "D17-07/E17-04; PO scope-strength negative"],
  ["H10", "evidence", "USB Mystery resolved, decisive attribution removed", Q, REVIEW, "Altered records remain visible, but the operator is neither established nor contradicted.", "D17-05/06/E17-02 ablation"],
  ["H11", "knowledge", "Lin Q suspects -> believes(true)", U, REVIEW, "The same maybe-clue does not show adoption of a belief.", "K13-03/E13-03; post-Ch13 Q"],
  ["H12", "knowledge", "Gu reported R unaware -> knows(true)", S, REVIEW, "Gu hears Lin make the claim without adopting F.", "K15-report-F/E15-02"],
  ["H13", "knowledge", "Lin P unaware -> knows(true), Ch16", U, REVIEW, "Lin is spatially isolated and Gu does not relay the disclosure.", "N16-01/E16-02/03/04/05"],
  ["H14", "knowledge", "Lin P unaware -> knows(true), Ch17", S, REVIEW, "Lin receives the full identity disclosure and examines the credential.", "K17-01/E17-03"],
  ["H15", "knowledge", "Gu full P unaware -> knows(true), partial disclosure", Q, REVIEW, "Police identity is disclosed but the undercover clause is absent, not denied.", "K16-01/E16-04 ablation"],
  ["H16", "temporal", "Chen Maintenance Tunnel -> Old Pump House, Ch17", S, AUTO, "Chen performs actions inside the pump house.", "D17-02/E17-arrival"],
  ["H17", "temporal", "Chen Maintenance Tunnel -> Old Pump House, Ch16", U, REVIEW, "Movement toward the destination does not establish arrival.", "N16-03/E16-05; post-Ch16 snapshot"],
  ["H18", "temporal", "Chen remains resolved at Hospital after departure", U, REVIEW, "A NO_CHANGE candidate retains Hospital despite explicit departure.", "D14-01/02/E14-01 negative NO_CHANGE"],
  ["H19", "temporal", "Chen Hospital -> unresolved, departure removed", Q, REVIEW, "Waiting and USB activity do not establish or contradict Chen's departure.", "D14-01/02/E14-01 ablation"],
  ["H20", "temporal", "USB index_unlocked -> decrypted, completion removed", Q, REVIEW, "Typing a key establishes an attempt, not completion or failure.", "D17-04/E17-01 ablation"],
];
export const caseMetadata: readonly CaseMetadata[] = deepFreeze([
  ...caseIds.map(caseId => ({
    caseId, set: "anchor" as const,
    group: (caseId === "Ch14-A" || caseId === "Ch17-A" ? "temporal" : ["Ch13-A", "Ch13-B"].includes(caseId) ? "evidence" : "knowledge") as Group,
    description: `Existing Stage 2.2 ${caseId} candidate`, goldSemanticVerdict: aggregateSemantic(expected[caseId].verdicts),
    goldFinalRouting: expected[caseId].recommendation as Routing,
    rationale: "Previously used anchor; sanity/regression only, not primary architecture evidence.",
    stabilitySelected: false, fixtureReference: `runtimeFixture(${caseId})`,
  })),
  ...definitions.map(([caseId, group, description, goldSemanticVerdict, goldFinalRouting, rationale, fixtureReference]) => ({
    caseId, set: "holdout" as const, group, description, goldSemanticVerdict, goldFinalRouting, rationale, fixtureReference,
    stabilitySelected: benchmarkMetadata.stabilitySelectedIds.includes(caseId),
  })),
]);

// Stable, label-neutral fixture identifiers; random IDs/time from old test builders
// are normalized before freezing. No case ID or Gold is encoded in a model packet.
function uuid(key: string): string {
  const hex = createHash("sha256").update(`story-state-eval-v0.1/${key}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
function normalize<T>(value: T, named: Map<string, string>): T {
  const ids = new Map(named);
  function walk(input: unknown): unknown {
    if (typeof input === "string") {
      if (/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(input)) {
        if (!ids.has(input)) ids.set(input, uuid(`anonymous/${ids.size}`));
        return ids.get(input);
      }
      if (/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(input)) return "2026-09-15T00:00:00.000Z";
      return input;
    }
    if (Array.isArray(input)) return input.map(walk);
    if (input && typeof input === "object") return Object.fromEntries(Object.entries(input).map(([key, child]) => [key, walk(child)]));
    return input;
  }
  return walk(value) as T;
}
const context = new StructuredValidationContextProvider();
function assertEligible(id: string, a: StoryAggregate, d: StateDelta) {
  const gate = deterministicGate(a, d, a.story.currentVersion);
  assert.equal(gate.terminal, null, `BENCHMARK_CASE_BLOCKED: ${id}: ${gate.check.code}: ${gate.check.reason}`);
}
function neutralize(packet: BoundCase["packet"]) {
  packet.candidateDelta.reason = "Proposed state update.";
  if (packet.candidateDelta.effect) packet.candidateDelta.effect.description = "Proposed state effect.";
  packet.candidateDelta.basis.note = "Proposed supporting basis.";
  // Do not send fixture authors' narrative judgments through canonical basis notes.
  for (const row of [...packet.currentStateSlice.knowledge, ...packet.currentStateSlice.relationships]) row.basis.note = "Recorded provenance.";
  return packet;
}
export async function buildBenchmark(): Promise<readonly BoundCase[]> {
  const bound: BoundCase[] = [];
  for (const caseId of caseIds) {
    const f = await runtimeFixture(caseId);
    const raw = await f.repository.read(f.storyId);
    const named = new Map(Object.entries(f.ids).map(([name, id]) => [id, uuid(`anchor/entity/${name}`)]));
    const a = normalize(raw, named), d = a.deltas.find(d => !d.committedVersionId)!;
    const packet = neutralize(context.build(a, d));
    bound.push({ metadata: caseMetadata.find(c => c.caseId === caseId)!, aggregate: a, delta: d, packet, fullPacket: structuredClone(packet), ablation: null });
  }
  const p = new Pilot();
  await p.seed();
  for (const chapter of chapters) await chapter(p);
  const fullRaw = await p.repository.read(p.storyId);
  const names = new Map([...p.ids].map(([key, id]) => [id, uuid(`pilot/${key}`)]));
  for (const [key, event] of p.events) names.set(event.id, uuid(`event/${key}`));
  // Use chapter rather than random document IDs to make evidence identity reproducible.
  for (const e of fullRaw.evidence) {
    const revision = fullRaw.revisions.find(r => r.id === e.sourceRevisionId)!;
    const doc = fullRaw.documents.find(doc => doc.id === revision.documentId)!;
    names.set(e.id, uuid(`evidence/${doc.chapter}/${e.start}/${e.end}`));
  }
  const full = normalize(fullRaw, names);
  const entity = (key: string) => uuid(`pilot/${key}`);
  const sourceEvent = (ref: string) => full.events.find(e => e.id === uuid(`event/${ref}`))!;
  const row = <T extends TargetType>(state: CanonicalState, type: T, key: string): CanonicalState[T][number] => {
    const found = state[type].find(r => r.id === entity(key));
    assert.ok(found, `Missing canonical fixture ${type}/${key}`); return found;
  };
  const chapterFor = [13, 14, 16, 13, 17, 15, 15, 17, 17, 17, 13, 15, 16, 17, 16, 17, 16, 14, 14, 17];
  const refs = ["E13-01", "E14-05", "E16-05", "E13-01", "E17-01", "E15-03", "E15-03", "E17-04", "E17-04", "E17-02", "E13-03", "E15-02", "E16-04", "E17-03", "E16-04", "E17-arrival", "E16-05", "E14-01", "E14-01", "E17-01"];
  for (let index = 0; index < definitions.length; index++) {
    const id = definitions[index][0], chapter = chapterFor[index], ref = refs[index];
    const a = structuredClone(full);
    const snapshotNumber = (id === "H11" || id === "H17" ? chapter : chapter - 1) - 11;
    const snapshot = full.versions.find(v => v.versionNumber === snapshotNumber)!;
    a.state = structuredClone(snapshot.snapshot);
    a.story = { ...a.story, currentVersion: snapshotNumber, currentChapter: chapter, storyRevision: chapter - 12 };
    // Independent benchmark fixture: load a frozen state snapshot, not all prior
    // candidate decisions. Only the declared relevant source events are supplied.
    a.versions = [structuredClone(snapshot)];
    a.deltas = [];
    a.documents = a.documents.filter(d => d.chapter! <= chapter);
    a.revisions = a.revisions.filter(r => a.documents.some(d => d.id === r.documentId));
    const eventRefs = id === "H13" ? [ref, "E16-02", "E16-03", "E16-05"] : [ref];
    a.events = a.events.filter(e => eventRefs.some(key => e.id === sourceEvent(key).id));
    a.evidence = [...new Map(a.evidence.filter(e => a.events.some(event => event.evidenceIds.includes(e.id))).map(e => [e.id, e])).values()];
    a.annotations = [];
    const event = a.events.find(e => e.id === sourceEvent(ref).id)!;
    let fullIds = [...event.evidenceIds];
    let keepIds: string[] | undefined;
    let decisive: string[] = [];
    function extraQuote(quote: string): string {
      const revision = a.revisions.find(r => r.id === event.sourceRevisionId)!;
      const start = revision.content.indexOf(quote);
      assert.ok(start >= 0, `BENCHMARK_CASE_BLOCKED: ${id}: quote absent`);
      const eid = uuid(`evidence/${chapter}/${start}/${start + quote.length}`);
      if (!a.evidence.some(e => e.id === eid)) a.evidence.push({ id: eid, sourceRevisionId: revision.id, quote, start, end: start + quote.length, speakerId: null });
      if (!event.evidenceIds.includes(eid)) event.evidenceIds.push(eid);
      fullIds.push(eid);
      return eid;
    }
    if (id === "H10") {
      keepIds = [event.evidenceIds.at(-1)!]; decisive = event.evidenceIds.slice(0, -1);
    }
    if (id === "H15") {
      decisive = event.evidenceIds.filter(eid => a.evidence.find(e => e.id === eid)!.quote.includes("我在港务安保里卧底"));
      keepIds = [event.evidenceIds[0], extraQuote("市刑侦支队，陈默，警号 071306。")];
    }
    if (id === "H19") {
      decisive = [...event.evidenceIds];
      keepIds = [extraQuote("林夏在处置室外等了十分钟。"), extraQuote("林夏始终把 USB 握在自己手里")];
    }
    if (id === "H20") {
      decisive = [...event.evidenceIds];
      keepIds = [extraQuote("她取出货单残页，将背面的三组字符输入 USB 的第二层密钥框。")];
    }
    if (id === "H13") {
      for (const linked of ["E16-02", "E16-03", "E16-05"]) fullIds.push(...sourceEvent(linked).evidenceIds);
      event.evidenceIds = [...new Set([...event.evidenceIds, ...fullIds])];
    }
    fullIds = [...new Set(fullIds)];
    if (id === "H06" || id === "H07") {
      // Frozen D15-03 discovery checkpoint, before the separate D15-05 holder effect.
      const fragment = structuredClone(row(full.versions.find(v => v.versionNumber === 4)!.snapshot, "items", "Fragment"));
      fragment.holder = epistemic(null);
      a.state.items.push(fragment);
    }
    const extra: Partial<DeltaInput> = {
      sourceKind: "story_event", sourceEventId: event.id, effect: { id: uuid("candidate/effect"), description: "Proposed state effect." },
      evidenceIds: fullIds, basis: { kinds: ["direct_observation"], note: "Proposed supporting basis." },
      reason: "Proposed state update.",
    };
    function field(type: TargetType, key: string, path: string, after: DeltaInput["after"]) {
      const current = row(a.state, type, key);
      return proposal(type, current.id, path === "$" ? current : (current as unknown as Record<string, DeltaInput["before"]>)[path], after, path, extra);
    }
    let input: DeltaInput;
    if (["H01", "H04", "H16", "H17", "H18", "H19"].includes(id)) {
      input = field("characters", "Chen", "location", id === "H04" ? epistemic("Home") : ["H16", "H17"].includes(id) ? epistemic("Old Pump House") : id === "H19" ? epistemic(null, "Hospital") : epistemic("Hospital"));
      if (id === "H18") input.operation = "NO_CHANGE";
    } else if (id === "H03") input = field("characters", "Lin", "location", epistemic("Maintenance Tunnel"));
    else if (["H02", "H05", "H20"].includes(id)) input = field("items", "USB", "condition", id === "H02" ? "index_unlocked" : id === "H05" ? "encrypted" : "decrypted");
    else if (id === "H06" || id === "H07") input = field("items", "Fragment", id === "H06" ? "holder" : "owner", epistemic(entity("Lin")));
    else if (id === "H08" || id === "H09") input = proposal("relationships", entity("operational-cooperation"), null, {
      id: entity("operational-cooperation"), active: true, fromCharacterId: entity("Lin"), toCharacterId: entity("Chen"),
      category: "explicit_operational", predicate: "cooperation", scope: id === "H08" ? "current escape" : "general ongoing beyond current escape",
      value: "active", basis: { kinds: ["direct_disclosure"], note: "Proposed supporting basis." },
    }, "$", extra);
    else if (id === "H10") {
      const thread = row(a.state, "plotThreads", "USB Mystery");
      input = field("plotThreads", "USB Mystery", "$", { ...thread, status: "resolved", resolution: "周启明本人篡改记录" });
      input.operation = "RESOLVE";
      input.resolutionSupport = { coreQuestion: thread.coreQuestion, answer: "周启明本人篡改记录", evidenceIds: fullIds, assessment: "direct_answer" };
    } else {
      const key = id === "H11" ? "Lin/Q" : id === "H12" ? "Gu/RF" : id === "H15" ? "Gu/P" : "Lin/P";
      const current = row(a.state, "knowledge", key);
      input = field("knowledge", key, "$", { ...current, stance: id === "H11" ? "believes" : "knows", believedValue: true,
        basis: { kinds: id === "H12" ? ["reported_claim"] : ["direct_disclosure", "credential_inspection"], note: "Proposed supporting basis." } });
    }
    const d: StateDelta = { ...deltaInputSchema.parse(input), id: uuid("candidate/delta"), decision: "needs_review", decisions: [], committedVersionId: null, validatorResult: null, createdAt: "2026-09-15T00:00:00.000Z" };
    validateCanonical(a.state); validateDelta(a, d); assertEligible(id, a, d);
    const fullPacket = neutralize(context.build(a, d));
    const packet = structuredClone(fullPacket);
    const allEvidence = [...fullPacket.primaryEvidence, ...fullPacket.retrievedEvidence];
    if (keepIds) {
      const keep = new Set(keepIds);
      packet.primaryEvidence = allEvidence.filter(e => keep.has(e.id));
      packet.retrievedEvidence = [];
      packet.candidateDelta.evidenceIds = [...keepIds];
      if (packet.candidateDelta.resolutionSupport) packet.candidateDelta.resolutionSupport.evidenceIds = [...keepIds];
      // The actual evaluated candidate uses the ablated evidence as well as the packet.
      d.evidenceIds = [...keepIds];
      if (d.resolutionSupport) d.resolutionSupport.evidenceIds = [...keepIds];
      assertEligible(id, a, d);
      assert.equal(packet.primaryEvidence.length, keepIds.length);
    }
    a.deltas.push(d);
    assertEligible(id, a, d);
    const metadata = caseMetadata.find(c => c.caseId === id)!;
    bound.push({
      metadata, aggregate: a, delta: d, fullPacket, packet,
      ablation: keepIds ? {
        fullEvidenceIds: allEvidence.map(e => e.id), removedEvidenceIds: allEvidence.filter(e => !keepIds.includes(e.id)).map(e => e.id),
        removedDecisiveEvidenceIds: decisive, remainingEvidenceIds: keepIds, explanation: metadata.rationale,
      } : null,
    });
  }
  return deepFreeze(bound);
}
export function benchmarkFingerprint(cases: readonly BoundCase[]): string {
  return digest({ metadata: benchmarkMetadata, minimalPairs, cases: cases.map(c => ({ metadata: c.metadata, packet: c.packet, ablation: c.ablation })) });
}
export function sourceDigest(): string {
  return createHash("sha256").update(readFileSync("docs/BENCHMARK_PILOT_V0.2.2.md")).digest("hex");
}
export function evidenceById(c: BoundCase, id: string): Evidence {
  const e = c.aggregate.evidence.find(e => e.id === id);
  assert.ok(e, `${c.metadata.caseId}: unknown evidence ${id}`); return e;
}
