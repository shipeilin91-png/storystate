# Stage 2.2.1B0.3 DeepSeek Live Runner Freeze

Status: **IDENTITY AND PROVENANCE FROZEN / OFFICIAL RUN NOT AUTHORIZED**.

Stage 2.2.1A remains **COMPLETED / FROZEN**. Stage 2.2.1B0/B0.1 prepared the provider package, and B0.3 freezes the post-probe identity and execution provenance contract. Stage 2.2.1B is **NOT STARTED**. Live Semantic Accuracy is **NOT YET VALIDATED**. No provider call was made in B0.3.

## Frozen experiment boundary

- Benchmark: `stage-2.2.1/v0.1`
- Dataset: `992db12b706414bec4b9dadb2e591e1c220a90af6962853cb5b3d89af6dda53e`
- Evaluation configuration: `f7c3ec971e427cf32a936d8b1f1f5f0ec813afdc60d2329cf261aa7c447c6420`
- Reviewed pre-live frozen commit: `fe620a3d8e36cf81d70d39c426a22783c555379a`
- Frozen decoding: temperature `0`, maximum output tokens `500`, one response, no retry, no tools.

The provider package does not change the Validation Packet, Generic prompt, specialist prompts, routing, Gold, Stage 2.2 production behavior, frontend, or Frozen Docs. Provider JSON still passes through the existing StoryState parser and grounding checks.

## Sanitized one-shot probe attestation

The separately authorized non-Benchmark red-key probe completed successfully before B0.3. This is the complete committed attestation:

| Field | Value |
| --- | --- |
| Probe status | PASS |
| Provider status | `completed` |
| Real probe calls | 1 |
| Benchmark calls | 0 |
| Requested model | `deepseek-flash` |
| Observed `response.model` | `deepseek-flash` |
| Model identity class | `PROVIDER_MODEL_ALIAS_ONLY` |
| Input tokens | 939 |
| Output tokens | 85 |
| Reasoning tokens | 0 |
| Semantic verdict | `SUPPORTED` |
| Structured parser | PASS |

The attestation excludes the API key, Authorization header, raw response, private account balance, and provider response ID. The probe validates connectivity, explicit non-thinking request behavior, structured-output compatibility, and usage mapping. It does not validate model accuracy or architecture quality.

## Honest alias-only identity

The requested alias and provider-returned model string were both `deepseek-flash`. The response did not expose a distinct immutable backend model version. The model identity class is therefore `PROVIDER_MODEL_ALIAS_ONLY`, not `SPECIFIC_RESOLVED_MODEL`.

The manifest retains `expectedResolvedModelVersion: deepseek-flash` solely because the provider-neutral runner calls its expected response identity field `modelVersion`. Here it means the exact expected provider-returned string. It is not evidence of an immutable or dated backend version, and it must not be described as `DeepSeek-V4.1-Flash` based on the response.

The official comparison may later use this limitation because Generic and Specialist would run with the same alias and settings in one contiguous process. This reduces, but does not eliminate, the risk of an unobservable backend change behind the alias.

## Exact DeepSeek request and response contract

Every future semantic call maps to one `POST https://api.deepseek.com/responses` request:

- `model`: `deepseek-flash`
- `instructions`: the unchanged Generic or applicable specialist prompt
- `input`: the complete Validation Packet under `UNTRUSTED_STORYSTATE_VALIDATION_DATA`
- `reasoning`: `{ "effort": "none" }`
- `temperature`: `0`
- `max_output_tokens`: `500`
- `text.format`: the existing response JSON Schema with a stable Generic or specialist name
- no tools, search, functions, prior response ID, conversation state, fallback, reflection, or retry

The adapter rejects reasoning output items and positive `usage.output_tokens_details.reasoning_tokens`. It accepts only completed assistant `output_text`, maps `usage.input_tokens` and `usage.output_tokens` exactly, and passes the result through the existing parser. Missing usage remains null. Each real benchmark response must return `response.model === deepseek-flash`; the existing identity guard aborts on any mismatch.

