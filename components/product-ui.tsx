import type { ReactNode } from "react";
export type IconName =
  | "arrow"
  | "check"
  | "warning"
  | "chevron"
  | "info"
  | "stories"
  | "workspace"
  | "state"
  | "history"
  | "setup"
  | "review"
  | "plus"
  | "search";
export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    arrow: (
      <>
        <path d="M5 12h14" />
        <path d="m14 7 5 5-5 5" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    warning: (
      <>
        <path d="M12 4 3 20h18L12 4Z" />
        <path d="M12 9v4M12 17h.01" />
      </>
    ),
    chevron: <path d="m9 6 6 6-6 6" />,
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5M12 8h.01" />
      </>
    ),
    stories: (
      <>
        <rect x="4" y="4" width="6" height="16" rx="1" />
        <path d="m14 4 5-1 3 16-5 1Z M6 8h2" />
      </>
    ),
    workspace: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M15 4v16M6 8h6M6 12h6" />
      </>
    ),
    state: (
      <>
        <circle cx="12" cy="5" r="2" />
        <circle cx="5" cy="18" r="2" />
        <circle cx="19" cy="18" r="2" />
        <path d="M12 7v5M5 16v-4h14v4" />
      </>
    ),
    history: (
      <>
        <path d="M3 11a9 9 0 1 1 2 7M3 5v6h6" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    setup: (
      <>
        <path d="M12 16V3m-4 4 4-4 4 4M4 14v6h16v-6" />
      </>
    ),
    review: (
      <>
        <rect x="5" y="3" width="14" height="18" rx="2" />
        <path d="m8 9 2 2 5-5M8 15h8" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    search: (
      <>
        <circle cx="10" cy="10" r="6" />
        <path d="m15 15 5 5" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
export function StatusPill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "good" | "warn" | "bad" | "neutral" | "blue";
}) {
  return <span className={`status-pill ${tone}`}>{children}</span>;
}
export function PageIntro({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-intro">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="description">{description}</p>}
      </div>
      {action}
    </header>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty-state">
      <Icon name="stories" size={28} />
      <h2>{title}</h2>
      <div>{children}</div>
    </div>
  );
}
