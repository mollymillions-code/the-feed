"use client";

import { useState } from "react";

interface CardActionsProps {
  linkId: string;
  onDelete: (id: string) => void;
}

export default function CardActions({ linkId, onDelete }: CardActionsProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
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
    <button
      onClick={handleDelete}
      disabled={deleteLoading}
      className={`flex items-center gap-2 px-4 py-2 rounded-full text-[12px] font-medium tracking-wide transition-all duration-200 active:scale-[0.92] ${
        confirmDelete
          ? "bg-red-500/15 text-red-400 border border-red-500/20"
          : "bg-white/[0.04] text-feed-dim border border-white/[0.06] hover:text-feed-muted"
      } ${deleteLoading ? "opacity-40" : ""}`}
    >
      {deleteLoading ? (
        <div className="w-3.5 h-3.5 border-2 border-red-400/30 border-t-red-400 rounded-full animate-spin" />
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
      )}
      {confirmDelete ? "Tap to confirm" : "Delete"}
    </button>
  );
}
