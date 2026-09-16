import test from "node:test";
import assert from "node:assert/strict";
import { initialStories } from "../lib/mock-story";
import {
  ApiStoryStateAdapter,
  StoryStateApiError,
} from "../lib/frontend/story-state-service";
import {
  backendStoryIdFor,
  isBackendUuid,
} from "../lib/frontend/story-api-identity";

const STORY_UUID = "2c600001-0000-4000-8000-000000000001";
const REVISION_UUID = "2c600001-0000-4000-8000-000000000003";
const DOCUMENT_UUID = "2c600001-0000-4000-8000-000000000002";
const DELTA_UUID = "2c600001-0000-4000-8000-000000000010";
const REJECTED_UUID = "2c600001-0000-4000-8000-000000000011";

const story = () => structuredClone(initialStories[0]);
const backendStory = {
  id: STORY_UUID,
  title: "雾港来信",
  currentVersion: 12,
  currentChapter: 12,
  storyRevision: 1,
  createdAt: "2026-09-15T00:00:00.000Z",
};
const validatorResult = {
  status: "passed" as const,
  recommendation: "AUTO_ACCEPT_ELIGIBLE" as const,
  reason: "Exact evidence supports this change.",
  risk: "LOW" as const,
  checks: [
    {
      agent: "deterministic" as const,
      verdict: "SUPPORTED" as const,
      reason: "Before value and references are valid.",
      evidenceIds: ["2c600001-0000-4000-8000-000000000040"],
      code: "EVIDENCE",
    },
  ],
};
const delta = (id: string, decision: "needs_review" | "rejected") => ({
  id,
  operation: "UPDATE" as const,
  targetType: "characters",
  targetId: "2c600001-0000-4000-8000-000000000020",
  fieldPath: "location",
  before: "Home",
  after: "Hospital",
  sourceEventId: "2c600001-0000-4000-8000-000000000030",
  evidenceIds: ["2c600001-0000-4000-8000-000000000040"],
  reason: "The character arrives at the hospital.",
  confidence: 0.98,
  risk: [],
  decision,
  validatorResult,
  committedVersionId: null,
  createdAt: "2026-09-15T00:00:01.000Z",
});

function hydration() {
  return {
    story: backendStory,
    candidateDeltas: [
      delta(DELTA_UUID, "needs_review"),
      delta(REJECTED_UUID, "rejected"),
    ],
    evidence: [
      {
        id: "2c600001-0000-4000-8000-000000000040",
        sourceRevisionId: REVISION_UUID,
        quote: "林夏推开医院的门。",
        start: 0,
        end: 10,
      },
    ],
    events: [
      {
        id: "2c600001-0000-4000-8000-000000000030",
        sourceRevisionId: REVISION_UUID,
        summary: "林夏到达医院",
        createdAt: "2026-09-15T00:00:01.000Z",
      },
    ],
    sourceRevisions: [
      {
        id: REVISION_UUID,
        documentId: DOCUMENT_UUID,
        revisionNumber: 1,
        visibility: "canonical" as const,
      },
    ],
    sourceDocuments: [
      {
        id: DOCUMENT_UUID,
        title: "Chapter 13",
        sourceOrder: 13,
        chapter: 13,
      },
    ],
  };
}

const response = (value: unknown, status = 200) =>
  Response.json(value, { status });

test("real adapter persists source revision, extracts by UUID, then hydrates review", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.endsWith("/source-documents")) return response({});
    if (url.endsWith("/source-revisions")) return response({});
    if (url.endsWith("/extract")) {
      const body = JSON.parse(String(init?.body)) as {
        sourceRevisionId: string;
      };
      assert.ok(isBackendUuid(body.sourceRevisionId));
      return response({
        status: "completed",
        sourceRevisionId: body.sourceRevisionId,
        baseStateVersion: 12,
        candidateDeltas: hydration().candidateDeltas,
        validatorResults: [validatorResult],
        compilerIssues: [],
        warnings: [],
        evidence: hydration().evidence,
        events: hydration().events,
        provider: {
          modelId: "deepseek-chat",
          calls: 1,
          packetHash: "packet-1",
        },
        timing: {
          startedAt: "2026-09-15T00:00:00.000Z",
          completedAt: "2026-09-15T00:00:01.000Z",
          durationMs: 1000,
        },
      });
    }
    if (url.endsWith("/review")) return response(hydration());
    throw new Error(`Unexpected URL ${url}`);
  }) as typeof fetch;
  const adapter = new ApiStoryStateAdapter(fetcher);
  const result = await adapter.extract(story(), {
    storyId: "fog-harbor",
    title: "Chapter 13",
    chapter: 13,
    expectedStateVersion: 12,
    content: "林夏推开医院的门。",
  });

  assert.deepEqual(
    calls.map((call) => call.url.split("/").at(-1)),
    ["source-documents", "source-revisions", "extract", "review"],
  );
  assert.ok(calls.every((call) => call.url.includes(STORY_UUID)));
  assert.ok(calls.every((call) => !call.url.includes("fog-harbor")));
  assert.equal(result.run?.baseStateVersion, 12);
  assert.equal(result.run?.provider.modelId, "deepseek-chat");
  assert.deepEqual(
    result.story.deltas.map((item) => item.id),
    [DELTA_UUID],
  );
});

