"use client";
import Link from "next/link";
import { useState } from "react";
import { useStories } from "./story-provider";
import {
  categories,
  canCommit,
  commitMock,
  importOptions,
  initializeStory,
  rollbackMock,
  writerOutput,
  type Story,
  type Category,
  type Delta,
  type Version,
} from "@/lib/mock-story";
import { Empty, Icon, PageIntro, StatusPill } from "./product-ui";
type Update = (fn: (s: Story) => Story) => void;
export function StoryScreen({
  storyId,
  view,
}: {
  storyId: string;
  view: string;
}) {
  const { stories, ready, update } = useStories();
  const story = stories.find((s) => s.id === storyId);
  if (!ready)
    return (
      <div className="page">
        <p role="status">正在打开故事工作台…</p>
      </div>
    );
  if (!story)
    return (
      <Empty title="未找到这个 Story">
        <p>故事可能只保存在另一台设备的浏览器中。</p>
        <Link href="/" className="button secondary">
          返回故事库
        </Link>
      </Empty>
    );
  const mutate: Update = (fn) => update(storyId, fn);
  if (view !== "setup" && !story.ready)
    return (
      <div className="page">
        <Empty title="先建立故事的初始状态">
          <p>导入示例章节与设定，即可开始探索状态。</p>
          <Link className="button primary" href={`/stories/${storyId}/setup`}>
            进入设定与导入
          </Link>
        </Empty>
      </div>
    );
  return (
    <div className={`page ${view}-page`} key={storyId}>
      {view === "setup" ? (
        <Setup story={story} update={mutate} />
      ) : view === "state" ? (
        <StateExplorer story={story} />
      ) : view === "workspace" ? (
        <WritingWorkspace story={story} update={mutate} />
      ) : view === "review" ? (
        <DeltaReview story={story} update={mutate} />
      ) : (
        <History story={story} update={mutate} />
      )}
    </div>
  );
}
function StoryMeta({ story }: { story: Story }) {
  return (
    <div className="story-meta">
      <span className="live-dot" />《{story.title}》<span>／</span>第{" "}
      {story.chapter} 章后<StatusPill tone="good">当前状态</StatusPill>
      <span className="push-right">{story.entities.length} 条状态记录</span>
    </div>
  );
}
function Setup({ story, update }: { story: Story; update: Update }) {
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
function StateExplorer({ story }: { story: Story }) {
  const [category, setCategory] = useState<Category>("Characters");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("lin");
  const rows = story.entities.filter(
    (e) =>
      e.category === category &&
      (e.name + Object.values(e.fields).join(" "))
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const selected = rows.find((e) => e.id === selectedId) ?? rows[0];
  return (
    <>
      <PageIntro
        eyebrow="STATE EXPLORER"
        title="Current Truth"
        description="StoryState 当前认为故事世界是什么状态。这里只展示已经 Commit 的 Canonical State。"
      />
      <StoryMeta story={story} />
      <div className="truth-legend">
        <div>
          <StatusPill tone="good">HARD STATE</StatusPill>
          <span>Canonical Current Truth · 已确认事实</span>
        </div>
        <div>
          <StatusPill tone="warn">INTERPRETATION</StatusPill>
          <span>Not canonical unless confirmed</span>
        </div>
      </div>
      {category === "Knowledge" && (
        <section className="knowledge-boundary">
          <header>
            <span className="eyebrow">KNOWLEDGE BOUNDARY</span>
            <h2>World Truth ≠ Character Knowledge</h2>
          </header>
          <div className="world-truth">
            <small>WORLD TRUTH</small>
            <strong>陈默真实身份：卧底</strong>
            <span>Canonical</span>
          </div>
          <div className="knowledge-people">
            <div>
              <strong>林夏</strong>
              <StatusPill tone="warn">Suspects</StatusPill>
              <small>只有怀疑，没有确认</small>
            </div>
            <div>
              <strong>陈默</strong>
              <StatusPill tone="good">Knows</StatusPill>
              <small>本人知情</small>
            </div>
            <div>
              <strong>顾言</strong>
              <StatusPill>Unaware</StatusPill>
              <small>尚无知情证据</small>
            </div>
          </div>
        </section>
      )}
      <div className="category-tabs" aria-label="状态类别">
        {categories.map((c) => (
          <button
            key={c}
            aria-pressed={c === category}
            className={c === category ? "active" : ""}
            onClick={() => {
              setCategory(c);
              setQuery("");
            }}
          >
            {c}
            <span>{story.entities.filter((e) => e.category === c).length}</span>
          </button>
        ))}
      </div>
      <div className="explorer">
        <section className="entity-list">
          <div className="toolbar">
            <strong>{category}</strong>
            <label className="search">
              <Icon name="search" size={15} />
              <input
                aria-label="搜索状态"
                placeholder="搜索名称或状态…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
          </div>
          <div className="entity-table">
            <div className="entity-header">
              <span>实体 / 当前状态</span>
              <span>来源</span>
            </div>
            {rows.map((e) => (
              <button
                key={e.id}
                className={`entity-row ${selected?.id === e.id ? "selected" : ""}`}
                onClick={() => setSelectedId(e.id)}
                aria-pressed={selected?.id === e.id}
              >
                <div>
                  <strong>{e.name}</strong>
                  <p>{e.summary}</p>
                  <div className="field-chips">
                    {Object.entries(e.fields)
                      .slice(0, 2)
                      .map(([k, v]) => (
                        <span key={k}>
                          {k} <b>{v}</b>
                        </span>
                      ))}
                  </div>
                </div>
                <span className="source-ref">
                  CH.{String(e.chapter).padStart(2, "0")}
                  <Icon name="chevron" size={13} />
                </span>
              </button>
            ))}
          </div>
          {!rows.length && (
            <Empty title="没有匹配的状态">试试其他关键词。</Empty>
          )}
          <p className="list-note">
            {rows.length} 条记录 · 点击记录查看状态依据
          </p>
        </section>
        <aside className="inspector">
          {selected ? (
            <>
              <div className="inspector-heading">
                <span className="eyebrow">STATE INSPECTOR</span>
                <Icon name="info" size={16} />
              </div>
              <h2>{selected.name}</h2>
              <p className="description">
                {selected.category} / 第 {selected.chapter} 章后
              </p>
              <h3>当前事实</h3>
              <dl className="fact-list">
                {Object.entries(selected.fields).map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
              <h3>
                Evidence <span>来源证据</span>
              </h3>
              <blockquote>“{selected.evidence}”</blockquote>
              <span className="evidence-source">
                《{story.title}》 · Chapter {selected.chapter}
              </span>
              {selected.category === "Knowledge" && (
                <div className="notice warn">
                  <Icon name="warning" size={16} />
                  <p>
                    角色知识与世界事实分开记录。叙述者知道，不代表角色知道。
                  </p>
                </div>
              )}
              <div className="inspector-note">
                <Icon name="check" size={15} />
                <span>
                  已确认状态
                  <br />
                  <small>来自已提交的故事版本</small>
                </span>
              </div>
            </>
          ) : (
            <p className="description">选择一条记录以查看详情。</p>
          )}
        </aside>
      </div>
      <section className="soft-state">
        <div>
          <span className="eyebrow">SOFT INTERPRETATION</span>
          <h2>可能成立，但还不是事实</h2>
        </div>
        <p>“林夏似乎开始信任陈默。”</p>
        <p>“顾言可能有所隐瞒。”</p>
        <StatusPill tone="warn">Not canonical unless confirmed</StatusPill>
      </section>
    </>
  );
}
function WritingWorkspace({ story, update }: { story: Story; update: Update }) {
  const [tab, setTab] = useState("Current State");
  const [preview, setPreview] = useState(true);
  const contextTabs = [
    "Current State",
    "Knowledge Boundary",
    "Relevant Events",
    "Open Plot Threads",
    "Evidence",
    "Constraints",
  ];
  const stateRows = story.entities.filter((e) =>
    ["lin", "usb", "relation"].includes(e.id),
  );
  return (
    <>
      <PageIntro
        eyebrow="WRITING WORKSPACE"
        title={story.title}
        description={`Chapter ${story.chapter + 1} · Current State v${story.chapter} · 从准确的上下文继续写作。`}
      />
      {story.chapter > 12 && (
        <p className="notice state-updated" role="status">
          <Icon name="check" size={16} />
          State updated · v12 → v{story.chapter}
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
                  尚未更新 Current State。
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
        <aside className="context-panel">
          <div className="inspector-heading">
            <div>
              <p className="eyebrow">CONTEXT INSPECTOR</p>
              <h2>这次创作，知道什么？</h2>
            </div>
            <Icon name="state" size={21} />
          </div>
          <p className="description">
            基于第 {story.chapter} 章后状态的示例上下文。选择理由可逐项查看。
          </p>
          <div className="context-tabs">
            {contextTabs.map((t) => (
              <button
                key={t}
                className={t === tab ? "active" : ""}
                aria-pressed={t === tab}
                onClick={() => setTab(t)}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="context-content">
            <div className="section-heading">
              <h3>{tab}</h3>
              <StatusPill tone="good">已选入</StatusPill>
            </div>
            {tab === "Current State" &&
              stateRows.map((e) => (
                <div className="context-entry" key={e.id}>
                  <strong>{e.name}</strong>
                  <p>
                    {Object.entries(e.fields)
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(" · ")}
                  </p>
                  <small>
                    为什么选入：本章涉及此人物、交接道具或人物间的信任。
                  </small>
                </div>
              ))}
            {tab === "Knowledge Boundary" && (
              <>
                <div className="notice warn">
                  <Icon name="warning" size={17} />
                  <p>保持林夏的有限视角</p>
                </div>
                <div className="context-entry knowledge-context">
                  <div className="world-truth">
                    <small>WORLD TRUTH</small>
                    <strong>陈默真实身份：卧底</strong>
                  </div>
                  <div className="knowledge-people compact">
                    <div>
                      <strong>林夏</strong>
                      <StatusPill tone="warn">Suspects</StatusPill>
                    </div>
                    <div>
                      <strong>陈默</strong>
                      <StatusPill tone="good">Knows</StatusPill>
                    </div>
                    <div>
                      <strong>顾言</strong>
                      <StatusPill>Unaware</StatusPill>
                    </div>
                  </div>
                  <small>
                    为什么选入：该事实限制林夏当前可以知道的信息，避免知识泄漏。
                  </small>
                </div>
                <p className="description">
                  可表现怀疑；“怀疑”并不等于“确认身份”。
                </p>
              </>
            )}
            {tab === "Relevant Events" &&
              story.entities
                .filter((e) => e.category === "Events")
                .map((e) => (
                  <div className="context-entry" key={e.id}>
                    <strong>
                      {e.name}{" "}
                      <span className="text-muted">/ CH.{e.chapter}</span>
                    </strong>
                    <p>{e.summary}</p>
                    <small>
                      为什么选入：提供这次医院会面的行动动机与前因。
                    </small>
                  </div>
                ))}
            {tab === "Open Plot Threads" &&
              story.entities
                .filter(
                  (e) =>
                    e.category === "Plot Threads" &&
                    e.fields.status !== "closed",
                )
                .map((e) => (
                  <div className="context-entry" key={e.id}>
                    <strong>
                      {e.name} <StatusPill>{e.fields.status}</StatusPill>
                    </strong>
                    <p>{e.fields.question}</p>
                    <small>
                      为什么选入：可推进的悬念；本章不应无依据地结案。
                    </small>
                  </div>
                ))}
            {tab === "Evidence" &&
              stateRows.map((e) => (
                <div className="context-entry" key={e.id}>
                  <strong>
                    {e.name} · Chapter {e.chapter}
                  </strong>
                  <blockquote>“{e.evidence}”</blockquote>
                  <small>为什么选入：让 Writer 的起始事实可追溯至原文。</small>
                </div>
              ))}
            {tab === "Constraints" && (
              <ol className="constraint-list">
                <li>
                  <strong>不揭露卧底身份</strong>
                  <p>本章示例任务要求；需保持角色知识边界。</p>
                </li>
                <li>
                  <strong>USB 转移需要明确交接</strong>
                  <p>从当前持有者出发，不让关键物品凭空出现。</p>
                </li>
                <li>
                  <strong>不提前关闭失踪线索</strong>
                  <p>现有章节没有提供完整答案。</p>
                </li>
              </ol>
            )}
          </div>
          <div className="context-footer">
            <Icon name="info" size={15} />
            <p>选择理由为预置演示。真实上下文编译尚未接入。</p>
          </div>
        </aside>
      </div>
    </>
  );
}
function DeltaReview({ story, update }: { story: Story; update: Update }) {
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
          <p>新 State Version 已生成。返回 Workspace 继续下一轮写作。</p>
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
function History({ story, update }: { story: Story; update: Update }) {
  const [selectedId, setSelectedId] = useState<string | undefined>(
    story.versions[0]?.id,
  );
  const [rollback, setRollback] = useState<Version | null>(null);
  const [notice, setNotice] = useState("");
  const selected =
    story.versions.find((v) => v.id === selectedId) ?? story.versions[0];
  return (
    <>
      <PageIntro
        eyebrow="VERSION HISTORY"
        title="State Version History"
        description="沿着版本回看故事如何变化，检查每一次已确认的 State Delta。"
        action={
          <StatusPill tone="good">
            {story.versions.length} 个本地版本
          </StatusPill>
        }
      />
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      <div className="history-grid">
        <div>
          <div className="section-heading">
            <h2>故事时间线</h2>
            <span className="text-muted">最新在前</span>
          </div>
          <div className="timeline">
            {story.versions.map((v, i) => (
              <button
                key={v.id}
                className={`version-row ${selected?.id === v.id ? "selected" : ""}`}
                onClick={() => {
                  setSelectedId(v.id);
                  setRollback(null);
                }}
                aria-pressed={selected?.id === v.id}
              >
                <span className="timeline-dot" />
                <div className="version-meta">
                  <strong>State v{v.chapter}</strong>
                  <span>{v.date.replace("T", " ").slice(0, 16)}</span>
                </div>
                <h2>
                  第 {v.chapter} 章 · {v.title}
                </h2>
                <p>
                  {v.changes.length} 条状态变化 <span>· 已提交</span>
                </p>
                {i === 0 && <StatusPill tone="good">Current</StatusPill>}
                <Icon name="chevron" size={17} />
              </button>
            ))}
          </div>
        </div>
        <aside className="inspector history-inspector">
          {selected ? (
            <>
              <div className="inspector-heading">
                <p className="eyebrow">VERSION INSPECTOR</p>
                <Icon name="history" />
              </div>
              <h2>{selected.title}</h2>
              <p className="description">
                第 {selected.chapter} 章后 ·{" "}
                {selected.date.replace("T", " ").slice(0, 16)}
              </p>
              <h3>Committed State Delta</h3>
              <ul className="version-changes">
                {selected.changes.map((c, i) => (
                  <li key={i}>
                    <Icon name="check" size={14} />
                    {c}
                  </li>
                ))}
              </ul>
              <h3>状态快照</h3>
              <dl className="fact-list">
                <div>
                  <dt>状态记录</dt>
                  <dd>{selected.entities.length}</dd>
                </div>
                <div>
                  <dt>林夏位置</dt>
                  <dd>
                    {
                      selected.entities.find((e) => e.id === "lin")?.fields
                        .location
                    }
                  </dd>
                </div>
                <div>
                  <dt>USB 持有者</dt>
                  <dd>
                    {
                      selected.entities.find((e) => e.id === "usb")?.fields
                        .owner
                    }
                  </dd>
                </div>
              </dl>
              <div className="rollback-area">
                <h3>回到这个故事状态</h3>
                <p className="description">
                  模拟恢复会新建一条本地版本，保留历史记录，并清除当前待审核变化。
                </p>
                {selected.id !== story.versions[0].id ? (
                  <button
                    className="button secondary"
                    onClick={() => setRollback(selected)}
                  >
                    Restore this version
                  </button>
                ) : (
                  <StatusPill>这是当前版本</StatusPill>
                )}
                {rollback && (
                  <div
                    className="rollback-confirm"
                    role="group"
                    aria-label="确认模拟恢复"
                  >
                    <p>
                      恢复第 {rollback.chapter}{" "}
                      章的状态快照？当前未提交的审核决定将被清除。
                    </p>
                    <div className="actions">
                      <button
                        className="button primary small"
                        onClick={() => {
                          update((s) =>
                            rollbackMock(s, rollback, new Date().toISOString()),
                          );
                          setRollback(null);
                          setSelectedId(undefined);
                          setNotice(
                            "已模拟恢复状态并保留原历史。此操作仅影响当前浏览器。",
                          );
                        }}
                      >
                        确认模拟恢复
                      </button>
                      <button
                        className="button secondary small"
                        onClick={() => setRollback(null)}
                      >
                        取消
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <p>尚无版本记录。</p>
          )}
        </aside>
      </div>
    </>
  );
}
