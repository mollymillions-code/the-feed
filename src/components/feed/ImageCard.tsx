"use client";

import { FeedLink, CATEGORY_COLORS } from "@/types";
import { timeAgo } from "@/lib/utils";
import CardActions from "./CardActions";

interface ImageCardProps {
  link: FeedLink;
  onDelete: (id: string) => void;
  onLike: (id: string) => void;
  onOpen: (id: string) => void;
}

export default function ImageCard({ link, onDelete, onLike, onOpen }: ImageCardProps) {
  const imageSrc = link.imageData || link.thumbnail;

  return (
    <div className="flex flex-col items-center justify-center h-full px-5 gap-4">
      {/* Image */}
      <div
        className="w-full max-w-[400px] max-h-[55vh] rounded-2.5xl overflow-hidden card-glass"
        onClick={() => onOpen(link.id)}
      >
        {imageSrc ? (
          <img
            src={imageSrc}
            alt={link.title || "Saved image"}
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="w-full h-48 flex items-center justify-center text-feed-muted text-sm">
            Image unavailable
          </div>
        )}
      </div>

      {/* Title */}
      {link.title && link.title !== "Image" && (
        <h2 className="font-serif text-[19px] leading-snug text-center line-clamp-2 max-w-[400px]">
          {link.title}
        </h2>
      )}

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
