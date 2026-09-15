# Architecture Decision: Generic Semantic Validator

- Decision: **SELECT_GENERIC_VALIDATOR**
- Decision scope: planned Stage 2.2.2 Runtime Validator V0.2
- Status: accepted from the completed Stage 2.2.1B architecture experiment; implementation not started
- Historical baseline: Stage 2.2 Runtime Validator V0.1 Specialist remains completed and frozen

## Question

Does an Evidence + Knowledge Boundary + Temporal State Specialist decomposition provide enough value over one Generic semantic validator to justify its production complexity?

## Experimental design

The preregistered experiment used 10 Anchor cases and 20 frozen Holdout cases. Holdout was the primary architecture evidence; Anchor was sanity and regression evidence. Generic and Specialist used the same provider model alias, Validation Packet, frozen decoding, frozen candidates, and downstream routing policy. The comparison included a preselected 10-case hard-case stability set with three runs per architecture.

The model request and provider-returned identity were both `deepseek-flash`. The provider exposed only an alias, classified as `PROVIDER_MODEL_ALIAS_ONLY`, rather than an immutable backend version. All 198 planned calls completed in one contiguous session with no failed calls.

## Evidence

| Measure | Generic | Specialist |
| --- | ---: | ---: |
| Holdout semantic accuracy | 12/20 | 12/20 |
| False AUTO | 0/15 | 0/15 |
| Safe AUTO coverage | 4/5 | 4/5 |
| Review rate | 16/20 | 16/20 |
| Stable hard cases | 10/10 | 9/10 |
| Average calls per Holdout case | 1.00 | 2.15 |
| Mean latency | 1,365.79 ms | 2,760.91 ms |
| Median latency | 1,249.25 ms | 2,517.64 ms |
| P95 latency | 1,662.63 ms | 4,856.91 ms |

Specialist improved Evidence by one correct case and lost one correct Temporal case. Control and Knowledge were unchanged. Specialist H17 was unstable across the three stability runs: `UNCERTAIN`, `UNSUPPORTED`, `UNCERTAIN`.

## Decision

Select the Generic semantic validator for the planned Runtime Validator V0.2 simplification. Both architectures met the same observed safety and automation outcomes, and their Holdout correct counts were identical. Specialist produced no net boundary capability gain while requiring 2.15 times the calls, about twice the mean and median latency, about 2.9 times the P95 latency, and showing lower exact-verdict stability.

The rejected hypothesis is: **Specialist semantic decomposition provides sufficient incremental boundary capability to justify production complexity.**

## Consequences

Stage 2.2.2 may remove the Specialist decomposition only after separate Product Owner review and explicit implementation authorization. This decision does not change Stage 2.2 production code, routing, prompts, benchmark Gold, or the frozen Runtime Validator V0.1 history.

The Generic result must remain behind the deterministic gate, conservative routing, high-impact review, human decisions, and the rule that an LLM does not directly mutate Canonical State. The 12/20 result does not justify expanding AUTO acceptance.

## Limitations

The primary sample is 20 preregistered internal StoryState Holdout cases. It supports an architecture choice inside the current StoryState domain. It is not universal evidence about multi-agent systems or all long-horizon AIGC domains.

The provider exposed an alias-only identity. Running both architectures in one contiguous session reduced, but did not eliminate, the risk of an unobservable backend change behind that alias. The result compares these two frozen configurations; it does not establish that the selected Generic semantic judge is already sufficiently accurate for unrestricted canonical mutation.
