import type { Story } from "@/lib/mock-story";
import { StatusPill } from "../product-ui";
export function StoryMeta({ story }: { story: Story }) {
  return (
    <div className="story-meta">
      <span className="live-dot" />《{story.title}》<span>／</span>第{" "}
      {story.chapter} 章后
      <StatusPill tone="good">State v{story.currentStateVersion}</StatusPill>
      <span className="push-right">{story.entities.length} 条状态记录</span>
    </div>
  );
}
