# Resume Metrics Master

| Metric | Definition | Numerator | Denominator | Result | Baseline | StoryState Result | Absolute Δ | Relative Δ | 95% CI | Evidence File | Resume Eligible | Limitation |
| --- | --- | ---: | ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Direct Final State Accuracy | Correct final fields / Gold final fields | — | — | NOT_EXECUTED | — | — | — | — | — | STATE_SYNC_RAW_RESULTS.jsonl | NO | Provider credential unavailable |
| RAG Direct Final State Accuracy | Correct final fields / Gold final fields | — | — | NOT_EXECUTED | Direct | — | — | — | — | STATE_SYNC_RAW_RESULTS.jsonl | NO | Product RAG is not implemented; evaluation arm not run |
| StoryState Final State Accuracy | Correct final fields / Gold final fields | — | — | NOT_EXECUTED | Direct/RAG | — | — | — | — | STATE_SYNC_RAW_RESULTS.jsonl | NO | Real Extractor/Validator arm not run |
| Direct Drift Rate | Incorrect no-evidence changes / no-change opportunities | — | — | NOT_EXECUTED | — | — | — | — | — | STATE_SYNC_RAW_RESULTS.jsonl | NO | Provider credential unavailable |
| StoryState Drift Rate | Incorrect no-evidence changes / no-change opportunities | — | — | NOT_EXECUTED | Direct | — | — | — | — | STATE_SYNC_RAW_RESULTS.jsonl | NO | Deterministic oracle 0/200 is not a model result |
| Deterministic oracle transition conformance | Correct applied Gold changes / frozen changes | 60 | 60 | 100% | — | 100% | — | — | not applicable | STATE_SYNC_METRICS.json | NO | Scorer/replay validation, not model performance |
| Existing unsafe interception recall | Unsafe routed to human / Gold unsafe | 15 | 15 | 100% | all-manual | 100% | — | — | directional | ../stage-2.2.1b/metrics.json | YES | Existing 20-case synthetic Holdout |
| Existing review-load reduction | Reviews avoided / all cases | 4 | 20 | 20% | 0% automation | 20% | +20 pp | — | directional | ../stage-2.2.1b/metrics.json | YES | Existing 20-case synthetic Holdout |
| Existing invalid mutation escape | Escaped invalid candidates / challenges | 0 | 46 | 0% | — | 0% | — | — | not applicable | ../RESUME_METRICS_AUDIT.md | YES | Deterministic challenge set |
| Raw Outline Completeness | Explicit Gold fields in raw outline / Gold fields | 90 | 144 | 62.5% | raw outline | — | — | — | directional | BLUEPRINT_METRICS.json | YES as baseline only | Human mapping of synthetic Holdout |
| AI Blueprint Completeness | Matched Gold fields / Gold fields | — | — | NOT_EXECUTED | 62.5% | — | — | — | — | BLUEPRINT_RAW_RESULTS.jsonl | NO | Provider credential unavailable |
| Human Revision Reduction | (raw edits - AI edits) / raw edits | — | — | NOT_EXECUTED | 54 raw ADD operations | — | — | — | — | BLUEPRINT_RAW_RESULTS.jsonl | NO | AI arm not run |
