"use client";
import type { Delta, Story } from "@/lib/mock-story";
import {
  canAcceptChange,
  changeFields,
  reasoningFor,
  recommendationLabels,
  reviewKind,
} from "@/lib/review-contract";
import { StatusPill } from "../product-ui";
import { ReasoningDetail } from "./reasoning-detail";
export function StateDiffRow({
  story,
  delta: d,
  onDecision,
}: {
  story: Story;
  delta: Delta;
  onDecision: (id: string, decision: Delta["decision"]) => void;
}) {
  const detail = reasoningFor(story, d);
  const candidate = story.loop?.activeRun?.candidates.find(
    (item) => item.id === d.id,
  );
  const kind = candidate?.kind ?? reviewKind(d);
  const recommendation = candidate?.recommendation ?? detail.recommendation;
  const risk = candidate?.risk ?? detail.risk;
  const entity = story.entities.find((e) => e.id === d.entityId);
  return (
    <article
      className={`state-diff-row ${kind}`}
      aria-label={`${entity?.name ?? d.entityId} / ${d.field}`}
      data-change-id={d.id}
    >
      <div className="diff-overview">
        <div className="diff-subject">
          <h3>{entity?.name ?? d.entityId}</h3>
          <span>
            {d.field}
            {d.additionalFields ? " + believed_value" : ""}
          </span>
          {candidate && (
            <small>
              Source r{candidate.sourceRevision.revisionNumber} ·{" "}
              {candidate.validatorResult.status}
            </small>
          )}
          {kind !== "canonical" && (
            <small>
              {kind === "soft"
                ? "Soft Interpretation · 非 Hard State Delta"
                : "No canonical change"}
            </small>
          )}
        </div>
        <div className="state-comparison" aria-label="Before → After">
          <div>
            <small>
              {kind === "soft" ? "Before interpretation" : "Before"}
            </small>
            <span>{detail.beforeLabel ?? d.before}</span>
            {d.additionalFields && (
              <code>
                {changeFields(d)
                  .map((f) => `${f.field} = ${f.before}`)
                  .join(" · ")}
              </code>
            )}
          </div>
          <span className="diff-arrow" aria-hidden="true">
            →
          </span>
          <div>
            <small>
              {kind === "soft" ? "Possible interpretation" : "After"}
            </small>
            <span>{detail.afterLabel ?? d.after}</span>
            {d.additionalFields && (
              <code>
                {changeFields(d)
                  .map((f) => `${f.field} = ${f.after}`)
                  .join(" · ")}
              </code>
            )}
          </div>
        </div>
        <div className="diff-recommendation">
          <small>系统推荐</small>
          <strong>
            {kind === "soft"
              ? "Soft only"
              : kind === "no_change"
                ? "保持原状态"
                : recommendationLabels[recommendation]}
          </strong>
          <StatusPill
            tone={
              risk === "CONFLICT" ? "bad" : risk === "HIGH" ? "warn" : "neutral"
            }
          >
            {risk}
          </StatusPill>
        </div>
        <div className="diff-decision">
          <small>你的 Decision</small>
          <StatusPill tone={d.decision === "accepted" ? "good" : "neutral"}>
            {kind !== "canonical"
              ? "不适用"
              : d.decision === "accepted"
                ? "Accepted"
                : d.decision === "rejected"
                  ? "Rejected"
                  : "Pending"}
          </StatusPill>
          {kind === "canonical" && (
            <div className="actions">
              <button
                className="button secondary small"
                disabled={
                  !(candidate
                    ? candidate.acceptAllowed
                    : canAcceptChange(story, d)) || d.decision === "accepted"
                }
                onClick={() => onDecision(d.id, "accepted")}
              >
                Accept
              </button>
              <button
                className="button secondary small"
                disabled={d.decision === "rejected"}
                onClick={() => onDecision(d.id, "rejected")}
              >
                Reject
              </button>
            </div>
          )}
        </div>
      </div>
      <details className="diff-reasoning">
        <summary>
          查看原因 <span>Why?</span>
        </summary>
        <ReasoningDetail story={story} delta={d} candidate={candidate} />
      </details>
    </article>
  );
}
