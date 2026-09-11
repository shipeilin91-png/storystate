import Link from "next/link";
export default function NotFound() {
  return (
    <div className="empty-state">
      <p className="eyebrow">404 / STORYSTATE</p>
      <h1>这一页还没有故事</h1>
      <Link className="button primary" href="/">
        返回故事库
      </Link>
    </div>
  );
}
