import type { Story } from "@/lib/mock-story";
import { StatusPill } from "../product-ui";

export function KnowledgeBoundary({
  story,
  compact = false,
}: {
  story: Story;
  compact?: boolean;
}) {
  const identity =
    story.entities.find((e) => e.id === "chen")?.fields.identity ?? "未记录";
  const knowledge =
    story.entities.find((e) => e.id === "identity")?.fields ?? {};
  const descriptions: Record<string, string> = {
    knows: "已确认知情",
    suspects: "只有怀疑，没有确认",
    unaware: "尚无知情证据",
  };
  return (
    <>
      <div className="world-truth">
        <small>WORLD TRUTH</small>
        <strong>陈默真实身份：{identity}</strong>
        {!compact && <span>Canonical</span>}
      </div>
      <div className={`knowledge-people${compact ? " compact" : ""}`}>
        {Object.entries(knowledge).map(([name, status]) => (
          <div key={name}>
            <strong>{name}</strong>
            <StatusPill
              tone={
                status === "knows"
                  ? "good"
                  : status === "suspects"
                    ? "warn"
                    : "neutral"
              }
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </StatusPill>
            {!compact && (
              <small>{descriptions[status] ?? "已提交的角色知识状态"}</small>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
