import { StateService } from "../lib/server/state-service";
import { productionRepository } from "../lib/server/api";
import type { CanonicalRow, DeltaInput, TargetType } from "../lib/domain/state";

export const demoStory = {
  storyId: "2c600001-0000-4000-8000-000000000001",
  documentId: "2c600001-0000-4000-8000-000000000002",
  sourceRevisionId: "2c600001-0000-4000-8000-000000000003",
  jiChuanId: "2c600001-0000-4000-8000-000000000004",
  linXiaId: "2c600001-0000-4000-8000-000000000005",
  recorderId: "2c600001-0000-4000-8000-000000000006",
  propositionId: "2c600001-0000-4000-8000-000000000007",
  threadId: "2c600001-0000-4000-8000-000000000008",
  relationshipId: "2c600001-0000-4000-8000-000000000009",
} as const;

const human: DeltaInput["basis"] = { kinds: ["human_confirmation"], note: "Deterministic final integration demo seed" };
const resolved = (value: string) => ({ value, status: "resolved" as const, lastConfirmedValue: value });

function createRecord(targetType: TargetType, row: CanonicalRow): DeltaInput {
  return {
    operation: "CREATE", targetType, targetId: row.id, fieldPath: "$", before: null, after: row,
    sourceKind: "human_correction", sourceEventId: null, effect: null, evidenceIds: [],
    reason: "Deterministic demo seed", confidence: 1, risk: [], proposedBy: "demo-seed",
    basis: human, resolutionSupport: null,
  };
}

async function main() {
  const service = new StateService(productionRepository());
  await service.createStory({ id: demoStory.storyId, title: "Final Extraction Demo" });
  const records: Array<[TargetType, CanonicalRow]> = [
    ["characters", { id: demoStory.jiChuanId, active: true, name: "纪川", role: "engineer", location: resolved("Maintenance Room") }],
    ["characters", { id: demoStory.linXiaId, active: true, name: "林夏", role: "operator", location: resolved("Control Room") }],
    ["items", { id: demoStory.recorderId, active: true, name: "Recorder", owner: resolved(demoStory.jiChuanId), holder: resolved(demoStory.jiChuanId), custodian: null, condition: "operational" }],
    ["propositions", { id: demoStory.propositionId, active: true, statement: "The recorder contains the shutdown sequence", kind: "assertion", reportedPropositionId: null, reporterId: null }],
    ["plotThreads", { id: demoStory.threadId, active: true, title: "Shutdown sequence", coreQuestion: "Where is the shutdown sequence?", status: "open", resolution: null }],
    ["relationships", { id: demoStory.relationshipId, active: true, fromCharacterId: demoStory.jiChuanId, toCharacterId: demoStory.linXiaId, category: "explicit_operational", predicate: "coordination", value: "active", scope: "current repair", basis: human }],
  ];
  const deltas = [];
  for (const [targetType, row] of records) {
    const delta = await service.proposeDelta(demoStory.storyId, createRecord(targetType, row));
    deltas.push(await service.decideDelta(demoStory.storyId, delta.id, { decision: "accepted", actor: "demo-seed", reason: "Seed canonical story state" }));
  }
  await service.commitAcceptedDeltas(demoStory.storyId, { deltaIds: deltas.map(delta => delta.id), expectedVersion: 0 });
  await service.addSourceDocument(demoStory.storyId, { id: demoStory.documentId, title: "Chapter 1", sourceOrder: 1, chapter: 1 });
  await service.addSourceRevision(demoStory.storyId, {
    id: demoStory.sourceRevisionId, documentId: demoStory.documentId, revisionNumber: 1,
    content: "纪川把 Recorder 交给林夏，并说：“里面有停机序列。”", visibility: "canonical",
  });
  console.log(JSON.stringify({ storyId: demoStory.storyId, sourceRevisionId: demoStory.sourceRevisionId }));
}

void main();
