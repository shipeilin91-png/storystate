import { buildLivePreflight } from "../lib/eval/live/preflight";

async function main() {
  if (process.argv.length !== 2) throw new Error("OFFLINE_PREFLIGHT_ACCEPTS_NO_FLAGS");
  console.log(JSON.stringify(await buildLivePreflight(), null, 2));
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : "OFFLINE_PREFLIGHT_FAILED");
  process.exitCode = 1;
});
