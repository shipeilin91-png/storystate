import test from "node:test";
import assert from "node:assert/strict";
import { initialStories } from "../lib/mock-story";
import {
  ApiStoryStateAdapter,
  StoryStateApiError,
} from "../lib/frontend/story-state-service";
import { backendStoryIdFor } from "../lib/frontend/story-api-identity";

const fixture = () => structuredClone(initialStories[0]);

test("display slug is isolated from the backend UUID", () => {
  const story = fixture();
  assert.equal(story.id, "fog-harbor");
  assert.equal(
    backendStoryIdFor(story.id),
    "2c600001-0000-4000-8000-000000000001",
  );
});

test("commit gate requires explicit decisions and at least one acceptance", () => {
  const adapter = new ApiStoryStateAdapter(async () => {
    throw new Error("network must not be used by the commit gate");
  });
  const story = fixture();
  assert.equal(adapter.canCommit(story), false);
  story.deltas.forEach((delta) => {
    delta.decision =
      delta.review?.kind === "canonical" ? "rejected" : "pending";
  });
  assert.equal(adapter.canCommit(story), false);
  story.deltas.find((delta) => delta.review?.kind === "canonical")!.decision =
    "accepted";
  assert.equal(adapter.canCommit(story), true);
});

test("unmapped story is rejected before any API request", async () => {
  let calls = 0;
  const adapter = new ApiStoryStateAdapter(async () => {
    calls += 1;
    return new Response("{}", { status: 200 });
  });
  const story = { ...fixture(), id: "display-only-story" };
  await assert.rejects(
    adapter.refresh(story),
    (error: unknown) =>
      error instanceof StoryStateApiError &&
      error.status === 400 &&
      error.code === "STORY_ID_UNMAPPED",
  );
  assert.equal(calls, 0);
});
