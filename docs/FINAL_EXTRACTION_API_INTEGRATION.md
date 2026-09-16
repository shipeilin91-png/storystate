# Final Extraction API Integration

This bounded demo exposes the existing extraction pipeline without connecting the frozen browser Mock.

## Runtime configuration

Server-only variables:

- `STORYSTATE_DATABASE_URL`
- `STORYSTATE_EXTRACTOR_MODEL`
- `STORYSTATE_EXTRACTOR_ENDPOINT` (full HTTPS chat-completions URL)
- `STORYSTATE_EXTRACTOR_API_KEY`

`STORYSTATE_EXTRACTOR_*` is independent of historical `DEEPSEEK_API_KEY` evaluation configuration. Missing or invalid extractor configuration fails closed with `503`. The extraction route uses the Node runtime, has a 20-second provider timeout, and declares a 60-second request maximum on hosts that support `maxDuration`.

## Demo bootstrap

With a migrated PostgreSQL database configured, run:

```bash
npm run demo:seed
```

It creates one deterministic UUID story and prints its `storyId` and `sourceRevisionId`. It seeds characters, an item, a proposition, a thread, a relationship, and one canonical source revision. It is intentionally a one-time seed: a duplicate UUID exits with the repository's conflict error.

## API surface

`POST /api/stories/:storyId/extract`

```json
{ "sourceRevisionId": "UUID" }
```

The response includes status, source/base-version identity, candidate deltas and validator results, compiler issues/warnings, exact evidence spans/quotes, events, sanitized provider metadata, and timings. It excludes provider payloads, prompts, model reasoning, and credentials.

`GET /api/stories/:storyId/review` returns open candidate deltas with their validator results, linked exact evidence, events, source revision identity, source documents, and provenance needed for Review hydration after a refresh.

Errors use `400` for invalid input/IDs, `404` for missing resources, `409` for stale state/source, `503` for missing configuration, `502` for extractor unavailability, and `422` for invalid structured extractor output.
