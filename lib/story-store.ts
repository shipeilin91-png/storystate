import { type Entity, type Story, type Version } from "./mock-story";

export function updateStoryInCollection(
  stories: Story[],
  id: string,
  update: (story: Story) => Story,
) {
  return stories.map((story) => (story.id === id ? update(story) : story));
}

type LegacyVersion = Omit<Version, "stateVersion"> & { stateVersion?: number };
type LegacyStory = Omit<Story, "currentStateVersion" | "versions"> & {
  currentStateVersion?: number;
  versions: LegacyVersion[];
};
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
const strings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((v) => typeof v === "string");
const counter = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) >= 0;
function entities(value: unknown): value is Entity[] {
  return (
    Array.isArray(value) &&
    value.every(
      (e) =>
        object(e) &&
        ["id", "name", "category", "summary", "evidence"].every(
          (k) => typeof e[k] === "string",
        ) &&
        counter(e.chapter) &&
        object(e.fields) &&
        Object.values(e.fields).every((v) => typeof v === "string"),
    )
  );
}
function isStoredStory(value: unknown): value is LegacyStory {
  if (!object(value)) return false;
  return (
    ["id", "title", "description", "genre", "updated", "prompt"].every(
      (k) => typeof value[k] === "string",
    ) &&
    typeof value.ready === "boolean" &&
    counter(value.chapter) &&
    strings(value.imports) &&
    entities(value.entities) &&
    (value.currentStateVersion === undefined ||
      counter(value.currentStateVersion)) &&
    Array.isArray(value.deltas) &&
    value.deltas.every(
      (d) =>
        object(d) &&
        [
          "id",
          "entityId",
          "field",
          "before",
          "after",
          "reason",
          "evidence",
        ].every((k) => typeof d[k] === "string") &&
        ["pending", "accepted", "rejected"].includes(d.decision as string) &&
        ["normal", "high", "conflict"].includes(d.risk as string),
    ) &&
    Array.isArray(value.versions) &&
    value.versions.every(
      (v) =>
        object(v) &&
        ["id", "date", "title"].every((k) => typeof v[k] === "string") &&
        counter(v.chapter) &&
        strings(v.changes) &&
        entities(v.entities) &&
        (v.stateVersion === undefined || counter(v.stateVersion)),
    )
  );
}

// Upgrade the existing origin-local Stage 1.1 cache without losing edits.
// Legacy fixture ids seed the sequence once; chapter never drives new versions.
export function restoreStoredStories(value: unknown): Story[] | null {
  if (!Array.isArray(value) || !value.length || !value.every(isStoredStory))
    return null;
  return value.map((story) => {
    let previous = 0;
    const known = new Map<string, number>();
    const chronological = [...story.versions].reverse().map((v, index) => {
      const fixtureNumber =
        index === 0 ? Number(/^v(\d+)$/.exec(v.id)?.[1] ?? 1) : previous + 1;
      const stateVersion = Math.max(
        v.stateVersion ?? fixtureNumber,
        previous + 1,
      );
      previous = stateVersion;
      const legacySourceId = /^从版本 (\S+) 恢复/.exec(v.changes[0] ?? "")?.[1];
      const restoredFromStateVersion =
        v.restoredFromStateVersion ??
        (legacySourceId ? known.get(legacySourceId) : undefined);
      known.set(v.id, stateVersion);
      return {
        ...v,
        stateVersion,
        ...(restoredFromStateVersion !== undefined
          ? { restoredFromStateVersion }
          : {}),
      };
    });
    const versions = chronological.reverse();
    return {
      ...story,
      versions,
      currentStateVersion: versions[0]?.stateVersion ?? 0,
    };
  });
}
