"use client";

import { useState, useEffect } from "react";
import { FeedLink, CATEGORY_COLORS } from "@/types";

type AddState = "idle" | "unfurling" | "categorizing" | "done" | "error";

interface AddLinkFormProps {
  initialUrl?: string;
  onAdded?: () => void;
}

export default function AddLinkForm({ initialUrl, onAdded }: AddLinkFormProps) {
  const [url, setUrl] = useState(initialUrl || "");
  const [state, setState] = useState<AddState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FeedLink | null>(null);

  useEffect(() => {
    if (initialUrl) {
      setUrl(initialUrl);
    }
  }, [initialUrl]);

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();

    const trimmed = url.trim();
    if (!trimmed) return;

    // Validate URL
    try {
      new URL(trimmed);
    } catch {
      setError("Please enter a valid URL");
      return;
    }

    setError(null);
    setState("unfurling");

    try {
      const res = await fetch("/api/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });

      if (res.status === 409) {
        const data = await res.json();
        setError("This link is already in your feed");
        setResult(data.link);
        setState("done");
        return;
      }

      if (!res.ok) {
        throw new Error("Failed to add link");
      }

      setState("categorizing");
      const link = await res.json();
      setResult(link);
      setState("done");
      onAdded?.();

      // Clear input after success
      setTimeout(() => {
        setUrl("");
        setState("idle");
        setResult(null);
      }, 3000);
    } catch {
      setError("Something went wrong. Try again.");
      setState("error");
    }
  }

  async function handlePaste() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setUrl(text);
        // Auto-submit if it looks like a URL
        try {
          new URL(text);
          setUrl(text);
          // Small delay to let the UI update
          setTimeout(() => {
            handleSubmitWithUrl(text);
          }, 100);
        } catch {
          // Not a URL, just paste it
        }
      }
    } catch {
      // Clipboard API not available or permission denied
      setError("Clipboard access denied. Paste manually.");
    }
  }

  async function handleSubmitWithUrl(submitUrl: string) {
    const trimmed = submitUrl.trim();
    if (!trimmed) return;

    try {
      new URL(trimmed);
    } catch {
      return;
    }

    setError(null);
    setState("unfurling");

    try {
      const res = await fetch("/api/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });

      if (res.status === 409) {
        const data = await res.json();
        setError("This link is already in your feed");
        setResult(data.link);
        setState("done");
        return;
      }

      if (!res.ok) throw new Error("Failed to add link");

      setState("categorizing");
      const link = await res.json();
      setResult(link);
      setState("done");
      onAdded?.();

      setTimeout(() => {
        setUrl("");
        setState("idle");
        setResult(null);
      }, 3000);
    } catch {
      setError("Something went wrong. Try again.");
      setState("error");
    }
  }

  const isProcessing = state === "unfurling" || state === "categorizing";

  return (
    <div className="flex flex-col gap-4">
      {/* URL Input */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste a link..."
          disabled={isProcessing}
          autoFocus
          className="input-glass w-full rounded-2.5xl px-5 py-4 text-[15px] text-feed-text placeholder:text-feed-dim disabled:opacity-40"
        />

        {/* Clipboard paste button */}
        <button
          type="button"
          onClick={handlePaste}
          disabled={isProcessing}
          className="w-full flex items-center gap-3 card-glass rounded-2.5xl px-5 py-4 text-feed-muted hover:text-feed-text transition-colors disabled:opacity-40 active:scale-[0.98]"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-60">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          <span className="text-[13px] font-medium tracking-wide">Paste from clipboard</span>
        </button>

        {/* Submit button */}
        <button
          type="submit"
          disabled={!url.trim() || isProcessing}
          className="w-full bg-feed-accent/90 hover:bg-feed-accent text-white py-4 rounded-2.5xl text-[13px] font-semibold tracking-wide transition-all active:scale-[0.96] disabled:opacity-20 disabled:active:scale-100 shadow-[0_0_20px_rgba(129,140,248,0.15)]"
        >
          {isProcessing ? (
            <span className="animate-pulse tracking-wide">
              {state === "unfurling" ? "Fetching preview..." : "AI tagging..."}
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add
            </span>
          )}
        </button>
      </form>

      {/* Error */}
      {error && (
        <div className="text-red-400/90 text-[13px] text-center tracking-wide">{error}</div>
      )}

      {/* Success result */}
      {state === "done" && result && (
        <div className="card-glass border-feed-done/20 rounded-2.5xl p-5 flex flex-col gap-3">
          <div className="flex items-center gap-2 text-feed-done text-[13px] font-semibold tracking-wide">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Added to your feed
          </div>

          {result.thumbnail && (
            <img
              src={result.thumbnail}
              alt=""
              className="w-full rounded-xl object-cover max-h-32"
            />
          )}

          <p className="text-[15px] font-semibold line-clamp-2 tracking-tight">
            {result.title || "Untitled"}
          </p>

          {result.categories && result.categories.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              {result.categories.map((cat) => (
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
        </div>
      )}
    </div>
  );
}
