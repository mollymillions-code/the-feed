"use client";

import { FeedLink, CATEGORY_COLORS } from "@/types";
import { timeAgo } from "@/lib/utils";
import CardActions from "./CardActions";

interface TextCardProps {
  link: FeedLink;
  onDelete: (id: string) => void;
  onLike: (id: string) => void;
  onOpen: (id: string) => void;
}

export default function TextCard({ link, onDelete, onLike, onOpen }: TextCardProps) {
  return (
    <div
      className="flex flex-col items-center justify-center h-full px-5 gap-4"
      onClick={() => onOpen(link.id)}
    >
      {/* Text content card */}
      <div className="w-full max-w-[400px] rounded-2.5xl card-glass p-6 max-h-[60vh] overflow-y-auto no-scrollbar">
        {/* Title if different from content */}
        {link.title && link.title !== link.textContent?.slice(0, 80) && (
          <h2 className="font-serif text-[19px] mb-4 leading-snug">
            {link.title}
          </h2>
        )}

        {/* The text content */}
        <p className="text-[15px] leading-[1.7] text-feed-text/80 whitespace-pre-wrap">
          {link.textContent || link.description || ""}
        </p>
      </div>

      <p className="text-feed-muted text-xs tracking-wide">
        {timeAgo(link.addedAt)}
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
