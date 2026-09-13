"use client";
import Link from "next/link";
import { useState } from "react";
import { writerOutput, type Story } from "@/lib/mock-story";
import type { Update } from "./types";
import { Empty, Icon, PageIntro, StatusPill } from "../product-ui";
import { StoryMeta } from "./story-meta";
import { ContextInspector } from "./context-inspector";
export function WritingWorkspace({
  story,
  update,
}: {
  story: Story;
  update: Update;
}) {
  const [preview, setPreview] = useState(true);
  return (
    <>
      <PageIntro
        eyebrow="WRITING WORKSPACE"
        title={story.title}
        description={`Chapter ${story.chapter + 1} · Current State v${story.currentStateVersion} · 从准确的上下文继续写作。`}
      />
      {story.versions.length > 1 && story.currentStateVersion > 12 && (
        <p className="notice state-updated" role="status">
          <Icon name="check" size={16} />
          State updated · v{story.versions[1].stateVersion} → v
          {story.currentStateVersion}
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
            onChange={(e) => update((s) => ({ ...s, prompt: e.target.value }))}
          />
          <div className="prompt-footer">
            <span>本地自动保存 · {story.prompt.length} 字</span>
            <button
              className="text-button"
              onClick={() => setPreview(!preview)}
            >
              {preview ? "收起示例输出" : "查看示例输出"}
              <Icon name="chevron" size={13} />
            </button>
          </div>
          <div className="writer-document">
            <header>
              <span className="eyebrow">EXISTING WRITER / OUTPUT PREVIEW</span>
              <StatusPill>固定示例</StatusPill>
            </header>
            {preview ? (
              <>
                <div className="chapter-title">
                  <small>CHAPTER 13</small>
                  <h2>急诊室的交接</h2>
                  <div />
                </div>
                <div className="prose">
                  {writerOutput.split("\n\n").map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                </div>
                <div className="document-end">◇</div>
                <p className="writer-note">
                  这段固定示例用于审核演示，不随 Prompt 生成。Writer Output
                  不会直接修改 Current State。
                </p>
                <div className="proposed-change-bar">
                  <div>
                    <strong>
                      StoryState detected {story.deltas.length} proposed changes
                    </strong>
                    <p>Review 与 Commit 后才会写入 Canonical State。</p>
                  </div>
                  <Link
                    className="button primary"
                    href={`/stories/${story.id}/review`}
                  >
                    Review {story.deltas.length} changes{" "}
                    <Icon name="arrow" size={15} />
                  </Link>
                </div>
              </>
            ) : (
              <Empty title="示例输出已收起">点击“查看示例输出”重新展开。</Empty>
            )}
          </div>
        </section>
        <ContextInspector story={story} />
      </div>
    </>
  );
}
