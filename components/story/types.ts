import type { Story } from "@/lib/mock-story";
export type Update = (fn: (story: Story) => Story) => void;
