"use client";
import Link from "next/link";
import { useStories } from "./story-provider";
import { Empty } from "./product-ui";
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
