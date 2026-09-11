# Stage 1.1 verification

Verified locally on 2026-09-11, Node.js 24.18.0, npm 11.16.0, resolved Next.js 16.3.4.

| Check         | Result                                                                   |
| ------------- | ------------------------------------------------------------------------ |
| npm install   | PASS; package-lock committed; audit reported 0 vulnerabilities           |
| npm run build | PASS; production compilation, TypeScript, prerender and route generation |
| npm run lint  | PASS; no errors or warnings                                              |
| npm test      | PASS; 6 tests                                                            |
| npm run dev   | PASS; local server on port 3000                                          |

## Routes

Browser navigation and development-server logs confirmed HTTP 200 and rendered content for `/`, `/stories/fog-harbor/setup`, `/stories/fog-harbor/state`, `/stories/fog-harbor/workspace`, `/stories/fog-harbor/review`, `/stories/fog-harbor/history`.

## Browser acceptance

- Inspected story library at 1440 × 1000; state explorer and delta review at 1280 × 900. No page-level horizontal overflow at those widths. Responsive viewport override reset after testing.
- State inspector shows character fields and evidence; Knowledge tab distinguishes narrator knowledge from 林夏's `unaware` state.
- All six Context Inspector sections open, including selection reasons and constraints.
- Conflict Accept is initially disabled; editing the value and adding a rationale marks it revised. Accepted three other changes and rejected the knowledge change.
- Mock commit updates chapter to 13, USB owner to 林夏, location to Hospital, and creates a third version; rejected knowledge remains unchanged.
- Selected the prior version, opened Rollback confirmation, confirmed simulated restore; feedback appeared and history was retained.
- Created a separate test story, observed initialization disabled before imports, loaded three fixtures and initialized it; refreshed to verify persistence.
- Browser error log inspection returned no errors.
- QA edits were made at `127.0.0.1:3000`. Deliverable preview uses `localhost:3000`, independently verified with the untouched 12-chapter fixture and four pending deltas.

## Regression tests

1. Accept decisions do not mutate state before commit; unresolved conflicts block commit.
2. Commit applies only accepted changes, preserves previous snapshots and cannot double-commit.
3. Pending or stale-before changes block commit.
4. New stories are isolated and require all example imports before initialization.
5. Rollback creates a new snapshot, preserves history and clears pending deltas.
6. Every proposed delta's evidence is quoted verbatim from the shared Writer output.

## Boundaries

No backend, file parsing, AI calls, real context compilation, remote state commit or rollback was tested or implemented. Cross-device and concurrent editing are not provided. Mobile received CSS fallbacks only, not a full acceptance pass. Source story tests live in browser-local mock storage, not the repository.

Initial build/test attempts required sandbox permission for local process/port/IPC operations; reruns with approved permissions passed. Next.js appends its framework instructions to AGENTS.md during development; that generated block is retained so starting development does not dirty the working tree.