Official references: [Responses API](https://api-docs.deepseek.com/api/create-response/) and [thinking mode](https://api-docs.deepseek.com/guides/thinking_mode/).

## Fail-closed official runner

`npm run eval:semantic:live` defaults to the committed prepared manifest and returns `LIVE_RUN_NOT_AUTHORIZED`. The prepared manifest remains `PREPARED_NOT_AUTHORIZED`, with null authorization fields and null `liveRunCodeGitSha`. Environment variables cannot authorize a run.

The runner can later accept one explicitly supplied authorized manifest path. Before reading `DEEPSEEK_API_KEY` or constructing the transport it requires:

1. strict `AUTHORIZED` manifest status and Product Owner authorization fields;
2. provider `deepseek-api`, requested alias `deepseek-flash`, observed provider model `deepseek-flash`, and identity class `PROVIDER_MODEL_ALIAS_ONLY`;
3. expected provider-returned identity string `deepseek-flash`;
4. the frozen dataset, configuration, reviewed commit, temperature, output limit, primary and stability settings;
5. an exact `liveRunCodeGitSha` matching `HEAD`;
6. a clean worktree, including no untracked files;
7. the locally derived 198-call routing count.

There is no resume, retry, fallback, provider switch, model switch, or environment-only authorization path. The run executes primary and stability sequentially in one process. It must not be intentionally split across days.

## Offline preflight

`npm run eval:semantic:live:preflight` reconstructs the frozen experiment, verifies Git/lock provenance, derives routing, and serializes every proposed DeepSeek request without reading a key or calling a provider.

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

The estimate uses `CJK + non-CJK/4` for the low bound and `2×CJK + non-CJK/2` for the conservative high bound. It is **NOT PROVIDER TOKEN COUNT — FOR QUOTA PLANNING ONLY**.

## Execution provenance and artifacts

The artifact contract covers `run-manifest.json`, `raw-results.jsonl`, `metrics.json`, `report.md`, and `execution-summary.json`. Official artifacts record:

- benchmark frozen commit, dataset hash, and evaluation configuration hash;
- live-run code Git SHA and `gitWorktreeState: CLEAN`;
- provider, requested alias, observed provider model, and identity class;
- `runStartedAt` and `runFinishedAt`;
- case, architecture, phase, run, agent, packet hash, parsed result, latency, exact usage when available, provider response ID, completion status, and sanitized error category.

The alias-only classification is carried explicitly; artifacts do not describe the observed alias as a specific immutable model version. Files use restrictive temporary writes and atomic linking or renaming. Existing completed runs are immutable. `results/live-semantic/` remains Git-ignored, and B0.3 writes no benchmark result.

## Pricing and result policy

No account balance or provider price is committed. Provider pricing may change. Any later cost estimate requires returned usage plus an explicit reviewed pricing configuration. Raw provider results remain local by default; committing sanitized manifest, metrics, or report artifacts remains Product Owner-owned.

## Verification

B0.3 verification passed:

- build and lint: PASS;
- full suite: 258/258;
- backend: 62/62;
- exact benchmark contract: 11/11;
- runtime validator: 72/72;
- semantic eval harness: 51/51;
- live preparation: 37/37;
- offline preflight: PASS, frozen lock matched, 198 calls derived;
- default `npm run eval:semantic:live`: fail closed with `LIVE_RUN_NOT_AUTHORIZED`.

Provider calls in B0.3 remained 0; the historical synthetic probe count remains 1; benchmark calls remain 0.

## Methodology boundary

The 20 Holdout cases are a preregistered internal StoryState challenge set derived from Ch13–17 and known semantic boundary classes. They support an architecture decision within the current StoryState domain. They do not establish universal superiority across all long-horizon AIGC domains.
