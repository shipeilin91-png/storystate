import test from "node:test";
import assert from "node:assert/strict";
import {
  initialStories,
  canCommit,
  commitMock,
  newStory,
  initializeStory,
  importOptions,
  rollbackMock,
  fixtureDeltas,
  writerOutput,
} from "../lib/mock-story";
const fixture = () => structuredClone(initialStories[0]);
test("review preserves current facts until commit; unresolved conflict blocks commit", () => {
  const s = fixture();
  s.deltas.forEach((d) => (d.decision = "accepted"));
  assert.equal(canCommit(s), false);
  assert.equal(commitMock(s, "date"), s);
  assert.equal(s.entities.find((e) => e.id === "usb")!.fields.owner, "陈默");
});
test("commit applies accepted changes only and preserves snapshot history", () => {
  const s = fixture();
  s.deltas.forEach(
    (d) => (d.decision = d.risk === "conflict" ? "rejected" : "accepted"),
  );
  const next = commitMock(s, "2026-09-11T00:00:00Z");
  assert.equal(next.chapter, 13);
  assert.equal(next.deltas.length, 0);
  assert.equal(next.versions.length, 3);
  assert.equal(next.entities.find((e) => e.id === "usb")!.fields.owner, "林夏");
  assert.equal(
    next.entities.find((e) => e.id === "identity")!.fields["林夏"],
    "unaware",
  );
  assert.equal(
    next.versions[1].entities.find((e) => e.id === "usb")!.fields.owner,
    "陈默",
  );
  assert.equal(commitMock(next, "again"), next);
});
test("stale before value blocks commit and pending changes block commit", () => {
  const s = fixture();
  assert.equal(canCommit(s), false);
  s.deltas.forEach(
    (d) => (d.decision = d.risk === "conflict" ? "rejected" : "accepted"),
  );
  s.entities.find((e) => e.id === "usb")!.fields.owner = "顾言";
  assert.equal(canCommit(s), false);
});
test("new story is isolated and only initializes after all fixture imports", () => {
  const s = newStory("new", "新故事", "新的开始");
  assert.equal(s.entities.length, 0);
  assert.equal(initializeStory(s), s);
  const next = initializeStory({ ...s, imports: [...importOptions] });
  assert.equal(next.ready, true);
  assert.equal(next.entities.length, 10);
  next.entities[0].fields.location = "Elsewhere";
  assert.equal(initialStories[0].entities[0].fields.location, "Home");
});
test("rollback restores snapshot as a new version and clears proposed deltas", () => {
  const s = fixture();
  const next = rollbackMock(s, s.versions[1], "2026-09-11T01:00:00Z");
  assert.equal(next.chapter, 11);
  assert.equal(next.versions.length, 3);
  assert.equal(next.deltas.length, 0);
  assert.equal(
    next.entities.find((e) => e.id === "lin")!.fields.location,
    "Dock",
  );
  assert.equal(s.entities.find((e) => e.id === "lin")!.fields.location, "Home");
});

test("proposed delta evidence is quoted from the shared writer output", () => {
  for (const d of fixtureDeltas)
    assert.ok(writerOutput.includes(d.evidence), d.id);
});
