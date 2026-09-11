import type { Metadata } from "next";
import { StoryProvider } from "@/components/story-provider";
import { WorkspaceShell } from "@/components/workspace-shell";
import "./globals.css";
export const metadata: Metadata = {
  title: {
    default: "StoryState — 故事的每一步，都有迹可循",
    template: "%s | StoryState",
  },
  description:
    "面向长篇与连续文本的故事状态工作台。管理 Story State、检查 Context、审核 State Delta，并追溯每一个版本。",
  icons: { icon: "/favicon.svg" },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>
        <StoryProvider>
          <WorkspaceShell>{children}</WorkspaceShell>
        </StoryProvider>
      </body>
    </html>
  );
}
