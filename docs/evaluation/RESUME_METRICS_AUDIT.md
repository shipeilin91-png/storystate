# StoryState Resume Metrics Audit

Audit date: 2026-09-17

Audited Git baseline: `afca043b64f0dabf1021147b35b7ae1f5b674aa1` (`origin/main`)

Scope: existing Ch13–17 benchmark, fixtures, tests, and the completed Stage 2.2.1B live semantic run. No provider call, product change, RAG work, or deployment was performed.

## Audit rules and evidence boundary

- A metric is reported only when its numerator and denominator can be reconstructed from existing raw evidence.
- Stage 2.2.1B collaboration metrics use the 20 primary Holdout cases only. The 10 Anchor cases and all stability reruns are excluded from the denominator.
- The raw live artifact contains 198 call records. Its SHA-256 is `7802b112054bf8fef4d9223db5d71913cddfb89892d5cb132693fef1449fda7d`. The raw file remains local and ignored at `results/live-semantic/storystate-stage-2.2.1b-live-semantic/raw-results.jsonl`; provider response IDs and raw responses are not reproduced here.
- Gold safe means `goldFinalRouting = AUTO_ACCEPT_ELIGIBLE`. Every other Gold route is treated as requiring human review. Actual routing was reconstructed per case with the frozen production aggregation rules, rather than copied from the report summary.
- Ch13–17 is a sequential state-service benchmark with hand-authored Gold deltas. It is explicitly labelled “not AI extraction” in the fixture and tests. Its results can support state-engine and governance claims, but not end-to-end Agent extraction accuracy.

## A. Long-horizon state synchronization

### Requested product metrics

| Metric | Formula | Numerator | Denominator | Result | Raw evidence source | Can use on resume | Limitation |
| --- | --- | ---: | ---: | --- | --- | --- | --- |
| Final State Accuracy, Agent → Canonical | Final Canonical fields equal to an independently frozen Gold Final State / all Gold Final State fields | MISSING | MISSING | **MISSING** | Ch13–17 has exact assertions and Gold deltas, but no independent machine-readable Gold Final State produced after a real Extractor run | **NO** | Deriving Gold from the same hand-authored deltas used to create state would be circular. It would also omit extraction errors and missing candidates. |
| End-to-end State Transition Accuracy, Agent → Canonical | Correct Agent-recognized Before → After transitions / all required transitions | MISSING | MISSING | **MISSING** | No sequential real-Extractor result artifact exists for Ch13–17 | **NO** | The existing replay bypasses the Extractor. The deterministic state-layer result below is a valid narrower metric. |
| State Drift Rate, complete | Incorrect changes to fields with no new evidence / all expected-no-change field opportunities | MISSING | MISSING | **MISSING** | Existing tests contain selected NO_CHANGE and negative challenges, but no frozen inventory of every unchanged field at every revision | **NO** | A zero from only explicit negative cases would undercount the true denominator and cannot be called full drift rate. |
| Explicit NO_CHANGE drift proxy | Explicit NO_CHANGE target fields that changed / explicit NO_CHANGE fields | 0 | 3 | **0% (0/3)** | `tests/fixtures/benchmark-pilot.ts`; `tests/benchmark-pilot-exact.test.ts` | **NO** | Only three declared NO_CHANGE deltas; this is a guardrail check, not comprehensive drift measurement. |
| Invalid Mutation Escape Rate | Invalid candidates that entered Canonical State / invalid candidates that reached candidate/commit governance | 0 | 46 | **0% (0/46)** | 44 benchmark negatives in `tests/benchmark-pilot-exact.test.ts`, plus one validator-conflict and one stale-before candidate in `tests/backend-foundation.test.ts` | **YES** | Deterministic challenge suite, not naturally occurring live-Extractor traffic. Count excludes malformed proposals rejected before becoming candidates. |

