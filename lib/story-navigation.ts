import type { Story } from "./mock-story";

export const storyRouteLabels = {
  workspace: "Workspace",
  state: "State",
  history: "History",
  setup: "Sources & settings",
  review: "Review changes",
} as const;

export function storyEntryHref(story: Pick<Story, "id" | "ready">) {
  return `/stories/${story.id}/${story.ready ? "workspace" : "setup"}`;
}
