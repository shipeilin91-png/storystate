# Evidence RAG V0.1 Benchmark

## Scope

This stage is intentionally local-only:

- historical chunking and exact source offsets
- deterministic signed n-gram vectorization
- same-story retrieval with chronology guards
- current-revision and future-revision exclusion
- recency and entity signals
- Top-K `5`
- context budget `3600` characters
- Extractor packet safety
- 12 registered StoryState badcases in baseline/RAG arms

Vercel, hosted Production, Supabase Production migration, temporary admin API,
Production smoke, deployment protection, remote finalization, and main merge
are outside the V0.1 completion standard.

## Frozen Cases

`tests/fixtures/rag-badcases.ts` contains 12 cases in six groups:

| Group | Cases |
| --- | --- |
| stale historical state | R01, R02 |
| holder / owner / custodian | R03, R04 |
| belief / report / world truth | R05, R06 |
| pronoun / ellipsis | R07, R08 |
| redundant current state | R09, R10 |
| repeated state reversals | R11, R12 |

Every case is run in two arms:

- baseline: `STORYSTATE_RAG_ENABLED=0` projection
- RAG: deterministic historical retrieval enabled

## Local Result

The local run is recorded in [`local-summary.json`](rag-v0.1/local-summary.json)
and [`local-results.json`](rag-v0.1/local-results.json).

- mode: `deterministic-safety`
- real-model A/B: `NOT_RUN`
- local provider configuration: unavailable
- retrieval hit correctness: `12/12`
- same-story admission: `12/12`
- current-revision exclusion: `12/12`
- future-revision exclusion: `12/12`
- Top-K and context budget: `12/12`
- recency boost signal: `12/12`
- entity boost signal: `12/12`
- pronoun/entity retrieval support: `2/2`
- historical evidence leakage: `0`
- canonical mutation safety: `PASS`
- ownership/custody violations: `0`
- belief/truth violations: `0`
- stale-history errors: `0`
- redundant candidate errors: `0`

The deterministic harness uses a conservative no-op Extractor provider when
local provider configuration is unavailable. Its effect match is `4/12` in
both arms, but this is a fixture/control result and **not model accuracy**.
Semantic baseline rate, RAG rate, and absolute percentage-point change remain
unmeasured. Absolute pp change is only reported after a real local provider A/B.

## Extractor Input Contract

Both arms use the same explicit packet structure:

```text
CURRENT_SOURCE
CURRENT_CANONICAL_STATE
RETRIEVED_HISTORICAL_CONTEXT  (RAG arm only)
```

Historical context is labeled context-only and is never authoritative for new
EvidenceProposal quotes. Evidence must be an exact span from `CURRENT_SOURCE`.
Canonical State remains current truth; retrieval cannot mutate it.

## Running Locally

```bash
npm run benchmark:rag
```

The script writes sanitized local artifacts to this directory. If all three
server-only `STORYSTATE_EXTRACTOR_*` variables are already available in the
current local environment, it runs the real 12-case A/B directly. It never
pulls or runs secrets through Vercel or Supabase and never deploys.
