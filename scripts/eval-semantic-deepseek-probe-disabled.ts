import { assertDeepSeekProbeDisabled } from "../lib/eval/live/deepseek-probe";

try {
  assertDeepSeekProbeDisabled();
} catch (error) {
  console.error(error instanceof Error ? error.message : "DEEPSEEK_PROBE_NOT_AUTHORIZED");
  process.exitCode = 1;
}
