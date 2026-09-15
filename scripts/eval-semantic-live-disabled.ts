import { assertB0ExecutionDisabled } from "../lib/eval/live/manifest";

try {
  assertB0ExecutionDisabled();
} catch (error) {
  console.error(error instanceof Error ? error.message : "LIVE_RUN_NOT_AUTHORIZED");
  process.exitCode = 1;
}