The 46 invalid candidates cover wrong owner, holder/owner confusion, stale-before, contradicted location, unsupported item condition, belief-to-world-truth promotion, premature plot resolution, relationship overreach, historical/future facts treated as current, validator conflict/rejection, and soft interpretation. Each challenged candidate was prevented from entering a new Canonical State; the state snapshot remained unchanged relative to the start of that invalid attempt.

### Deterministic transition application accuracy

This metric starts after the Gold delta has already been authored. A transition is correct when the committed version snapshot contains the delta's exact `after` value. The Ch15 item CREATE is scored as four field opportunities: owner, holder, custodian, and condition. NO_CHANGE deltas are excluded.

| Metric | Formula | Numerator | Denominator | Result | Raw evidence source | Can use on resume | Limitation |
| --- | --- | ---: | ---: | --- | --- | --- | --- |
| Location transition application | Correct committed location transitions / expected location transitions | 11 | 11 | **100% (11/11)** | `tests/fixtures/benchmark-pilot.ts`; committed Ch13–17 snapshots | **YES, with exact wording** | Hand-authored Gold inputs; does not measure detection by the Extractor. |
| Holder transition application | Correct committed holder transitions / expected holder transitions | 2 | 2 | **100% (2/2)** | Same as above | **YES, with exact wording** | Small category denominator. |
| Owner transition application | Correct committed owner transitions / expected owner transitions | 1 | 1 | **100% (1/1)** | Same as above | **NO as a standalone metric** | One CREATE-field opportunity only. |
| Custodian transition application | Correct committed custodian transitions / expected custodian transitions | 1 | 1 | **100% (1/1)** | Same as above | **NO as a standalone metric** | One CREATE-field opportunity only. |
| Item-condition transition application | Correct committed condition transitions / expected condition transitions | 4 | 4 | **100% (4/4)** | Same as above | **YES only inside aggregate** | Small category denominator. |
| Knowledge transition application | Correct committed knowledge transitions / expected knowledge transitions | 43 | 43 | **100% (43/43)** | Same as above | **YES, with exact wording** | Dominates the aggregate and is still deterministic replay. |
| World-truth transition application | Correct committed world-truth transitions / expected world-truth transitions | 1 | 1 | **100% (1/1)** | Same as above | **NO as a standalone metric** | One opportunity only. |
| Plot-thread transition application | Correct committed plot-thread transitions / expected plot-thread transitions | 3 | 3 | **100% (3/3)** | Same as above | **YES only inside aggregate** | Small category denominator. |
| Relationship transition application | Correct committed relationship transitions / expected relationship transitions | 1 | 1 | **100% (1/1)** | Same as above | **NO as a standalone metric** | One opportunity only. |
| **All deterministic field transitions** | Correct committed field transitions / expected field transitions | **67** | **67** | **100% (67/67)** | Sequential Ch13–17 replay and version snapshots | **YES, with exact wording** | State-engine conformance only. It must not be described as model or extraction accuracy. |

Safe resume wording: **“Built a governed canonical-state pipeline that applied 67/67 hand-authored Gold field transitions across five sequential chapter updates, while blocking 46/46 invalid mutation attempts.”**

### Version integrity

| Metric | Formula | Numerator | Denominator | Result | Raw evidence source | Can use on resume | Limitation |
| --- | --- | ---: | ---: | --- | --- | --- | --- |
| Sequential commit monotonicity | Ch13–17 commits that advanced exactly one state version / sequential chapter commits | 5 | 5 | **100% (5/5)** | `tests/benchmark-pilot-exact.test.ts`; versions advance from seed v1 through v6 | **YES only as supporting evidence** | Five deterministic commits. |
| Sequential history retention | Version snapshots still present after Ch17 / versions created through Ch17 | 6 | 6 | **100% (6/6)** | Ch13–17 repository version list | **YES only as supporting evidence** | Memory repository benchmark, not a long production soak. |
| Backend restore creates a new version | Restore operations that created a new version and preserved prior history / exercised backend restores | 1 | 1 | **100% (1/1)** | `tests/backend-foundation.test.ts` (`[1,2,3]`, restored-from link, governed restore delta) | **NO as a standalone metric** | One backend restore scenario. |
| Frontend version chronology across commit/restore | Consecutive commit/restore operations with monotonic versions / exercised operations | 4 | 4 | **100% (4/4)** | `tests/story-state.test.ts` (`v13 → v14 → v15 → v16`) | **NO as a standalone metric** | Frontend mock contract, not backend persistence. |
| Commit refresh consistency | Adapter scenarios that reloaded both current state and history after commit / exercised adapter commit scenarios | 2 | 2 | **100% (2/2)** | `tests/frontend-backend-adapter.test.ts` | **NO as a standalone metric** | Stubbed/fake provider and fetch boundary; no production-network measurement. |

