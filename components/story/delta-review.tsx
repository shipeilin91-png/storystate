"use client";
import Link from "next/link";
import { useState } from "react";
import type { Story, Delta } from "@/lib/mock-story";
import { storyStateService } from "@/lib/frontend/story-state-service";
import { reasoningFor, reviewKind } from "@/lib/review-contract";
import { reviewExamples } from "@/lib/review-fixtures";
import type { Update } from "./types";
import { Empty, Icon, PageIntro } from "../product-ui";
import { StoryMeta } from "./story-meta";
import { StateDiffRow } from "./state-diff-row";
const filters = [
  "All",
  "Recommended",
  "Needs Review",
  "Rejected",
  "Soft",
  "Conflict",
] as const;
type Filter = (typeof filters)[number];
export function matchesReviewFilter(story: Story, d: Delta, filter: Filter) {
  const candidate = story.loop?.activeRun?.candidates.find(
    (item) => item.id === d.id,
  );
  const detail = reasoningFor(story, d);
  const recommendation = candidate?.recommendation ?? detail.recommendation;
  const kind = candidate?.kind ?? reviewKind(d);
  if (filter === "All") return true;
  if (filter === "Soft") return kind === "soft";
  if (kind !== "canonical") return false;
  if (filter === "Rejected")
    return d.decision === "rejected" || recommendation === "REJECT";
  return (
    recommendation ===
    (
      {
        Recommended: "AUTO_ACCEPT_ELIGIBLE",
        "Needs Review": "NEEDS_REVIEW",
        Conflict: "CONFLICT",
      } as const
    )[filter]
  );
}
export function DeltaReview({
  story,
  update,
}: {
  story: Story;
  update: Update;
}) {
  const [filter, setFilter] = useState<Filter>("All");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const decision = async (id: string, next: Delta["decision"]) => {
    if (next === "pending") return;
    setBusy(id);
    setError("");
    try {
      const result = await storyStateService.decide(story, id, next);
      update(() => result.story);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "保存决定失败，请重试。",
      );
    } finally {
      setBusy("");
    }
  };
  const commit = async () => {
    setBusy("commit");
    setError("");
    try {
      const committed = await storyStateService.commit(story);
      update(() => committed.story);
      setMessage("提交完成。Canonical State 与 Version History 已刷新。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "提交失败，请重试。");
    } finally {
      setBusy("");
    }
  };
  const candidateKind = (delta: Delta) =>
    story.loop?.activeRun?.candidates.find((item) => item.id === delta.id)
      ?.kind ?? reviewKind(delta);
  const canonical = story.deltas.filter(
    (d) => candidateKind(d) === "canonical",
  );
  const pending = canonical.filter((d) => d.decision === "pending").length;
  const filtered = story.deltas.filter((d) =>
    matchesReviewFilter(story, d, filter),
  );
  const groups =
    (story.reviewSource?.chapter ?? 13) === 13
      ? ["Items", "Characters", "Plot Threads", "Knowledge", "Relationships"]
      : ["Knowledge", "Relationships", "Items", "Characters", "Plot Threads"];
  return (
    <div className="state-diff-review">
      <PageIntro
        eyebrow="STATE DIFF REVIEW"
        title="本轮状态变化"
        description="先看 Before → After，再按需展开证据与判断。系统推荐不是你的决定；Commit 后才更新 Current State。"
      />
      <StoryMeta story={story} />
      <div className="review-examples" aria-label="独立审核示例">
        <span>审核示例</span>
        {reviewExamples.map((e) => (
          <Link
            key={e.id}
            href={`/stories/${e.id}/review`}
            aria-current={story.id === e.id ? "page" : undefined}
          >
            {e.label}
          </Link>
        ))}
        <small>独立故事 · 精选变化</small>
      </div>
      {busy === "hydrate" && (
        <p className="notice" role="status">
          正在从后端恢复 Review…
        </p>
      )}
      {message && (
        <div className="notice" role="status">
          <span>{message}</span>
          <Link
            className="button secondary small"
            href={`/stories/${story.id}/state`}
          >
            查看 State
          </Link>
          <Link
            className="button secondary small"
            href={`/stories/${story.id}/history`}
          >
            查看 History
          </Link>
        </div>
      )}
      {error && (
        <p className="notice warn" role="alert">
          <Icon name="warning" size={16} /> {error}
        </p>
      )}
      {!!story.loop?.activeRun?.validationIssues.length && (
        <p className="notice warn" role="status">
          <Icon name="warning" size={16} /> Validator unavailable for{" "}
          {story.loop.activeRun.validationIssues.length} candidate(s). They remain
          in Needs Review and were not auto-accepted.
        </p>
      )}
      {!story.deltas.length ? (
        <Empty title="没有待审核的变更">
          <p>当前变化已处理或恢复已清空候选。审核记录保留在版本快照中。</p>
          <div className="actions">
            <Link
              className="button primary"
              href={`/stories/${story.id}/state`}
            >
              查看 Current State
            </Link>
            <Link
              className="button secondary"
              href={`/stories/${story.id}/history`}
            >
              查看 Version History
            </Link>
            <Link
              className="button secondary"
              href={`/stories/${story.id}/workspace`}
            >
              Back to Workspace
            </Link>
          </div>
        </Empty>
      ) : (
        <>
          <p className="review-run-summary">
            Chapter {story.reviewSource?.chapter ?? 13} · {canonical.length}{" "}
            Canonical 候选 · {pending} 等待决定 · Source revision{" "}
            {story.loop?.activeRun?.sourceRevision.revisionNumber ?? "fixture"}
            {story.loop?.activeRun && (
              <>
                {" "}
                · {story.loop.activeRun.provider.modelId} ·{" "}
                {story.loop.activeRun.timing.durationMs}ms ·{" "}
                {story.loop.activeRun.compilerIssues.length} compiler issues ·{" "}
                {story.loop.activeRun.warnings.length} warnings
              </>
            )}
          </p>
          <div className="toolbar review-filters">
            <div className="tabs" aria-label="筛选状态变化">
              {filters.map((f) => (
                <button
                  key={f}
                  className={filter === f ? "active" : ""}
                  aria-pressed={filter === f}
                  onClick={() => setFilter(f)}
                >
                  {f}{" "}
                  <span>
                    {
                      story.deltas.filter((d) =>
                        matchesReviewFilter(story, d, f),
                      ).length
                    }
                  </span>
                </button>
              ))}
            </div>
          </div>
          <p className="review-filter-note">
            Rejected 包含建议拒绝与已拒绝的候选；你的最终决定单独显示。
          </p>
          {groups.map((category) => {
            const changes = filtered.filter(
              (d) =>
                story.entities.find((e) => e.id === d.entityId)?.category ===
                category,
            );
            return changes.length ? (
              <section className="diff-group" key={category}>
                <h2>
                  {category}
                  <span>{changes.length}</span>
                </h2>
                {changes.map((d) => (
                  <StateDiffRow
                    key={d.id}
                    story={story}
                    delta={d}
                    onDecision={decision}
                  />
                ))}
              </section>
            ) : null;
          })}
          {filtered.some(
            (d) =>
              !groups.includes(
                story.entities.find((e) => e.id === d.entityId)?.category ?? "",
              ),
          ) && (
            <section className="diff-group">
              <h2>需核对的旧候选</h2>
              {filtered
                .filter(
                  (d) =>
                    !groups.includes(
                      story.entities.find((e) => e.id === d.entityId)
                        ?.category ?? "",
                    ),
                )
                .map((d) => (
                  <StateDiffRow
                    key={d.id}
                    story={story}
                    delta={d}
                    onDecision={decision}
                  />
                ))}
            </section>
          )}
          {!filtered.length && (
            <Empty title="当前筛选下没有变化">切换 All 查看全部候选。</Empty>
          )}
          <div className="commit-bar">
            <div>
              <strong>
                {canonical.filter((d) => d.decision === "accepted").length}{" "}
                条已接受 ·{" "}
                {canonical.filter((d) => d.decision === "rejected").length}{" "}
                条已拒绝
              </strong>
              <p>
                {pending
                  ? "请处理所有 Canonical 候选；冲突与证据不足的候选需拒绝。"
                  : "只有已接受且通过检查的变化可提交；Soft / No change 不写入状态。"}
              </p>
            </div>
            <button
              className="button primary"
              disabled={
                !storyStateService.canCommit(story) || busy === "commit"
              }
              onClick={commit}
            >
              {busy === "commit"
                ? "Committing & refreshing…"
                : "Commit accepted changes"}
              <Icon name="arrow" size={15} />
            </button>
          </div>
          <p className="list-note">
            Recommendation ≠ Decision · Event ≠ State · Soft Interpretation ≠
            Canonical State
          </p>
        </>
      )}
    </div>
  );
}
