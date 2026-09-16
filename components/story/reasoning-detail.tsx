import type { Delta, Story } from "@/lib/mock-story";
import type { ReviewCandidateDTO } from "@/lib/frontend/story-state-dtos";
import {
  changeFields,
  reasoningFor,
  recommendationLabels,
} from "@/lib/review-contract";

export function ReasoningDetail({
  story,
  delta,
  candidate,
}: {
  story: Story;
  delta: Delta;
  candidate?: ReviewCandidateDTO;
}) {
  const detail = reasoningFor(story, delta);
  const evidence =
    candidate?.evidence.map((item) => item.quote) ??
    delta.evidence.split("\n").filter(Boolean);
  const checks = candidate?.validatorResult.checks ?? detail.checks;
  return (
    <div className="reasoning-detail">
      <section>
        <h4>
          Evidence{" "}
          <span>
            Chapter {candidate?.sourceRevision.chapter ?? detail.chapter}
          </span>
        </h4>
        <blockquote>
          {evidence.map((quote, index) => (
            <p key={index}>{quote.startsWith("“") ? quote : `“${quote}”`}</p>
          ))}
        </blockquote>
        {candidate && (
          <p className="evidence-source">
            Source revision {candidate.sourceRevision.revisionNumber} ·{" "}
            {candidate.sourceRevision.id}
          </p>
        )}
      </section>
      <section>
        <h4>Event</h4>
        <p>{candidate?.event?.summary ?? "No linked source event"}</p>
        {candidate?.event && <code>{candidate.event.id}</code>}
      </section>
      <section>
        <h4>
          Validator checks / result{" "}
          <span>
            {candidate?.validatorResult.validatorVersion ?? "review checks"}
          </span>
        </h4>
        <p>
          <strong>{candidate?.validatorResult.status ?? "reviewed"}</strong> ·{" "}
          {candidate?.validatorResult.reason ?? detail.reason}
        </p>
        <ul>
          {checks.map((check, index) => (
            <li
              key={index}
              className={check.passed ? "check-pass" : "check-fail"}
            >
              <span aria-label={check.passed ? "通过" : "未通过"}>
                {check.passed ? "✓" : "✕"}
              </span>{" "}
              {check.label}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h4>Compiler issues</h4>
        {candidate?.compilerIssues.length ? (
          <ul>
            {candidate.compilerIssues.map((issue) => (
              <li className="check-fail" key={issue.code}>
                <code>{issue.code}</code> · {issue.message}
              </li>
            ))}
          </ul>
        ) : (
          <p>No compiler issues</p>
        )}
      </section>
      <section>
        <h4>Recommendation · {candidate?.risk ?? detail.risk}</h4>
        <p>
          <strong>
            {
              recommendationLabels[
                candidate?.recommendation ?? detail.recommendation
              ]
            }
          </strong>{" "}
          · <code>{candidate?.recommendation ?? detail.recommendation}</code>
        </p>
        <p>{candidate?.validatorResult.reason ?? detail.reason}</p>
        {detail.rule && <p className="reasoning-rule">{detail.rule}</p>}
      </section>
      <section>
        <h4>Reasoning & provenance</h4>
        <p>{candidate?.reasoning ?? detail.why}</p>
        {detail.context && <p>{detail.context}</p>}
        {candidate?.provenance.map((item) => (
          <p key={item}>↳ {item}</p>
        ))}
      </section>
      {delta.additionalFields && (
        <section>
          <h4>Formal transition</h4>
          {changeFields(delta).map((field) => (
            <p key={field.field}>
              <code>
                {field.field}: {field.before} → {field.after}
              </code>
            </p>
          ))}
          <p>correction 是 provenance / transition，不是 stance。</p>
        </section>
      )}
      {delta.note && <p>修订说明：{delta.note}</p>}
    </div>
  );
}
