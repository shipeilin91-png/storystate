# Stage 2.2.1B0.1 DeepSeek Live Semantic Run Package

Status: **DEEPSEEK PROVIDER PREPARED / PROBE NOT AUTHORIZED**.

Stage 2.2.1A remains **COMPLETED / FROZEN**. Stage 2.2.1B0 contains the prepared live-run package. Stage 2.2.1B is **NOT STARTED**. Live Semantic Accuracy is **NOT YET VALIDATED**. This package made **0 real provider calls** and authorizes neither a probe nor the official experiment.

## Frozen experiment boundary

- Benchmark: `stage-2.2.1/v0.1`
- Dataset: `992db12b706414bec4b9dadb2e591e1c220a90af6962853cb5b3d89af6dda53e`
- Evaluation configuration: `f7c3ec971e427cf32a936d8b1f1f5f0ec813afdc60d2329cf261aa7c447c6420`
- Reviewed pre-live frozen commit: `fe620a3d8e36cf81d70d39c426a22783c555379a`
- Frozen decoding: temperature `0`, maximum output tokens `500`, one response, no retry, no tools.

The provider pivot does not change the Validation Packet, Generic prompt, specialist prompts, routing, Gold, Stage 2.2 production behavior, frontend, or Frozen Docs. Provider JSON still passes through the existing StoryState parser and grounding checks.

## Official provider and unresolved model version

The official provider for the proposed experiment is the DeepSeek API at `https://api.deepseek.com`, using native Node `fetch` and the `DEEPSEEK_API_KEY` environment variable. The requested model ID is exactly `deepseek-flash`. There is no fallback or automatic switch to an alternate alias, model, provider, or project.

`deepseek-flash` is a provider alias. The package does not assume a resolved version. `expectedResolvedModelVersion` remains null until a separately authorized synthetic probe observes `response.model` and the Product Owner reviews that result. The official runner later requires that reviewed value and retains the existing identity-drift abort.

Gemini remains documentation-only prior research. Its SDK dependency and runtime adapter were removed so the official package exposes one provider path.

## Exact Responses API mapping

Every future semantic call maps to one `POST /responses` request:

- `model`: `deepseek-flash`
- `instructions`: the unchanged Generic or applicable specialist system prompt
- `input`: the complete Validation Packet under `UNTRUSTED_STORYSTATE_VALIDATION_DATA`
- `reasoning`: `{ "effort": "none" }`
- `temperature`: `0`
- `max_output_tokens`: `500`
- `text.format`: the existing response JSON Schema with a stable Generic or specialist schema name
- no tools, web search, functions, prior response ID, conversation state, reflection, or retry

DeepSeek documents that Responses API `reasoning.effort: none` disables thinking, while thinking is otherwise enabled by default. The adapter rejects any reasoning output item or positive `usage.output_tokens_details.reasoning_tokens` with `DEEPSEEK_REASONING_NOT_DISABLED`.

The adapter reads only assistant `output_text` from message output items. It requires `status=completed`, sends the text through the existing StoryState parser, maps `response.model` to the resolved model version, maps `response.id` to the provider response ID, and records completed status as provider metadata. Reasoning, tool, and unknown output items never become the semantic answer.

Usage mapping is exact when both fields are valid:

- `usage.input_tokens` → `inputTokens`
- `usage.output_tokens` → `outputTokens`

Missing or partial usage remains `usage: null`. No token value is invented. Provider errors are reduced to bounded categories; response bodies, Authorization headers, and keys are excluded from artifacts.

