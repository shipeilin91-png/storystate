import { notFound } from "next/navigation";
import { StoryScreen } from "@/components/story-screen";
const views = ["setup", "state", "workspace", "review", "history"] as const;
export async function generateMetadata({
  params,
}: {
  params: Promise<{ storyId: string; view: string }>;
}) {
  const { view } = await params;
  const names: Record<string, string> = {
    setup: "设定与导入",
    state: "故事状态",
    workspace: "创作工作区",
    review: "变更审核",
    history: "版本历史",
  };
  return { title: names[view] ?? "未找到页面" };
}
export default async function Page({
  params,
}: {
  params: Promise<{ storyId: string; view: string }>;
}) {
  const { storyId, view } = await params;
  if (!views.includes(view as (typeof views)[number])) notFound();
  return <StoryScreen storyId={storyId} view={view} />;
}
