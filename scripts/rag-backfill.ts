import { productionPool } from "../lib/server/api";
import { backfillEvidenceChunks } from "../lib/rag/backfill";

async function main() {
  const pool = productionPool();
  const result = await backfillEvidenceChunks(pool);
  console.log(JSON.stringify({
    ...result,
    backfill: result.failures === 0 ? "PASS" : "FAIL",
  }));
  if (result.failures > 0) process.exitCode = 1;
}

void main();
