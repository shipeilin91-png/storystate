# Stage 2.1.2 Contract Hardening

Status: implemented on local branch `hardening/stage-2-1-2-contract`, awaiting Product Owner Review and independent Codex engineering review.

Base main: `753ca6a0cc0f7625898ae8839f8bc461788d502e`.
Stage 2.1 remains completed on main. Stage 1.3 frontend product flow remains frozen.

## Scope and motivation

Only three topics are included:

1. Validator Result Admission Gate: the previous service blocked only `status=conflict`, allowing an explicitly rejected/failed result to be accepted and committed.
2. Custodian Canonical Reference Validation: owner and holder had an active same-story reference check, but custodian did not. Memory could admit data that PostgreSQL rejected via a foreign key.
3. Exact executable mapping of Frozen Benchmark Ch13-17, separate from the existing selected backend scenarios.

The three frozen inputs (`STATE_DATA_CONTRACT_V0.2.1.md`, `BENCHMARK_PILOT_V0.2.2.md`, `VALIDATOR_RULEBOOK_V0.1.1.md`) are unchanged. No frontend, API integration, migration, ontology or repository persistence changes are included.

## Validator admission

`assertValidatorAcceptable` in `lib/domain/governance.ts` is shared by `StateService.decideDelta` and its commit path.

| Validator result | Human accepted decision | Commit |
| --- | --- | --- |
| null | Existing Stage 2.1 behavior preserved | Allowed subject to existing structural checks |
| passed + AUTO_ACCEPT_ELIGIBLE | Allowed | Requires explicit accepted decision |
| passed / needs_review + NEEDS_REVIEW | Allowed | Requires explicit accepted decision |
| status failed OR recommendation REJECT | Rejected with VALIDATOR_REJECTED (409) | Rejected again, including legacy forged accepted data |
| status conflict OR recommendation CONFLICT | Rejected with UNRESOLVED_CONFLICT (409) | Rejected again; corrected/superseding delta required |

The existing result schema remains unchanged. No restrictive status/recommendation matrix is introduced. Recommendations do not create decisions. Rejected, deferred and needs_review audit records remain possible. A result changed after acceptance is checked again at commit.

The automated regression matrix runs against both Memory and the production PostgreSQL repository via PGlite. It includes independent status-only failures, forged accepted rows, a valid mutation batched with an inadmissible one, and complete aggregate equality after rollback.

## Custodian references

`validateCanonical` checks owner, holder and non-null custodian using the same active Character lookup in the story aggregate, before the repository saves any canonical mutation.

- Null custodian means the slot is unused and remains null.
- An unresolved object means the slot is in use but its current value is unknown.
- Each non-null value and lastConfirmedValue must resolve to an active Character in the same story.
- Owner, holder and custodian may be three different Characters; no slot is synchronized to another.

Tests cover null, independent A/B/C roles, unresolved with/without history, nonexistent/inactive/cross-story value and lastConfirmedValue, field updates and clearing the slot. Both adapters return the domain `FOREIGN_REFERENCE` error, not a persistence FK error, and leave state/version/audit unchanged on failure.

## Exact Benchmark architecture

`tests/backend-foundation.test.ts` remains unchanged: its 14 tests are selected backend contract scenarios, not a verbatim replay of every Frozen Benchmark fact.

`tests/fixtures/benchmark-pilot.ts` and `tests/benchmark-pilot-exact.test.ts` form an independent, manually authored executable ground-truth mapping. The fixture ingests only each frozen document's **Chapter Text** section, not its expected results or author-only annotations. Every evidence quote must be an exact UTF-16 span in that source. Named E/D/K/N references link assertions back to the frozen document.

A governed Chapter 12 baseline commits as state version 1. Five continuous chapter commits produce versions 2-6. Each chapter checks independent expected pre/post state, explicit human decisions, Event/Effect/Delta links, source evidence, immutable snapshots and chapter/revision/version separation. Every Event append is checked for canonical state/version inertness.

Proposition identities and unaware knowledge slots are addressing scaffolding. They do not assert the propositions' truth. Identity P is confirmed_true at baseline; father proposition F stays unresolved through Ch16. Gu's not-adopted F uses the legal stance unaware with a null believedValue, never a new unknown stance.

**Exact Benchmark Contract Test != AI Extraction Evaluation.**

The suite tests whether the backend can represent, govern and preserve the mapped ground truth. Admission verdicts in the benchmark fixture are supplied explicitly by a human test author. Semantic negative cases supply a frozen REJECT judgment and prove it cannot be overridden by an attempted acceptance. Separate tests exercise intrinsic structural guards for author-only evidence, psychological hardening, inference-only resolution and illegal corrected stance. This does not claim the service can automatically derive a verdict from prose.

## Requirement mapping

