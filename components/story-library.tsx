"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useStories } from "./story-provider";
import { Empty, Icon, PageIntro, StatusPill } from "./product-ui";
import { newStory } from "@/lib/mock-story";
export function StoryLibrary() {
  const { stories, add, ready } = useStories();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [filter, setFilter] = useState("all");
  const filtered = stories
    .filter(
      (s) =>
        s.title.toLowerCase().includes(query.toLowerCase()) &&
        (filter === "all" || (filter === "ready" ? s.ready : !s.ready)),
    )
    .toSorted((a, b) => b.updated.localeCompare(a.updated));
  return (
    <div className="page library">
      <PageIntro
        eyebrow="STORY LIBRARY"
        title="让故事继续，让状态有据可循。"
        description="人物知道什么、线索走到哪里、每次变化因何发生。都在这里。"
        action={
          <button
            className="button primary"
            disabled={!ready}
            onClick={() => setCreating(!creating)}
          >
            <Icon name="plus" size={16} />
            新建 Story
          </button>
        }
      />
      <section className="library-feature">
        <div>
          <span className="eyebrow">A HOME FOR YOUR STORY’S MEMORY</span>
          <h2>
            故事向前，
            <br />
            上下文始终在场。
          </h2>
          <p>
            将散落的设定与章节，组织成可查看、
            <br />
            可审核、可追溯的故事状态。
          </p>
          <Link
            href={`/stories/${stories[0].id}/${stories[0].ready ? "workspace" : "setup"}`}
            className="text-button"
          >
            {stories[0].ready
              ? "继续《" + stories[0].title + "》"
              : "建立第一个故事状态"}
            <Icon name="arrow" size={16} />
          </Link>
        </div>
        <div
          className="state-map"
          aria-label="故事从章节证据进入当前状态，再经过变更审核形成新版本"
        >
          <div className="map-grid" />
          <span className="map-label">STORY MEMORY / 001</span>
          <div className="map-node n1">
            <Icon name="stories" />
            <span>
              章节与设定<small>Source evidence</small>
            </span>
          </div>
          <div className="map-node n2">
            <span className="map-state-icon">
              <Icon name="state" />
            </span>
            <span>
              当前 Story State<small>One shared source of truth</small>
            </span>
            <span className="live-dot" />
          </div>
          <div className="map-node n3">
            <Icon name="review" />
            <span>
              变更审核<small>Review before commit</small>
            </span>
          </div>
          <div className="map-line l1" />
          <div className="map-line l2" />
          <span className="map-note">Context → Writer → Delta → State</span>
        </div>
      </section>
      {creating && (
        <form
          className="create-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!title.trim()) return;
            const story = newStory(crypto.randomUUID(), title, description);
            add(story);
            router.push(`/stories/${story.id}/setup`);
          }}
        >
          <h2>新建 Story</h2>
          <label>
            故事名称
            <input
              autoFocus
              value={title}
              maxLength={80}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="为你的故事命名"
            />
          </label>
          <label>
            一句话简介
            <input
              value={description}
              maxLength={240}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="这个故事从哪里开始？"
            />
          </label>
          <div className="actions">
            <button className="button primary" disabled={!title.trim()}>
              创建并进入设定
            </button>
            <button
              type="button"
              className="button secondary"
              onClick={() => setCreating(false)}
            >
              取消
            </button>
          </div>
        </form>
      )}
      <div className="section-heading">
        <h2>
          你的故事 <span>{stories.length.toString().padStart(2, "0")}</span>
        </h2>
        <span className="text-muted">按最近更新排序</span>
      </div>
      <div className="toolbar">
        <div className="tabs">
          {[
            ["all", "全部故事"],
            ["ready", "进行中"],
            ["setup", "待建立"],
          ].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setFilter(id)}
              className={filter === id ? "active" : ""}
              aria-pressed={filter === id}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="search">
          <Icon name="search" size={16} />
          <input
            aria-label="搜索故事"
            placeholder="搜索故事…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <span>⌕</span>
        </label>
      </div>
      <div className="table-shell">
        <table className="library-table">
          <thead>
            <tr>
              <th>故事 / STORY</th>
              <th>当前进度</th>
              <th>状态</th>
              <th>最近更新</th>
              <th>
                <span className="sr-only">打开故事</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr key={s.id}>
                <td>
                  <div className="story-cell">
                    <span className="story-cover">
                      {s.title[0]}
                      <small>STORY</small>
                    </span>
                    <div>
                      <Link
                        className="story-title"
                        href={`/stories/${s.id}/${s.ready ? "workspace" : "setup"}`}
                      >
                        {s.title}
                      </Link>
                      <small>{s.genre}</small>
                      <p>{s.description || "尚未添加故事简介"}</p>
                    </div>
                  </div>
                </td>
                <td>
                  <strong>{s.ready ? `第 ${s.chapter} 章` : "尚未开始"}</strong>
                  <small>
                    {s.entities.length} 条状态 · {s.versions.length} 个版本
                  </small>
                </td>
                <td>
                  <StatusPill tone={s.ready ? "good" : "warn"}>
                    {s.ready ? "进行中" : "待建立"}
                  </StatusPill>
                  {s.deltas.length > 0 && (
                    <small className="amber">
                      {s.deltas.length} 条变更待审核
                    </small>
                  )}
                </td>
                <td>
                  <span>{s.updated.slice(0, 10)}</span>
                  <small>{s.updated.slice(11, 16)}</small>
                </td>
                <td>
                  <Link
                    className="icon-link"
                    aria-label={`打开${s.title}`}
                    href={`/stories/${s.id}/${s.ready ? "workspace" : "setup"}`}
                  >
                    <Icon name="arrow" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <Empty title="没有匹配的故事">试试其他名称，或新建一个 Story。</Empty>
        )}
      </div>
      <div className="library-footnote">
        <Icon name="info" size={15} />
        <p>
          这是你的故事状态工作台。先导入已有故事，再为下一次创作准备准确的上下文。
        </p>
      </div>
    </div>
  );
}
