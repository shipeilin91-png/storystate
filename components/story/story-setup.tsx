"use client";
import Link from "next/link";
import { useState } from "react";
import { importOptions, initializeStory, type Story } from "@/lib/mock-story";
import type { Update } from "./types";
import { Icon, PageIntro, StatusPill } from "../product-ui";
export function Setup({ story, update }: { story: Story; update: Update }) {
  const [title, setTitle] = useState(story.title);
  const [description, setDescription] = useState(story.description);
  const [saved, setSaved] = useState(false);
  return (
    <>
      <PageIntro
        eyebrow={story.ready ? "STORY SETTINGS" : "STORY SETUP"}
        title={
          story.ready ? "Sources & Story Settings" : "为故事建立共同的起点"
        }
        description={
          story.ready
            ? "维护故事信息与来源。当前 Canonical State 不会因修改来源自动变化。"
            : "把已有章节、人物与世界观组织在一起。故事的记忆，从这里开始。"
        }
      />
      <div className="setup-grid">
        <div>
          <form
            className="document-section"
            onSubmit={(e) => {
              e.preventDefault();
              if (title.trim()) {
                update((s) => ({
                  ...s,
                  title: title.trim(),
                  description,
                  updated: new Date().toISOString(),
                }));
                setSaved(true);
              }
            }}
          >
            <div className="section-heading">
              <h2>
                <span className="section-number">01</span>故事基础信息
              </h2>
              <StatusPill>{story.ready ? "已建立" : "草稿"}</StatusPill>
            </div>
            <label>
              故事名称
              <input
                required
                maxLength={80}
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setSaved(false);
                }}
              />
            </label>
            <label>
              故事简介
              <textarea
                rows={3}
                maxLength={500}
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  setSaved(false);
                }}
              />
            </label>
            <div className="actions">
              <button className="button secondary" disabled={!title.trim()}>
                保存信息
              </button>
              {saved && (
                <span className="teal" role="status">
                  已保存到本地
                </span>
              )}
            </div>
          </form>
          <section className="document-section">
            <div className="section-heading">
              <h2>
                <span className="section-number">02</span>导入故事资料
              </h2>
              <span className="text-muted">示例资料</span>
            </div>
            <p className="description">
              本阶段使用《雾港》示例包，不上传文件、不解析内容。
            </p>
            {importOptions.map((option, i) => (
              <div className="import-row" key={option}>
                <span className="file-icon">
                  <Icon
                    name={i === 0 ? "stories" : i === 1 ? "state" : "setup"}
                    size={20}
                  />
                </span>
                <div>
                  <strong>{option}</strong>
                  <small>
                    {
                      [
                        "fog-harbor_chapters.txt · 示例章节",
                        "characters.md · 示例人物设定",
                        "story-bible.md · 示例港城背景",
                      ][i]
                    }
                  </small>
                </div>
                <button
                  className="button secondary small"
                  disabled={story.imports.includes(option)}
                  onClick={() =>
                    update((s) => ({
                      ...s,
                      imports: [...new Set([...s.imports, option])],
                    }))
                  }
                >
                  {story.imports.includes(option) ? "已载入" : "载入示例"}
                </button>
              </div>
            ))}
          </section>
        </div>
        <aside className="setup-progress">
          <p className="eyebrow">INITIAL STATE</p>
          <h2>{story.ready ? "初始状态已就绪" : "建立你的故事记忆"}</h2>
          <p>每一条状态，都应有它的出处。</p>
          <div className="progress-track">
            <span
              style={{
                width: `${story.ready ? 100 : (story.imports.length / 4) * 100}%`,
              }}
            />
          </div>
          <ol className="steps">
            {["载入章节资料", "载入人物设定", "载入世界观", "确认初始状态"].map(
              (s, i) => (
                <li
                  key={s}
                  className={
                    (
                      i === 3
                        ? story.ready
                        : story.imports.includes(importOptions[i])
                    )
                      ? "done"
                      : ""
                  }
                >
                  <span>
                    {(
                      i === 3
                        ? story.ready
                        : story.imports.includes(importOptions[i])
                    ) ? (
                      <Icon name="check" size={13} />
                    ) : (
                      i + 1
                    )}
                  </span>
                  {s}
                </li>
              ),
            )}
          </ol>
          {story.ready ? (
            <Link
              className="button primary"
              href={`/stories/${story.id}/workspace`}
            >
              返回 Workspace
              <Icon name="arrow" size={15} />
            </Link>
          ) : (
            <button
              className="button primary"
              disabled={story.imports.length < 3}
              onClick={() => update(initializeStory)}
            >
              建立初始状态（模拟）
            </button>
          )}
          <small>初始状态为预置示例，不代表真实 AI 抽取结果。</small>
        </aside>
      </div>
    </>
  );
}