## B. Human–AI collaboration efficiency

### Recomputed per-case routing

`A` = AUTO_ACCEPT_ELIGIBLE; `R` = NEEDS_REVIEW. Generic and Specialist produced the same final route on all 20 Holdout cases. H02 was the only Gold-safe case unnecessarily routed to review.

| Case | Gold | Generic | Specialist | Product interpretation |
| --- | --- | --- | --- | --- |
| H01 | A | A | A | Safe auto-handled |
| H02 | A | R | R | Safe case sent to unnecessary review |
| H03 | A | A | A | Safe auto-handled |
| H04 | R | R | R | Unsafe intercepted |
| H05 | R | R | R | Unsafe intercepted |
| H06 | A | A | A | Safe auto-handled |
| H07 | R | R | R | Unsafe intercepted |
| H08 | R | R | R | Unsafe intercepted |
| H09 | R | R | R | Unsafe intercepted |
| H10 | R | R | R | Unsafe intercepted |
| H11 | R | R | R | Unsafe intercepted |
| H12 | R | R | R | Unsafe intercepted |
| H13 | R | R | R | Unsafe intercepted |
| H14 | R | R | R | Unsafe intercepted |
| H15 | R | R | R | Unsafe intercepted |
| H16 | A | A | A | Safe auto-handled |
| H17 | R | R | R | Unsafe intercepted |
| H18 | R | R | R | Unsafe intercepted |
| H19 | R | R | R | Unsafe intercepted |
| H20 | R | R | R | Unsafe intercepted |

### Product-routing metrics

| Metric | Formula | Numerator | Denominator | Result | Raw evidence source | Can use on resume | Limitation |
| --- | --- | ---: | ---: | --- | --- | --- | --- |
| Generic Unsafe Interception Recall | Gold-unsafe cases routed to review / all Gold-unsafe cases | 15 | 15 | **100% (15/15)** | Raw Stage 2.2.1B primary Holdout records + frozen Gold in `tests/fixtures/live-semantic-benchmark.ts` | **YES** | One synthetic 20-case Holdout; confidence interval is wide and production prevalence is unknown. |
| Specialist Unsafe Interception Recall | Same formula | 15 | 15 | **100% (15/15)** | Same as above | **YES** | Same limitation. |
| Generic Auto-handled Precision | Gold-safe auto-routed cases / all auto-routed cases | 4 | 4 | **100% (4/4)** | Same as above | **YES** | Only four auto-handled cases. |
| Specialist Auto-handled Precision | Same formula | 4 | 4 | **100% (4/4)** | Same as above | **YES** | Only four auto-handled cases. |
| Generic Automation Coverage | Cases not requiring review / all Holdout cases | 4 | 20 | **20% (4/20)** | Same as above | **YES** | Benchmark class mix is curated, not production traffic. |
| Specialist Automation Coverage | Same formula | 4 | 20 | **20% (4/20)** | Same as above | **YES** | Same limitation. |
| Generic Human Review Load Reduction | Reviews avoided versus all-manual baseline / all Holdout cases | 4 | 20 | **20% (4/20)** | Same as above | **YES** | Equal to automation coverage under this binary routing policy; does not measure review time saved. |
| Specialist Human Review Load Reduction | Same formula | 4 | 20 | **20% (4/20)** | Same as above | **YES** | Same limitation. |
| Generic Review Precision | Gold-unsafe cases in review queue / all reviewed cases | 15 | 16 | **93.75% (15/16)** | Same as above | **YES** | One false-positive review; curated sample. |
| Specialist Review Precision | Same formula | 15 | 16 | **93.75% (15/16)** | Same as above | **YES** | Same limitation. |
| Generic Unnecessary Review Rate | Gold-safe cases routed to review / all Gold-safe cases | 1 | 5 | **20% (1/5)** | Same as above | **YES as supporting metric** | Five safe cases only. |
| Specialist Unnecessary Review Rate | Same formula | 1 | 5 | **20% (1/5)** | Same as above | **YES as supporting metric** | Same limitation. |
| Generic False AUTO Rate | Gold-unsafe cases auto-routed / all Gold-unsafe cases | 0 | 15 | **0% (0/15)** | Same as above | **YES** | No observed escape is not proof of zero population risk. |
| Specialist False AUTO Rate | Same formula | 0 | 15 | **0% (0/15)** | Same as above | **YES** | Same limitation. |

