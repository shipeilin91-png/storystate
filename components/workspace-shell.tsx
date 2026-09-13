"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Icon, StatusPill, type IconName } from "./product-ui";
import { useStories } from "./story-provider";
import { storyEntryHref, storyRouteLabels } from "@/lib/story-navigation";
import type { Story } from "@/lib/mock-story";
const items: { path: string; label: string; en: string; icon: IconName }[] = [
  {
    path: "workspace",
    label: "创作工作区",
    en: "Workspace",
    icon: "workspace",
  },
  { path: "state", label: "故事状态", en: "State", icon: "state" },
  { path: "history", label: "版本历史", en: "History", icon: "history" },
];
export function WorkspaceShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { stories, storageWarning } = useStories();
  const storyId = pathname.split("/")[2];
  const story = stories.find((s) => s.id === storyId);
  const selected = story ?? stories[0];
  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">
        跳至主要内容
      </a>
      <aside className="sidebar">
        <Link className="brand" href="/">
          <span className="brand-mark">
            S<span>·</span>
          </span>
          StoryState<span className="brand-beta">BETA</span>
        </Link>
        <div className="nav-caption">YOUR WORKSPACE</div>
        <nav aria-label="主导航">
          <Link
            href="/"
            className={pathname === "/" ? "active" : ""}
            aria-current={pathname === "/" ? "page" : undefined}
          >
            <Icon name="stories" />
            故事库
            <span className="nav-count">
              {stories.length.toString().padStart(2, "0")}
            </span>
          </Link>
        </nav>
        <div className="sidebar-divider" />
        <div className="nav-caption">CURRENT STORY</div>
        <CurrentStorySwitch story={selected} />
        <nav aria-label="故事导航">
          {items.map((item) => {
            const active = pathname === `/stories/${selected.id}/${item.path}`;
            return (
              <Link
                key={item.path}
                href={`/stories/${selected.id}/${item.path}`}
                className={active ? "active" : ""}
                aria-current={active ? "page" : undefined}
              >
                <Icon name={item.icon} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        {selected.ready && (
          <Link
            className="story-settings-link"
            href={`/stories/${selected.id}/setup`}
          >
            <Icon name="setup" size={15} />
            Sources & settings
          </Link>
        )}
        <div className="sidebar-bottom">
          <div className="connection-dot" />
          <strong>Frontend preview</strong>
          <p>
            把故事的每一次变化，
            <br />
            留在可追溯的上下文里。
          </p>
          <span>本地 Mock · 无 AI 连接</span>
        </div>
        <div className="profile">
          <span>创</span>
          <div>
            <strong>创作者工作台</strong>
            <small>Personal workspace</small>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <Link href="/">故事库</Link>
            {story && (
              <>
                <span>/</span>
                <span>{story.title}</span>
                <span>/</span>
                <strong>
                  {storyRouteLabels[
                    pathname.split("/")[3] as keyof typeof storyRouteLabels
                  ] ?? "Story"}
                </strong>
              </>
            )}
          </div>
          <div className="topbar-right">
            <span className="text-muted">STATEFUL CONTEXT INFRASTRUCTURE</span>
            <StatusPill tone="good">● &nbsp; Mock mode</StatusPill>
          </div>
        </header>
        <main id="main">
          {storageWarning && (
            <p className="notice warn" role="status">
              浏览器存储不可用；当前更改仅保留至页面刷新。
            </p>
          )}
          {children}
        </main>
        <footer className="app-footer">
          <span>StoryState / Frontend Foundation</span>
          <span>Every story has a state.</span>
        </footer>
      </div>
    </div>
  );
}

export function CurrentStorySwitch({ story }: { story: Story }) {
  return (
    <Link href={storyEntryHref(story)} className="story-switch">
      <span className="mini-cover">{story.title[0]}</span>
      <div>
        <strong>{story.title}</strong>
        <small>
          {story.ready
            ? `第 ${story.chapter} 章 · 当前状态`
            : "等待建立初始状态"}
        </small>
      </div>
      <Icon name="chevron" size={14} />
    </Link>
  );
}
