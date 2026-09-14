import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import type { CanonicalRow, CharacterKnowledgeState, DeltaInput, StateDelta, TargetType } from "../../lib/domain/state";
import type { SemanticCheckResult, Specialist } from "../../lib/domain/validation";
import { MemoryStateRepository } from "../../lib/repositories/memory-state-repository";
import type { StateRepository } from "../../lib/repositories/state-repository";
import { StateService } from "../../lib/server/state-service";
import type { SemanticModelClient, SemanticRequest } from "../../lib/server/validator/semantic";
import { createStory, epistemic, human, proposal, seedRecords } from "../helpers/backend";

export type CaseId = "Ch13-A" | "Ch13-B" | "Ch13-C" | "Ch13-D" | "Ch14-A" | "Ch15-A" | "Ch15-B" | "Ch16-A" | "Ch17-A" | "Ch17-B";
export const caseIds: CaseId[] = ["Ch13-A", "Ch13-B", "Ch13-C", "Ch13-D", "Ch14-A", "Ch15-A", "Ch15-B", "Ch16-A", "Ch17-A", "Ch17-B"];
const ET: Specialist[] = ["evidence", "temporal_state"];
const EKT: Specialist[] = ["evidence", "knowledge_boundary", "temporal_state"];
export const expected: Record<CaseId, { route: Specialist[]; verdicts: SemanticCheckResult["verdict"][]; recommendation: string; unsafe: boolean }> = {
  "Ch13-A": { route: ET, verdicts: ["SUPPORTED", "SUPPORTED"], recommendation: "AUTO_ACCEPT_ELIGIBLE", unsafe: false },
  "Ch13-B": { route: ET, verdicts: ["UNSUPPORTED", "SUPPORTED"], recommendation: "NEEDS_REVIEW", unsafe: true },
  "Ch13-C": { route: EKT, verdicts: ["UNSUPPORTED", "UNSUPPORTED", "SUPPORTED"], recommendation: "NEEDS_REVIEW", unsafe: true },
  "Ch13-D": { route: EKT, verdicts: ["SUPPORTED", "SUPPORTED", "SUPPORTED"], recommendation: "NEEDS_REVIEW", unsafe: false },
  "Ch14-A": { route: ET, verdicts: ["SUPPORTED", "SUPPORTED"], recommendation: "AUTO_ACCEPT_ELIGIBLE", unsafe: false },
  "Ch15-A": { route: EKT, verdicts: ["SUPPORTED", "SUPPORTED", "SUPPORTED"], recommendation: "NEEDS_REVIEW", unsafe: false },
  "Ch15-B": { route: EKT, verdicts: ["UNSUPPORTED", "UNSUPPORTED", "SUPPORTED"], recommendation: "NEEDS_REVIEW", unsafe: true },
  "Ch16-A": { route: EKT, verdicts: ["SUPPORTED", "SUPPORTED", "SUPPORTED"], recommendation: "NEEDS_REVIEW", unsafe: false },
  "Ch17-A": { route: ET, verdicts: ["UNSUPPORTED", "UNSUPPORTED"], recommendation: "NEEDS_REVIEW", unsafe: true },
  "Ch17-B": { route: EKT, verdicts: ["SUPPORTED", "SUPPORTED", "SUPPORTED"], recommendation: "NEEDS_REVIEW", unsafe: false },
};
export class FakeSemanticClient implements SemanticModelClient {
  readonly modelId = "deterministic-test-fake";
  requests: SemanticRequest[] = [];
  constructor(private answer: (request: SemanticRequest) => unknown | Promise<unknown> = supported) {}
  async complete(request: SemanticRequest) {
    this.requests.push(request);
    return this.answer(request);
  }
}
export function supported(request: SemanticRequest): SemanticCheckResult {
  return { agent: request.agent, verdict: "SUPPORTED", reason: "Explicit deterministic test fixture response.", evidenceIds: request.packet.primaryEvidence.map(e => e.id) };
}
export function benchmarkClient(id: CaseId) {
  return new FakeSemanticClient(request => ({
    ...supported(request), verdict: expected[id].verdicts[expected[id].route.indexOf(request.agent)],
    reason: `Frozen ${id} semantic fixture; this is not an online model judgment.`,
  }));
}