Official references: [Responses API](https://api-docs.deepseek.com/api/create-response/), [thinking mode](https://api-docs.deepseek.com/guides/thinking_mode/), and [models/pricing](https://api-docs.deepseek.com/quick_start/pricing/).

## Synthetic probe boundary

`lib/eval/live/deepseek-probe.ts` prepares one independent synthetic example: evidence says a red key lies on a desk and the candidate says the key is red. It contains no Anchor, Holdout, H01–H20, Ch13–17, Gold, minimal-pair, or benchmark content.

The probe is only for later verification of credentials, `deepseek-flash` acceptance, Responses API compatibility, explicit non-thinking mode, structured output, returned model version and response ID, usage metadata, zero reasoning tokens, and parser compatibility. It is not accuracy or architecture evidence.

`npm run eval:semantic:deepseek:probe` is deliberately disabled and exits with `DEEPSEEK_PROBE_NOT_AUTHORIZED` before reading `DEEPSEEK_API_KEY`, constructing the official transport, or making a request. It has no execute flag or environment bypass.

`npm run eval:semantic:live` remains disabled and exits with `LIVE_RUN_NOT_AUTHORIZED`. The prepared manifest is `PREPARED_NOT_AUTHORIZED`, has no authorization fields or resolved version, and is insufficient to run the benchmark.

## Offline call and budget preflight

Run `npm run eval:semantic:live:preflight` to reconstruct the frozen experiment, verify Git/lock provenance, derive routing, and serialize every exact proposed DeepSeek request locally. This command does not read a key or call a provider.

The token range is labeled **NOT PROVIDER TOKEN COUNT — FOR QUOTA PLANNING ONLY**. For mixed Chinese/English/JSON, each serialized request uses:

- low estimate: `CJK characters + non-CJK characters / 4`
- conservative high estimate: `2 × CJK characters + non-CJK characters / 2`
- output ceiling: derived calls × frozen `maxOutputTokens`

Current B0.1 offline output:

| Derived measurement | Value |
| --- | --- |
| Total calls | 198 |
| Primary Generic / Specialist | 30 / 69 |
| Stability Generic / Specialist | 30 / 69 |
| Generic / Evidence / Knowledge / Temporal calls | 60 / 60 / 20 / 58 |
| Total request characters / UTF-8 bytes | 1,097,879 / 1,124,881 |
| Mean / median / maximum request bytes | 5,681.22 / 5,369 / 8,826 |
| Rough input-token range | 284,242–568,391 |
| Frozen output-token ceiling | 99,000 |
| Real provider calls | 0 |

## Pricing and authorization policy

The Product Owner has separately confirmed sufficient account budget; no personal balance is recorded. Provider prices can change and are not embedded in evaluation metrics. Future cost estimates require exact returned usage plus an explicit reviewed pricing configuration. No pricing configuration is authorized in B0.1.

| Decision field | Value |
| --- | --- |
| Required calls | Derived by offline preflight |
| Actual provider request limits | `TO_BE_FILLED_AFTER_PO_REVIEW` |
| Actual applicable token limits | `TO_BE_FILLED_AFTER_PO_REVIEW` |
| Reviewed pricing configuration | `NOT_AUTHORIZED` |
| Resolved model version | `UNKNOWN UNTIL PROBE` |
| Decision | `PENDING_SEPARATE_PROBE_AND_RUN_AUTHORIZATION` |

Do not split or switch the official experiment across models, providers, or projects. A failure aborts the run for review.

## Artifact contract and Git policy

The prepared artifact contract covers `run-manifest.json`, `raw-results.jsonl`, `metrics.json`, `report.md`, and `execution-summary.json`. Records retain experiment/freeze/model provenance, case/architecture/phase/run/agent, packet hash, parsed result, latency, exact usage when available, provider response ID, completion status, and sanitized errors. No key, Authorization header, or raw sensitive request header is accepted.

Writes use restrictive temporary files and atomic linking or renaming. Existing completed runs are immutable; partial, aborted, and completed states are distinct. `results/live-semantic/` remains Git-ignored, and no real results exist. Schemas and the sanitized example remain tracked. A later Product Owner decision may permit sanitized manifest/metrics/report artifacts while raw provider results remain local.

## B0.1 verification boundary

All provider and probe tests use injected fake responses. Final preparation verification:

- install: PASS, 381 packages audited, 0 vulnerabilities
- build and lint: PASS
- full suite: 253/253
- backend: 62/62; exact benchmark: 11/11; validator: 72/72; evaluation harness: 51/51
- B0/B0.1 provider, probe, manifest, artifact, freeze, and preflight tests: 32/32
- offline DeepSeek preflight: PASS with the frozen Git/lock match
- disabled probe: exits nonzero with `DEEPSEEK_PROBE_NOT_AUTHORIZED`
- disabled official live runner: exits nonzero with `LIVE_RUN_NOT_AUTHORIZED`
- `DEEPSEEK_API_KEY` read: NO
- `REAL_PROVIDER_CALLS`: **0**

## Methodology boundary

The 20 Holdout cases are a preregistered internal StoryState challenge set derived from Ch13–17 and known semantic boundary classes. They support an architecture decision within the current StoryState domain. They do not establish universal superiority across all long-horizon AIGC domains.
