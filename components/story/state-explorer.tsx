"use client";
import { useState } from "react";
import { categories, type Story, type Category } from "@/lib/mock-story";
import { Empty, Icon, PageIntro, StatusPill } from "../product-ui";
import { StoryMeta } from "./story-meta";
import { KnowledgeBoundary } from "./knowledge-boundary";
export function StateExplorer({ story }: { story: Story }) {
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
          <KnowledgeBoundary story={story} />
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
