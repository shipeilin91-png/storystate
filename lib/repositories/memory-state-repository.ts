import type { StoryAggregate } from "../domain/state";
import { invariant } from "../domain/errors";
import type { StateRepository } from "./state-repository";
// Test-only adapter; never selected as a fallback for production APIs.
export class MemoryStateRepository implements StateRepository {
  private stories = new Map<string, StoryAggregate>();
  async create(value: StoryAggregate) {
    invariant(!this.stories.has(value.story.id), "DUPLICATE", "Story already exists", 409);
    this.stories.set(value.story.id, structuredClone(value));
  }
  async read(id: string) {
    const found = this.stories.get(id);
    invariant(found, "NOT_FOUND", "Story not found", 404);
    return structuredClone(found);
  }
  async transaction<T>(id: string, work: (draft: StoryAggregate) => T) {
    // No await between read and publish: synchronous callback is an atomic unit.
    const found = this.stories.get(id);
    invariant(found, "NOT_FOUND", "Story not found", 404);
    const draft = structuredClone(found);
    const result = work(draft);
    this.stories.set(id, structuredClone(draft));
    return structuredClone(result);
  }
}
