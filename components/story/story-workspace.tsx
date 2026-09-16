"use client";
import Link from "next/link";
import { useState } from "react";
import type { Story } from "@/lib/mock-story";
import { storyStateService } from "@/lib/frontend/story-state-service";
import type { Update } from "./types";
import { Empty, Icon, PageIntro, StatusPill } from "../product-ui";
import { StoryMeta } from "./story-meta";
import { ContextInspector } from "./context-inspector";

type ExtractionView =
  "idle" | "loading" | "review_required" | "no_changes" | "error";

export function WritingWorkspace({
  story,
  update,
}: {
  story: Story;
  update: Update;
}) {
  const [preview, setPreview] = useState(true);
  const [content, setContent] = useState(
    story.loop?.sourceContent ?? story.reviewSource?.output ?? "",
  );
  const [status, setStatus] = useState<ExtractionView>(
    story.loop?.activeRun?.status === "failed"
      ? "error"
      : (story.loop?.activeRun?.status ?? "idle"),
  );
  const [error, setError] = useState("");
  const source = story.reviewSource ?? {
    chapter: story.chapter + 1,
    title: "新增 Story Content",
    output: content,
  };

  const extract = async () => {
    setStatus("loading");
    setError("");
    try {
      const result = await storyStateService.extract(story, {
        storyId: story.id,
        title: `Chapter ${story.chapter + 1} · Story Content`,
        chapter: story.chapter + 1,
        expectedStateVersion: story.currentStateVersion,
        content,
      });
      update(() => result.story);
      setStatus(
        result.run?.status === "failed"
          ? "error"
          : (result.run?.status ?? "error"),
      );
    } catch (cause) {
      setStatus("error");
      setError(
        cause instanceof Error ? cause.message : "抽取失败，请稍后重试。",
      );
    }
  };

  return (
    <>
      <PageIntro
        eyebrow="WRITING WORKSPACE"
        title={story.title}
        description={`Chapter ${story.chapter + 1} · Current State v${story.currentStateVersion} · 从准确的上下文继续写作。`}
      />
      {story.loop?.lastCommit && (
        <p className="notice state-updated" role="status">
          <Icon name="check" size={16} />
          State 与 History 已刷新至 v{story.currentStateVersion}
        </p>
      )}
      <StoryMeta story={story} />
      <div className="writing-grid">
        <section className="writing-main">
          <div className="section-heading">
            <h2>Writing task</h2>
            <StatusPill>第 {story.chapter + 1} 章 · 草稿</StatusPill>
          </div>
          <label htmlFor="writing-prompt" className="text-muted">
            当前任务 / Prompt
          </label>
          <textarea
            id="writing-prompt"
            className="prompt"
            rows={5}
            value={story.prompt}
            onChange={(event) =>
              update((current) => ({ ...current, prompt: event.target.value }))
            }
          />
          <div className="prompt-footer">
            <span>本地自动保存 · {story.prompt.length} 字</span>
            <button
              className="text-button"
              onClick={() => setPreview(!preview)}
            >
              {preview ? "收起 Story Content" : "展开 Story Content"}
              <Icon name="chevron" size={13} />
            </button>
          </div>
          <div className="writer-document">
            <header>
              <span className="eyebrow">STORY CONTENT / SOURCE REVISION</span>
              <StatusPill tone={story.loop?.activeRun ? "good" : "neutral"}>
                {story.loop?.activeRun
                  ? `Revision ${story.loop.activeRun.sourceRevision.revisionNumber}`
                  : "Draft"}
              </StatusPill>
            </header>
            {preview ? (
              <div className="story-content-editor">
                <div className="chapter-title">
                  <small>CHAPTER {story.chapter + 1}</small>
                  <h2>{source.title}</h2>
                  <div />
                </div>
                <label htmlFor="story-content" className="text-muted">
                  新增 Story Content
                </label>
                <textarea
                  id="story-content"
                  rows={13}
                  value={content}
                  onChange={(event) => {
                    setContent(event.target.value);
                    setStatus("idle");
                    setError("");
                  }}
                  placeholder="粘贴或输入本章新增内容。抽取只产生审核候选，不会自动 Commit。"
                />
                <div className="extraction-actions">
                  <div>
                    <strong>{content.trim().length} 字</strong>
                    <p>
                      Extract → Review → Decision →
                      Commit，推荐不会自动成为决定。
                    </p>
                  </div>
                  <button
                    className="button primary"
                    disabled={status === "loading" || !content.trim()}
                    onClick={extract}
                  >
                    {status === "loading"
                      ? "Extracting…"
                      : "Extract State Changes"}
                    <Icon name="arrow" size={15} />
                  </button>
                </div>
                {status === "loading" && (
                  <p className="notice" role="status">
                    正在编译候选并运行校验… Canonical State 尚未改变。
                  </p>
                )}
                {status === "error" && (
                  <div className="notice warn" role="alert">
                    <Icon name="warning" size={16} />
                    <span>{error || "抽取失败，请重试。"}</span>
                    <button
                      className="button secondary small"
                      onClick={extract}
                    >
                      重试
                    </button>
                  </div>
                )}
                {status === "no_changes" && (
                  <Empty title="No state changes">
                    当前内容没有形成可审核的 Canonical State
                    变化。可继续补充内容后再次抽取。
                  </Empty>
                )}
                {status === "idle" && story.deltas.length > 0 && (
                  <div className="proposed-change-bar">
                    <div>
                      <strong>
                        StoryState detected {story.deltas.length} proposed
                        changes
                      </strong>
                      <p>已有候选等待决定；重新 Extract 会开启新的审核轮次。</p>
                    </div>
                    <Link
                      className="button secondary"
                      href={`/stories/${story.id}/review`}
                    >
                      Review {story.deltas.length} changes{" "}
                      <Icon name="arrow" size={15} />
                    </Link>
                  </div>
                )}
                {status === "review_required" && story.loop?.activeRun && (
                  <div className="proposed-change-bar" role="status">
                    <div>
                      <strong>
                        Review required ·{" "}
                        {story.loop.activeRun.candidates.length} proposed
                        changes
                      </strong>
                      <p>
                        Extraction 已完成，尚未 Commit；请逐条 Accept 或
                        Reject。
                      </p>
                    </div>
                    <Link
                      className="button primary"
                      href={`/stories/${story.id}/review`}
                    >
                      Review State Diff <Icon name="arrow" size={15} />
                    </Link>
                  </div>
                )}
              </div>
            ) : (
              <Empty title="Story Content 已收起">
                点击“展开 Story Content”继续编辑。
              </Empty>
            )}
          </div>
        </section>
        <ContextInspector story={story} />
      </div>
    </>
  );
}