export async function runtimeFixture(id: CaseId = "Ch13-A", repository: StateRepository = new MemoryStateRepository(), client: SemanticModelClient = new FakeSemanticClient()) {
  const ids = Object.fromEntries(["Lin", "Chen", "Gu", "Father", "USB", "P", "Q", "F", "R", "LinP", "LinQ", "LinF", "GuP", "GuF", "GuR", "WorldP", "WorldF", "thread", "trust"].map(key => [key, randomUUID()]));
  const service = new StateService(repository, client), storyId = await createStory(service);
  const chapter = Number(id.slice(2, 4));
  const records: [TargetType, CanonicalRow][] = [];
  for (const [who, name] of [["Lin", "林夏"], ["Chen", "陈默"], ["Gu", "顾言"], ["Father", "林夏父亲"]])
    records.push(["characters", { id: ids[who], active: true, name, role: "fixture", location: epistemic(who === "Father" ? null : "Hospital") }]);
  for (const [key, statement] of [
    ["P", "陈默是市刑侦支队警察，并正在港务安保中卧底"],
    ["Q", "陈默的公开身份不完整"],
    ["F", "父亲三天前亲自到过 C-19，并亲手留下残页"],
    ["R", "林夏声称父亲三天前亲自到过 C-19，并亲手留下残页"],
  ]) records.push(["propositions", { id: ids[key], active: true, statement, kind: key === "R" ? "reported" : "assertion", reportedPropositionId: key === "R" ? ids.F : null, reporterId: key === "R" ? ids.Lin : null }]);
  records.push(
    ["items", { id: ids.USB, active: true, name: "加密 USB", owner: epistemic(ids.Chen), holder: epistemic(ids.Chen), custodian: null, condition: "encrypted" }],
    ["worldTruth", { id: ids.WorldP, active: true, propositionId: ids.P, status: "confirmed_true" }],
    ["worldTruth", { id: ids.WorldF, active: true, propositionId: ids.F, status: "unresolved" }],
    ["plotThreads", { id: ids.thread, active: true, title: "USB Mystery", coreQuestion: "谁在篡改港口货运记录？", status: "progressing", resolution: null }],
    ["relationships", { id: ids.trust, active: true, fromCharacterId: ids.Lin, toCharacterId: ids.Chen, category: "human_confirmed_psychological", predicate: "long_term_trust", value: "distrust", scope: "continuing", basis: human }],
  );
  const knowledge = new Map<string, CharacterKnowledgeState>();
  for (const [key, who, proposition] of [["LinP", "Lin", "P"], ["LinQ", "Lin", "Q"], ["LinF", "Lin", "F"], ["GuP", "Gu", "P"], ["GuF", "Gu", "F"], ["GuR", "Gu", "R"]]) {
    const belief = key === "LinF" && id === "Ch17-B";
    const report = key === "GuR" && id === "Ch15-B";
    const row: CharacterKnowledgeState = { id: ids[key], active: true, characterId: ids[who], propositionId: ids[proposition], stance: belief ? "believes" : report ? "knows" : "unaware", believedValue: belief || report ? true : null, basis: human };
    records.push(["knowledge", row]); knowledge.set(key, row);
  }
  await seedRecords(service, storyId, records);
  const source = readFileSync("docs/BENCHMARK_PILOT_V0.2.2.md", "utf8").split(`## Chapter ${chapter} `)[1].split("### 3. Chapter Text\n")[1].split("\n### 4. Ground Truth Events")[0].trim();
  const docId = randomUUID(), revisionId = randomUUID();
  await service.addSourceDocument(storyId, { id: docId, chapter, sourceOrder: chapter, title: `Chapter ${chapter}` });
  await service.addSourceRevision(storyId, { id: revisionId, documentId: docId, content: source, revisionNumber: 1, visibility: "canonical" });
  const quotes: Record<number, string[]> = {
    13: ["从大衣里取出那枚银色 USB，放进她手里", "保管好它。", "他也许并非码头的人"],
    14: ["签字离院，没留下去向"],
    15: ["三天前他亲自来过这里。这张残页就是他留给我的。", "还不能证明是谁把纸放进来的"],
    16: ["市刑侦支队，陈默，警号 071306。我在港务安保里卧底", "顾言看见徽记随角度变色，也认出证件格式", "林夏已经转过弯，只能看见她手电的余光"],
    17: id === "Ch17-A" ? ["今天是六月十七日", "他们会把我送去北堤中转站", "电脑右下角显示六月二十日凌晨"] :
      ["我没有去过十九号冷库", "三天前只有何叔刷证进入储物区，并把证物袋中的残页放入柜内；父亲的身份记录、面部影像和同行痕迹均未出现", "所以我错了。父亲没有在三天前来过 C-19；是何叔替他放的"],
  };
  const evidenceIds: string[] = [];
  for (const quote of quotes[chapter]) {
    const start = source.indexOf(quote); assert.ok(start >= 0);
    const evidenceId = randomUUID(); evidenceIds.push(evidenceId);
    await service.addEvidence(storyId, { id: evidenceId, sourceRevisionId: revisionId, quote, start, end: start + quote.length, speakerId: null });
  }
  const beforeEvent = await service.getCurrentState(storyId);
  const event = await service.appendEvent(storyId, { sourceRevisionId: revisionId, sourceOrder: chapter, storyTime: null, eventType: "frozen-benchmark", summary: "Hand-authored benchmark event", payload: {}, participantIds: chapter === 16 ? [ids.Chen, ids.Gu] : [ids.Lin, ids.Chen, ids.Gu], evidenceIds });
  assert.deepEqual(await service.getCurrentState(storyId), beforeEvent);
  const extra: Partial<DeltaInput> = { sourceKind: "story_event", sourceEventId: event.id, effect: { id: randomUUID(), description: "Candidate effect under test" }, evidenceIds, basis: { kinds: ["direct_observation"], note: "Proposed basis; semantics must be checked" } };
  let input: DeltaInput;
  if (id === "Ch13-A" || id === "Ch13-B") input = proposal("items", ids.USB, epistemic(ids.Chen), epistemic(ids.Lin), id === "Ch13-A" ? "holder" : "owner", extra);
  else if (id === "Ch14-A") input = proposal("characters", ids.Chen, epistemic("Hospital"), epistemic(null, "Hospital"), "location", extra);
  else if (id === "Ch17-A") input = proposal("characters", ids.Father, epistemic(null), epistemic("North Embankment Transfer Station"), "location", extra);
  else {
    const key = id === "Ch13-C" ? "LinP" : id === "Ch13-D" ? "LinQ" : id === "Ch15-B" ? "GuF" : id === "Ch16-A" ? "GuP" : "LinF";
    const before = knowledge.get(key)!;
    const after: CharacterKnowledgeState = { ...before, stance: id === "Ch13-D" ? "suspects" : id === "Ch15-A" ? "believes" : "knows",
      believedValue: id === "Ch13-D" ? null : id !== "Ch17-B", basis: extra.basis! };
    if (id === "Ch16-A") after.basis = { kinds: ["direct_disclosure", "credential_inspection"], note: "Disclosure and credential inspection" };
    if (id === "Ch17-B") after.basis = { kinds: ["documentary_evidence", "direct_disclosure"], note: "Recording, independent audit, explicit correction",
      correction: { previousStance: "believes", previousBelievedValue: true, evidenceIds } };
    input = proposal("knowledge", before.id, before, after, "$", extra);
  }
  const delta = await service.proposeDelta(storyId, input);
  return { repository, service, storyId, ids, delta, evidenceIds, docId, revisionId, source, event, input };
}
export function withoutValidatorResults(a: { deltas: StateDelta[] }) {
  return { ...a, deltas: a.deltas.map(d => ({ ...d, validatorResult: null })) };
}
