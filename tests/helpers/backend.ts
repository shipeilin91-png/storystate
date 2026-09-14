import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Pool } from "pg";
import type { CanonicalRow, DeltaInput, Item, TargetType } from "../../lib/domain/state";
import { MemoryStateRepository } from "../../lib/repositories/memory-state-repository";
import { PostgresStateRepository } from "../../lib/repositories/postgres-state-repository";
import { StateService } from "../../lib/server/state-service";

export const human: DeltaInput["basis"] = { kinds: ["human_confirmation"], note: "Explicit test fixture setup, not extracted story evidence" };
export const epistemic = (value: string | null, lastConfirmedValue = value): Item["owner"] => ({
  value, status: value === null ? "unresolved" : "resolved", lastConfirmedValue,
});
export function proposal(targetType: TargetType, targetId: string, before: DeltaInput["before"], after: DeltaInput["after"], fieldPath = "$", extra: Partial<DeltaInput> = {}): DeltaInput {
  return {
    operation: before === null && fieldPath === "$" ? "CREATE" : "UPDATE",
    targetType, targetId, fieldPath, before, after,
    sourceKind: "human_correction", sourceEventId: null, effect: null, evidenceIds: [],
    reason: "Governed contract test", confidence: 1, risk: [], proposedBy: "human",
    basis: human, resolutionSupport: null, ...extra,
  };
}
export async function openRepository(adapter: "memory" | "postgres") {
  if (adapter === "memory") return { repository: new MemoryStateRepository(), close: async () => {} };
  const db = new PGlite();
  try {
    await db.exec(await readFile("supabase/migrations/20260914000100_canonical_state_foundation.sql", "utf8"));
  } catch (error) {
    await db.close();
    throw error;
  }
  // Same pg adapter as production; PGlite executes the migration and SQL locally.
  const connection = { query: (sql: string, args?: unknown[]) => db.query(sql, args), release: () => {} };
  const pool = { query: connection.query, connect: async () => connection } as unknown as Pool;
  return { repository: new PostgresStateRepository(pool), close: () => db.close() };
}
export async function accept(service: StateService, storyId: string, deltaId: string) {
  return service.decideDelta(storyId, deltaId, { decision: "accepted", actor: "human reviewer", reason: "Explicitly reviewed contract fixture" });
}
export async function seedRecords(service: StateService, storyId: string, records: [TargetType, CanonicalRow][]) {
  const ids: string[] = [];
  for (const [type, row] of records) {
    const d = await service.proposeDelta(storyId, proposal(type, row.id, null, row));
    await accept(service, storyId, d.id);
    ids.push(d.id);
  }
  const { story } = await service.getCurrentState(storyId);
  return service.commitAcceptedDeltas(storyId, { deltaIds: ids, expectedVersion: story.currentVersion });
}
export async function createStory(service: StateService) {
  const storyId = randomUUID();
  await service.createStory({ id: storyId, title: "Contract test" });
  return storyId;
}
