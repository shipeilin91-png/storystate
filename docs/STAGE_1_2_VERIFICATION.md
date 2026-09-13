# Stage 1.2 integration review and verification

Date: 2026-09-13. Base main: `b5ba77d24409a232a10ac6b0c97f19e520fa1456`; frontend: `ca1566ba60298e7c56a93fe8e1de7bcbac76ef50` on `origin/ui/stage-1-2`. Fetched and confirmed main had not moved before continuing. Frontend merged without conflict on `integration/stage-1-2`.

## Technical findings resolved

1. Current Story switch still linked READY stories to State. It now shares `storyEntryHref` with Library/Open entry points, selecting workspace or setup by readiness.
2. Chapter was used as State Version in Library, Workspace and History. Added explicit fixture counters and restore provenance; Commit and Restore monotonically increase State Version while snapshot chapters can decrease.
3. Setup and Review breadcrumbs were derived from primary nav items and empty. Independent route labels fix them; removed unreachable review-nav code.
4. `StoryScreen` held all pages. Split pages and Context Inspector into `components/story/`, preserving markup/classes and existing styling. `app/globals.css` is unchanged from the frontend branch.
5. Knowledge panels hardcoded Suspects for 林夏 although Current State was unaware. Shared KnowledgeBoundary now reads canonical fields. Soft Interpretation remains separate and does not write canonical entities.
6. Existing browser storage lacked the new counters. Chronological migration preserves edits, chapters and snapshots, derives legacy restore provenance where available, and is idempotent.

## Automated verification

- `npm install`: passed; no new dependencies; audit reported zero vulnerabilities.
- `npm run build`: passed, including TypeScript and route generation.
- `npm run lint`: passed, no errors/warnings.
- `npm test`: **13/13 passed** using Node tests and React server rendering; no browser-test dependency added.

Coverage includes ready/unready entry paths and actual Current Story link markup; actual Workspace Review action; output rendering without mutation; pending/unresolved conflict rejection; accepted-only state writes; stale-before guard; Commit version +1; repeated Restore and subsequent Commit without chapter/version coupling; prior history and source snapshots preserved; two-story update isolation; canonical knowledge display; legacy cache migration and malformed cache fallback; shared output evidence.

## Browser acceptance

Used `npm run dev -- --port 3012` and `http://127.0.0.1:3012`. An old development process from the previous session had a broken output pipe and held the dev lock; after verifying that process, restarted it. The fresh service and browser had no blocking console errors.

- `/`: separate Chapter and Current State columns; READY Open Story leads to workspace.
- `setup`: Sources & Story Settings title; Sources & settings breadcrumb; secondary entry only.
- Current Story switch from settings opens workspace.
- `workspace`: next narrative task and independent current state version; four-change Review action within output flow.
- `review`: Review changes breadcrumb; Accept disabled on unresolved conflict. Three accepts alone still block Commit; rejecting conflict enables Commit. Commit yields Chapter 13 / State v13.
- `history`: shows v13, v12, v11 separately. Restoring v11 prompts for a NEW v14. Confirmation yields State v14, Restored from State v11, Snapshot chapter 11, with all four versions retained.
- Reload preserves v14/Chapter 11. `state` shows Current Truth v14 and restored entity fields; Knowledge panel and inspector both show 林夏 unaware. Hard/Soft and World Truth ≠ Character Knowledge presentation retained.
- Library after restore displays Chapter 11 / State v14.
- Creating an unready story opens setup; its Current Story switch also points to setup and breadcrumb remains populated.
- Desktop layout visually inspected; no visual redesign or CSS modifications during technical integration.

## Release gate

Merge to current main only after all checks above pass, then rerun build/lint/test on the resulting main commit before pushing. The final task result reports that final commit and remote status.

## Boundaries

**Frontend Mock Contract ≠ Backend State Schema**. No Backend, Database, API routes, Auth, LLM, extraction, real parsing, RAG, Embedding or MCP added. Mock content stays browser-local; no production or multi-user guarantees are claimed.
