"use client";

import type { MouseEvent } from "react";
import { FeedLink, CATEGORY_COLORS } from "@/types";
import { timeAgo, getDomain } from "@/lib/utils";
import CardActions from "./CardActions";

interface ArticleCardProps {
  link: FeedLink;
  onDelete: (id: string) => void;
  onLike: (id: string) => void;
  onOpen: (id: string) => void;
}

export default function ArticleCard({ link, onDelete, onLike, onOpen }: ArticleCardProps) {
  function handleExternalOpen(event: MouseEvent<HTMLAnchorElement>) {
    if (!link.url) return;
    event.preventDefault();
    event.stopPropagation();
    onOpen(link.id);
    window.open(link.url, "_blank", "noopener,noreferrer");
  }

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
          <h2 className="font-serif text-[19px] leading-snug line-clamp-2">
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

          {link.url && (
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-feed-accent text-[13px] font-medium tracking-wide"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={handleExternalOpen}
            >
              Read full article →
            </a>
          )}
        </div>
      </div>

      {/* Source + time */}
      <p className="text-feed-muted text-xs tracking-wide">
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
                backgroundColor: `${CATEGORY_COLORS[cat] || "#888888"}12`,
                color: CATEGORY_COLORS[cat] || "#888888",
              }}
            >
              {cat}
            </span>
          ))}
        </div>
      )}

      <CardActions linkId={link.id} liked={!!link.likedAt} onLike={onLike} onDelete={onDelete} />
    </div>
  );
}
