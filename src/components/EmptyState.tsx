import Link from "next/link";

export default function EmptyState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
      <div className="relative mb-8">
        <div className="absolute -inset-6 bg-feed-accent/[0.06] rounded-full blur-2xl animate-glow-pulse" />
        <div className="relative text-5xl">📭</div>
      </div>

      <h2 className="text-xl font-bold mb-2 tracking-tight">Your feed is empty</h2>
      <p className="text-feed-muted mb-10 text-sm leading-relaxed max-w-[260px]">
        Add your first link to start building your personal feed
      </p>
      <Link
        href="/add"
        className="inline-flex items-center gap-2 bg-feed-accent text-white px-7 py-3.5 rounded-full text-sm font-semibold tracking-wide transition-all duration-200 active:scale-95 shadow-[0_0_24px_rgba(129,140,248,0.2)]"
      >
        <span className="text-base">+</span>
        Add a link
      </Link>
    </div>
  );
}
