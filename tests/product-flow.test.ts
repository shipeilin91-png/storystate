import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  initialStories,
  newStory,
  initializeStory,
  importOptions,
  commitMock,
  rollbackMock,
} from "../lib/mock-story";
import { storyEntryHref, storyRouteLabels } from "../lib/story-navigation";
import {
  restoreStoredStories,
  updateStoryInCollection,
} from "../lib/story-store";
import { CurrentStorySwitch } from "../components/workspace-shell";
import { WritingWorkspace } from "../components/story/story-workspace";
import { History } from "../components/story/version-history";
import { KnowledgeBoundary } from "../components/story/knowledge-boundary";
const fixture = () => structuredClone(initialStories[0]);

test("story entry and rendered Current Story switch share ready/unready destinations", () => {
  for (const story of [fixture(), newStory("empty", "空故事", "")]) {
    const expected = `/stories/${story.id}/${story.ready ? "workspace" : "setup"}`;
    assert.equal(storyEntryHref(story), expected);
    const html = renderToStaticMarkup(
      createElement(CurrentStorySwitch, { story }),
    );
    assert.ok(html.includes(`href="${expected}"`));
    assert.ok(html.includes('class="story-switch"'));
  }
});

test("Workspace output exposes Review as a run action without mutating state", () => {
  const story = fixture();
  const before = structuredClone(story);
  const html = renderToStaticMarkup(
    createElement(WritingWorkspace, {
      story,
      update: () => assert.fail("render must not change state"),
    }),
  );
  assert.ok(html.includes(`href="/stories/${story.id}/review"`));
  assert.match(html, /Review 4 changes/);
  assert.match(html, /Current State v12/);
  assert.deepEqual(story, before);
  assert.equal(storyRouteLabels.setup, "Sources & settings");
  assert.equal(storyRouteLabels.review, "Review changes");
});

test("restored version renders separately from chapter in Workspace and History", () => {
  const story = rollbackMock(fixture(), fixture().versions[1], "restore");
  assert.equal(story.chapter, 11);
  const workspace = renderToStaticMarkup(
    createElement(WritingWorkspace, { story, update: () => {} }),
  );
  assert.match(workspace, /Chapter 12 · Current State v13/);
  const history = renderToStaticMarkup(
    createElement(History, { story, update: () => {} }),
  );
  assert.match(history, /State v13/);
  assert.match(history, /Restored from State v11/);
  assert.match(history, /Snapshot chapter: 11/);
});

test("Knowledge Boundary renders committed knowledge, not hardcoded interpretation", () => {
  const story = fixture();
  const before = renderToStaticMarkup(
    createElement(KnowledgeBoundary, { story }),
  );
  assert.ok(before.includes("Unaware"));
  assert.ok(!before.includes("Suspects"));
  story.entities.find((e) => e.id === "identity")!.fields["林夏"] = "suspects";
  const after = renderToStaticMarkup(
    createElement(KnowledgeBoundary, { story, compact: true }),
  );
  assert.ok(after.includes("Suspects"));
});

test("review, commit and restore one story leave another story untouched", () => {
  const a = initializeStory({
    ...newStory("a", "甲", ""),
    imports: [...importOptions],
  });
  const b = initializeStory({
    ...newStory("b", "乙", ""),
    imports: [...importOptions],
  });
  const originalB = structuredClone(b);
  const reviewed = updateStoryInCollection([a, b], "a", (story) => ({
    ...story,
    deltas: story.deltas.map((d) => ({
      ...d,
      decision: d.risk === "conflict" ? "rejected" : "accepted",
    })),
  }));
  const committed = updateStoryInCollection(reviewed, "a", (story) =>
    commitMock(story, "commit"),
  );
  const restored = updateStoryInCollection(committed, "a", (story) =>
    rollbackMock(story, a.versions[0], "restore"),
  );
  assert.equal(restored[0].currentStateVersion, 14);
  assert.equal(restored[1], b);
  assert.deepEqual(restored[1], originalB);
  assert.equal(
    initialStories[0].entities.find((e) => e.id === "usb")!.fields.owner,
    "陈默",
  );
});

test("legacy cache migrates commits and restores chronologically without data loss", () => {
  const story = fixture();
  story.deltas.forEach(
    (d) => (d.decision = d.risk === "conflict" ? "rejected" : "accepted"),
  );
  const committed = commitMock(story, "commit");
  const restored = rollbackMock(committed, story.versions[1], "restore");
  const legacy = JSON.parse(JSON.stringify(restored));
  delete legacy.currentStateVersion;
  legacy.versions.forEach((v: Record<string, unknown>) => {
    delete v.stateVersion;
    delete v.restoredFromStateVersion;
  });
  legacy.versions[0].changes = ["从版本 v11 恢复完整状态快照"];
  const migrated = restoreStoredStories([legacy])![0];
  assert.equal(migrated.currentStateVersion, 14);
  assert.deepEqual(
    migrated.versions.map((v) => v.stateVersion),
    [14, 13, 12, 11],
  );
  assert.equal(migrated.versions[0].restoredFromStateVersion, 11);
  assert.equal(migrated.chapter, 11);
  assert.deepEqual(migrated.entities, restored.entities);
  assert.deepEqual(restoreStoredStories([migrated]), [migrated]);
  assert.equal(restoreStoredStories([{ id: "broken" }]), null);
  const empty = newStory("empty", "空", "");
  assert.equal(restoreStoredStories([empty])![0].currentStateVersion, 0);
});