The answer to the product question is: on this frozen synthetic Holdout, both architectures removed **20% of manual reviews (4/20)**, and all **15/15** cases that Gold marked unsafe still reached a human. The resulting review queue was **93.75% relevant (15/16)**. This is stronger evidence than the 60% semantic-verdict accuracy because the combined model, deterministic policy, and human-review route preserved the safety boundary despite model-level classification errors.

### Generic versus Specialist efficiency

| Metric | Formula | Numerator | Denominator | Result | Raw evidence source | Can use on resume | Limitation |
| --- | --- | ---: | ---: | --- | --- | --- | --- |
| Primary Holdout model-call reduction | Specialist calls minus Generic calls / Specialist calls | 23 fewer | 43 Specialist calls | **53.5% fewer calls** (20 vs 43) | Recomputed primary raw Holdout records | **YES** | Call count is architecture-specific; no monetary cost is claimed because explicit pricing was absent. |
| Mean latency reduction | Specialist mean minus Generic mean / Specialist mean | 1,395.12 ms | 2,760.91 ms | **50.5% lower mean latency** (1,365.79 vs 2,760.91 ms) | `docs/evaluation/stage-2.2.1b/metrics.json`, derived from raw call timings | **YES** | Single provider/session and 20-case sample; not a service-level latency guarantee. |
| Routing outcome parity | Holdout cases with identical Generic/Specialist final routing / all Holdout cases | 20 | 20 | **100% parity (20/20)** | Per-case raw reconstruction above | **YES as context** | Same routes do not mean identical semantic explanations; both had 12/20 semantic-verdict correctness. |

Generic delivered the same safety and review-load outcomes as Specialist while using 23 fewer primary calls and roughly half the mean latency. This supports the product decision to prefer the simpler Generic Validator without making 60% model accuracy the headline.

## Recommended Resume Metrics

Use four to six of the following, keeping the sample and synthetic-benchmark qualifier nearby:

1. **100% unsafe-interception recall (15/15)** on the frozen 20-case live Holdout: every Gold-unsafe candidate was routed to human review.
2. **20% manual-review load reduction (4/20)** versus an all-manual baseline, with **0 false AUTO escapes among 15 unsafe cases**.
3. **100% auto-handled precision (4/4)** and a **93.75% relevant review queue (15/16)**, showing that automation reduced low-value review without relaxing the safety boundary.
4. **53.5% fewer model calls and 50.5% lower mean latency** for Generic versus Specialist, with identical final routing on **20/20** Holdout cases.
5. **0% invalid mutation escape rate (0/46)** across the audited governance challenge set, including owner/holder confusion, stale-before, belief/world-truth leakage, temporal errors, unsupported resolution, and validator conflict/rejection.
6. **67/67 deterministic Gold field transitions applied correctly** across five sequential chapter updates, covering location, item custody, condition, knowledge, world truth, plot threads, and relationships. State explicitly that this measures the governed state engine, not AI extraction accuracy.

