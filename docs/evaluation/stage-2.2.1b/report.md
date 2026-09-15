# Stage 2.2.1B Live Semantic Architecture Experiment

Status: **COMPLETED / LIVE SEMANTIC ARCHITECTURE EXPERIMENT VALID**.

Decision: **SELECT_GENERIC_VALIDATOR** for the planned Runtime Validator V0.2 simplification.

This experiment answers whether the Specialist decomposition justifies its additional production complexity relative to one Generic semantic validator. It does not show that 60% Holdout semantic accuracy is sufficient for unrestricted canonical mutation.

## Execution

| Field | Result |
| --- | --- |
| Status | `COMPLETED` |
| Calls | 198 expected / 198 completed / 0 failed |
| Run window | 2026-09-15T13:33:18.293Z — 2026-09-15T13:37:31.872Z |
| Provider | `deepseek-api` |
| Requested / observed model | `deepseek-flash` / `deepseek-flash` |
| Identity class | `PROVIDER_MODEL_ALIAS_ONLY` |
| Reasoning | none |
| Total input / output tokens | 353,591 / 25,005 |

## Primary Holdout result

The 20 frozen Holdout cases are the primary architecture evidence. The 10 Anchor cases are sanity and regression evidence only.

| Metric | Generic | Specialist |
| --- | ---: | ---: |
| Semantic accuracy | 12/20 (60%) | 12/20 (60%) |
| False AUTO | 0/15 | 0/15 |
| Safe AUTO coverage | 4/5 (80%) | 4/5 (80%) |
| Review rate | 16/20 (80%) | 16/20 (80%) |
| Invalid or unavailable responses | 0 | 0 |
| Average model calls | 1.00 | 2.15 |
| Mean latency | 1,365.79 ms | 2,760.91 ms |
| Median latency | 1,249.25 ms | 2,517.64 ms |
| P95 latency | 1,662.63 ms | 4,856.91 ms |

Group accuracy was Generic `control 4/5`, `evidence 2/5`, `knowledge 3/5`, `temporal 3/5`; Specialist was `control 4/5`, `evidence 3/5`, `knowledge 3/5`, `temporal 2/5`. The Specialist Evidence gain of one case was offset by one fewer correct Temporal case.

## Stability and efficiency

Generic had 10/10 stable hard cases with 100% exact verdict agreement. Specialist had 9/10 stable cases with 90% agreement. Specialist H17 varied `UNCERTAIN → UNSUPPORTED → UNCERTAIN`; all stability responses were valid.

Specialist used 2.15 times as many model calls per Holdout case. Its mean and median latency were each about 2.02 times Generic, and its P95 latency was about 2.92 times Generic.

## Decision boundary

The preregistered simplification rule selects Generic when both architectures have zero False AUTO and their Holdout correct counts differ by at most one case. The observed difference was zero. Specialist added no net semantic accuracy, safety, Safe AUTO coverage, or Review Rate benefit, while increasing calls, latency, complexity, and instability.

The selected direction is therefore a **Generic semantic validator** for the separately reviewed and implemented Stage 2.2.2. Stage 2.2 Runtime Validator V0.1 remains the frozen Specialist historical baseline and is unchanged by this documentation result.

The production safeguards remain required: deterministic admission gates, conservative routing, high-impact review, human decisions, and no direct LLM mutation. This experiment does not authorize broader AUTO acceptance.

## Artifact policy

The tracked directory contains a sanitized run manifest, execution summary, aggregate metrics, this report, and the architecture decision record. Raw provider results stay local and ignored. No API key, Authorization header, provider response ID, provider response body, or private account data is committed.
