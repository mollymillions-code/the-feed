"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence, PanInfo } from "framer-motion";
import { FeedLink } from "@/types";
import FeedCard from "./FeedCard";

const SWIPE_THRESHOLD = 80;
const DWELL_ENGAGED_MS = 3000; // 3s+ = "engaged"
const FAST_SWIPE_MS = 1500;    // <1.5s = "skipped"

interface FeedSwiperProps {
  links: FeedLink[];
  onDelete: (id: string) => void;
  onEngagement: (event: EngagementEvent) => void;
  onNearEnd: () => void;
  sessionId: string;
}

export interface EngagementEvent {
  linkId: string;
  eventType: "impression" | "dwell" | "open";
  dwellTimeMs?: number;
  swipeVelocity?: number;
  cardIndex?: number;
  sessionId: string;
}

export default function FeedSwiper({
  links,
  onDelete,
  onEngagement,
  onNearEnd,
  sessionId,
}: FeedSwiperProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(0);

  // Behavioral tracking refs
  const cardStartTime = useRef<number>(Date.now());
  const currentLinkRef = useRef<string | null>(null);

  // Track when a new card is shown
  useEffect(() => {
    const link = links[currentIndex];
    if (!link) return;

    // Log impression
    cardStartTime.current = Date.now();
    currentLinkRef.current = link.id;

    onEngagement({
      linkId: link.id,
      eventType: "impression",
      cardIndex: currentIndex,
      sessionId,
    });
  }, [currentIndex, links, onEngagement, sessionId]);

  // Log dwell time when leaving a card
  const logDwell = useCallback(
    (swipeVelocity?: number) => {
      const linkId = currentLinkRef.current;
      if (!linkId) return;

      const dwellTimeMs = Date.now() - cardStartTime.current;

      onEngagement({
        linkId,
        eventType: "dwell",
        dwellTimeMs,
        swipeVelocity,
        cardIndex: currentIndex,
        sessionId,
      });
    },
    [currentIndex, onEngagement, sessionId]
  );

  const goNext = useCallback(
    (velocity?: number) => {
      if (currentIndex < links.length - 1) {
        logDwell(velocity);
        setDirection(1);
        setCurrentIndex((prev) => {
          const next = prev + 1;
          if (next >= links.length - 5) onNearEnd();
          return next;
        });
      }
    },
    [currentIndex, links.length, logDwell, onNearEnd]
  );

  const goPrev = useCallback(
    (velocity?: number) => {
      if (currentIndex > 0) {
        logDwell(velocity);
        setDirection(-1);
        setCurrentIndex((prev) => prev - 1);
      }
    },
    [currentIndex, logDwell]
  );

  function handleDragEnd(_: unknown, info: PanInfo) {
    const { offset, velocity } = info;

    // Compute swipe velocity in px/ms (higher = faster swipe)
    const swipeSpeed = Math.abs(velocity.y) / 1000;

    if (offset.y < -SWIPE_THRESHOLD || velocity.y < -500) {
      goNext(swipeSpeed);
    } else if (offset.y > SWIPE_THRESHOLD || velocity.y > 500) {
      goPrev(swipeSpeed);
    }
  }

  function handleDelete(id: string) {
    onDelete(id);

    if (currentIndex < links.length - 1) {
      setDirection(1);
      setCurrentIndex((prev) => prev + 1);
    } else if (currentIndex > 0) {
      setDirection(-1);
      setCurrentIndex((prev) => prev - 1);
    }
  }

  function handleOpen(id: string) {
    onEngagement({
      linkId: id,
      eventType: "open",
      dwellTimeMs: Date.now() - cardStartTime.current,
      cardIndex: currentIndex,
      sessionId,
    });
  }

  const currentLink = links[currentIndex];
  if (!currentLink) return null;

  const variants = {
    enter: (dir: number) => ({
      y: dir > 0 ? "100%" : "-100%",
      opacity: 0,
    }),
    center: {
      y: 0,
      opacity: 1,
    },
    exit: (dir: number) => ({
      y: dir > 0 ? "-100%" : "100%",
      opacity: 0,
    }),
  };

  return (
    <div className="relative flex-1 overflow-hidden">
      {/* Progress bar */}
      <div className="absolute top-0 left-0 right-0 z-10 h-[3px] bg-white/[0.04]">
        <div
          className="h-full bg-gradient-to-r from-feed-accent/80 to-feed-accent rounded-full transition-all duration-500 ease-out"
          style={{ width: `${((currentIndex + 1) / links.length) * 100}%` }}
        />
      </div>

      {/* Ambient glow */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-[280px] h-[280px] bg-feed-accent/[0.025] rounded-full blur-[120px]" />
      </div>

      <AnimatePresence initial={false} custom={direction} mode="popLayout">
        <motion.div
          key={currentLink.id}
          custom={direction}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{
            y: { type: "spring", stiffness: 300, damping: 30 },
            opacity: { duration: 0.2 },
          }}
          drag="y"
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={0.2}
          onDragEnd={handleDragEnd}
          className="absolute inset-0 touch-pan-x"
        >
          <FeedCard
            link={currentLink}
            onDelete={handleDelete}
            onOpen={handleOpen}
          />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export { DWELL_ENGAGED_MS, FAST_SWIPE_MS };
