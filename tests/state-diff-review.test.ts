import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  initialStories,
  canCommit,
  commitMock,
  rollbackMock,
  type Story,
} from "../lib/mock-story";
import {
  canAcceptChange,
  reasoningFor,
  reviewKind,
} from "../lib/review-contract";
import { reviewDemoStories, withReviewExamples } from "../lib/review-fixtures";
import { restoreStoredStories } from "../lib/story-store";
import {
  DeltaReview,
  matchesReviewFilter,
} from "../components/story/delta-review";
import { StateDiffRow } from "../components/story/state-diff-row";
const fixture = () => structuredClone(initialStories[0]);
const example = (id: string) =>
  structuredClone(reviewDemoStories.find((s) => s.id === id)!);
const review = (s: Story) => ({
  ...s,
  deltas: s.deltas.map((d) => ({
    ...d,
    decision: canAcceptChange(s, d)
      ? ("accepted" as const)
      : ("rejected" as const),
  })),
});
const fields = (s: Story, id: string) =>
  s.entities.find((e) => e.id === id)!.fields;

test("Review defaults to state diff and every reasoning disclosure starts closed", () => {
  const story = fixture();
  const html = renderToStaticMarkup(
    createElement(DeltaReview, {
      story,
      update: () => assert.fail("render cannot mutate"),
    }),
  );
  assert.match(html, /本轮状态变化/);
  assert.match(html, /Before → After/);
  assert.match(html, /你的 Decision/);
  assert.match(html, /Pending/);
  assert.equal((html.match(/<details /g) ?? []).length, story.deltas.length);
  assert.doesNotMatch(html, /<details[^>]*\sopen(?:=|\s|>)/);
  assert.match(html, /<summary>查看原因/);
  assert.match(html, /Evidence/);
  assert.match(html, /Validator checks/);
});

test("Ch13 holder accepts possession, owner rejects ownership, Soft cannot commit", () => {
  const s = fixture();
  const holder = s.deltas.find((d) => d.field === "holder")!;
  const owner = s.deltas.find((d) => d.id === "d5-owner")!;
  assert.equal(holder.before, "陈默");
  assert.equal(holder.after, "林夏");
  assert.equal(reasoningFor(s, holder).recommendation, "AUTO_ACCEPT_ELIGIBLE");
  assert.equal(holder.decision, "pending");
  assert.equal(canCommit(s), false);
  assert.equal(reasoningFor(s, owner).recommendation, "REJECT");
  assert.equal(canAcceptChange(s, owner), false);
  const ready = review(s);
  // Even an externally edited cache cannot promote a Soft candidate into canonical state.
  ready.deltas.find((d) => reviewKind(d) === "soft")!.decision = "accepted";
  const result = commitMock(ready, "commit");
  assert.equal(fields(result, "usb").holder, "林夏");
  assert.equal(fields(result, "usb").owner, "陈默");
  assert.equal(fields(result, "relation").trust, "distrust");
  assert.equal(fields(result, "relation")["心理信任（解释）"], undefined);
  assert.equal(result.currentStateVersion, 13);
  assert.ok(
    result.versions[0].reviewedChanges?.some(
      (d) => d.id === owner.id && d.decision === "rejected",
    ),
  );
});

test("forged accepted Reject candidate blocks the commit instead of overriding ownership", () => {
  const s = review(fixture());
  s.deltas.find((d) => d.id === "d5-owner")!.decision = "accepted";
  assert.equal(canCommit(s), false);
  assert.equal(commitMock(s, "no"), s);
});

test("Ch16 updates only Gu's P, preserves Lin's P and independent Q", () => {
  const s = example("review-ch16");
  const d = s.deltas[0];
  assert.equal(reasoningFor(s, d).risk, "HIGH");
  assert.equal(reasoningFor(s, d).recommendation, "NEEDS_REVIEW");
  const result = commitMock(review(s), "ch16");
  assert.equal(fields(result, "identity")["顾言"], "knows");
  assert.equal(fields(result, "identity")["林夏"], "unaware");
  assert.equal(fields(result, "identity-q")["林夏"], "suspects");
  assert.equal(fields(s, "identity")["顾言"], "unaware");
});

