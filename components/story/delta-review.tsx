"use client";
import Link from "next/link";
import { useState } from "react";
import {
  canCommit,
  commitMock,
  type Story,
  type Delta,
} from "@/lib/mock-story";
import type { Update } from "./types";
import { Empty, Icon, PageIntro, StatusPill } from "../product-ui";
import { StoryMeta } from "./story-meta";
export function DeltaReview({
  story,
  update,
}: {
  story: Story;
  update: Update;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [filter, setFilter] = useState("all");
  const [message, setMessage] = useState("");
  const decision = (id: string, next: Delta["decision"]) =>
    update((s) => ({
      ...s,
      deltas: s.deltas.map((d) => (d.id === id ? { ...d, decision: next } : d)),
    }));
  const pending = story.deltas.filter((d) => d.decision === "pending").length;
  const filtered = story.deltas.filter(
    (d) =>
      filter === "all" ||
      (filter === "pending" ? d.decision === "pending" : d.risk !== "normal"),
  );
  return (
    <>
      <PageIntro
        eyebrow="DELTA REVIEW"
        title="Proposed State Changes"
        description="Writer Output ≠ Current State。逐项检查 Evidence、Reason 与 Risk，再决定是否写入 Canonical State。"
      />
      <StoryMeta story={story} />
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      {!story.deltas.length ? (
        <Empty title="没有待审核的变更">
          <p>当前没有 Proposed Delta。返回 Workspace 查看当前 State 与任务。</p>
          <div className="actions">
            <Link
              className="button primary"
              href={`/stories/${story.id}/workspace`}
            >
              Back to Workspace
            </Link>
            <Link
              className="button secondary"
              href={`/stories/${story.id}/history`}
            >
              查看 Version History
            </Link>
          </div>
        </Empty>
      ) : (
        <>
          <div className="review-summary">
            <div>
              <strong>{story.deltas.length.toString().padStart(2, "0")}</strong>
              <span>提出的变化</span>
            </div>
            <div>
              <strong>{pending.toString().padStart(2, "0")}</strong>
              <span>等待决定</span>
            </div>
            <div>
              <strong className="amber">
                {story.deltas
                  .filter((d) => d.risk === "high")
                  .length.toString()
                  .padStart(2, "0")}
              </strong>
              <span>高风险变化</span>
            </div>
            <div>
              <strong className="red">
                {story.deltas
                  .filter(
                    (d) =>
                      d.risk === "conflict" &&
                      !d.resolved &&
                      d.decision !== "rejected",
                  )
                  .length.toString()
                  .padStart(2, "0")}
              </strong>
              <span>未解决冲突</span>
            </div>
            <span className="push-right text-muted">
              来源：第 13 章固定输出示例
            </span>
          </div>
          <div className="toolbar">
            <div className="tabs">
              {[
                ["all", "全部变化"],
                ["pending", "待处理"],
                ["risk", "高风险与冲突"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  aria-pressed={filter === id}
                  className={filter === id ? "active" : ""}
                  onClick={() => setFilter(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <span className="text-muted">Accept / Edit / Reject</span>
          </div>
          <div className="delta-list">
            {filtered.map((d, i) => (
              <article
                key={d.id}
                className={`delta-row ${d.risk} ${d.decision}`}
              >
                <div className="delta-number">
                  {String(i + 1).padStart(2, "0")}
                </div>
                <div className="delta-body">
                  <header>
                    <h2>
                      {story.entities.find((e) => e.id === d.entityId)?.name}
                      <span>/ {d.field}</span>
                    </h2>
                    <StatusPill
                      tone={
                        d.risk === "conflict"
                          ? "bad"
                          : d.risk === "high"
                            ? "warn"
                            : "neutral"
                      }
                    >
                      {d.risk === "conflict"
                        ? d.resolved
                          ? "Conflict · 已修订"
                          : "Conflict · 知识边界"
                        : d.risk === "high"
                          ? "高风险 · 关键道具"
                          : "普通变化"}
                    </StatusPill>
                    <StatusPill
                      tone={
                        d.decision === "accepted"
                          ? "good"
                          : d.decision === "rejected"
                            ? "bad"
                            : "neutral"
                      }
                    >
                      {d.decision === "accepted"
                        ? "已接受"
                        : d.decision === "rejected"
                          ? "已拒绝"
                          : "待审核"}
                    </StatusPill>
                  </header>
                  <div className="delta-values">
                    <span className="before">{d.before}</span>
                    <Icon name="arrow" size={17} />
                    <span className="after">{d.after}</span>
                  </div>
                  <p>{d.reason}</p>
                  <blockquote>
                    <span>证据 · CH.13</span>“{d.evidence}”
                  </blockquote>
                  {d.note && <p className="teal">修订说明：{d.note}</p>}
                  {editing === d.id && (
                    <form
                      className="delta-editor"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (
                          !value.trim() ||
                          (d.risk === "conflict" && !note.trim())
                        )
                          return;
                        update((s) => ({
                          ...s,
                          deltas: s.deltas.map((item) =>
                            item.id === d.id
                              ? {
                                  ...item,
                                  after: value.trim(),
                                  note: note.trim(),
                                  resolved: true,
                                  decision: "pending",
                                }
                              : item,
                          ),
                        }));
                        setEditing(null);
                      }}
                    >
                      <label>
                        修订后的值
                        <input
                          autoFocus
                          value={value}
                          required
                          maxLength={160}
                          onChange={(e) => setValue(e.target.value)}
                        />
                      </label>
                      <label>
                        修订说明{" "}
                        {d.risk === "conflict" ? "（冲突必填）" : "（可选）"}
                        <input
                          value={note}
                          maxLength={300}
                          required={d.risk === "conflict"}
                          onChange={(e) => setNote(e.target.value)}
                          placeholder="说明证据实际支持的状态"
                        />
                      </label>
                      <div className="actions">
                        <button className="button primary small">
                          保存修订
                        </button>
                        <button
                          type="button"
                          className="button secondary small"
                          onClick={() => setEditing(null)}
                        >
                          取消
                        </button>
                      </div>
                    </form>
                  )}
                </div>
                <div className="delta-actions">
                  <button
                    className="button secondary small accept"
                    disabled={
                      editing === d.id ||
                      (d.risk === "conflict" && !d.resolved) ||
                      d.decision === "accepted"
                    }
                    title={
                      d.risk === "conflict" && !d.resolved
                        ? "先修订冲突或拒绝此条变化"
                        : undefined
                    }
                    onClick={() => decision(d.id, "accepted")}
                  >
                    <Icon name="check" size={13} />
                    Accept
                  </button>
                  <button
                    className="button secondary small"
                    onClick={() => {
                      setEditing(d.id);
                      setValue(d.after);
                      setNote(d.note ?? "");
                    }}
                  >
                    Edit
                  </button>
                  <button
                    className="button secondary small"
                    disabled={editing === d.id || d.decision === "rejected"}
                    onClick={() => decision(d.id, "rejected")}
                  >
                    Reject
                  </button>
                </div>
              </article>
            ))}
          </div>
          {!filtered.length && (
            <Empty title="当前筛选下没有变更">
              切换“全部变化”查看已处理的条目。
            </Empty>
          )}
          <div className="commit-bar">
            <div>
              <strong>
                {story.deltas.filter((d) => d.decision === "accepted").length}{" "}
                条已接受 ·{" "}
                {story.deltas.filter((d) => d.decision === "rejected").length}{" "}
                条已拒绝
              </strong>
              <p>
                {pending
                  ? "请逐条处理所有变更；冲突需要修订或拒绝。"
                  : "确认后，接受的变化将更新本地状态并生成版本。"}
              </p>
            </div>
            <button
              className="button primary"
              disabled={!canCommit(story) || editing !== null}
              onClick={() => {
                update((s) => commitMock(s, new Date().toISOString()));
                setMessage(
                  "模拟提交已完成。当前状态与版本历史已同步，未调用后端。",
                );
              }}
            >
              Commit accepted changes
              <Icon name="arrow" size={15} />
            </button>
          </div>
          <p className="list-note">
            审核决定保存在本地；只有模拟提交才会更新 Current State。
          </p>
        </>
      )}
    </>
  );
}
