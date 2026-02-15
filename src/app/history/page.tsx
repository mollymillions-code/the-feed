"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { FeedLink, CATEGORY_COLORS } from "@/types";
import { timeAgo } from "@/lib/utils";
import ContentTypeIcon from "@/components/ContentTypeIcon";
import BottomNav from "@/components/BottomNav";

export default function HistoryPage() {
  const [items, setItems] = useState<FeedLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const cursorRef = useRef<string | null>(null);
  const loadingMoreRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadItems = useCallback(async (append = false) => {
    if (append) {
      if (loadingMoreRef.current || !hasMore) return;
      loadingMoreRef.current = true;
    }

    try {
      const params = new URLSearchParams({
        mode: "timeline",
        limit: "30",
        includeCategories: "0",
      });
      if (append && cursorRef.current) {
        params.set("cursor", cursorRef.current);
      }

      const res = await fetch(`/api/links?${params}`);
      if (!res.ok) throw new Error("Failed to load history");

      const data = await res.json();
      const incoming = (data.links || []) as FeedLink[];

      if (append) {
        setItems((prev) => {
          const existingIds = new Set(prev.map((l) => l.id));
          return [...prev, ...incoming.filter((l) => !existingIds.has(l.id))];
        });
      } else {
        setItems(incoming);
      }

      setHasMore(data.hasMore === true);
      cursorRef.current = data.nextCursor || null;
    } catch (err) {
      console.error("Failed to load history:", err);
    } finally {
      setLoading(false);
      loadingMoreRef.current = false;
    }
  }, [hasMore]);

  useEffect(() => {
    loadItems();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Infinite scroll via IntersectionObserver
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loadingMoreRef.current) {
          loadItems(true);
        }
      },
      { rootMargin: "200px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadItems]);

  function handleItemClick(item: FeedLink) {
    if (item.url) {
      window.open(item.url, "_blank", "noopener,noreferrer");
      return;
    }
    // For images and text without URLs, we could open a viewer
    // For now, images with imageData open in a new tab
    if (item.contentType === "image" && item.imageData) {
      window.open(item.imageData, "_blank");
      return;
    }
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <h1 className="font-serif text-[22px] text-center mb-6">History</h1>

        {loading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="animate-pulse card-glass rounded-xl px-4 py-3.5 flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-white/[0.03] flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-3/4 rounded-lg bg-white/[0.03]" />
                  <div className="h-3 w-1/2 rounded-lg bg-white/[0.03]" />
                </div>
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#5C544D" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <p className="text-feed-dim text-[14px] tracking-wide">No items yet</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {items.map((item) => (
              <button
                key={item.id}
                onClick={() => handleItemClick(item)}
                className="w-full flex items-center gap-3 card-glass rounded-xl px-4 py-3.5 text-left active:scale-[0.99] transition-transform"
              >
                {/* Thumbnail or icon */}
                <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-white/[0.03] flex items-center justify-center">
                  {item.thumbnail ? (
                    <img src={item.thumbnail} alt="" className="w-full h-full object-cover" />
                  ) : item.contentType === "image" && item.imageData ? (
                    <img src={item.imageData} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <ContentTypeIcon type={item.contentType} />
                  )}
                </div>

                {/* Text content */}
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-medium truncate tracking-tight">
                    {item.title || item.textContent?.slice(0, 60) || item.url || "Untitled"}
                  </p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {item.categories?.slice(0, 2).map((cat) => (
                      <span
                        key={cat}
                        className="text-[10px] font-semibold tracking-wider uppercase"
                        style={{ color: CATEGORY_COLORS[cat] || "#8A8078" }}
                      >
                        {cat}
                      </span>
                    ))}
                    <span className="text-feed-dim text-[11px] tracking-wide">
                      {timeAgo(item.addedAt)}
                    </span>
                  </div>
                </div>

                {/* Chevron */}
                {(item.url || (item.contentType === "image" && item.imageData)) && (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5C544D" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                )}
              </button>
            ))}

            {/* Sentinel for infinite scroll */}
            <div ref={sentinelRef} className="h-1" />

            {loadingMoreRef.current && (
              <div className="py-4 text-center">
                <span className="text-feed-dim text-[12px] animate-pulse tracking-wide">Loading more...</span>
              </div>
            )}

            {!hasMore && items.length > 0 && (
              <p className="text-feed-dim text-[12px] text-center py-4 tracking-wide">
                That&apos;s everything
              </p>
            )}
          </div>
        )}
      </div>

      <BottomNav />
    </>
  );
}
