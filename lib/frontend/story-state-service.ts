import {
  canCommit,
  commitMock,
  fixtureDeltas,
  type Category,
  type Delta,
  type Entity,
  type Story,
  type Version,
} from "../mock-story";
import { canAcceptChange, reasoningFor, reviewKind } from "../review-contract";
import { backendStoryIdFor } from "./story-api-identity";
export { backendStoryIdFor } from "./story-api-identity";
import type {
  BackendCanonicalState,
  BackendDelta,
  BackendEvidence,
  BackendEvent,
  BackendExtractionResult,
  BackendReviewHydration,
  BackendSourceDocument,
  BackendSourceRevision,
  BackendStateResponse,
  BackendValidatorResult,
  BackendVersion,
  CanonicalStateSnapshotDTO,
  CommitResultDTO,
  ExtractStateChangesInputDTO,
  ExtractionRunResultDTO,
  HistoryEntryDTO,
  ReviewCandidateDTO,
  ReviewDecisionDTO,
  ReviewDecisionValue,
  ReviewRisk,
  SourceRevisionDTO,
} from "./story-state-dtos";

export type StoryLoopProjection = {
  story: Story;
  run?: ExtractionRunResultDTO;
  commit?: CommitResultDTO;
};

export interface StoryStateAdapter {
  hasBackendStory(story: Story): boolean;
  canCommit(story: Story): boolean;
  extract(
    story: Story,
    input: ExtractStateChangesInputDTO,
  ): Promise<StoryLoopProjection>;
  hydrateReview(story: Story): Promise<StoryLoopProjection>;
  decide(
    story: Story,
    candidateId: string,
    decision: ReviewDecisionValue,
  ): Promise<StoryLoopProjection>;
  commit(story: Story): Promise<StoryLoopProjection>;
  restore(story: Story, versionId: string): Promise<StoryLoopProjection>;
  refresh(story: Story): Promise<StoryLoopProjection>;
}

const actor = "shipeilin.1";

const stringValue = (value: unknown): string => {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  if (typeof value === "object" && "value" in value) {
    const inner = (value as { value: unknown }).value;
    return inner === null ? "unresolved" : stringValue(inner);
  }
  return JSON.stringify(value);
};

const categoryFor = (targetType: string): Category =>
  (({
    characters: "Characters",
    items: "Items",
    plotThreads: "Plot Threads",
    propositions: "Knowledge",
    worldTruth: "Knowledge",
    knowledge: "Knowledge",
    relationships: "Relationships",
  })[targetType] as Category | undefined) ?? "Knowledge";

const riskFor = (
  validator: BackendValidatorResult | null,
  delta: BackendDelta,
): ReviewRisk =>
  validator?.risk ??
  (delta.risk.includes("conflict_prone")
    ? "CONFLICT"
    : delta.risk.length
      ? "HIGH"
      : "LOW");

const validatorFor = (
  delta: BackendDelta,
): ReviewCandidateDTO["validatorResult"] => {
  const value = delta.validatorResult;
  return {
    status: value?.status ?? "needs_review",
    recommendation: value?.recommendation ?? "NEEDS_REVIEW",
    reason: value?.reason ?? "等待人工审核。",
    risk: riskFor(value, delta),
    checks: (value?.checks ?? []).map((check) => ({
      label: `${check.agent}: ${check.reason}`,
      passed: check.verdict === "SUPPORTED",
    })),
    ...(value?.validatorVersion
      ? { validatorVersion: value.validatorVersion }
      : {}),
  };
};

const sourceFor = (
  revisionId: string,
  revisions: BackendSourceRevision[],
  documents: BackendSourceDocument[],
  createdAt: string,
): SourceRevisionDTO => {
  const revision = revisions.find((value) => value.id === revisionId);
  const document = documents.find((value) => value.id === revision?.documentId);
  return {
    id: revisionId,
    revisionNumber: revision?.revisionNumber ?? 1,
    title: document?.title ?? "Story Content",
    chapter: document?.chapter ?? 0,
    createdAt,
  };
};