test("GET review rebuild excludes rejected uncommitted audit deltas", async () => {
  let requested = "";
  const adapter = new ApiStoryStateAdapter((async (
    input: RequestInfo | URL,
  ) => {
    requested = String(input);
    return response(hydration());
  }) as typeof fetch);
  const result = await adapter.hydrateReview(story());
  assert.equal(requested, `/api/stories/${STORY_UUID}/review`);
  assert.deepEqual(
    result.story.deltas.map((item) => item.id),
    [DELTA_UUID],
  );
});

test("unmapped route slug is rejected before a backend request", async () => {
  let calls = 0;
  const adapter = new ApiStoryStateAdapter((async () => {
    calls += 1;
    return response({});
  }) as typeof fetch);
  const unmapped = { ...story(), id: "display-only-story" };
  await assert.rejects(
    adapter.hydrateReview(unmapped),
    (error: unknown) =>
      error instanceof StoryStateApiError && error.status === 400,
  );
  assert.equal(calls, 0);
  assert.equal(backendStoryIdFor("display-only-story"), null);
});

test("409 mutation is surfaced and never retried", async () => {
  let calls = 0;
  const adapter = new ApiStoryStateAdapter((async () => {
    calls += 1;
    return response(
      { error: "STALE_VERSION", message: "Current state version changed" },
      409,
    );
  }) as typeof fetch);
  await assert.rejects(
    adapter.decide(story(), DELTA_UUID, "accepted"),
    (error: unknown) =>
      error instanceof StoryStateApiError &&
      error.status === 409 &&
      error.retryable === false,
  );
  assert.equal(calls, 1);
});

test("documented backend errors remain explicit adapter states", async () => {
  for (const status of [400, 404, 422, 502, 503]) {
    let calls = 0;
    const adapter = new ApiStoryStateAdapter((async () => {
      calls += 1;
      return response({ error: `HTTP_${status}` }, status);
    }) as typeof fetch);
    await assert.rejects(
      adapter.hydrateReview(story()),
      (error: unknown) =>
        error instanceof StoryStateApiError &&
        error.status === status &&
        error.retryable === [502, 503].includes(status),
    );
    assert.equal(calls, 1);
  }
});

test("commit posts accepted IDs then reloads canonical state and versions", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const committedVersion = {
    id: "2c600001-0000-4000-8000-000000000050",
    versionNumber: 13,
    parentVersionId: "2c600001-0000-4000-8000-000000000051",
    commitKind: "delta_commit",
    createdAt: "2026-09-15T00:00:02.000Z",
    deltaIds: [DELTA_UUID],
    snapshot: {},
    restoredFromVersionId: null,
    chapter: 13,
    storyRevision: 2,
  };
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.endsWith("/commit")) return response(committedVersion);
    if (url.endsWith("/state")) {
      return response({
        story: { ...backendStory, currentVersion: 13, currentChapter: 13 },
        state: {},
      });
    }
    if (url.endsWith("/versions")) return response([committedVersion]);
    throw new Error(`Unexpected URL ${url}`);
  }) as typeof fetch;
  const adapter = new ApiStoryStateAdapter(fetcher);
  const ready = story();
  ready.deltas = [
    {
      ...ready.deltas[0],
      id: DELTA_UUID,
      decision: "accepted",
    },
  ];

  const result = await adapter.commit(ready);
  const commitBody = JSON.parse(String(calls[0].init?.body));
  assert.deepEqual(commitBody, {
    deltaIds: [DELTA_UUID],
    expectedVersion: 12,
  });
  assert.deepEqual(
    calls.map((call) => call.url.split("/").at(-1)),
    ["commit", "state", "versions"],
  );
  assert.equal(result.story.currentStateVersion, 13);
  assert.equal(result.story.loop?.history?.[0].version, 13);
  assert.equal(result.story.deltas.length, 0);
});
