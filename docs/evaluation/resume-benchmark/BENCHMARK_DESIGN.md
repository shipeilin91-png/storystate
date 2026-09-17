# Benchmark Design

## A — Sequential Long-Horizon State Sync

Three independent internal synthetic story sequences contain 20 ordered Source Revisions. Every revision consumes the previous state. The frozen ledger contains 60 expected changes, 200 expected-no-change opportunities, and 20 invalid-mutation challenges. One sequence is Development and two are frozen Holdout.

The three preregistered real-model arms are A1 Direct LLM, A2 evaluation-only lexical RAG + Direct LLM, and A3 StoryState incremental extraction + compiler + validator + Gold-based human decision simulation + commit. Product RAG does not exist at this baseline, so A2/A3 retrieval is explicitly evaluation-only and may not be described as shipped architecture.

## B — Outline to Tracking Blueprint

Twenty-four human-authored synthetic outlines are balanced across sparse, medium, and detailed quality. Six are Development and eighteen Holdout. Each outline has eight Gold fields, criticality, rationale, should-not-track fields, and an ambiguity requiring human calibration.

B0 maps only information explicitly present in the raw outline. B1 requires a real model and was not executed.

## Freeze and leakage controls

Dataset and Gold are separate artifacts. Prompts serialize only dataset inputs, prior state, current revision, and retrieved source text. They do not serialize Gold changes, final state, invalid-candidate labels, or expected field mappings. Any future design correction requires a version bump and full rerun of every affected arm.

## Statistics

All metrics require numerator, denominator, percentage, by-story/category/quality/run breakdown, and paired deltas. Bootstrap intervals are produced only for executed model results. Missing model results remain null rather than inheriting deterministic-oracle values.