const candidateFor = (
  delta: BackendDelta,
  evidence: BackendEvidence[],
  events: BackendEvent[],
  revisions: BackendSourceRevision[],
  documents: BackendSourceDocument[],
  issues: ReviewCandidateDTO["compilerIssues"] = [],
): ReviewCandidateDTO => {
  const linkedEvidence = evidence.filter((item) =>
    delta.evidenceIds.includes(item.id),
  );
  const event = events.find((item) => item.id === delta.sourceEventId) ?? null;
  const revisionId =
    linkedEvidence[0]?.sourceRevisionId ??
    event?.sourceRevisionId ??
    revisions[0]?.id ??
    "unknown";
  const validator = validatorFor(delta);
  return {
    id: delta.id,
    kind: delta.operation === "NO_CHANGE" ? "no_change" : "canonical",
    target: {
      entityId: delta.targetId,
      entityName: delta.targetId,
      category: categoryFor(delta.targetType),
      field: delta.fieldPath,
    },
    before: stringValue(delta.before),
    after: stringValue(delta.after),
    evidence: linkedEvidence.map(({ quote, sourceRevisionId }) => ({
      quote,
      sourceRevisionId,
    })),
    event: event ? { id: event.id, summary: event.summary } : null,
    compilerIssues: issues,
    validatorResult: validator,
    risk: validator.risk,
    recommendation: validator.recommendation,
    sourceRevision: sourceFor(
      revisionId,
      revisions,
      documents,
      delta.createdAt,
    ),
    reasoning: delta.reason,
    provenance: [
      `Source revision ${revisionId}`,
      `Candidate ${delta.id}`,
      "Backend Decision → explicit Commit",
    ],
    decision:
      delta.decision === "accepted" || delta.decision === "rejected"
        ? delta.decision
        : "needs_review",
    acceptAllowed:
      delta.operation !== "NO_CHANGE" &&
      !["failed", "conflict"].includes(validator.status) &&
      !["REJECT", "CONFLICT"].includes(validator.recommendation),
  };
};

function deltaFor(candidate: ReviewCandidateDTO): Delta {
  return {
    id: candidate.id,
    entityId: candidate.target.entityId,
    field: candidate.target.field,
    before: candidate.before,
    after: candidate.after,
    risk:
      candidate.risk === "CONFLICT"
        ? "conflict"
        : ["HIGH", "MEDIUM"].includes(candidate.risk)
          ? "high"
          : "normal",
    reason: candidate.validatorResult.reason,
    evidence: candidate.evidence.map((item) => item.quote).join("\n"),
    decision:
      candidate.decision === "needs_review" ? "pending" : candidate.decision,
    review: {
      kind: candidate.kind,
      chapter: candidate.sourceRevision.chapter,
      recommendation: candidate.recommendation,
      risk: candidate.risk,
      checks: candidate.validatorResult.checks,
      why: candidate.reasoning,
      reason: candidate.validatorResult.reason,
    },
  };
}

function entitiesForReview(
  story: Story,
  candidates: ReviewCandidateDTO[],
): Entity[] {
  const entities = structuredClone(story.entities);
  for (const candidate of candidates) {
    let entity = entities.find(
      (value) => value.id === candidate.target.entityId,
    );
    if (!entity) {
      entity = {
        id: candidate.target.entityId,
        category: candidate.target.category as Category,
        name: candidate.target.entityName,
        summary: "Backend canonical target",
        fields: {},
        evidence: candidate.evidence[0]?.quote ?? "",
        chapter: candidate.sourceRevision.chapter,
      };
      entities.push(entity);
    }
    entity.fields[candidate.target.field] = candidate.before;
  }
  return entities;
}

function entityName(row: Record<string, unknown>, type: string): string {
  if (typeof row.name === "string") return row.name;
  if (typeof row.title === "string") return row.title;
  if (typeof row.statement === "string") return row.statement;
  if (type === "relationships")
    return `${stringValue(row.fromCharacterId)} → ${stringValue(row.toCharacterId)}`;
  return String(row.id);
}

