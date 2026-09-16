# Stage 2.2.2 — Runtime Validator V0.2 Generic Semantic Simplification

Status: **IMPLEMENTED ON FEATURE BRANCH / AWAITING PRODUCT OWNER REVIEW**

## Why

The frozen Stage 2.2.1B experiment found no semantic, safety, or Safe AUTO advantage for Specialist decomposition over Generic validation. Both architectures scored 12/20 semantic correct, 0/15 false AUTO, and 4/5 Safe AUTO coverage on the Holdout. Generic used one call instead of 2.15 calls on average, had lower latency, and was more stable. The recorded architecture decision is **SELECT_GENERIC_VALIDATOR**.

## Production architecture

```text
Deterministic Gate
  → Validation Packet
  → ONE Generic Semantic Validator
  → Deterministic Impact / Routing Policy
  → Human Decision
  → Commit
```

Every eligible candidate with valid context makes exactly one bounded semantic request. The request uses the exact frozen Generic prompt shared with the evaluation harness, a strict Generic JSON schema, temperature 0, one response, a 500-token output limit, no tools, and no retries. The provider boundary remains vendor neutral and OpenAI compatible.

The production Runtime Validator no longer invokes Evidence, Knowledge Boundary, or Temporal State routing and does not fan out semantic calls. `routeAgents`, the Specialist prompts and parser, the Specialist orchestrator, and Specialist aggregation remain available for historical Stage 2.2 V0.1 and Stage 2.2.1 evaluation reproducibility.

## Safety and compatibility

The deterministic gate, bounded context provider, impact policy, explicit human Decision, commit/version behavior, input fingerprinting, stale-run rejection, and transactional writeback are preserved. A Generic result other than `SUPPORTED`, an unavailable or invalid semantic response, incomplete context, truncated retrieval, or a high-impact mutation routes to `NEEDS_REVIEW`. Semantic failures never become deterministic rejection and never become false AUTO eligibility.

`AUTO_ACCEPT_ELIGIBLE` remains a recommendation for a supported, complete, low-impact candidate. It does not decide, commit, or mutate Canonical State. Knowledge, World Truth, relationships, item ownership, resolved plot threads, and non-story-event mutations still require review.

Runtime Validator V0.2 stores `deterministic` plus `generic` checks, or `context` when context is unavailable. The validation domain continues to accept historical V0.1 `evidence`, `knowledge_boundary`, and `temporal_state` checks. Memory, PostgreSQL JSONB persistence, and API serialization need no migration.

## Limitation

Generic achieved 12/20 on the frozen Holdout. That result supports choosing the simpler architecture relative to Specialist decomposition. It does not support unrestricted semantic automation or wider AUTO acceptance. The LLM continues to recommend only; a human or explicit Decision API controls mutation admission.

Frozen dataset, Gold labels, prompts, decoding, governance documents, and Stage 2.2.1B result artifacts remain unchanged. Stage 2.2.2 makes no provider calls and does not add extraction, RAG, context compilation, writer integration, MCP, or frontend integration.
