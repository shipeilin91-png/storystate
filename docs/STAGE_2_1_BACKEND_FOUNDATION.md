# Stage 2.1 — Canonical State Backend Foundation

Status: in progress on `backend/stage-2-1`; Stage 1.3 frontend flow remains frozen. The backend contract is independent of the browser fixture (`Frontend Mock Contract ≠ Backend State Schema`). This stage provides no AI extraction, runtime AI validator, context compiler, Writer connector, authentication, or deployment.

## Reference baseline

The verbatim frozen inputs are `STATE_DATA_CONTRACT_V0.2.1.md`, `BENCHMARK_PILOT_V0.2.2.md`, and `VALIDATOR_RULEBOOK_V0.1.1.md` in this directory. They were copied without edits from the supplied local sources. The benchmark assertions in `tests/backend-foundation.test.ts` cover Ch13–17 and governance; they are selected contract scenarios rather than an extraction implementation.

## Architecture and domain

Next.js route handlers in `app/api/stories/` dispatch to `StateService`; they contain no SQL. The service owns validation, decisions, stale-before checks, canonical mutation, snapshots, restore and version lifecycle. `StateRepository` is the transaction port; `PostgresStateRepository` uses the `pg` driver and a story row lock in one SQL transaction. `MemoryStateRepository` is test-only and is never an API fallback. `STORYSTATE_DATABASE_URL` selects the PostgreSQL adapter at runtime. With no credentials, API returns 503 while build, tests, lint and the browser Mock remain independent of the database. A Supabase PostgreSQL connection string is the persistence target; no SQLite schema or separate backend server is used.

The formal typed model has Story, SourceDocument, SourceRevision, Evidence, Character, Item, PlotThread, Proposition (including Reported Proposition), WorldTruthState, CharacterKnowledgeState, directed Relationship, Event, StateDelta, StateVersion and DerivedAnnotation. The current state is held in seven normalized typed groups; immutable version snapshots are additional audit/diff/restore artifacts. Chapter, source/story revision and State Version have separate counters. The schema lives in `supabase/migrations/20260914000100_canonical_state_foundation.sql`.

## Tables and integrity

`stories`, `source_documents`, `source_revisions`, `evidence`, `characters`, `items`, `plot_threads`, `propositions`, `world_truth_states`, `character_knowledge_states`, `relationships`, `events`, `event_participants`, `event_evidence`, `state_deltas`, `delta_evidence`, `delta_decisions`, `state_versions`, `derived_annotations`, `annotation_evidence`. All child records carry story ID; composite foreign keys prevent cross-story references. Primary keys, source/version uniqueness, partial unique current assertions, constrained values, typed nullable epistemic fields, timestamps and indexes enforce baseline integrity. JSONB is restricted to structured payload, basis/provenance, risk, before/after, annotation scope and immutable snapshots. Current State is normalized; it is not read from a giant JSONB fixture.

## Event, Delta, Commit

Append Event writes an append-only ledger entry with source revision/order, optional story time, payload, participants and evidence. A database trigger rejects event update/delete. Event append does not mutate Current State or increase State Version. A story-event State Delta requires an owned event, distinct effect identity and matching anchored evidence; corrections/overrides/retcons/migrations also use Delta governance. Decision history is an append-only audit table. Recommendations (`AUTO_ACCEPT_ELIGIBLE`, `NEEDS_REVIEW`, `REJECT`, `CONFLICT`) are distinct from human decisions (`accepted`, `rejected`, `needs_review`, `deferred`). A human may reject/defer an eligible candidate; unresolved conflict cannot be accepted. This is a structural gate, not the complete runtime AI Validator.

Only accepted, uncommitted, real deltas enter a commit. `CREATE` requires an absent target and a complete typed record; `UPDATE` cannot invent a target. Every mutation checks current Before, even after another delta in the same batch. A stale batch fails atomically. `NO_CHANGE` may retain an audit decision but a NO_CHANGE-only batch creates no version; rejected/deferred/needs_review/Soft records never mutate canonical state. Story-scoped `SELECT FOR UPDATE`, one transaction, normalized row updates, immutable version snapshot and committed delta links form a single unit; any failure rolls back all statements. The service's invariant checks are backed by PostgreSQL keys/checks/FKs.

## Knowledge and relationship boundaries

Item `owner` and `holder` are independent epistemic values. A missing location or owner uses null value plus `unresolved` status and optional last-confirmed value; literal `Unknown`/`unresolved` is not a domain value. World Truth status is separate from each character's `unaware / suspects / believes / knows` stance. `believedValue` is Boolean/null, allowing `believes(true) → knows(false)` without a fifth `corrected` stance. Correction evidence stays in basis/provenance. A Reported Proposition “Lin claims P” is a separate proposition R: Gu may know R without believing or knowing P. Long-term trust is a seeded, human-confirmed psychological assertion; event-based soft inference stays in DerivedAnnotation. Explicit bounded cooperation can be a hard directed relationship with scope `current escape`. Plot resolution requires a direct answer to the core question with cited evidence, not strong inference.

## Versions, restore, provenance

Real commit creates the next integer State Version; it does not derive version from Chapter. Restore takes a historical immutable snapshot, compares every typed row, generates owned restore deltas, marks their explicit human decision accepted, runs the same stale-before/commit path and creates a new version with `restored_from_version_id`. History is never deleted or rewound. An identical snapshot produces no version. Current State ← State Version ← accepted Delta ← Event/Effect or correction source ← Evidence/SourceRevision is queryable through story-scoped IDs and link tables. Rejected/deferred decisions and soft annotations remain separately queryable. A source revision invalidates soft annotations from the earlier revision. Reasoning Graph is not a backend architecture; the State Diff UI is one future projection of these records.

## API and verification

`POST /api/stories` creates a story. Story-scoped GET routes: `state`, `events`, `deltas`, `versions`, `annotations`. POST routes: `source-documents`, `source-revisions`, `evidence`, `events`, `deltas`, `deltas/{id}/decision`, `commit`, `versions/{id}/restore`, `annotations`. Bodies are strict Zod-validated; error responses carry structured codes and appropriate HTTP status. No frontend page consumes these routes in Stage 2.1. Authentication and deployment are planned; do not expose these write routes publicly without an access-control stage.

`npm run test:backend` exercises Ch13–17, governance, typed persistence, SQL migration, constraints, transaction behavior, provenance and API dispatch with PGlite running PostgreSQL SQL locally. The migration is also suitable for Supabase PostgreSQL; no Supabase credentials are required. A real hosted Supabase migration run is deferred until an environment is provisioned.

## Stage 2.1.1 contract corrections

- A source revision increments Story Revision without incrementing State Version. Its document chapter may advance `currentChapter` but can never rewind it; only an explicit governed Restore can set `currentChapter` back to the selected historical snapshot chapter.
- `Item.condition` remains a typed, trimmed, non-empty narrative state string (at most 120 characters), rather than a USB-specific enum. The existing benchmark conditions and generic states such as `sealed → opened` are valid; `Unknown` and `unresolved` remain epistemic labels, not conditions.
- `Item.custodian` is an optional epistemic slot independent of owner and holder. Absent custodian is `null`; when supplied it has `value`, `status`, and `lastConfirmedValue`. PostgreSQL stores these in separate nullable typed columns, and version snapshots and repository reads preserve the distinction.