Do not headline `198 calls`, total test count, or unit/contract pass count. They describe execution volume and engineering coverage rather than user or product value.

## EXISTING_METRICS

- Stage 2.2.1B collaboration metrics are fully reconstructable per Holdout case for both Generic and Specialist: unsafe interception, auto precision, automation coverage, review-load reduction, review precision, unnecessary review, and false AUTO.
- Generic versus Specialist routing parity, call reduction, and latency reduction are supported.
- Ch13–17 supports deterministic field-transition application accuracy: 67/67 across all requested state categories.
- The audited governance challenge set supports a 0/46 invalid-mutation escape result.
- Commit, restore, history, and refresh behaviors have small but explicit deterministic denominators.

## MISSING_METRICS

- **End-to-end Final State Accuracy after Agent extraction:** no independent machine-readable Gold Final State is paired with a sequential real-Extractor run.
- **End-to-end State Transition Accuracy by field category:** current Ch13–17 transitions are hand-authored and bypass extraction.
- **Complete State Drift Rate:** there is no frozen list of every expected-no-change field opportunity for every revision.
- **Production human-review time saved:** case reduction exists, but review duration or reviewer-effort telemetry does not.
- **Production prevalence and confidence bounds:** the Holdout is synthetic and contains only 20 cases.

## PROPOSED_MINIMAL_BENCHMARK

### Long-Horizon State Tracking Benchmark V0.1

Reuse the existing Ch13–17 story as five ordered Source Revisions. Do not add UI, RAG, deployment, a new ontology, or a new state engine.

Freeze exactly **40 field opportunities**:

| Field category | Expected change | Expected no change | Total |
| --- | ---: | ---: | ---: |
| location | 3 | 4 | 7 |
| holder | 2 | 2 | 4 |
| owner | 1 | 3 | 4 |
| custodian | 1 | 2 | 3 |
| item condition | 2 | 2 | 4 |
| knowledge | 3 | 3 | 6 |
| world truth | 2 | 2 | 4 |
| plot thread | 2 | 2 | 4 |
| relationship | 2 | 2 | 4 |
| **Total** | **18** | **22** | **40** |

For each revision, freeze the input snapshot, the exact expected Before → After transitions, the expected-no-change slots, and an independently authored Gold snapshot. Freeze a final Gold Canonical State containing every tracked field. Score:

1. extractor candidate recall and precision before review;
2. State Transition Accuracy after review/commit, by category and overall;
3. State Drift Rate over all 22 no-change opportunities;
4. Final State Accuracy against the independent Gold Final State;
5. Invalid Mutation Escape Rate for deliberately injected wrong-owner, holder/owner, stale-before, belief/world-truth, unsupported, conflict, and validator-reject candidates;
6. version monotonicity, snapshot retention, restore-as-new-version, and post-refresh equality.

Run the deterministic replay first. It needs **0 provider calls and zero provider cost** and validates the scorer, compiler, state service, and version ledger. Only after that passes should an optional live Extractor run be authorized.

For a live Generic pipeline, the expected call formula is:

`5 extractor calls + number of compiled candidate deltas validated`

With 18 Gold changes and one candidate per change, the planning estimate is **23 calls**. The current extraction contract permits up to 64 effects per revision, so the theoretical unbounded-by-runner maximum is **325 calls (5 + 5 × 64)**; a future run authorization should set a stricter call ceiling before execution. Input/output tokens and monetary cost are **MISSING** because no serialized extraction packets or explicit provider pricing are part of the current evidence. Perform offline packet serialization/token estimation and record reviewed pricing before requesting any live run. No live experiment is authorized or started by this audit.

## Audit verification

- Frozen benchmark test: **11/11 passed**.
- Version/backend/adapter-focused tests: **32/32 passed**.
- These counts validate the recomputation environment; they are not promoted as primary resume metrics.
