"use client";
import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  type ReactNode,
} from "react";
import { initialStories, type Story } from "@/lib/mock-story";
const KEY = "storystate.foundation.v1";
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
    stories: state.stories.map((s) =>
      s.id === action.id ? action.update(s) : s,
    ),
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
    let stories = initialStories;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (
          Array.isArray(parsed) &&
          parsed.length &&
          parsed.every(
            (s) =>
              typeof s.id === "string" &&
              typeof s.title === "string" &&
              Array.isArray(s.entities) &&
              Array.isArray(s.deltas) &&
              Array.isArray(s.versions) &&
              Array.isArray(s.imports) &&
              typeof s.prompt === "string",
          )
        )
          stories = parsed;
      }
    } catch {
      /* A corrupt or inaccessible cache falls back to fixtures. */
    }
    dispatch({ type: "hydrate", stories });
  }, []);
  useEffect(() => {
    if (state.ready) {
      try {
        localStorage.setItem(KEY, JSON.stringify(state.stories));
      } catch {
        dispatch({ type: "storage-error" });
      }
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
