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

interface ImageCardProps {
  link: FeedLink;
  onDone: (id: string) => void;
  onDelete: (id: string) => void;
  onOpen: (id: string) => void;
}

export default function ImageCard({ link, onDone, onDelete, onOpen }: ImageCardProps) {
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
        <h2 className="text-[17px] font-semibold leading-snug text-center line-clamp-2 max-w-[400px] tracking-tight">
          {link.title}
        </h2>
      )}

      <p className="text-neutral-500 text-xs tracking-wide">
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
                backgroundColor: `${CATEGORY_COLORS[cat] || "#888"}12`,
                color: CATEGORY_COLORS[cat] || "#888",
              }}
            >
              {cat}
            </span>
          ))}
        </div>
      )}

      <CardActions linkId={link.id} onDone={onDone} onDelete={onDelete} />
    </div>
  );
}
