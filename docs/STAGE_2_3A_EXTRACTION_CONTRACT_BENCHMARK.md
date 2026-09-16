# Stage 2.3A — AI Extraction Contract + Development Benchmark Harness V0.1

Stage 2.3A defines how AI extraction may describe story semantics before an extraction runtime exists. Candidate Deltas are currently constructed manually or by deterministic fixtures. This stage freezes the semantic proposal boundary, Compiler specification, development benchmark, deterministic scoring, metrics, and Holdout authoring method before implementation of an Extractor.

## Architecture boundary

```text
Story Content
  → Extractor
  → Semantic Proposal
  → Deterministic Compiler
  → Candidate Delta
  → Runtime Validator
  → Human Decision
  → Commit
```

Extraction, compilation, validation, and mutation are separate responsibilities. The AI may propose exact evidence quotes, bounded event groups, semantic effects, and unresolved mentions. It cannot supply before-state, StateDelta control fields, database IDs, risk, recommendation, Decision, validator output, or commit metadata. It cannot mutate Canonical State.

The future Compiler will resolve exact evidence spans, resolve known aliases, derive before-state from current Canonical State, apply governance rules, and build Candidate Deltas. Knowledge and WorldTruth assertion rows may be created only over known Canonical Characters or Propositions. V0.1 does not permit AI-created Characters, Items, Propositions, PlotThreads, or Relationships.

Stage 2.3A contains no `ExtractionService`, model prompt, provider adapter, persistence, API endpoint, database migration, or production Compiler. It makes no provider calls.

## Extraction Proposal V0.1

The strict Zod contract contains four top-level arrays: `evidence`, `events`, `effects`, and `unresolvedMentions`. It supports exactly nine semantic effect kinds:

1. `character_location`
2. `item_holder`
3. `item_owner`
4. `item_custodian`
5. `item_condition`
6. `knowledge_state`
7. `world_truth_status`
8. `plot_thread_status`
9. `relationship_value`

Holder, owner, and custodian remain independent. A custodian `after: null` clears the current custodian assertion; an epistemic unresolved value preserves an assertion whose current value is unknown, so the two forms are not interchangeable. Confidence is telemetry only. AI support kinds exclude `human_confirmation` and `restore`. Unresolved mentions record ambiguity and never create canonical entities.

Each Effect may cite only Evidence owned by its referenced EventGroup. Event and Effect evidence-key lists are unique, as are Event participant references. This preserves the local provenance chain Evidence → Event → Effect before deterministic compilation.

Cross-field rules that Zod enforces through refinements are also recorded in the frozen `extractionContractSemanticInvariants` metadata and included in the contract fingerprint. The hash therefore covers provenance ownership, reference integrity, uniqueness, epistemic consistency, plot consistency, and custodian-null semantics rather than relying on JSON Schema fields alone.

## Compiler specification

The declarative specification freezes effect-to-slot and future Delta mappings, known-entity CREATE policy, risk rules, basis rules, issue codes, transition safety, normalization, same-slot handling, and run atomicity. It is executable as constants and pure specification helpers; it does not persist anything.

An exact duplicate for one canonical slot produces `WARNING:DUPLICATE_EFFECT`. Different effects for the same slot produce `EFFECT_REJECTED:CONFLICTING_EFFECTS_SAME_SLOT`. The future runtime sequence is model call → compile entirely in memory → freshness recheck → one atomic transaction. State, story, or source revision drift yields `EXTRACTION_STALE`; partial Evidence/Event/Delta persistence is forbidden. Event groups with no compiled state effects are not persisted in V0.1.

## Development benchmark

The visible Development Set uses the deterministic 北岬站 universe. It contains exactly 14 cases and 14 Gold Effects. D02 and D14 are zero-effect cases. D05 and D09 each contain two Gold Effects. Six registered minimal-pair relationships cover arrival/direction, current/historical location, holder/owner, reported/underlying proposition, plot progress/resolution, and bounded/broader operational cooperation.

Gold and Forbidden effects are semantic contracts rather than DeltaInput objects. Matching uses exact aliases and one-to-one deterministic semantic keys. Duplicate predictions are extra false positives. Text normalization is `extraction-text-normalization/v0.1`: Unicode NFKC, trim, whitespace collapse, and terminal punctuation removal. It performs no paraphrase matching, fuzzy entity mapping, embeddings, or LLM judging.

Evidence Resolution and Evidence Semantic Support are separate. Resolution maps `quote + occurrence` to an exact source span. Support verifies that evidence attached to a matched proposal equals a Gold-allowed exact span. Gold effects may require `any` registered span or `all` registered spans; knowledge and relationship cases use `all` where access, direction, and claim content are jointly necessary. A resolvable quote alone does not prove semantic support.

## Metrics and preregistered decisions

Proposal precision/recall/F1 and compiled precision/recall/F1 are reported independently. Compiler filtering may improve compiled precision, but that value must never be presented as model precision. Proposal and compiled layers each report negative-case false positives and boundary violations. The harness also measures evidence resolution, evidence support, high-impact false proposals and compiled effects, Compiler rejections, correctly and incorrectly rejected effects, and explicit harness-supplied persistence counters.

No Stage 2.3A result claims extraction performance. A future official evaluation may pass to a runtime pilot only with compiled precision ≥ 0.85, compiled recall ≥ 0.70, zero high-impact false compiled effects, zero invalid persisted Deltas, 100% exact persisted evidence spans, and zero direct AI Canonical mutations. Conservative review requires precision ≥ 0.85 and `0.55 ≤ recall < 0.70`, with zero high-impact false compiled effects. Manual architecture review covers `0.80 ≤ precision < 0.85`. Failure includes precision `< 0.80` or any registered safety failure. These explicit comparisons avoid inclusive-range overlap and are frozen in `lib/eval/extraction/metrics.ts`.

## Freeze hashes

| Contract | SHA-256 |
|---|---|
| extractionContractHash | `37b9e48646905c7b714867a7709096eca3e441c7247978f6ad7f9ed15bca0392` |
| compilerSpecHash | `e4b182663f3d8a87075bb0bdb96cb28d864d0089fda6a00488bb305a269f7202` |
| developmentDatasetHash | `2da4010147d5ad8b9ba53edbf7a1e0e24ec0b40a97155585542229fbbf375d11` |
| holdoutBlueprintHash | `35baeb1ddd87bf122b9f9f649ff8dab5364e29a272722bba74154b5ed35f00f6` |

No extractor configuration hash exists because no Extractor prompt or runtime exists. No Holdout dataset hash exists because no actual Holdout cases exist.

The Development Set is visible implementation material and is not a Holdout. A future Holdout uses a new universe and is authored only after the Extractor freezes. No live model evaluation has occurred, and no extraction accuracy claim is authorized.
