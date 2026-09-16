"use client";
import { useState } from "react";
import { type Story, type Version } from "@/lib/mock-story";
import { storyStateService } from "@/lib/frontend/story-state-service";
import type { Update } from "./types";
import { Icon, PageIntro, StatusPill } from "../product-ui";
export function History({ story, update }: { story: Story; update: Update }) {
  const [selectedId, setSelectedId] = useState<string | undefined>(
    story.versions[0]?.id,
  );
  const [rollback, setRollback] = useState<Version | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
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
            {story.versions.length} 个后端版本
          </StatusPill>
        }
      />
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="notice warn" role="alert">
          {error}
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
                  <strong>State v{v.stateVersion}</strong>
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
              <h2>
                State v{selected.stateVersion} · {selected.title}
              </h2>
              {selected.restoredFromStateVersion !== undefined && (
                <p className="description">
                  Restored from State v{selected.restoredFromStateVersion} ·
                  Snapshot chapter: {selected.chapter}
                </p>
              )}
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
                  <dt>USB 所有者</dt>
                  <dd>
                    {selected.entities.find((e) => e.id === "usb")?.fields
                      .owner ?? "未记录"}
                  </dd>
                </div>
                <div>
                  <dt>USB 持有者</dt>
                  <dd>
                    {selected.entities.find((e) => e.id === "usb")?.fields
                      .holder ?? "未单独记录"}
                  </dd>
                </div>
              </dl>
              <div className="rollback-area">
                <h3>回到这个故事状态</h3>
                <p className="description">
                  恢复由后端 Version API 创建新版本并保留完整历史。
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
                      从 State v{rollback.stateVersion} 恢复 Chapter{" "}
                      {rollback.chapter} 快照，将创建 State v
                      {story.currentStateVersion + 1}
                      。当前未提交的审核决定将被清除。
                    </p>
                    <div className="actions">
                      <button
                        className="button primary small"
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          setError("");
                          try {
                            const result = await storyStateService.restore(
                              story,
                              rollback.id,
                            );
                            update(() => result.story);
                            setRollback(null);
                            setSelectedId(undefined);
                            setNotice(
                              "已由后端恢复状态并刷新 Version History。",
                            );
                          } catch (cause) {
                            setError(
                              cause instanceof Error
                                ? cause.message
                                : "恢复失败，请刷新后重试。",
                            );
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        {busy ? "Restoring…" : "确认恢复"}
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
