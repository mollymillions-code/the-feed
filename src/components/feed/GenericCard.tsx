"use client";

import { FeedLink, CATEGORY_COLORS } from "@/types";
import DoneButton from "./DoneButton";

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

interface GenericCardProps {
  link: FeedLink;
  onDone: (id: string) => void;
  onOpen: (id: string) => void;
}

export default function GenericCard({ link, onDone, onOpen }: GenericCardProps) {
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
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#525252" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
          </div>
        )}

        {/* Title */}
        <h2 className="text-[17px] font-semibold leading-snug text-center line-clamp-3 tracking-tight">
          {link.title || (link.url ? getDomain(link.url) : null) || "Saved Link"}
        </h2>

        {/* Description */}
        {link.description && (
          <p className="text-[13px] text-feed-muted text-center line-clamp-3 leading-relaxed">
            {link.description}
          </p>
        )}

        {/* Open link */}
        <a
          href={link.url || undefined}
          target="_blank"
          rel="noopener noreferrer"
          className="text-feed-accent text-[13px] font-medium tracking-wide"
          onClick={() => onOpen(link.id)}
        >
          Open link →
        </a>
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

      <DoneButton linkId={link.id} onDone={onDone} />
    </div>
  );
}
