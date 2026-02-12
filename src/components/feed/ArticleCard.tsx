"use client";

import { FeedLink, CATEGORY_COLORS } from "@/types";
import CardActions from "./CardActions";

function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return "";
  }
}

interface ArticleCardProps {
  link: FeedLink;
  onDelete: (id: string) => void;
  onOpen: (id: string) => void;
}

export default function ArticleCard({ link, onDelete, onOpen }: ArticleCardProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-5 gap-4">
      {/* Article Card */}
      <div className="w-full max-w-[400px] rounded-2.5xl overflow-hidden card-glass">
        {/* Hero image with gradient fade */}
        {link.thumbnail && (
          <div className="relative aspect-[2/1] overflow-hidden">
            <img
              src={link.thumbnail}
              alt=""
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
          </div>
        )}

        {/* Content */}
        <div className="p-5 space-y-3.5">
          <h2 className="text-[17px] font-semibold leading-snug line-clamp-2 tracking-tight">
            {link.title || "Untitled Article"}
          </h2>

          {/* AI Summary */}
          {link.aiSummary && (
            <div className="bg-white/[0.03] rounded-xl p-3.5 border-l-2 border-feed-accent/30">
              <p className="text-[13px] text-feed-muted leading-relaxed line-clamp-4">
                {link.aiSummary}
              </p>
            </div>
          )}

          <a
            href={link.url || undefined}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-feed-accent text-[13px] font-medium tracking-wide"
            onClick={() => onOpen(link.id)}
          >
            Read full article →
          </a>
        </div>
      </div>

      {/* Source + time */}
      <p className="text-neutral-500 text-xs tracking-wide">
        {link.url ? getDomain(link.url) : ""}{link.url ? " · " : ""}{timeAgo(link.addedAt)}
      </p>

      {/* Category tags */}
      {link.categories && link.categories.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap justify-center">
          {link.categories.map((cat) => (
            <span
              key={cat}
              className="px-3 py-1 rounded-full text-[11px] font-semibold tracking-wider uppercase"
              style={{
                backgroundColor: `${CATEGORY_COLORS[cat] || "#888"}12`,
                color: CATEGORY_COLORS[cat] || "#888",
              }}
            >
              {cat}
            </span>
          ))}
        </div>
      )}

      <CardActions linkId={link.id} onDelete={onDelete} />
    </div>
  );
}