test("Ch17 commits World Truth and paired belief correction with provenance", () => {
  const s = example("review-ch17");
  const d = s.deltas.find((d) => d.id === "c17-belief")!;
  const html = renderToStaticMarkup(
    createElement(StateDiffRow, { story: s, delta: d, onDecision: () => {} }),
  );
  assert.match(html, /believes/);
  assert.match(html, /knows/);
  assert.match(html, /believed_value/);
  const result = commitMock(review(s), "ch17");
  assert.equal(fields(result, "father-world").truth, "confirmed_false");
  assert.deepEqual(fields(result, "father-lin"), {
    stance: "knows",
    believed_value: "false",
  });
  assert.equal(
    result.versions[0].reviewedChanges?.find((d) => d.id === "c17-belief")
      ?.review?.transition,
    "belief_correction",
  );
  assert.match(
    result.versions[0].changes.join(" "),
    /believed_value: true → false/,
  );
  assert.equal(fields(result, "relation").trust, "distrust");
  assert.equal(
    fields(result, "relation").bounded_cooperation,
    "active · current escape",
  );
  const restored = rollbackMock(result, s.versions[0], "restore");
  assert.equal(restored.currentStateVersion, 18);
  assert.equal(restored.chapter, 16);
  assert.equal(restored.versions.length, 3);
  assert.equal(restored.versions[0].restoredFromStateVersion, 16);
  assert.deepEqual(fields(restored, "father-lin"), {
    stance: "believes",
    believed_value: "true",
  });
});

test("paired belief fields both participate in stale checks and apply atomically", () => {
  const s = review(example("review-ch17"));
  fields(s, "father-lin").believed_value = "false";
  assert.equal(canCommit(s), false);
  assert.equal(commitMock(s, "blocked"), s);
  assert.equal(fields(s, "father-world").truth, "unresolved");
});

test("NO_CHANGE-only and Soft-only batches never advance a state version", () => {
  for (const kind of ["no_change", "soft"]) {
    const s = kind === "soft" ? fixture() : example("review-ch16");
    s.deltas = s.deltas
      .filter((d) => reviewKind(d) === kind)
      .map((d) => ({ ...d, decision: "accepted" }));
    assert.ok(s.deltas.length);
    assert.equal(canCommit(s), false);
    assert.equal(commitMock(s, "no"), s);
  }
});

test("review filters distinguish recommendation, rejection, Soft and no-change", () => {
  const s = fixture();
  assert.equal(
    s.deltas.filter((d) => matchesReviewFilter(s, d, "Recommended")).length,
    4,
  );
  assert.equal(
    s.deltas.filter((d) => matchesReviewFilter(s, d, "Soft")).length,
    1,
  );
  assert.equal(
    s.deltas.filter((d) => matchesReviewFilter(s, d, "Conflict")).length,
    1,
  );
  const d = s.deltas[0];
  d.decision = "rejected";
  assert.equal(matchesReviewFilter(s, d, "Rejected"), true);
});

test("example hydration is idempotent and cannot replace existing stories or decisions", () => {
  const s = example("review-ch16");
  s.deltas[0].decision = "accepted";
  const all = withReviewExamples([s]);
  assert.equal(all[0], s);
  assert.equal(all.filter((s) => s.id === "review-ch16").length, 1);
  assert.deepEqual(withReviewExamples(all), all);
  assert.deepEqual(restoreStoredStories(all), all);
  const result = commitMock(review(all[0]), "commit");
  assert.equal(result.currentStateVersion, 16);
  assert.equal(
    all.find((s) => s.id === "review-ch17")!.currentStateVersion,
    16,
  );
});

test("legacy owner candidate gets corrected gate while history and user decisions survive", () => {
  const s = fixture();
  const d = s.deltas.find((d) => d.id === "d2")!;
  d.field = "owner";
  d.decision = "accepted";
  delete d.review;
  delete fields(s, "usb").holder;
  const migrated = restoreStoredStories([s])![0];
  assert.deepEqual(migrated.entities, s.entities);
  assert.deepEqual(migrated.versions, s.versions);
  const owner = migrated.deltas.find((d) => d.id === "d2")!;
  assert.equal(owner.decision, "accepted");
  assert.equal(reasoningFor(migrated, owner).recommendation, "REJECT");
  assert.equal(canAcceptChange(migrated, owner), false);
  assert.deepEqual(restoreStoredStories([migrated]), [migrated]);
});

test("History renders holder separately from owner after Ch13 commit", async () => {
  const { History } = await import("../components/story/version-history");
  const s = commitMock(review(fixture()), "history");
  const html = renderToStaticMarkup(
    createElement(History, { story: s, update: () => {} }),
  );
  assert.match(html, /<dt>USB 所有者<\/dt><dd>陈默<\/dd>/);
  assert.match(html, /<dt>USB 持有者<\/dt><dd>林夏<\/dd>/);
});

test("example evidence quotes remain anchored to each example's writer excerpt", () => {
  for (const s of reviewDemoStories) {
    for (const d of s.deltas)
      for (const quote of d.evidence.split("\n").filter(Boolean))
        assert.ok(s.reviewSource!.output.includes(quote), `${s.id}/${d.id}`);
  }
});
