import {
  canCommit,
  commitMock,
  fixtureDeltas,
  type Delta,
  type Story,
} from "../mock-story";
import { reasoningFor, reviewKind } from "../review-contract";
import type {
  CanonicalStateSnapshotDTO,
  CommitResultDTO,
  ExtractStateChangesInputDTO,
  ExtractionRunResultDTO,
  HistoryEntryDTO,
  ReviewCandidateDTO,
  ReviewDecisionDTO,
  ReviewDecisionValue,
  SourceRevisionDTO,
} from "./story-state-dtos";

export type StoryLoopProjection = {
  story: Story;
  run?: ExtractionRunResultDTO;
  commit?: CommitResultDTO;
};

type PersistedStories = unknown;

interface StoryStateAdapter {
  canCommit(story: Story): boolean;
  extract(
    story: Story,
    input: ExtractStateChangesInputDTO,
  ): Promise<StoryLoopProjection>;
  decide(
    story: Story,
    candidateId: string,
    decision: ReviewDecisionValue,
  ): Promise<StoryLoopProjection>;
  commit(story: Story): Promise<StoryLoopProjection>;
  refresh(story: Story): Promise<StoryLoopProjection>;
}

interface StoryPersistenceAdapter {
  load(): PersistedStories | null;
  save(stories: Story[]): boolean;
}

