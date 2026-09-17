# StoryState

**Stateful Context Infrastructure for Long-horizon AIGC.** StoryState gives an existing Writer a governed, versioned view of the story’s current truth without turning the product into another AI Writer.

## Problem

**History ≠ Current State.** Long context and retrieval can surface earlier passages, but retrieval alone does not decide which fact is current, whether a character knows it, or whether a later event superseded it. Long-running stories need structured current truth, exact provenance, controlled mutation, and recoverable versions.

## Product

```text
Story Content
  → AI Extraction
  → Deterministic Compiler
  → Runtime Validator
  → Human Review
  → Commit
  → Canonical State + Version History
```

The user writes or pastes new story content in Workspace. StoryState creates a source revision, asks one configured extractor for a strict semantic proposal, compiles that proposal into exact Evidence, Events, and Candidate State Deltas, validates each candidate, and hydrates Review. A person accepts or rejects candidates. Only an explicit Commit can create the next Canonical State version.

## Core Architecture

1. **Extraction** interprets a bounded story revision and returns the frozen `ExtractionProposal` shape.
2. **Deterministic Compiler** resolves opaque model aliases and turns proposals into exact Evidence, Events, and typed Candidate State Deltas.
3. **Runtime Validator V0.2** applies deterministic gates plus one bounded Generic semantic check, then records support, risk, and safe routing.
4. **Human Review** owns Decision. A recommendation never becomes an automatic acceptance.
5. **StateService** owns controlled Canonical mutation, optimistic version checks, snapshots, Restore, and Version History.

**The LLM never directly mutates Canonical State.** The authority boundary is Extract → Propose → Validate → Review → Commit.

See [Final Architecture](docs/FINAL_ARCHITECTURE.md) for system boundaries, data ownership, invariants, and tradeoffs.

## Why not just Prompt, Summary, or RAG?

| Approach | What it provides | What it does not provide |
| --- | --- | --- |
| Prompt | Instructions and working context | Persistent, auditable current truth |
| Summary | Compressed narrative | Typed state, provenance, and versioned mutation |
| RAG | Relevant historical retrieval | Resolution of which fact is currently canonical |
| StoryState | Explicit current state, evidence, review, and versions | General-purpose retrieval or writing generation |

StoryState complements retrieval. Evidence RAG can supply context while StoryState remains responsible for current truth and mutation governance.

## Implemented MVP

- Canonical State for characters, items, plot threads, propositions, world truth, character knowledge, and relationships
- exact Evidence spans, Source Documents/Revisions, and an append-only Event Ledger
- typed Candidate State Deltas with provenance, validation results, and human Decisions
- AI Extraction through a provider-neutral, server-only adapter
- deterministic Compiler with opaque model aliases and Canonical ID resolution
- Runtime Validator V0.2 with conservative routing and failure-safe review
- Evidence RAG V0.1 as a feature-flagged historical context layer before extraction
- explicit Accept/Reject and Commit boundaries
- immutable State Versions, snapshot History, and Restore as a new version
- Library, Setup, Workspace, Review, State, and History product flows
- real frontend/backend adapter flow with refresh hydration from PostgreSQL
- stale-version protection, rejected-candidate audit retention, and per-candidate validator failure isolation

## Safety and Governance

- Extract never creates a Human Decision and never commits.
- Validator recommendations never replace user authority.
- Accepted candidates are sent to Commit with the expected State Version.
- A stale `409` mutation is surfaced and is never silently retried.
- Rejected candidates remain audit data and do not reappear in active Review.
- `VALIDATOR_UNAVAILABLE` remains Needs Review and is never shown as evidence-supported automatic acceptance.
- Canonical State changes only inside the transactional StateService commit path.
- Restore creates a new version and preserves history.

## Evaluation

The repository includes deterministic contract, compiler, migration, governance, and Ch13–17 regression suites. Stage 2.2.1 compared Generic and Specialist validator architectures on a preregistered internal StoryState challenge set; both reached 12/20 semantic accuracy and zero false automatic accepts under the experiment’s policy, so the project selected the simpler Generic architecture.

These results support an architecture decision for this bounded dataset. They are not production user metrics, do not prove broad literary accuracy, and do not authorize unrestricted automatic mutation. Stage 2.3A’s 14-case Development benchmark is also a development contract fixture, not a claim about real-user model quality.

## Evidence RAG V0.1

Evidence RAG retrieves a small Top-K of historical Source Revision chunks before
Extraction. It is same-story, chronology-bounded, excludes the current revision,
future sources, and superseded revisions, and is disabled by default with
`STORYSTATE_RAG_ENABLED=1` as the explicit opt-in.

Retrieved text is context only. It cannot become Canonical State or authoritative
Evidence: new `EvidenceProposal` quotes must still be exact spans from the
current Source Revision. The index uses a deterministic signed character
bigram/trigram vectorizer with 384 dimensions. This is a replaceable lexical
retrieval vectorizer, not a neural embedding model.

<!-- RAG_V0_1_LIVE_RESULT_START -->
The 12-case live DeepSeek A/B is pending server-runtime finalization. Production
remains disabled until the committed enablement rule is evaluated.
<!-- RAG_V0_1_LIVE_RESULT_END -->

## Tech Stack

- Next.js App Router, React, TypeScript, Tailwind CSS
- PostgreSQL / Supabase-compatible migration and transactional repository
- Zod and JSON Schema for strict runtime contracts
- provider-neutral LLM adapters for Extraction and validation
- Node test runner and PGlite for isolated migration/repository verification
- Vercel-compatible Next.js frontend and API deployment target

## Demo

The deterministic demo Story UUID is `2c600001-0000-4000-8000-000000000001`.

1. Apply `supabase/migrations/20260914000100_canonical_state_foundation.sql` to the target PostgreSQL database.
2. Configure the server-only variables below.
3. Run `npm install`, `npm run demo:seed`, then `npm run dev`.
4. Open `/stories/fog-harbor/workspace`.
5. Add explicit story content, run Extract, review the state diff, accept one safe candidate, reject another, and Commit.
6. Confirm State advances by one version and History records only the accepted mutation.

Required server-only production variables:

```text
STORYSTATE_DATABASE_URL
STORYSTATE_EXTRACTOR_MODEL
STORYSTATE_EXTRACTOR_ENDPOINT
STORYSTATE_EXTRACTOR_API_KEY
STORYSTATE_VALIDATOR_MODEL
STORYSTATE_VALIDATOR_ENDPOINT
STORYSTATE_VALIDATOR_API_KEY
```

Provider secrets must never use `NEXT_PUBLIC_*`. Historical evaluation variable `DEEPSEEK_API_KEY` is not the production provider contract. The current release is technically complete but has no published demo URL because deployment credentials are not available in this release environment.

## Local Verification

Node.js 22 or later:

```bash
npm install
npm run build
npm run lint
npm test
```

Critical suites can also be run independently with `test:backend`, `test:validator-v0-2`, `test:extraction-contract`, `test:extraction-eval`, `test:extraction-runtime`, and `test:extraction-api`.

## Roadmap / Not Implemented

The following remain future architecture and are not completed MVP features:

- broader RAG evaluation and production rollout (Evidence RAG V0.1 is implemented behind a disabled flag)
- the broader Context Compiler for Writer-facing context assembly
- MCP Connector
- broader Writer product integrations
- authentication and multi-tenant operations
- hosted deployment and production observability

The MVP product behavior is frozen. These roadmap items require separate design and review.
