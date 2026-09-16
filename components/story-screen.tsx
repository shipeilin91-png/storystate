"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useStories } from "./story-provider";
import { Empty } from "./product-ui";
import { storyStateService } from "@/lib/frontend/story-state-service";
import type { Update } from "./story/types";
import { Setup } from "./story/story-setup";
import { StateExplorer } from "./story/state-explorer";
import { WritingWorkspace } from "./story/story-workspace";
import { DeltaReview } from "./story/delta-review";
import { History } from "./story/version-history";

export function StoryScreen({
  storyId,
  view,
}: {
  storyId: string;
  view: string;
}) {
  const { stories, ready, update } = useStories();
  const story = stories.find((value) => value.id === storyId);
  const [syncError, setSyncError] = useState("");
  const loaded = useRef("");

  useEffect(() => {
    if (!ready || !story || !storyStateService.hasBackendStory(story)) return;
    if (!["review", "state", "history"].includes(view)) return;
    const key = `${storyId}:${view}`;
    if (loaded.current === key) return;
    loaded.current = key;
    let cancelled = false;
    const load =
      view === "review"
        ? storyStateService.hydrateReview(story)
        : storyStateService.refresh(story);
    void load
      .then((result) => {
        if (!cancelled) update(storyId, () => result.story);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          loaded.current = "";
          setSyncError(
            cause instanceof Error
              ? cause.message
              : "从后端刷新 StoryState 失败。",
          );
        }
      });
    return () => {
      cancelled = true;
    };
    // A route entry triggers one backend hydration. Store updates from that request
    // must not recursively issue another request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, storyId, view]);

  if (!ready)
    return (
      <div className="page">
        <p role="status">正在打开故事工作台…</p>
      </div>
    );
  if (!story)
    return (
      <Empty title="未找到这个 Story">
        <p>故事可能尚未映射到这个工作区。</p>
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
      {syncError && (
        <p className="notice warn" role="alert">
          {syncError}
        </p>
      )}
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
