# Stage 2.2.1B0 Live Semantic Run Package

Status: **LIVE RUN PACKAGE PREPARED / AWAITING PRODUCT OWNER REVIEW**.

Stage 2.2.1A remains completed and frozen. Stage 2.2.1B is **NOT STARTED**. Live Semantic Accuracy is **NOT YET VALIDATED**. This package made **0 real provider calls** and does not authorize one.

## Frozen experiment boundary

- Benchmark: `stage-2.2.1/v0.1`
- Dataset: `992db12b706414bec4b9dadb2e591e1c220a90af6962853cb5b3d89af6dda53e`
- Evaluation configuration: `f7c3ec971e427cf32a936d8b1f1f5f0ec813afdc60d2329cf261aa7c447c6420`
- Reviewed pre-live frozen commit: `fe620a3d8e36cf81d70d39c426a22783c555379a`
- Frozen decoding: temperature `0`, maximum output tokens `500`, one response, no retry, no tools.

The adapter does not change the Validation Packet, Generic prompt, specialist prompts, routing, Gold, or Stage 2.2 production behavior. Provider JSON still passes through the existing StoryState parser and evidence-grounding checks.

## Candidate provider and models

The candidate provider is the Google Gemini Developer API through the official `@google/genai` JavaScript SDK. The API key variable is `GEMINI_API_KEY`; it must never be logged, persisted, included in errors, or committed.

Current candidates, with no official selection yet:

- `gemini-3.1-flash-lite`
- `gemini-2.5-flash`
- `gemini-2.5-flash-lite`

A future reviewed manifest must contain exactly one requested model. There is no fallback or provider/model switching within an experiment. A failure aborts the run.

## Request and response mapping

Each semantic call becomes one `models.generateContent` request:

- `systemInstruction`: the unchanged Generic or specialist system prompt.
- `contents`: one user content containing the complete Validation Packet serialized under `UNTRUSTED_STORYSTATE_VALIDATION_DATA`.
- `temperature`, `maxOutputTokens`, and `candidateCount`: copied from the frozen evaluation decoding configuration.
- `responseMimeType`: `application/json`.
- `responseJsonSchema`: the existing response schema, with only the unsupported JSON Schema dialect declaration removed.
- no tools, search, URL context, code execution, function calling, reflection, or retry.

The adapter records the response's actual `modelVersion`; it never derives a version from the requested model ID. The current runner requires a predeclared expected resolved version and aborts on drift. Therefore the prepared manifest leaves `expectedResolvedModelVersion` null. A separately authorized version-discovery decision must happen before the official run, followed by manifest review. Identity protection is not weakened.

Gemini usage mapping is exact when both fields exist:

- `usageMetadata.promptTokenCount` → `inputTokens`
- `usageMetadata.candidatesTokenCount` → `outputTokens`

Missing or partial metadata remains unavailable (`usage: null`). Cached, tool-use, thought, and total token categories are not folded into these fields.

## Execution boundary

`npm run eval:semantic:live` is deliberately disabled and always returns `LIVE_RUN_NOT_AUTHORIZED`. It does not read `GEMINI_API_KEY`, construct an SDK client, or expose an execute flag. Tests and offline preflight inject no official transport and make no network request.

The committed prepared manifest is `config/live-semantic/run-manifest.prepared.json`. Its status is `PREPARED_NOT_AUTHORIZED`; requested model, expected resolved version, authorization time, and authorizer are null. It is insufficient to call the API.

## Offline call and quota preflight

Run:

```sh
npm run eval:semantic:live:preflight
```

The command locally reconstructs the frozen benchmark, validates the Git/lock provenance, derives routing, serializes every proposed Gemini request, and reports call counts and request sizes. It does not load a key or call a provider.

The token range is labeled **NOT PROVIDER TOKEN COUNT — FOR QUOTA PLANNING ONLY**. For mixed Chinese/English/JSON, each request uses:

- low estimate: `CJK characters + non-CJK characters / 4`
- conservative high estimate: `2 × CJK characters + non-CJK characters / 2`
- output ceiling: derived calls × frozen `maxOutputTokens`

No remote tokenizer or `countTokens` call is permitted in B0.

