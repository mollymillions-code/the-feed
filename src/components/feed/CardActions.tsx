"use client";

import { useState } from "react";

interface CardActionsProps {
  linkId: string;
  onDone: (id: string) => void;
  onDelete: (id: string) => void;
}

export default function CardActions({ linkId, onDone, onDelete }: CardActionsProps) {
  const [doneLoading, setDoneLoading] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  async function handleDone() {
    setDoneLoading(true);
    try {
      await fetch(`/api/links/${linkId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "archived" }),
      });
      setIsDone(true);
      setTimeout(() => onDone(linkId), 400);
    } catch {
      setDoneLoading(false);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      // Auto-reset after 3 seconds
      setTimeout(() => setConfirmDelete(false), 3000);
      return;
    }

    setDeleteLoading(true);
    try {
      await fetch(`/api/links/${linkId}`, { method: "DELETE" });
      onDelete(linkId);
    } catch {
      setDeleteLoading(false);
      setConfirmDelete(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {/* Delete button */}
      <button
        onClick={handleDelete}
        disabled={deleteLoading || isDone}
        className={`flex items-center justify-center w-10 h-10 rounded-full transition-all duration-200 active:scale-[0.88] ${
          confirmDelete
            ? "bg-red-500/15 text-red-400 border border-red-500/20"
            : "bg-white/[0.04] text-feed-dim border border-white/[0.06] hover:text-red-400 hover:border-red-500/20"
        } ${deleteLoading ? "opacity-40" : ""} ${isDone ? "opacity-20" : ""}`}
      >
        {deleteLoading ? (
          <div className="w-4 h-4 border-2 border-red-400/30 border-t-red-400 rounded-full animate-spin" />
        ) : (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        )}
      </button>

      {/* Done button */}
      <button
        onClick={handleDone}
        disabled={doneLoading || isDone}
        className={`group flex items-center gap-2.5 px-8 py-3 rounded-full text-[13px] font-semibold tracking-wide transition-all duration-300 active:scale-[0.92] ${
          isDone
            ? "bg-feed-done/15 text-feed-done shadow-[0_0_24px_rgba(52,211,153,0.12)]"
            : doneLoading
            ? "bg-white/[0.04] text-feed-muted"
            : "bg-white/[0.04] text-feed-text border border-white/[0.08] hover:bg-white/[0.06] hover:border-white/[0.12]"
        }`}
      >
        {isDone ? (
          <>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Done
          </>
        ) : doneLoading ? (
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
    </div>
  );
}
