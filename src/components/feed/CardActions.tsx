"use client";

import { useState } from "react";

interface CardActionsProps {
  linkId: string;
  liked: boolean;
  onLike: (id: string) => void;
  onDelete: (id: string) => void;
}

export default function CardActions({ linkId, liked, onLike, onDelete }: CardActionsProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [likeAnimating, setLikeAnimating] = useState(false);

  function handleLike(e: React.MouseEvent) {
    e.stopPropagation();
    setLikeAnimating(true);
    onLike(linkId);
    setTimeout(() => setLikeAnimating(false), 400);
  }

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
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
    <div className="flex items-center gap-3">
      {/* Like button */}
      <button
        onClick={handleLike}
        className={`flex items-center gap-2 px-4 py-2 rounded-full text-[12px] font-medium tracking-wide transition-all duration-200 active:scale-[0.92] ${
          liked
            ? "bg-red-500/15 text-red-400 border border-red-500/20"
            : "bg-white/[0.04] text-feed-dim border border-white/[0.06] hover:text-feed-muted"
        } ${likeAnimating ? "scale-110" : ""}`}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill={liked ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`transition-transform duration-300 ${likeAnimating ? "scale-125" : ""}`}
        >
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
        {liked ? "Liked" : "Like"}
      </button>

      {/* Delete button */}
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
    </div>
  );
}
