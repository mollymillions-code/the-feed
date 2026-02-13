"use client";

import type { MouseEvent } from "react";
import { FeedLink, CATEGORY_COLORS } from "@/types";
import { timeAgo } from "@/lib/utils";
import CardActions from "./CardActions";

function getTweetId(url: string): string | null {
  const match = url.match(/(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)/);
  return match ? match[1] : null;
}

interface TweetCardProps {
  link: FeedLink;
  onDelete: (id: string) => void;
  onLike: (id: string) => void;
  onOpen: (id: string) => void;
}

export default function TweetCard({ link, onDelete, onLike, onOpen }: TweetCardProps) {
  const tweetId = link.url ? getTweetId(link.url) : null;
  function handleExternalOpen(event: MouseEvent<HTMLAnchorElement>) {
    if (!link.url) return;
    event.preventDefault();
    event.stopPropagation();
    onOpen(link.id);
    window.open(link.url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="flex flex-col items-center justify-center h-full px-5 gap-4">
      {/* Tweet Card */}
      <div className="w-full max-w-[400px] rounded-2.5xl overflow-hidden card-glass p-5">
        {tweetId ? (
          <div className="flex flex-col gap-4">
            {/* Author header */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/[0.06] flex items-center justify-center text-base font-bold text-feed-muted">
                𝕏
              </div>
              <div>
                <p className="text-sm font-semibold">{link.siteName || "X"}</p>
                <p className="text-xs text-feed-dim">x.com</p>
              </div>
            </div>

            {/* Tweet content */}
            <p className="text-[15px] leading-relaxed text-feed-text/80">
              {link.description || link.title || ""}
            </p>

            {link.thumbnail && (
              <img
                src={link.thumbnail}
                alt=""
                className="w-full rounded-xl"
              />
            )}

            {link.url && (
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-feed-accent text-[13px] font-medium tracking-wide"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={handleExternalOpen}
              >
                View on X →
              </a>
            )}
          </div>
        ) : (
          <div className="py-8 text-center">
            <p className="text-sm mb-4 text-feed-text/80">{link.title || link.description || "Tweet"}</p>
            {link.url && (
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-feed-accent text-[13px] font-medium tracking-wide"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={handleExternalOpen}
              >
                Open on X →
              </a>
            )}
          </div>
        )}
      </div>

      {/* Source + time */}
      <p className="text-feed-muted text-xs tracking-wide">
        x.com · {timeAgo(link.addedAt)}
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
