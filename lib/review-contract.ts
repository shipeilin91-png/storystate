import type { Delta, Story } from "./mock-story";

// Frontend Review Contract ≠ Backend State Schema.
// Checks/recommendations are curated demonstration data, not a running validator.
export type Recommendation =
  "AUTO_ACCEPT_ELIGIBLE" | "NEEDS_REVIEW" | "REJECT" | "CONFLICT";
export type ReviewRisk = "LOW" | "MEDIUM" | "HIGH" | "CONFLICT";
export type ValidationCheck = { label: string; passed: boolean };
export type ReasoningDetail = {
  kind: "canonical" | "soft" | "no_change";
  chapter: number;
  recommendation: Recommendation;
  risk: ReviewRisk;
  checks: ValidationCheck[];
  why: string;
  reason: string;
  rule?: string;
  context?: string;
  beforeLabel?: string;
  afterLabel?: string;
  transition?: "belief_correction";
};
export const recommendationLabels: Record<Recommendation, string> = {
  AUTO_ACCEPT_ELIGIBLE: "建议接受",
  NEEDS_REVIEW: "需人工审核",
  REJECT: "不建议提交",
  CONFLICT: "存在冲突",
};
export function reviewKind(d: Delta): ReasoningDetail["kind"] {
  if (d.review?.kind === "soft") return "soft";
  if (
    d.before === d.after &&
    (d.additionalFields ?? []).every((f) => f.before === f.after)
  )
    return "no_change";
  return d.review?.kind ?? "canonical";
}
export function changeFields(d: Delta) {
  return [
    { field: d.field, before: d.before, after: d.after },
    ...(d.additionalFields ?? []),
  ];
}
export function beforeMatches(story: Story, d: Delta) {
  const entity = story.entities.find((e) => e.id === d.entityId);
  return (
    !!entity &&
    changeFields(d).every((f) => entity.fields[f.field] === f.before)
  );
}
export function reasoningFor(story: Story, d: Delta): ReasoningDetail {
  const detail: ReasoningDetail = d.review ?? {
    kind: reviewKind(d),
    chapter: story.chapter + 1,
    recommendation:
      d.risk === "conflict" && !d.resolved
        ? "CONFLICT"
        : d.risk === "high"
          ? "NEEDS_REVIEW"
          : "AUTO_ACCEPT_ELIGIBLE",
    risk:
      d.risk === "conflict" && !d.resolved
        ? "CONFLICT"
        : d.risk === "high"
          ? "HIGH"
          : "LOW",
    checks: [],
    why: d.reason,
    reason: d.reason,
  };
  const matches = beforeMatches(story, d);
  if (reviewKind(d) === "soft") return detail;
  return {
    ...detail,
    kind: reviewKind(d),
    ...(!matches
      ? {
          recommendation: "CONFLICT" as const,
          risk: "CONFLICT" as const,
          reason:
            "Before 与 Current State 不一致。请拒绝过期候选；不会静默合并。",
        }
      : {}),
    checks: [
      { label: "Before matches current state", passed: matches },
      ...detail.checks,
    ],
  };
}
export function canAcceptChange(story: Story, d: Delta) {
  const reason = reasoningFor(story, d);
  return (
    !(d.risk === "conflict" && !d.resolved) &&
    story.entities.find((e) => e.id === d.entityId)?.category !== "Events" &&
    reviewKind(d) === "canonical" &&
    !["REJECT", "CONFLICT"].includes(reason.recommendation) &&
    beforeMatches(story, d) &&
    changeFields(d).every((f) => f.after.trim())
  );
}
