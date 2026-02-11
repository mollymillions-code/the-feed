"use client";

import { useState } from "react";

interface DoneButtonProps {
  linkId: string;
  onDone: (id: string) => void;
}

export default function DoneButton({ linkId, onDone }: DoneButtonProps) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleDone() {
    setLoading(true);
    try {
      await fetch(`/api/links/${linkId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "archived" }),
      });
      setDone(true);
      setTimeout(() => onDone(linkId), 400);
    } catch {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleDone}
      disabled={loading || done}
      className={`group flex items-center gap-2.5 px-8 py-3 rounded-full text-[13px] font-semibold tracking-wide transition-all duration-300 active:scale-[0.92] ${
        done
          ? "bg-feed-done/15 text-feed-done shadow-[0_0_24px_rgba(52,211,153,0.12)]"
          : loading
          ? "bg-white/[0.04] text-feed-muted"
          : "bg-white/[0.04] text-feed-text border border-white/[0.08] hover:bg-white/[0.06] hover:border-white/[0.12]"
      }`}
    >
      {done ? (
        <>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Done
        </>
      ) : loading ? (
        <span className="animate-pulse">Archiving...</span>
      ) : (
        <>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-50 group-hover:opacity-100 transition-opacity">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Done
        </>
      )}
    </button>
  );
}
