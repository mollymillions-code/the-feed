"use client";

import type { MouseEvent } from "react";
import { FeedLink, CATEGORY_COLORS } from "@/types";
import { timeAgo, getDomain } from "@/lib/utils";
import CardActions from "./CardActions";

interface GenericCardProps {
  link: FeedLink;
  onDelete: (id: string) => void;
  onLike: (id: string) => void;
  onOpen: (id: string) => void;
}

export default function GenericCard({ link, onDelete, onLike, onOpen }: GenericCardProps) {
  function handleExternalOpen(event: MouseEvent<HTMLAnchorElement>) {
    if (!link.url) return;
    event.preventDefault();
    event.stopPropagation();
    onOpen(link.id);
    window.open(link.url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="flex flex-col items-center justify-center h-full px-5 gap-4">
      <div className="w-full max-w-[400px] rounded-2.5xl overflow-hidden card-glass p-6 flex flex-col items-center gap-4">
        {/* Thumbnail or fallback */}
        {link.thumbnail ? (
          <img
            src={link.thumbnail}
            alt=""
            className="w-full rounded-xl object-cover max-h-48"
          />
        ) : (
          <div className="w-16 h-16 rounded-2xl bg-white/[0.04] flex items-center justify-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8A8078" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
          </div>
        )}

        {/* Title */}
        <h2 className="font-serif text-[19px] leading-snug text-center line-clamp-3">
          {link.title || (link.url ? getDomain(link.url) : null) || "Saved Link"}
        </h2>

        {/* Description */}
        {link.description && (
          <p className="text-[13px] text-feed-muted text-center line-clamp-3 leading-relaxed">
            {link.description}
          </p>
        )}

        {/* Open link */}
        {link.url && (
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-feed-accent text-[13px] font-medium tracking-wide"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={handleExternalOpen}
          >
            Open link →
          </a>
        )}
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