| Quota decision field | Value |
| --- | --- |
| Required calls | Derived by offline preflight |
| Actual AI Studio RPD | `TO_BE_FILLED_AFTER_PO_REVIEW` |
| Actual AI Studio RPM | `TO_BE_FILLED_AFTER_PO_REVIEW` |
| Actual applicable token limits | `TO_BE_FILLED_AFTER_PO_REVIEW` |
| Estimated request-token need | Offline range; not a provider count |
| Decision | `UNDECIDED` |

If the actual free quota cannot comfortably complete the official run using one reviewed model and project, do not start. Do not split the primary experiment across models or projects.

Current B0 offline output:

| Derived measurement | Value |
| --- | --- |
| Total calls | 198 |
| Primary Generic / Specialist | 30 / 69 |
| Stability Generic / Specialist | 30 / 69 |
| Evidence / Knowledge / Temporal specialist calls | 60 / 20 / 58 |
| Total request characters / UTF-8 bytes | 1,100,633 / 1,127,635 |
| Mean / median / maximum request bytes | 5,695.13 / 5,382 / 8,839 |
| Rough input-token range | 284,935–569,770 |
| Frozen output-token ceiling | 99,000 |
| Real provider calls | 0 |

These measurements were derived from routing and locally serialized requests. The token range is a quota-planning heuristic, not a provider token count.

## Artifact contract and Git policy

`lib/eval/live/artifacts.ts` defines and validates:

- `run-manifest.json`
- `raw-results.jsonl`, one semantic-request record per line
- `metrics.json`
- `report.md`
- `execution-summary.json`

Each raw record carries experiment/freeze/model provenance, case/architecture/phase/run/agent, packet hash, parsed verdict/reason/evidence IDs, latency, exact usage when available, provider response ID, finish reason, and a sanitized error category. Secrets and provider headers are excluded.

Files are written through a restrictive temporary file and atomically linked or renamed. Existing completed runs are immutable; partial, aborted, and completed summaries are distinct. Future raw results live under `results/live-semantic/`, which Git ignores. The sanitized schema example remains tracked in `tests/fixtures/`. Whether sanitized manifest/metrics/report artifacts are later committed is Product Owner-owned; raw provider responses remain local by default.

## Free tier, quota, and privacy

The [Gemini Developer API pricing page](https://ai.google.dev/gemini-api/docs/pricing) currently lists free-tier access for candidate models and states that free-tier submitted content may be used to improve Google's products. The [rate-limit documentation](https://ai.google.dev/gemini-api/docs/rate-limits) says effective limits depend on model, project/account tier, and current capacity, and directs users to Google AI Studio for active limits. Public documentation does not justify assuming a specific RPD for this project.

Immediately before any future run, the Product Owner must inspect the actual AI Studio RPM, RPD, and token limits. Only synthetic StoryState benchmark content may be submitted. Do not send personal data, private company content, user secrets, or production data.

## Alternatives for fallback research only

- **Groq:** Its official API exposes familiar SDK/OpenAI-compatible integration patterns and model-specific RPM/RPD/TPM/TPD limits. Some models have high RPD, while token-per-day limits may still make the complete run unsuitable. Inspect the account's current limit page before considering it.
- **OpenRouter:** Its API is OpenAI-compatible. Its official FAQ currently documents low free-model daily limits without purchased credits, so it is not preferred for this 198-call one-session experiment. Automatic model routing would also violate the fixed-model comparison.

No Groq or OpenRouter adapter is implemented in B0.

## B0 verification

- `@google/genai`: `2.22.0` in the lockfile.
- build and lint: PASS.
- full suite: 241/241.
- backend: 62/62; exact benchmark: 11/11; validator: 72/72; Stage 2.2.1A evaluation: 51/51.
- B0 provider/preflight tests: 20/20, using injected fake transports only.
- Stage 1.3 regression: 25/25.
- disabled live command: exits nonzero with `LIVE_RUN_NOT_AUTHORIZED`.
- real provider calls: **0**.

## Methodology boundary

The 20 Holdout cases are a preregistered internal StoryState challenge set derived from Ch13–17 and known semantic boundary classes. They support an architecture decision within the current StoryState domain. They do not establish universal superiority across all long-horizon AIGC domains.
