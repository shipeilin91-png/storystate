import { executeOfficialDeepSeekRun } from "../lib/eval/live/official-run";
import { PREPARED_MANIFEST_PATH } from "../lib/eval/live/manifest";

const safeErrors = new Set([
  "LIVE_RUN_NOT_AUTHORIZED",
  "LIVE_RUN_DIRTY_WORKTREE",
  "LIVE_RUN_CODE_SHA_MISMATCH",
  "AUTHORIZED_MANIFEST_CALL_COUNT_MISMATCH",
  "LIVE_RUN_CALL_COUNT_MISMATCH",
  "MODEL_IDENTITY_CHANGED",
]);

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1) throw new Error("LIVE_RUN_MANIFEST_ARGUMENT_INVALID");
  await executeOfficialDeepSeekRun(args[0] ?? PREPARED_MANIFEST_PATH);
}

main().catch(error => {
  const message = error instanceof Error ? error.message : "";
  const category = [...safeErrors].find(value => message.startsWith(value));
  console.error(category ?? "LIVE_RUN_FAILED");
  process.exitCode = 1;
});
