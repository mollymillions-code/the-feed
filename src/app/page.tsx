"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { FeedLink } from "@/types";
import FeedSwiper, { EngagementEvent, DWELL_ENGAGED_MS, FAST_SWIPE_MS } from "@/components/feed/FeedSwiper";
import CategoryTabs from "@/components/CategoryTabs";
import BottomNav from "@/components/BottomNav";
import EmptyState from "@/components/EmptyState";

const FEED_PAGE_SIZE = 20;
const MAX_SESSION_SIGNAL_ITEMS = 200;

export default function FeedPage() {
  const [links, setLinks] = useState<FeedLink[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState("All");
  const [loading, setLoading] = useState(true);

  // Session state — tracks behavioral signals for the recommendation engine
  const sessionId = useMemo(() => `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, []);
  const engagedIdsRef = useRef<string[]>([]);
  const engagedIdSetRef = useRef<Set<string>>(new Set());
  const engagedCatsRef = useRef<string[]>([]);
  const skippedCatsRef = useRef<string[]>([]);
  const cardsShownRef = useRef(0);
  const linksRef = useRef<FeedLink[]>([]);
  const linkByIdRef = useRef<Map<string, FeedLink>>(new Map());

  // Engagement event queue — batch send to avoid hammering the API
  const eventQueueRef = useRef<EngagementEvent[]>([]);
  const flushTimerRef = useRef<NodeJS.Timeout | null>(null);
  const appendInFlightRef = useRef(false);
  const hasMoreRef = useRef(true);
  const requestSeqRef = useRef(0);

  useEffect(() => {
    linksRef.current = links;
    linkByIdRef.current = new Map(links.map((link) => [link.id, link]));
  }, [links]);

  const addEngagedId = useCallback((id: string) => {
    if (engagedIdSetRef.current.has(id)) return;

    engagedIdSetRef.current.add(id);
    engagedIdsRef.current.push(id);

    if (engagedIdsRef.current.length > MAX_SESSION_SIGNAL_ITEMS) {
      const removed = engagedIdsRef.current.shift();
      if (removed) {
        engagedIdSetRef.current.delete(removed);
      }
    }
  }, []);

  const pushCategorySignals = useCallback((target: string[], categories: string[]) => {
    if (categories.length === 0) return;

    target.push(...categories);
    if (target.length > MAX_SESSION_SIGNAL_ITEMS) {
      target.splice(0, target.length - MAX_SESSION_SIGNAL_ITEMS);
    }
  }, []);

  const flushEngagements = useCallback(async () => {
    const events = eventQueueRef.current.splice(0);
    if (events.length === 0) return;

    fetch("/api/engagement", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events }),
      keepalive: true,
    }).catch(() => {});
  }, []);

  // Flush events every 2 seconds
  useEffect(() => {
    flushTimerRef.current = setInterval(flushEngagements, 2000);
    return () => {
      if (flushTimerRef.current) clearInterval(flushTimerRef.current);
      flushEngagements(); // Flush remaining on unmount
    };
  }, [flushEngagements]);

  const fetchFeed = useCallback(async (category: string, append = false) => {
    if (append) {
      if (appendInFlightRef.current || !hasMoreRef.current) return;
      appendInFlightRef.current = true;
    } else {
      hasMoreRef.current = true;
    }

    const requestId = ++requestSeqRef.current;

    try {
      const params = new URLSearchParams({
        category,
        limit: String(FEED_PAGE_SIZE),
        excludeIds: append ? linksRef.current.map((link) => link.id).join(",") : "",
        engagedIds: engagedIdsRef.current.join(","),
        engagedCats: engagedCatsRef.current.join(","),
        skippedCats: skippedCatsRef.current.join(","),
        cardsShown: String(cardsShownRef.current),
      });

      const res = await fetch(`/api/feed?${params}`);
      if (!res.ok) {
        throw new Error(`Feed request failed with status ${res.status}`);
      }

      const data = await res.json();
      if (requestId !== requestSeqRef.current) return;
      const incoming = (data.links || []) as FeedLink[];

      if (append) {
        setLinks((prev) => {
          const existingIds = new Set(prev.map((link) => link.id));
          const next = incoming.filter((link) => !existingIds.has(link.id));
          return [...prev, ...next];
        });
      } else {
        setLinks(incoming);
      }

      setCategories(data.categories || []);
      hasMoreRef.current = incoming.length >= FEED_PAGE_SIZE;
    } catch (err) {
      console.error("Failed to fetch feed:", err);
    } finally {
      if (requestId === requestSeqRef.current) {
        setLoading(false);
      }
      if (append) {
        appendInFlightRef.current = false;
      }
    }
  }, []);

  useEffect(() => {
    fetchFeed(activeCategory);
  }, [activeCategory, fetchFeed]);

  function handleCategorySelect(category: string) {
    if (category === activeCategory) return;
    requestSeqRef.current++;
    appendInFlightRef.current = false;
    hasMoreRef.current = true;
    setActiveCategory(category);
    setLoading(true);
  }

  function handleDelete(id: string) {
    setLinks((prev) => prev.filter((l) => l.id !== id));
  }

  function handleLike(id: string) {
    const currentlyLiked = !!linkByIdRef.current.get(id)?.likedAt;

    // Optimistic toggle
    setLinks((prev) =>
      prev.map((l) =>
        l.id === id
          ? { ...l, likedAt: currentlyLiked ? null : new Date().toISOString() }
          : l
      )
    );

    // Persist to server
    fetch(`/api/links/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ liked: !currentlyLiked }),
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
      }

      const linkCats = linkByIdRef.current.get(event.linkId)?.categories || [];

      if (event.eventType === "dwell") {
        const dwellMs = event.dwellTimeMs || 0;

        if (dwellMs >= DWELL_ENGAGED_MS) {
          // Engaged — spent meaningful time on this card
          addEngagedId(event.linkId);
          pushCategorySignals(engagedCatsRef.current, linkCats);
        } else if (dwellMs < FAST_SWIPE_MS) {
          // Skipped — swiped away quickly
          pushCategorySignals(skippedCatsRef.current, linkCats);
        }
      }

      if (event.eventType === "open") {
        // Opening content is a strong engagement signal
        addEngagedId(event.linkId);
        pushCategorySignals(engagedCatsRef.current, linkCats);
      }
    },
    [addEngagedId, pushCategorySignals]
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