function canonicalEntities(
  state: BackendCanonicalState,
  chapter: number,
): Entity[] {
  return Object.entries(state).flatMap(([type, rows]) =>
    rows
      .filter((row) => row.active)
      .map((row) => {
        const fields = Object.fromEntries(
          Object.entries(row)
            .filter(
              ([key]) =>
                !["id", "active", "name", "title", "statement"].includes(key),
            )
            .map(([key, value]) => [key, stringValue(value)]),
        );
        return {
          id: row.id,
          category: categoryFor(type),
          name: entityName(row, type),
          summary: `${type} canonical record`,
          fields,
          evidence: "已由后端 Canonical State 确认",
          chapter,
        };
      }),
  );
}

const snapshotFor = (
  storyId: string,
  state: BackendStateResponse,
): CanonicalStateSnapshotDTO => ({
  storyId,
  version: state.story.currentVersion,
  chapter: state.story.currentChapter ?? 0,
  refreshedAt: new Date().toISOString(),
  records: canonicalEntities(state.state, state.story.currentChapter ?? 0).map(
    (entity) => ({
      id: entity.id,
      category: entity.category,
      name: entity.name,
      fields: entity.fields,
      evidence: entity.evidence,
    }),
  ),
});

function versionsFor(values: BackendVersion[]): Version[] {
  const numberById = new Map(
    values.map((value) => [value.id, value.versionNumber]),
  );
  return [...values]
    .sort((a, b) => b.versionNumber - a.versionNumber)
    .map((value) => ({
      id: value.id,
      stateVersion: value.versionNumber,
      ...(value.restoredFromVersionId
        ? {
            restoredFromStateVersion: numberById.get(
              value.restoredFromVersionId,
            ),
          }
        : {}),
      chapter: value.chapter ?? 0,
      date: value.createdAt,
      title: value.commitKind === "restore" ? "恢复历史状态" : "提交状态变化",
      changes: value.deltaIds.map((id) => `Committed delta ${id}`),
      entities: canonicalEntities(value.snapshot, value.chapter ?? 0),
    }));
}

function historyFor(versions: Version[]): HistoryEntryDTO[] {
  return versions.map((version) => ({
    id: version.id,
    version: version.stateVersion,
    chapter: version.chapter,
    committedAt: version.date,
    title: version.title,
    changes: version.changes,
  }));
}

export class StoryStateApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "StoryStateApiError";
  }
}

type Fetcher = typeof fetch;

export class ApiStoryStateAdapter implements StoryStateAdapter {
  constructor(private readonly fetcher: Fetcher = fetch) {}

  hasBackendStory(story: Story) {
    return backendStoryIdFor(story.id) !== null;
  }

  canCommit(story: Story) {
    const canonical = story.deltas.filter(
      (delta) =>
        delta.review?.kind !== "soft" && delta.review?.kind !== "no_change",
    );
    return (
      canonical.length > 0 &&
      canonical.every((delta) => delta.decision !== "pending") &&
      canonical.some((delta) => delta.decision === "accepted")
    );
  }

