"use client";
import { useState } from "react";
import type { Story } from "@/lib/mock-story";
import { Icon, StatusPill } from "../product-ui";
import { KnowledgeBoundary } from "./knowledge-boundary";
export function ContextInspector({ story }: { story: Story }) {
  const [tab, setTab] = useState("Current State");
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
              <KnowledgeBoundary story={story} compact />
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
                  {e.name} <span className="text-muted">/ CH.{e.chapter}</span>
                </strong>
                <p>{e.summary}</p>
                <small>为什么选入：提供这次医院会面的行动动机与前因。</small>
              </div>
            ))}
        {tab === "Open Plot Threads" &&
          story.entities
            .filter(
              (e) =>
                e.category === "Plot Threads" && e.fields.status !== "closed",
            )
            .map((e) => (
              <div className="context-entry" key={e.id}>
                <strong>
                  {e.name} <StatusPill>{e.fields.status}</StatusPill>
                </strong>
                <p>{e.fields.question}</p>
                <small>为什么选入：可推进的悬念；本章不应无依据地结案。</small>
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
  );
}
