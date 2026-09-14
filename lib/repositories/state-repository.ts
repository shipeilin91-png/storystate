import type { StoryAggregate } from "../domain/state";
// Implementations serialize a story's entire unit of work and roll back on failure.
// These are internal storage ports; application callers use StateService.
export interface StateRepository {
  create(value: StoryAggregate): Promise<void>;
  read(storyId: string): Promise<StoryAggregate>;
  transaction<T>(storyId: string, work: (draft: StoryAggregate) => T): Promise<T>;
}