  private storyId(story: Story) {
    const value = backendStoryIdFor(story.id);
    if (!value)
      throw new StoryStateApiError(
        400,
        "STORY_ID_UNMAPPED",
        "此 UI Story 尚未映射到后端 UUID。",
        false,
      );
    return value;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await this.fetcher(path, init);
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        error?: string;
        message?: string;
      } | null;
      const messages: Record<number, string> = {
        400: "请求内容无效，请检查源内容后重试。",
        404: "Story、Source Revision 或候选不存在，请刷新后重试。",
        409: "后端状态已变化，请刷新后重新操作。",
        422: "抽取器返回了无效结构，请修改内容后重试。",
        502: "抽取服务暂时不可用，请稍后手动重试。",
        503: "StoryState 后端服务尚未配置或暂时不可用。",
      };
      throw new StoryStateApiError(
        response.status,
        body?.error ?? "API_ERROR",
        body?.message ??
          messages[response.status] ??
          `StoryState API 请求失败（${response.status}）`,
        [502, 503].includes(response.status),
      );
    }
    return response.json() as Promise<T>;
  }

  private path(story: Story, suffix: string) {
    return `/api/stories/${encodeURIComponent(this.storyId(story))}/${suffix}`;
  }

  private post<T>(story: Story, suffix: string, body: unknown) {
    return this.request<T>(this.path(story, suffix), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async extract(story: Story, input: ExtractStateChangesInputDTO) {
    if (!input.content.trim())
      throw new StoryStateApiError(
        400,
        "EMPTY_SOURCE",
        "请先输入 Story Content，再开始抽取。",
        false,
      );
    const documentId = crypto.randomUUID();
    const sourceRevisionId = crypto.randomUUID();
    const sourceOrder = Number.parseInt(documentId.slice(0, 8), 16) % 2_147_483_647;
    await this.post(story, "source-documents", {
      id: documentId,
      title: input.title.trim() || `Chapter ${input.chapter}`,
      sourceOrder,
      chapter: input.chapter,
    });
    await this.post(story, "source-revisions", {
      id: sourceRevisionId,
      documentId,
      revisionNumber: 1,
      content: input.content,
      visibility: "canonical",
    });
    const extraction = await this.post<BackendExtractionResult>(
      story,
      "extract",
      { sourceRevisionId },
    );
    const hydrated = await this.request<BackendReviewHydration>(
      this.path(story, "review"),
    );
    return this.projectReview(story, hydrated, extraction, input.content);
  }

  async hydrateReview(story: Story) {
    const hydrated = await this.request<BackendReviewHydration>(
      this.path(story, "review"),
    );
    return this.projectReview(story, hydrated);
  }

  private projectReview(
    story: Story,
    hydration: BackendReviewHydration,
    extraction?: BackendExtractionResult,
    sourceContent?: string,
  ): StoryLoopProjection {
    // Rejected, committed and otherwise closed deltas remain backend audit data;
    // they are intentionally not reintroduced into the active review set.
    const active = hydration.candidateDeltas.filter(
      (delta) =>
        delta.committedVersionId === null &&
        ["needs_review", "deferred", "accepted"].includes(delta.decision),
    );
    const issues = (extraction?.compilerIssues ?? []).map((issue) => ({
      code: issue.code,
      message: issue.message,
      severity:
        issue.level === "WARNING" ? ("warning" as const) : ("error" as const),
    }));
    const candidates = active.map((delta) =>
      candidateFor(
        delta,
        hydration.evidence,
        hydration.events,
        hydration.sourceRevisions,
        hydration.sourceDocuments,
        issues,
      ),
    );
    const latest =
      candidates[0]?.sourceRevision ??
      sourceFor(
        extraction?.sourceRevisionId ??
          hydration.sourceRevisions[0]?.id ??
          "unknown",
        hydration.sourceRevisions,
        hydration.sourceDocuments,
        extraction?.timing.completedAt ?? new Date().toISOString(),
      );
    const runTimestamp =
      extraction?.timing.completedAt ?? new Date().toISOString();
    const run: ExtractionRunResultDTO = {
      runId: extraction?.provider.packetHash ?? `review-${latest.id}`,
      status:
        extraction?.status === "failed"
          ? "failed"
          : candidates.length
            ? "review_required"
            : "no_changes",
      createdAt: runTimestamp,
      sourceRevision: latest,
      baseStateVersion: extraction?.baseStateVersion,
      candidates,
      compilerIssues: issues,
      warnings: (extraction?.warnings ?? []).map((issue) => ({
        code: issue.code,
        message: issue.message,
        severity:
          issue.level === "WARNING" ? ("warning" as const) : ("error" as const),
      })),
      provider: extraction?.provider ?? {
        modelId: "persisted-review",
        calls: 0,
        packetHash: null,
      },
      timing: extraction?.timing ?? {
        startedAt: runTimestamp,
        completedAt: runTimestamp,
        durationMs: 0,
      },
      message: candidates.length
        ? `${candidates.length} 个后端候选等待决定。`
        : "没有待审核的 Canonical State 变化。",
    };
    const deltas = candidates.map(deltaFor);
    const reviewContent =
      sourceContent ??
      candidates
        .flatMap((candidate) => candidate.evidence.map((item) => item.quote))
        .join("\n\n");
    return {
      story: {
        ...story,
        title: hydration.story.title,
        chapter: hydration.story.currentChapter ?? story.chapter,
        currentStateVersion: hydration.story.currentVersion,
        updated: run.createdAt,
        entities: entitiesForReview(story, candidates),
        deltas,
        reviewSource: {
          chapter: latest.chapter,
          title: latest.title,
          output: reviewContent,
        },
        loop: { ...story.loop, sourceContent: reviewContent, activeRun: run },
      },
      run,
    };
  }

  async decide(
    story: Story,
    candidateId: string,
    decision: ReviewDecisionValue,
  ) {
    await this.post(
      story,
      `deltas/${encodeURIComponent(candidateId)}/decision`,
      {
        decision,
        actor,
        reason: "Explicit user decision in State Diff Review",
      },
    );
    return this.hydrateReview(story);
  }

  async commit(story: Story) {
    const deltaIds = story.deltas
      .filter((delta) => delta.decision === "accepted")
      .map((delta) => delta.id);
    if (!deltaIds.length)
      throw new StoryStateApiError(
        400,
        "NO_ACCEPTED_DELTAS",
        "没有可提交的已接受变化。",
        false,
      );
    const version = await this.post<BackendVersion>(story, "commit", {
      deltaIds,
      expectedVersion: story.currentStateVersion,
    });
    const refreshed = await this.refresh(story);
    const committedAt = version.createdAt;
    const result: CommitResultDTO = {
      commitId: version.id,
      committedCandidateIds: deltaIds,
      committedAt,
      canonicalState: refreshed.story.loop!.stateSnapshot!,
      history: refreshed.story.loop!.history!,
    };
    return {
      story: {
        ...refreshed.story,
        deltas: [],
        loop: {
          ...refreshed.story.loop,
          sourceContent:
            refreshed.story.loop?.sourceContent ??
            refreshed.story.reviewSource?.output ??
            "",
          activeRun: undefined,
          lastCommit: result,
        },
      },
      commit: result,
    };
  }

  async restore(story: Story, versionId: string) {
    await this.post<BackendVersion>(
      story,
      `versions/${encodeURIComponent(versionId)}/restore`,
      {
        expectedVersion: story.currentStateVersion,
        actor,
        reason: "Explicit user restore from Version History",
      },
    );
    return this.refresh(story);
  }

  async refresh(story: Story) {
    const [state, backendVersions] = await Promise.all([
      this.request<BackendStateResponse>(this.path(story, "state")),
      this.request<BackendVersion[]>(this.path(story, "versions")),
    ]);
    const versions = versionsFor(backendVersions);
    const stateSnapshot = snapshotFor(story.id, state);
    return {
      story: {
        ...story,
        title: state.story.title,
        chapter: state.story.currentChapter ?? 0,
        currentStateVersion: state.story.currentVersion,
        updated: stateSnapshot.refreshedAt,
        ready: true,
        entities: canonicalEntities(
          state.state,
          state.story.currentChapter ?? 0,
        ),
        versions,
        loop: {
          sourceContent:
            story.loop?.sourceContent ?? story.reviewSource?.output ?? "",
          ...story.loop,
          stateSnapshot,
          history: historyFor(versions),
        },
      },
    };
  }
}

const localId = (prefix: string) =>
  `${prefix}-${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;

function localSnapshot(story: Story): CanonicalStateSnapshotDTO {
  return {
    storyId: story.id,
    version: story.currentStateVersion,
    chapter: story.chapter,
    refreshedAt: new Date().toISOString(),
    records: story.entities.map((entity) => ({
      id: entity.id,
      category: entity.category,
      name: entity.name,
      fields: { ...entity.fields },
      evidence: entity.evidence,
    })),
  };
}

function localHistory(story: Story): HistoryEntryDTO[] {
  return story.versions.map((version) => ({
    id: version.id,
    version: version.stateVersion,
    chapter: version.chapter,
    committedAt: version.date,
    title: version.title,
    changes: [...version.changes],
    sourceRevisionId: story.loop?.activeRun?.sourceRevision.id,
  }));
}

// Fixture-only adapter kept for isolated Story UI tests; never used by the exported service.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class LocalDevelopmentAdapter implements StoryStateAdapter {
  hasBackendStory() {
    return false;
  }

  canCommit(story: Story) {
    return canCommit(story);
  }

  async extract(story: Story, input: ExtractStateChangesInputDTO) {
    if (!input.content.trim())
      throw new Error("请先输入 Story Content，再开始抽取。");
    const now = new Date().toISOString();
    const sourceRevision: SourceRevisionDTO = {
      id: localId("revision"),
      revisionNumber: input.expectedStateVersion + 1,
      title: input.title.trim() || `Chapter ${input.chapter}`,
      chapter: input.chapter,
      createdAt: now,
    };
    const localDeltas =
      input.content.trim().length < 20
        ? []
        : structuredClone(fixtureDeltas).map((delta) => ({
            ...delta,
            decision: "pending" as const,
          }));
    const projected = { ...story, deltas: localDeltas };
    const candidates = localDeltas.map((delta) => {
      const detail = reasoningFor(projected, delta);
      const entity = story.entities.find((item) => item.id === delta.entityId);
      const candidate: ReviewCandidateDTO = {
        id: delta.id,
        kind: reviewKind(delta),
        target: {
          entityId: delta.entityId,
          entityName: entity?.name ?? delta.entityId,
          category: entity?.category ?? "Knowledge",
          field: delta.field,
        },
        before: delta.before,
        after: delta.after,
        evidence: [
          { quote: delta.evidence, sourceRevisionId: sourceRevision.id },
        ],
        event: null,
        compilerIssues: [],
        validatorResult: {
          status:
            detail.recommendation === "CONFLICT"
              ? "conflict"
              : detail.recommendation === "REJECT"
                ? "failed"
                : "passed",
          recommendation: detail.recommendation,
          reason: detail.reason,
          risk: detail.risk,
          checks: detail.checks,
          validatorVersion: "frontend-development-fallback-v1",
        },
        risk: detail.risk,
        recommendation: detail.recommendation,
        sourceRevision,
        reasoning: detail.why,
        provenance: ["Development fallback", "Explicit Decision → Commit"],
        decision: "needs_review",
        acceptAllowed: canAcceptChange(projected, delta),
      };
      return candidate;
    });
    const run: ExtractionRunResultDTO = {
      runId: localId("run"),
      status: candidates.length ? "review_required" : "no_changes",
      createdAt: now,
      sourceRevision,
      baseStateVersion: input.expectedStateVersion,
      candidates,
      compilerIssues: [],
      warnings: [],
      provider: {
        modelId: "frontend-development-fallback",
        calls: 0,
        packetHash: null,
      },
      timing: { startedAt: now, completedAt: now, durationMs: 0 },
      message: candidates.length
        ? `${candidates.length} 个本地开发候选等待决定。`
        : "没有状态变化。",
    };
    return {
      story: {
        ...projected,
        reviewSource: {
          chapter: input.chapter,
          title: sourceRevision.title,
          output: input.content,
        },
        updated: now,
        loop: { ...story.loop, sourceContent: input.content, activeRun: run },
      },
      run,
    };
  }

  async hydrateReview(story: Story) {
    return { story, run: story.loop?.activeRun };
  }

  async decide(
    story: Story,
    candidateId: string,
    decision: ReviewDecisionValue,
  ) {
    const record: ReviewDecisionDTO = {
      candidateId,
      decision,
      actor,
      reason: "Explicit user decision in development fallback",
      decidedAt: new Date().toISOString(),
    };
    const activeRun = story.loop?.activeRun;
    const run = activeRun
      ? {
          ...activeRun,
          candidates: activeRun.candidates.map((candidate) =>
            candidate.id === candidateId
              ? { ...candidate, decision }
              : candidate,
          ),
        }
      : undefined;
    return {
      story: {
        ...story,
        deltas: story.deltas.map((delta) =>
          delta.id === candidateId ? { ...delta, decision } : delta,
        ),
        loop: {
          ...story.loop!,
          activeRun: run,
          decisions: [...(story.loop?.decisions ?? []), record],
        },
      },
      run,
    };
  }

  async commit(story: Story) {
    if (!canCommit(story))
      throw new Error("请先完成所有候选决定，并仅提交通过检查的变化。");
    const committedAt = new Date().toISOString();
    const committed = commitMock(story, committedAt);
    const canonicalState = localSnapshot(committed);
    const history = localHistory(committed);
    const result: CommitResultDTO = {
      commitId: committed.versions[0].id,
      committedCandidateIds: story.deltas
        .filter((delta) => delta.decision === "accepted")
        .map((delta) => delta.id),
      committedAt,
      canonicalState,
      history,
    };
    return {
      story: {
        ...committed,
        loop: {
          sourceContent:
            story.loop?.sourceContent ?? story.reviewSource?.output ?? "",
          ...story.loop,
          activeRun: undefined,
          lastCommit: result,
          stateSnapshot: canonicalState,
          history,
        },
      },
      commit: result,
    };
  }

  async restore(story: Story, versionId: string) {
    const version = story.versions.find((item) => item.id === versionId);
    if (!version) throw new Error("Version 不存在。");
    return this.refresh({
      ...story,
      chapter: version.chapter,
      currentStateVersion: story.currentStateVersion + 1,
      entities: structuredClone(version.entities),
      deltas: [],
    });
  }

  async refresh(story: Story) {
    const stateSnapshot = localSnapshot(story);
    const history = localHistory(story);
    return {
      story: {
        ...story,
        loop: {
          sourceContent:
            story.loop?.sourceContent ?? story.reviewSource?.output ?? "",
          ...story.loop,
          stateSnapshot,
          history,
        },
      },
    };
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
class ApiWithDevelopmentFallback implements StoryStateAdapter {
  constructor(
    private readonly api: StoryStateAdapter,
    private readonly fallback: StoryStateAdapter,
  ) {}

  hasBackendStory(story: Story) {
    return this.api.hasBackendStory(story);
  }

  canCommit(story: Story) {
    return this.api.canCommit(story);
  }

  private async run<T>(
    apiCall: () => Promise<T>,
    fallbackCall: () => Promise<T>,
  ) {
    try {
      return await apiCall();
    } catch (error) {
      const unavailable =
        error instanceof TypeError ||
        (error instanceof StoryStateApiError && error.status === 503);
      if (process.env.NODE_ENV !== "production" && unavailable)
        return fallbackCall();
      throw error;
    }
  }

  extract(story: Story, input: ExtractStateChangesInputDTO) {
    return this.run(
      () => this.api.extract(story, input),
      () => this.fallback.extract(story, input),
    );
  }

  hydrateReview(story: Story) {
    return this.run(
      () => this.api.hydrateReview(story),
      () => this.fallback.hydrateReview(story),
    );
  }

  decide(story: Story, candidateId: string, decision: ReviewDecisionValue) {
    return this.run(
      () => this.api.decide(story, candidateId, decision),
      () => this.fallback.decide(story, candidateId, decision),
    );
  }

  commit(story: Story) {
    return this.run(
      () => this.api.commit(story),
      () => this.fallback.commit(story),
    );
  }

  restore(story: Story, versionId: string) {
    return this.run(
      () => this.api.restore(story, versionId),
      () => this.fallback.restore(story, versionId),
    );
  }

  refresh(story: Story) {
    return this.run(
      () => this.api.refresh(story),
      () => this.fallback.refresh(story),
    );
  }
}

const STORAGE_KEY = "storystate.foundation.v1";
export const storyPersistence = {
  load(): unknown | null {
    if (typeof window === "undefined") return null;
    try {
      const value = window.localStorage.getItem(STORAGE_KEY);
      return value ? JSON.parse(value) : null;
    } catch {
      return null;
    }
  },
  save(stories: Story[]) {
    if (typeof window === "undefined") return false;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stories));
      return true;
    } catch {
      return false;
    }
  },
};

export const storyStateService: StoryStateAdapter = new ApiStoryStateAdapter();
