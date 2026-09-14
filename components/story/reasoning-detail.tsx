import type { Delta, Story } from "@/lib/mock-story";
import {
  changeFields,
  reasoningFor,
  recommendationLabels,
} from "@/lib/review-contract";

export function ReasoningDetail({
  story,
  delta,
}: {
  story: Story;
  delta: Delta;
}) {
  const detail = reasoningFor(story, delta);
  return (
    <div className="reasoning-detail">
      <section>
        <h4>
          Evidence <span>Chapter {detail.chapter} · 固定示例</span>
        </h4>
        <blockquote>
          {delta.evidence
            .split("\n")
            .filter(Boolean)
            .map((quote, i) => (
              <p key={i}>{quote.startsWith("“") ? quote : `“${quote}”`}</p>
            ))}
        </blockquote>
      </section>
      <section>
        <h4>Why this change</h4>
        <p>{detail.why}</p>
        {detail.context && <p>{detail.context}</p>}
      </section>
      <section>
        <h4>
          Validator checks <span>示例检查</span>
        </h4>
        <ul>
          {detail.checks.map((check, i) => (
            <li key={i} className={check.passed ? "check-pass" : "check-fail"}>
              <span aria-label={check.passed ? "通过" : "未通过"}>
                {check.passed ? "✓" : "✕"}
              </span>{" "}
              {check.label}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h4>Recommendation · {detail.risk}</h4>
        <p>
          <strong>{recommendationLabels[detail.recommendation]}</strong> ·{" "}
          <code>{detail.recommendation}</code>
        </p>
        <p>{detail.reason}</p>
        {detail.rule && <p className="reasoning-rule">{detail.rule}</p>}
      </section>
      {delta.additionalFields && (
        <section>
          <h4>Formal transition</h4>
          {changeFields(delta).map((f) => (
            <p key={f.field}>
              <code>
                {f.field}: {f.before} → {f.after}
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
