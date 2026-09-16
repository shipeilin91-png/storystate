import test from "node:test";
import assert from "node:assert/strict";
import { initialStories } from "../lib/mock-story";
import {
  ApiStoryStateAdapter,
  StoryStateApiError,
  storyStateService,
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
const delta = (
  id: string,
  decision: "needs_review" | "accepted" | "rejected",
) => ({
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

test("default adapter calls browser fetch with the global receiver", async () => {
  const originalFetch = globalThis.fetch;
  let usedGlobalReceiver = false;
  globalThis.fetch = (async function (
    this: unknown,
    input: RequestInfo | URL,
  ) {
    usedGlobalReceiver = this === globalThis;
    assert.equal(String(input), `/api/stories/${STORY_UUID}/review`);
    return response(hydration());
  }) as typeof fetch;
  try {
    const result = await new ApiStoryStateAdapter().hydrateReview(story());
    assert.equal(usedGlobalReceiver, true);
    assert.deepEqual(result.story.deltas.map((item) => item.id), [DELTA_UUID]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

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


test("successive source submissions use monotonic PostgreSQL int4-safe ordering independent of document UUID", async () => {
  const documents: Array<{ id: string; sourceOrder: number }> = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/source-documents")) {
      documents.push(JSON.parse(String(init?.body)) as { id: string; sourceOrder: number });
      return response({});
    }
    if (url.endsWith("/source-revisions")) return response({});
    if (url.endsWith("/extract")) {
      const body = JSON.parse(String(init?.body)) as { sourceRevisionId: string };
      return response({
        status: "completed",
        sourceRevisionId: body.sourceRevisionId,
        baseStateVersion: 12,
        candidateDeltas: [],
        validatorResults: [],
        compilerIssues: [],
        warnings: [],
        evidence: [],
        events: [],
        provider: {},
        timing: {},
      });
    }
    if (url.endsWith("/review")) {
      return response({ ...hydration(), candidateDeltas: [] });
    }
    throw new Error(`Unexpected URL ${url}`);
  }) as typeof fetch;
  const adapter = new ApiStoryStateAdapter(fetcher);
  const input = {
    storyId: "fog-harbor",
    title: "Chapter 13",
    chapter: 13,
    expectedStateVersion: 12,
    content: "林夏推开医院的门。",
  };

  await adapter.extract(story(), input);
  await adapter.extract(story(), { ...input, title: "Chapter 14", chapter: 14 });

  assert.equal(documents.length, 2);
  const [first, second] = documents;
  assert.ok(second.sourceOrder > first.sourceOrder);
  for (const document of documents) {
    assert.ok(Number.isInteger(document.sourceOrder));
    assert.ok(document.sourceOrder <= 2_147_483_647);
    const uuidDerivedOrder =
      Number.parseInt(document.id.slice(0, 8), 16) % 2_147_483_647;
    assert.notEqual(document.sourceOrder, uuidDerivedOrder);
  }
});

test("validator unavailable is projected as Needs Review without an automatic decision", async () => {
  const unavailable = {
    ...delta(DELTA_UUID, "needs_review"),
    validatorResult: null,
  };
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/source-documents") || url.endsWith("/source-revisions"))
      return response({});
    if (url.endsWith("/extract")) {
      const body = JSON.parse(String(init?.body)) as { sourceRevisionId: string };
      return response({
        status: "completed",
        sourceRevisionId: body.sourceRevisionId,
        baseStateVersion: 12,
        candidateDeltas: [unavailable],
        validatorResults: [null],
        compilerIssues: [],
        warnings: [],
        validationIssues: [
          { deltaId: DELTA_UUID, code: "VALIDATOR_UNAVAILABLE" },
        ],
        evidence: hydration().evidence,
        events: hydration().events,
        provider: { modelId: "fake-extractor", calls: 1, packetHash: "packet" },
        timing: {
          startedAt: "2026-09-15T00:00:00.000Z",
          completedAt: "2026-09-15T00:00:01.000Z",
          durationMs: 1000,
        },
      });
    }
    if (url.endsWith("/review")) {
      return response({ ...hydration(), candidateDeltas: [unavailable] });
    }
    throw new Error(`Unexpected URL ${url}`);
  }) as typeof fetch;
  const result = await new ApiStoryStateAdapter(fetcher).extract(story(), {
    storyId: "fog-harbor",
    title: "Chapter 13",
    chapter: 13,
    expectedStateVersion: 12,
    content: "林夏推开医院的门。",
  });

  assert.deepEqual(result.run?.validationIssues, [
    { deltaId: DELTA_UUID, code: "VALIDATOR_UNAVAILABLE" },
  ]);
  assert.equal(result.run?.warnings[0]?.code, "VALIDATOR_UNAVAILABLE");
  assert.equal(result.run?.candidates[0].recommendation, "NEEDS_REVIEW");
  assert.equal(result.story.deltas[0].decision, "pending");
});

test("the production story service uses the API adapter without mock fallback", () => {
  assert.ok(storyStateService instanceof ApiStoryStateAdapter);
});

test("fake-provider E2E commits only the accepted location and reloads state and history", async () => {
  const characterId = "2c600001-0000-4000-8000-000000000020";
  const itemId = "2c600001-0000-4000-8000-000000000021";
  const holderDeltaId = "2c600001-0000-4000-8000-000000000012";
  const evidenceId = "2c600001-0000-4000-8000-000000000040";
  const eventId = "2c600001-0000-4000-8000-000000000030";
  const epistemic = (value: string) => ({
    value,
    status: "resolved",
    lastConfirmedValue: value,
  });
  let document: Record<string, unknown> | undefined;
  let revision: Record<string, unknown> | undefined;
  let currentVersion = 12;
  let location = epistemic("Maintenance Room");
  const holder = epistemic(characterId);
  const decisions = new Map<string, "needs_review" | "accepted" | "rejected">([
    [DELTA_UUID, "needs_review"],
    [holderDeltaId, "needs_review"],
  ]);
  const backendDelta = (
    id: string,
    targetType: "characters" | "items",
    targetId: string,
    fieldPath: "location" | "holder",
    before: unknown,
    after: unknown,
  ) => ({
    ...delta(id, decisions.get(id) ?? "needs_review"),
    targetType,
    targetId,
    fieldPath,
    before,
    after,
    sourceEventId: eventId,
    evidenceIds: [evidenceId],
  });
  const candidates = () => [
    backendDelta(
      DELTA_UUID,
      "characters",
      characterId,
      "location",
      epistemic("Maintenance Room"),
      epistemic("Control Room"),
    ),
    backendDelta(
      holderDeltaId,
      "items",
      itemId,
      "holder",
      holder,
      epistemic("2c600001-0000-4000-8000-000000000022"),
    ),
  ];
  const reviewDto = () => ({
    ...hydration(),
    story: { ...backendStory, currentVersion, currentChapter: 13 },
    candidateDeltas: candidates().filter(
      (candidate) => candidate.decision !== "rejected",
    ),
    evidence: [
      {
        ...hydration().evidence[0],
        id: evidenceId,
        quote: "纪川明确到达控制室，并将记录器交给同伴临时保管。",
      },
    ],
    events: [{ ...hydration().events[0], id: eventId }],
  });
  const versions: Array<Record<string, unknown>> = [];
  const calls: string[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(`${init?.method ?? "GET"} ${url}`);
    if (url.endsWith("/source-documents")) {
      document = JSON.parse(String(init?.body));
      return response(document);
    }
    if (url.endsWith("/source-revisions")) {
      revision = JSON.parse(String(init?.body));
      return response(revision);
    }
    if (url.endsWith("/extract")) {
      const body = JSON.parse(String(init?.body)) as { sourceRevisionId: string };
      assert.equal(body.sourceRevisionId, revision?.id);
      return response({
        status: "completed",
        sourceRevisionId: body.sourceRevisionId,
        baseStateVersion: currentVersion,
        candidateDeltas: candidates(),
        validatorResults: candidates().map((candidate) => candidate.validatorResult),
        compilerIssues: [],
        warnings: [],
        validationIssues: [],
        evidence: reviewDto().evidence,
        events: reviewDto().events,
        provider: { modelId: "deterministic-fake", calls: 1, packetHash: "packet" },
        timing: {
          startedAt: "2026-09-15T00:00:00.000Z",
          completedAt: "2026-09-15T00:00:01.000Z",
          durationMs: 1000,
        },
      });
    }
    if (url.endsWith("/review")) return response(reviewDto());
    const decisionMatch = url.match(/\/deltas\/([^/]+)\/decision$/);
    if (decisionMatch) {
      const body = JSON.parse(String(init?.body)) as {
        decision: "accepted" | "rejected";
      };
      decisions.set(decisionMatch[1], body.decision);
      return response({});
    }
    if (url.endsWith("/commit")) {
      const body = JSON.parse(String(init?.body)) as {
        deltaIds: string[];
        expectedVersion: number;
      };
      assert.deepEqual(body, { deltaIds: [DELTA_UUID], expectedVersion: 12 });
      assert.equal(decisions.get(holderDeltaId), "rejected");
      location = epistemic("Control Room");
      currentVersion = 13;
      const version = {
        id: "2c600001-0000-4000-8000-000000000050",
        versionNumber: 13,
        parentVersionId: null,
        commitKind: "delta_commit",
        createdAt: "2026-09-15T00:00:02.000Z",
        deltaIds: [DELTA_UUID],
        snapshot: canonicalState(),
        restoredFromVersionId: null,
        chapter: 13,
        storyRevision: 1,
      };
      versions.push(version);
      return response(version);
    }
    if (url.endsWith("/state")) {
      return response({
        story: { ...backendStory, currentVersion, currentChapter: 13 },
        state: canonicalState(),
      });
    }
    if (url.endsWith("/versions")) return response(versions);
    throw new Error(`Unexpected URL ${url}`);
  }) as typeof fetch;
  const canonicalState = () => ({
    characters: [
      {
        id: characterId,
        active: true,
        name: "纪川",
        role: "engineer",
        location,
      },
    ],
    items: [
      {
        id: itemId,
        active: true,
        name: "Recorder",
        owner: holder,
        holder,
        custodian: null,
        condition: "operational",
      },
    ],
    plotThreads: [],
    propositions: [],
    worldTruth: [],
    knowledge: [],
    relationships: [],
  });
  const adapter = new ApiStoryStateAdapter(fetcher);
  const extracted = await adapter.extract(story(), {
    storyId: "fog-harbor",
    title: "Chapter 13",
    chapter: 13,
    expectedStateVersion: 12,
    content: "纪川明确到达控制室，并将记录器交给同伴临时保管。",
  });
  assert.ok(document && revision);
  assert.equal(location.value, "Maintenance Room");
  assert.equal(holder.value, characterId);

  const accepted = await adapter.decide(extracted.story, DELTA_UUID, "accepted");
  const rejected = await adapter.decide(
    accepted.story,
    holderDeltaId,
    "rejected",
  );
  assert.deepEqual(rejected.story.deltas.map((value) => value.id), [DELTA_UUID]);
  assert.equal(location.value, "Maintenance Room");

  const committed = await adapter.commit(rejected.story);
  assert.equal(committed.story.currentStateVersion, 13);
  assert.equal(committed.story.loop?.history?.length, 1);
  assert.deepEqual(committed.story.loop?.history?.[0].changes, [
    `Committed delta ${DELTA_UUID}`,
  ]);
  assert.equal(location.value, "Control Room");
  assert.equal(holder.value, characterId);
  assert.equal(
    calls.filter((call) => call.includes("/commit")).length,
    1,
  );
});
