"use client";
import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  type ReactNode,
} from "react";
import { initialStories, type Story } from "@/lib/mock-story";
import {
  restoreStoredStories,
  updateStoryInCollection,
} from "@/lib/story-store";
import { withReviewExamples } from "@/lib/review-fixtures";
import { storyPersistence } from "@/lib/frontend/story-state-service";
type Store = { stories: Story[]; ready: boolean; storageWarning: boolean };
type Action =
  | { type: "storage-error" }
  | { type: "hydrate"; stories: Story[] }
  | { type: "update"; id: string; update: (s: Story) => Story }
  | { type: "add"; story: Story };
function reducer(state: Store, action: Action): Store {
  if (action.type === "storage-error")
    return { ...state, storageWarning: true };
  if (action.type === "hydrate")
    return { ...state, stories: action.stories, ready: true };
  if (action.type === "add")
    return { ...state, stories: [...state.stories, action.story] };
  return {
    ...state,
    stories: updateStoryInCollection(state.stories, action.id, action.update),
  };
}
const Context = createContext<{
  stories: Story[];
  ready: boolean;
  update: (id: string, fn: (s: Story) => Story) => void;
  add: (s: Story) => void;
  storageWarning: boolean;
} | null>(null);
export function StoryProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, {
    stories: initialStories,
    ready: false,
    storageWarning: false,
  });
  useEffect(() => {
    const stored = storyPersistence.load();
    const stories = stored
      ? (restoreStoredStories(stored) ?? initialStories)
      : initialStories;
    dispatch({ type: "hydrate", stories: withReviewExamples(stories) });
  }, []);
  useEffect(() => {
    if (state.ready && !storyPersistence.save(state.stories)) {
      dispatch({ type: "storage-error" });
    }
  }, [state.ready, state.stories]);
  return (
    <Context.Provider
      value={{
        ...state,
        update: (id, update) => dispatch({ type: "update", id, update }),
        add: (story) => dispatch({ type: "add", story }),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useStories() {
  const store = useContext(Context);
  if (!store) throw new Error("StoryProvider required");
  return store;
}