const STORAGE_KEY = "storystate.foundation.v1";
const actor = "shipeilin.1";
const unavailable = new Set([404, 405, 501, 503]);
const id = (prefix: string) =>
  `${prefix}-${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;

export class BrowserStoryPersistenceAdapter implements StoryPersistenceAdapter {
  load() {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as unknown) : null;
    } catch {
      return null;
    }
  }

  save(stories: Story[]) {
    if (typeof window === "undefined") return false;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stories));
      return true;
    } catch {
      return false;
    }
  }
}

function sourceRevision(input: ExtractStateChangesInputDTO): SourceRevisionDTO {
  return {
    id: id("revision"),
    revisionNumber: input.expectedStateVersion + 1,
    title: input.title.trim() || `Chapter ${input.chapter}`,
    chapter: input.chapter,
    createdAt: new Date().toISOString(),
  };
}

function candidateFromDelta(
  story: Story,
  delta: Delta,
  revision: SourceRevisionDTO,
  content: string,
): ReviewCandidateDTO {
  const detail = reasoningFor(story, delta);
  const entity = story.entities.find((row) => row.id === delta.entityId);
  const quotedEvidence = delta.evidence
    .split("\n")
    .filter(Boolean)
    .filter((quote) => content.includes(quote));
  const evidence = quotedEvidence.length
    ? quotedEvidence
    : [
        content
          .trim()
          .split(/\n\n|[。！？]/)[0]
          ?.slice(0, 240) || delta.evidence,
      ];
  const checks = detail.checks.length
    ? detail.checks
    : [{ label: "Candidate requires explicit human review", passed: true }];
  const validatorStatus =
    detail.recommendation === "CONFLICT"
      ? "conflict"
      : detail.recommendation === "REJECT"
        ? "failed"
        : detail.recommendation === "NEEDS_REVIEW"
          ? "needs_review"
          : "passed";
  return {
    id: delta.id,
    kind: reviewKind(delta),
    target: {
      entityId: delta.entityId,
      entityName: entity?.name ?? delta.entityId,
      category: entity?.category ?? "Other",
      field: delta.field,
    },
    before: delta.before,
    after: delta.after,
    evidence: evidence.map((quote) => ({
      quote,
      sourceRevisionId: revision.id,
    })),
    event: {
      id: id("event"),
      summary: `Chapter ${revision.chapter} source event for ${entity?.name ?? delta.entityId}`,
    },
    compilerIssues:
      detail.recommendation === "CONFLICT" || detail.recommendation === "REJECT"
        ? [
            {
              code:
                detail.recommendation === "CONFLICT"
                  ? "STATE_CONFLICT"
                  : "INSUFFICIENT_SUPPORT",
              message: detail.reason,
              severity: "error",
            },
          ]
        : [],
    validatorResult: {
      status: validatorStatus,
      recommendation: detail.recommendation,
      reason: detail.reason,
      risk: detail.risk,
      checks,
      validatorVersion: "frontend-adapter-fallback-v1",
    },
    risk: detail.risk,
    recommendation: detail.recommendation,
    sourceRevision: revision,
    reasoning: detail.why,
    provenance: [
      `Story content → source revision ${revision.revisionNumber}`,
      `Source revision → candidate ${delta.id}`,
      "Candidate → human decision → explicit commit",
    ],
    decision: delta.decision === "pending" ? "needs_review" : delta.decision,
  };
}

function snapshot(story: Story): CanonicalStateSnapshotDTO {
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

function history(story: Story): HistoryEntryDTO[] {
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

class LocalStoryStateAdapter implements StoryStateAdapter {
  canCommit(story: Story) {
    return canCommit(story);
  }

  async extract(story: Story, input: ExtractStateChangesInputDTO) {
    const revision = sourceRevision(input);
    const now = new Date().toISOString();
    if (!input.content.trim())
      throw new Error("请先输入 Story Content，再开始抽取。");
    if (input.content.trim().length < 20) {
      const run: ExtractionRunResultDTO = {
        runId: id("run"),
        status: "no_changes",
        createdAt: now,
        sourceRevision: revision,
        candidates: [],
        compilerIssues: [],
        message: "内容不足以形成可审核的 Canonical State 变化。",
      };
      return {
        story: {
          ...story,
          deltas: [],
          reviewSource: {
            chapter: input.chapter,
            title: revision.title,
            output: input.content,
          },
          loop: { sourceContent: input.content, activeRun: run },
        },
        run,
      };
    }
    const deltas = structuredClone(fixtureDeltas).map((delta) => ({
      ...delta,
      decision: "pending" as const,
    }));
    const candidateStory = { ...story, deltas };
    const candidates = deltas.map((delta) =>
      candidateFromDelta(candidateStory, delta, revision, input.content),
    );
    const run: ExtractionRunResultDTO = {
      runId: id("run"),
      status: "review_required",
      createdAt: now,
      sourceRevision: revision,
      candidates,
      compilerIssues: candidates.flatMap(
        (candidate) => candidate.compilerIssues,
      ),
      message: `${candidates.length} 个候选等待用户决定。`,
    };
    return {
      story: {
        ...story,
        deltas,
        reviewSource: {
          chapter: input.chapter,
          title: revision.title,
          output: input.content,
        },
        updated: now,
        loop: { sourceContent: input.content, activeRun: run },
      },
      run,
    };
  }

  async decide(
    story: Story,
    candidateId: string,
    decision: ReviewDecisionValue,
  ) {
    const candidate = story.loop?.activeRun?.candidates.find(
      (item) => item.id === candidateId,
    );
    if (!candidate && !story.deltas.some((delta) => delta.id === candidateId))
      throw new Error("Review candidate 已过期，请重新抽取。");
    const record: ReviewDecisionDTO = {
      candidateId,
      decision,
      actor,
      reason: "Explicit user decision in State Diff Review",
      decidedAt: new Date().toISOString(),
    };
    const activeRun = story.loop?.activeRun;
    const run = activeRun
      ? {
          ...activeRun,
          candidates: activeRun.candidates.map((item) =>
            item.id === candidateId
              ? { ...item, decision: record.decision }
              : item,
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
          sourceContent:
            story.loop?.sourceContent ?? story.reviewSource?.output ?? "",
          ...story.loop,
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
    if (committed === story)
      throw new Error("没有可提交的 Canonical State 变化。");
    const result: CommitResultDTO = {
      commitId: committed.versions[0].id,
      committedCandidateIds: story.deltas
        .filter((delta) => delta.decision === "accepted")
        .map((delta) => delta.id),
      committedAt,
      canonicalState: snapshot(committed),
      history: history(committed),
    };
    return {
      story: {
        ...committed,
        loop: {
          ...story.loop!,
          activeRun: undefined,
          lastCommit: result,
          stateSnapshot: result.canonicalState,
          history: result.history,
        },
      },
      commit: result,
    };
  }

  async refresh(story: Story) {
    const stateSnapshot = snapshot(story);
    const entries = history(story);
    return {
      story: {
        ...story,
        loop: { ...story.loop!, stateSnapshot, history: entries },
      },
    };
  }
}

class ApiFirstStoryStateAdapter implements StoryStateAdapter {
  constructor(private fallback: StoryStateAdapter) {}

  canCommit(story: Story) {
    return this.fallback.canCommit(story);
  }

  private async request(path: string, init?: RequestInit) {
    const response = await fetch(path, init);
    if (!response.ok) {
      if (unavailable.has(response.status)) return null;
      const body = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;
      throw new Error(
        body?.message ?? `StoryState API 请求失败（${response.status}）`,
      );
    }
    return response.json() as Promise<StoryLoopProjection>;
  }

  async extract(story: Story, input: ExtractStateChangesInputDTO) {
    try {
      const result = await this.request(
        `/api/stories/${story.id}/extraction-runs`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
        },
      );
      if (result?.run && result.story) return result;
    } catch (error) {
      if (!(error instanceof TypeError)) throw error;
    }
    return this.fallback.extract(story, input);
  }

  async decide(
    story: Story,
    candidateId: string,
    decision: ReviewDecisionValue,
  ) {
    if (!story.loop?.activeRun)
      return this.fallback.decide(story, candidateId, decision);
    try {
      const result = await this.request(
        `/api/stories/${story.id}/review-candidates/${candidateId}/decision`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            decision,
            actor,
            reason: "Explicit user decision",
          }),
        },
      );
      if (result?.story) return result;
    } catch (error) {
      if (!(error instanceof TypeError)) throw error;
    }
    return this.fallback.decide(story, candidateId, decision);
  }

  async commit(story: Story) {
    try {
      const result = await this.request(
        `/api/stories/${story.id}/review-commit`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            expectedVersion: story.currentStateVersion,
            candidateIds: story.deltas
              .filter((delta) => delta.decision === "accepted")
              .map((delta) => delta.id),
          }),
        },
      );
      if (result?.commit && result.story) return result;
    } catch (error) {
      if (!(error instanceof TypeError)) throw error;
    }
    return this.fallback.commit(story);
  }

  async refresh(story: Story) {
    try {
      const result = await this.request(
        `/api/stories/${story.id}/product-loop`,
      );
      if (result?.story) return result;
    } catch (error) {
      if (!(error instanceof TypeError)) throw error;
    }
    return this.fallback.refresh(story);
  }
}

const localAdapter = new LocalStoryStateAdapter();
export const storyStateService: StoryStateAdapter =
  new ApiFirstStoryStateAdapter(localAdapter);
export const storyPersistence = new BrowserStoryPersistenceAdapter();