| Frozen requirements | Executable mapping and assertions |
| --- | --- |
| D13-01/02 | Home/Dock -> Hospital for Lin/Chen, Gu remains Hospital |
| D13-03/04, N13-06 | USB holder Chen -> Lin; owner Chen and encrypted unchanged; USB Mystery open -> progressing |
| K13-01/02/03/04/05 | Handoff/ship knowledge, independent Q suspects, Lin/Gu remain unaware of full P |
| D14-01/02/03/04/05 | Chen unresolved with last confirmed Hospital; encrypted -> index_unlocked; father thread open -> progressing; holder unchanged |
| K14-01 through 07 | K14-code, K14-report, K14-directory assertions for Lin/Gu; reported He claim does not confirm underlying entrusted proposition; contents/P not revealed |
| D15-01 through 07 | Lin/Gu C-19, fragment CREATE with unresolved owner and Lin holder; USB/thread remain at index_unlocked/progressing |
| K15-01/02/03/04/05/06/08/09 | Markings, Gu's reported marker claim, key length, SMS number vs verified sender, Lin believes F=true, Gu does not adopt F |
| Ch15 F and hidden truth | F is father-at-C19/fragment placement, NOT undercover P; WorldTruth F unresolved; author-only false truth rejected |
| D16-01 through 05 | All three Maintenance Tunnel, Chen unresolved -> resolved; both items' slots and USB condition preserved |
| K16-01/02/03/04/06 | Gu knows exact P with direct_disclosure + credential_inspection; Lin remains unaware P/suspects Q; credential, sender acknowledgment and future disclosure plan separate |
| D17-01 through 06 | Old Pump House; index_unlocked -> decrypted; USB core question "谁在篡改港口货运记录？" resolved as "周启明本人实施货运记录篡改" |
| COV-24 / N17-08 | Resolution cites non-remote exclusive terminal, live face, dynamic fingerprint, camera audit and unique authorization key; credential ownership alone fails |
| D17-07/08 | Directed bounded cooperation active, scope current escape; long_term_trust stays distrust |
| D17-09, K17-10 | F unresolved -> confirmed_false; Lin believes(true) -> knows(false); previous stance/value and recording/audit/recantation evidence retained |
| D17-10/11, K17-06/07/08/09 | Father thread remains progressing; North Embankment is a historical reported lead, not current location/alive |
| D17-12/13, remaining mapped K17 | Item ownership/holding unchanged; all three know tampering/equipment/historical recording/independent placement; Lin and Gu know task target |

No dedicated PlotThread.lead column exists in the frozen backend schema. D14's C-19 lead and D17-11's North Embankment lead are represented through evidence-backed event payload and proposition-centric knowledge, while the thread identity, original core question and progressing status are retained. This stage does not add an ontology field.

The frozen K16-04 row calls the previous SMS belief "suspected", while K15-06 explicitly gives unaware. The continuous fixture preserves the explicit Ch15 non-adoption and establishes sender knowledge only at the Ch16 acknowledgment. It does not invent an intermediate canonical suspicion delta.

The backend has no Character.current_status alive/dead field. Historical/current alive separation is exercised with separate propositions and knowledge slots; this stage does not add that field. The suite is an exact mapping of the listed requirements and boundary negatives, not a claim to cover every possible negative or every soft interpretation row.

## Negative assertions

- Ch13 N13-01/02/03/04/05/06: identity propagation, trust hardening, premature decrypt, unsupported departure and ownership transfer.
- Ch14 N14-01/02/03/05/06: partial unlock, device provider vs holder, clue vs resolution, guessed location and identity; reported claim vs WorldTruth.
- Ch15 N15-01/03/04/05/06 and K15-09: suspected key vs decrypt, belief vs WorldTruth (both true and false forbidden), trust, number vs location, fragment ownership, Gu's unadopted belief; future intent and author-only truth.
- Ch16 N16-01/02/03/05/06: spatially isolated Lin cannot acquire P, trust unchanged, destination not reached, no decrypt/handoff.
- Ch17 N17-01/02/03/04/06/07/08: unresolved father thread, historical lead/alive vs current, bounded cooperation vs trust, departure plan vs arrival, ownership and insufficient credential-only attribution.

## Verification

Executed locally:

| Command / check | Result |
| --- | --- |
| npm install | PASS; up to date, 0 reported vulnerabilities; install-script approval warnings for esbuild/fsevents/unrs-resolver, no approvals changed |
| npm run build | PASS (Next.js 16.3.4, webpack, TypeScript) |
| npm run lint | PASS |
| npm test | 98/98 PASS |
| npm run test:backend | 62/62 PASS: 14 existing selected + 48 hardening |
| npm run test:benchmark | 11/11 PASS: continuous parent + 5 chapter subtests + 5 negative groups |
| Stage 1.3 automated regression | 25/25 PASS, original frontend tests unchanged |
| PGlite migration | Actually executed from an empty DB: existing migration/adapter test plus two hardening PostgreSQL groups |

Counts use Node's reported test count, including parent tests and subtests. No tests skipped. Hosted Supabase was not configured or tested.

Browser smoke check used the existing development server at `http://127.0.0.1:3013` after `npm run dev -- --port 3100` detected that same-repo server and exited. Library, Workspace, Review, State, History and Setup rendered; Review had 7 details elements and 0 open by default. No application console errors appeared in the final Setup check. This was a read-only route smoke check, not a repeated interactive commit/restore acceptance run. The browser tool exposed a 556px-wide viewport; desktop-width visual verification remains for the reviewer. The pre-existing server was not stopped or reconfigured.

## Remaining boundaries and handoff

Runtime Validator, AI Extraction, RAG, Context Compiler, frontend/backend integration, Auth, Writer Connector, MCP and deployment remain planned. Stage 2.2 has not started. Structural admission trusts the supplied validator result; it is not an evidence-reasoning engine. Full aggregate loading remains a scalability risk recorded but not refactored here. Raw repository/SQL access remains an internal trust boundary.

This delivery is local implementation + tests + local commit only. Per Product Owner instruction, no fetch, pull, push, credential/remote edits or Keychain permission requests were made during this implementation. Remote status: **REMOTE_BLOCKED by Trae sandbox credential access**. Codex owns independent review and remote integration/push. Do not merge main before approval.
