# Stage 2.3A Hidden Holdout Blueprint V0.1

This document freezes distribution, difficulty, and authoring rules only. It contains **zero passages, zero Gold effects, and zero pre-generated answers**.

## Distribution

The future Holdout contains exactly 20 cases:

| Group | Cases |
|---|---:|
| Temporal / Location | 4 |
| Item state | 3 |
| Knowledge / belief | 4 |
| Reported proposition | 2 |
| Plot | 2 |
| WorldTruth | 1 |
| Relationship | 2 |
| Pure negative | 2 |

It must include at least six minimal-pair relationships, eight trap opportunities, five high-impact Gold effects, five low-impact Gold effects, five zero-effect or partial-negative passages, four multi-fact passages where only some facts change state, and three cases that require Current Canonical State.

The Holdout must use new characters, items, locations, a new plot question, and new phrasing. It may test the same capabilities, but it must not merely rename the 北岬站 Development universe.

## Authoring and anti-contamination protocol

1. Product Owner freezes the Extraction Contract, Compiler specification, Holdout blueprint, and metric rules.
2. Development implementation and prompt work use only the Development Set.
3. The Extractor prompt and code freeze before Holdout authoring.
4. A separate authoring agent creates the Holdout after that freeze.
5. The author does not receive model outputs, Development failure analysis, known prompt weaknesses, or official evaluation results.
6. Product Owner reviews logical correctness before any model run.
7. The approved Holdout receives a deterministic dataset hash.
8. Official evaluation begins only after that hash freezes.
9. Prompt tuning after a consumed Holdout requires a new future Holdout.

The Stage 2.3A blueprint hash is `35baeb1ddd87bf122b9f9f649ff8dab5364e29a272722bba74154b5ed35f00f6`.
