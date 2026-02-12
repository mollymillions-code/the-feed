"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { FeedLink } from "@/types";
import FeedSwiper, { EngagementEvent, DWELL_ENGAGED_MS, FAST_SWIPE_MS } from "@/components/feed/FeedSwiper";
import CategoryTabs from "@/components/CategoryTabs";
import BottomNav from "@/components/BottomNav";
import EmptyState from "@/components/EmptyState";

export default function FeedPage() {
  const [links, setLinks] = useState<FeedLink[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState("All");
  const [loading, setLoading] = useState(true);

  // Session state — tracks behavioral signals for the recommendation engine
  const sessionId = useMemo(() => `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, []);
  const engagedIdsRef = useRef<string[]>([]);
  const engagedCatsRef = useRef<string[]>([]);
  const skippedCatsRef = useRef<string[]>([]);
  const cardsShownRef = useRef(0);

  // Engagement event queue — batch send to avoid hammering the API
  const eventQueueRef = useRef<EngagementEvent[]>([]);
  const flushTimerRef = useRef<NodeJS.Timeout | null>(null);

  const flushEngagements = useCallback(async () => {
    const events = eventQueueRef.current.splice(0);
    if (events.length === 0) return;

    // Fire-and-forget — don't block the UI
    for (const event of events) {
      fetch("/api/engagement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(event),
      }).catch(() => {});
    }
  }, []);

  // Flush events every 2 seconds
  useEffect(() => {
    flushTimerRef.current = setInterval(flushEngagements, 2000);
    return () => {
      if (flushTimerRef.current) clearInterval(flushTimerRef.current);
      flushEngagements(); // Flush remaining on unmount
    };
  }, [flushEngagements]);

  // Track whether we've done the initial load vs appending more cards
  const hasLoadedRef = useRef(false);

  const fetchFeed = useCallback(async (category: string, append = false) => {
    try {
      const params = new URLSearchParams({
        category,
        limit: "20",
        engagedIds: engagedIdsRef.current.join(","),
        engagedCats: engagedCatsRef.current.join(","),
        skippedCats: skippedCatsRef.current.join(","),
        cardsShown: String(cardsShownRef.current),
      });

      const res = await fetch(`/api/feed?${params}`);
      const data = await res.json();

      if (append) {
        // Append new cards, deduplicating by ID — preserves existing deck order
        setLinks((prev) => {
          const existingIds = new Set(prev.map((l) => l.id));
          const newLinks = data.links.filter((l: FeedLink) => !existingIds.has(l.id));
          return [...prev, ...newLinks];
        });
      } else {
        setLinks(data.links);
      }
      setCategories(data.categories);
    } catch (err) {
      console.error("Failed to fetch feed:", err);
    } finally {
      setLoading(false);
      hasLoadedRef.current = true;
    }
  }, []);

  useEffect(() => {
    fetchFeed(activeCategory);
  }, [activeCategory, fetchFeed]);

  function handleCategorySelect(category: string) {
    setActiveCategory(category);
    setLoading(true);
    hasLoadedRef.current = false;
  }

  function handleDelete(id: string) {
    setLinks((prev) => prev.filter((l) => l.id !== id));
  }

  function handleLike(id: string) {
    // Optimistic toggle
    setLinks((prev) =>
      prev.map((l) =>
        l.id === id
          ? { ...l, likedAt: l.likedAt ? null : new Date().toISOString() }
          : l
      )
    );

    // Persist to server
    const link = links.find((l) => l.id === id);
    fetch(`/api/links/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ liked: !link?.likedAt }),
    }).catch(() => {});
  }

  // The core behavioral signal handler — every interaction flows through here
  const handleEngagement = useCallback(
    (event: EngagementEvent) => {
      // Queue for batch sending
      eventQueueRef.current.push(event);

      // Update session state for real-time feed adaptation
      if (event.eventType === "impression") {
        cardsShownRef.current++;

        // Also increment shown count on the server
        fetch(`/api/links/${event.linkId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ incrementShown: true }),
        }).catch(() => {});
      }

      if (event.eventType === "dwell") {
        const dwellMs = event.dwellTimeMs || 0;
        const link = links.find((l) => l.id === event.linkId);
        const linkCats = link?.categories || [];

        if (dwellMs >= DWELL_ENGAGED_MS) {
          // Engaged — spent meaningful time on this card
          if (!engagedIdsRef.current.includes(event.linkId)) {
            engagedIdsRef.current.push(event.linkId);
          }
          linkCats.forEach((c) => engagedCatsRef.current.push(c));
        } else if (dwellMs < FAST_SWIPE_MS) {
          // Skipped — swiped away quickly
          linkCats.forEach((c) => skippedCatsRef.current.push(c));
        }
      }

      if (event.eventType === "open") {
        // Opening content is a strong engagement signal
        if (!engagedIdsRef.current.includes(event.linkId)) {
          engagedIdsRef.current.push(event.linkId);
        }
        const link = links.find((l) => l.id === event.linkId);
        link?.categories?.forEach((c) => engagedCatsRef.current.push(c));
      }
    },
    [links]
  );

  function handleNearEnd() {
    // Append new cards — preserves existing deck so back-swiping works
    fetchFeed(activeCategory, true);
  }

  return (
    <>
      <CategoryTabs
        categories={categories}
        activeCategory={activeCategory}
        onSelect={handleCategorySelect}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full px-5 gap-4 animate-pulse">
            <div className="w-full max-w-[400px] rounded-2.5xl overflow-hidden card-glass">
              <div className="aspect-[2/1] bg-white/[0.02]" />
              <div className="p-5 space-y-3">
                <div className="h-5 w-3/4 rounded-lg bg-white/[0.03]" />
                <div className="h-4 w-1/2 rounded-lg bg-white/[0.03]" />
              </div>
            </div>
            <div className="h-3 w-32 rounded-full bg-white/[0.03]" />
            <div className="flex gap-2">
              <div className="h-6 w-16 rounded-full bg-white/[0.03]" />
              <div className="h-6 w-14 rounded-full bg-white/[0.03]" />
            </div>
            <div className="h-10 w-28 rounded-full bg-white/[0.03]" />
          </div>
        ) : links.length === 0 ? (
          <EmptyState />
        ) : (
          <FeedSwiper
            links={links}
            onDelete={handleDelete}
            onLike={handleLike}
            onEngagement={handleEngagement}
            onNearEnd={handleNearEnd}
            sessionId={sessionId}
          />
        )}
      </div>

      <BottomNav />
    </>
  );
}
