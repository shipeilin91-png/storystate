import test from "node:test";
import assert from "node:assert/strict";
import { initialStories } from "../lib/mock-story";
import { canAcceptChange } from "../lib/review-contract";
import { storyStateService } from "../lib/frontend/story-state-service";

const fixture = () => structuredClone(initialStories[0]);

test("frontend product loop extracts without auto decision or commit", async () => {
  const story = fixture();
  const result = await storyStateService.extract(story, {
    storyId: story.id,
    title: "Chapter 13 · Story Content",
    chapter: 13,
    expectedStateVersion: story.currentStateVersion,
    content:
      story.reviewSource?.output ??
      "林夏推开医院的门。陈默把银色 USB 放进她手里，要求她保管好它。",
  });
  assert.equal(result.run?.status, "review_required");
  assert.equal(result.story.currentStateVersion, 12);
  assert.equal(result.story.versions.length, story.versions.length);
  assert.ok(result.run?.candidates.length);
  assert.ok(
    result.run?.candidates.every(
      (candidate) => candidate.decision === "needs_review",
    ),
  );
  assert.ok(
    result.run?.candidates.every((candidate) => candidate.sourceRevision.id),
  );
  assert.ok(
    result.run?.candidates.every((candidate) => candidate.validatorResult),
  );
});

test("explicit decisions precede commit and state/history refresh", async () => {
  let story = fixture();
  story = (
    await storyStateService.extract(story, {
      storyId: story.id,
      title: "Chapter 13 · Story Content",
      chapter: 13,
      expectedStateVersion: 12,
      content:
        "林夏推开医院的门，看见陈默。陈默把银色 USB 放进她手里。货船线索仍未解密。",
    })
  ).story;

  for (const delta of story.deltas) {
    const decision = canAcceptChange(story, delta) ? "accepted" : "rejected";
    story = (await storyStateService.decide(story, delta.id, decision)).story;
  }

  const committed = await storyStateService.commit(story);
  assert.equal(committed.story.currentStateVersion, 13);
  assert.equal(committed.story.deltas.length, 0);
  assert.ok(committed.commit?.committedCandidateIds.length);

  const refreshed = await storyStateService.refresh(committed.story);
  assert.equal(refreshed.story.loop?.stateSnapshot?.version, 13);
  assert.equal(refreshed.story.loop?.history?.[0].version, 13);
  assert.equal(refreshed.story.loop?.activeRun, undefined);
});

test("short content returns no changes without advancing state", async () => {
  const story = fixture();
  const result = await storyStateService.extract(story, {
    storyId: story.id,
    title: "Short note",
    chapter: 13,
    expectedStateVersion: 12,
    content: "没有变化。",
  });
  assert.equal(result.run?.status, "no_changes");
  assert.equal(result.story.currentStateVersion, 12);
  assert.equal(result.story.deltas.length, 0);
});
