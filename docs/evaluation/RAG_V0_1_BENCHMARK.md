# Evidence RAG V0.1 Benchmark

## Status

The deterministic retrieval/safety harness passes locally. The repository-local
finalizer writes the sanitized real A/B result to `live-results.json` and
`live-summary.json` after authenticated remote execution. Until that artifact
exists, no provider accuracy or enablement claim is made and Production
remains `STORYSTATE_RAG_ENABLED=0`/unset.

## Registered Cases

The fixture `tests/fixtures/rag-badcases.ts` registers 12 cases across six
groups. The live A/B runner uses all 12 cases:

| Group | Cases |
| --- | --- |
| historical old/current state | R01, R02 |
| holder/owner/custodian | R03, R04 |
| belief/report/world truth | R05, R06 |
| pronoun/ellipsis | R07, R08 |
| redundant/current state | R09, R10 |
| repeated reversals | R11, R12 |

Each future case runs with identical model/config in two arms:

- baseline: RAG disabled
- RAG: deterministic historical retrieval enabled

Case metrics are expected-effect correctness, exact current-source Evidence
validity, historical quote leakage, ownership/custody violations,
belief/report/world-truth violations, redundant candidates, and schema
validity. The enablement rule requires zero safety regressions, zero historical
Evidence leakage, no Canonical State regression, and measurable improvement on
at least one history-dependent case.

## Local Deterministic Coverage

- deterministic Chinese/English/mixed-language vectorization
- 384-dimensional L2-normalized signed character n-grams
- exact chunk content/hash preservation and long-text splitting
- same-story, chronology, current-revision, future-source, hidden-source and
  superseded-revision exclusion
- entity and bounded recency scoring
- Top-K and 3600-character context budget
- idempotent chunk indexing
- feature flag OFF baseline projection
- historical Evidence quote rejection
- additive, non-destructive migration shape
