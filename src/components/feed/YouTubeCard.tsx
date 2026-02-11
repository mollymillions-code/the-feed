"use client";

import { FeedLink, CATEGORY_COLORS } from "@/types";
import DoneButton from "./DoneButton";

function getYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

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

interface YouTubeCardProps {
  link: FeedLink;
  onDone: (id: string) => void;
  onOpen: (id: string) => void;
}

export default function YouTubeCard({ link, onDone, onOpen }: YouTubeCardProps) {
  const videoId = link.url ? getYouTubeId(link.url) : null;

  return (
    <div className="flex flex-col items-center justify-center h-full px-5 gap-4">
      {/* YouTube Player */}
      <div className="w-full max-w-[400px] aspect-video rounded-2.5xl overflow-hidden card-glass">
        {videoId ? (
          <div onClick={() => onOpen(link.id)} className="w-full h-full">
            <iframe
              src={`https://www.youtube.com/embed/${videoId}?playsinline=1&rel=0`}
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-feed-muted text-sm">
            Video unavailable
          </div>
        )}
      </div>

      {/* Title */}
      <div className="w-full max-w-[400px] text-center px-2">
        <h2 className="text-[17px] font-semibold leading-snug line-clamp-2 tracking-tight">
          {link.title || "Untitled Video"}
        </h2>
      </div>

      {/* Source + time */}
      <p className="text-neutral-500 text-xs tracking-wide">
        youtube.com · {timeAgo(link.addedAt)}
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
