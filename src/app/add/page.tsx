"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import AddLinkForm from "@/components/AddLinkForm";
import BottomNav from "@/components/BottomNav";
import { FeedLink, CATEGORY_COLORS } from "@/types";

type InputMode = "link" | "image" | "text" | "bulk";

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

// SVG icons for content types — avoids emoji rendering inconsistencies
function ContentIcon({ type }: { type: string }) {
  const cls = "w-4 h-4 text-feed-dim";
  switch (type) {
    case "youtube":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="5 3 19 12 5 21 5 3" />
        </svg>
      );
    case "tweet":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      );
    case "article":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
      );
    case "image":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
      );
    case "text":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
        </svg>
      );
    default:
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
      );
  }
}

// ─── Shared Success Card ─────────────────────────────────────

function SuccessCard({ result }: { result: FeedLink }) {
  return (
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
                backgroundColor: `${CATEGORY_COLORS[cat] || "#888888"}12`,
                color: CATEGORY_COLORS[cat] || "#888888",
              }}
            >
              {cat}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Image Upload Mode ───────────────────────────────────────

function ImageMode({ onAdded }: { onAdded: () => void }) {
  const [title, setTitle] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FeedLink | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Please select an image file");
      return;
    }

    // 10MB limit
    if (file.size > 10 * 1024 * 1024) {
      setError("Image must be under 10MB");
      return;
    }

    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      setPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  }

  async function handleSubmit() {
    if (!preview) return;

    setState("uploading");
    setError(null);

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "image",
          title: title.trim() || undefined,
          imageData: preview,
        }),
      });

      if (!res.ok) throw new Error("Upload failed");

      const link = await res.json();
      setResult(link);
      setState("done");
      onAdded();

      setTimeout(() => {
        setTitle("");
        setPreview(null);
        setState("idle");
        setResult(null);
        if (fileRef.current) fileRef.current.value = "";
      }, 3000);
    } catch {
      setError("Failed to upload image. Try again.");
      setState("error");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* File picker */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
        id="image-input"
      />
      <label
        htmlFor="image-input"
        className="w-full flex flex-col items-center justify-center gap-3 card-glass border border-dashed border-white/[0.08] rounded-2.5xl px-5 py-10 cursor-pointer hover:border-feed-accent/30 transition-all active:scale-[0.99]"
      >
        {preview ? (
          <img src={preview} alt="Preview" className="max-h-48 rounded-xl object-contain" />
        ) : (
          <>
            <div className="w-12 h-12 rounded-2xl bg-white/[0.03] flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8A8078" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
            </div>
            <span className="text-feed-dim text-[13px] tracking-wide">Tap to select an image or take a photo</span>
          </>
        )}
      </label>

      {/* Optional title */}
      {preview && (
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a title (optional)"
          className="input-glass w-full rounded-2.5xl px-5 py-3.5 text-[14px] text-feed-text placeholder:text-feed-dim"
        />
      )}

      {/* Submit */}
      {preview && (
        <button
          onClick={handleSubmit}
          disabled={state === "uploading"}
          className="w-full bg-feed-accent/90 hover:bg-feed-accent text-white py-4 rounded-2.5xl text-[13px] font-semibold tracking-wide transition-all active:scale-[0.96] disabled:opacity-20 shadow-[0_0_20px_rgba(212,160,75,0.15)]"
        >
          {state === "uploading" ? (
            <span className="animate-pulse tracking-wide">Uploading & tagging...</span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add Image
            </span>
          )}
        </button>
      )}

      {error && <div className="text-red-400/90 text-[13px] text-center tracking-wide">{error}</div>}

      {state === "done" && result && (
        <SuccessCard result={result} />
      )}
    </div>
  );
}

// ─── Text/Writing Mode ───────────────────────────────────────

function TextMode({ onAdded }: { onAdded: () => void }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [state, setState] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FeedLink | null>(null);

  async function handleSubmit() {
    if (!content.trim()) return;

    setState("uploading");
    setError(null);

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "text",
          title: title.trim() || undefined,
          textContent: content.trim(),
        }),
      });

      if (!res.ok) throw new Error("Failed to save");

      const link = await res.json();
      setResult(link);
      setState("done");
      onAdded();

      setTimeout(() => {
        setTitle("");
        setContent("");
        setState("idle");
        setResult(null);
      }, 3000);
    } catch {
      setError("Failed to save text. Try again.");
      setState("error");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Title */}
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title (optional)"
        className="input-glass w-full rounded-2.5xl px-5 py-3.5 text-[14px] text-feed-text placeholder:text-feed-dim"
      />

      {/* Content textarea */}
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Write something — a thought, a quote, a note..."
        rows={6}
        autoFocus
        className="input-glass w-full rounded-2.5xl px-5 py-4 text-[14px] text-feed-text placeholder:text-feed-dim resize-none leading-relaxed"
      />

      {/* Character count */}
      <p className="text-feed-dim text-[11px] text-right -mt-2 tracking-wide">
        {content.length} characters
      </p>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={!content.trim() || state === "uploading"}
        className="w-full bg-feed-accent/90 hover:bg-feed-accent text-white py-4 rounded-2.5xl text-[13px] font-semibold tracking-wide transition-all active:scale-[0.96] disabled:opacity-20 shadow-[0_0_20px_rgba(212,160,75,0.15)]"
      >
        {state === "uploading" ? (
          <span className="animate-pulse tracking-wide">Saving & tagging...</span>
        ) : (
          <span className="flex items-center justify-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Text
          </span>
        )}
      </button>

      {error && <div className="text-red-400/90 text-[13px] text-center tracking-wide">{error}</div>}

      {state === "done" && result && (
        <SuccessCard result={result} />
      )}
    </div>
  );
}

// ─── Bulk Import Mode ────────────────────────────────────────

function BulkMode({ onAdded }: { onAdded: () => void }) {
  const [urls, setUrls] = useState("");
  const [state, setState] = useState<"idle" | "importing" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ added: number; duplicates: number; errors: number } | null>(null);

  function getUrlCount() {
    return urls.split("\n").map((l) => l.trim()).filter(Boolean).length;
  }

  async function handleSubmit() {
    const urlList = urls
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    if (urlList.length === 0) return;

    setState("importing");
    setError(null);
    setProgress(null);

    try {
      const res = await fetch("/api/upload", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: urlList }),
      });

      if (!res.ok) throw new Error("Import failed");

      const data = await res.json();
      setProgress(data.summary);
      setState("done");
      onAdded();

      setTimeout(() => {
        setUrls("");
        setState("idle");
        setProgress(null);
      }, 5000);
    } catch {
      setError("Import failed. Try again.");
      setState("error");
    }
  }

  const count = getUrlCount();

  return (
    <div className="flex flex-col gap-4">
      {/* URL textarea */}
      <textarea
        value={urls}
        onChange={(e) => setUrls(e.target.value)}
        placeholder={"Paste multiple links, one per line:\nhttps://youtube.com/watch?v=...\nhttps://x.com/user/status/...\nhttps://example.com/article"}
        rows={8}
        autoFocus
        className="input-glass w-full rounded-2.5xl px-5 py-4 text-[13px] font-mono text-feed-text placeholder:text-feed-dim resize-none leading-relaxed"
      />

      {/* URL count */}
      <p className="text-feed-dim text-[11px] text-right -mt-2 tracking-wide">
        {count} link{count !== 1 ? "s" : ""} {count > 50 ? "(max 50 per batch)" : ""}
      </p>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={count === 0 || state === "importing"}
        className="w-full bg-feed-accent/90 hover:bg-feed-accent text-white py-4 rounded-2.5xl text-[13px] font-semibold tracking-wide transition-all active:scale-[0.96] disabled:opacity-20 shadow-[0_0_20px_rgba(212,160,75,0.15)]"
      >
        {state === "importing" ? (
          <span className="animate-pulse tracking-wide">Importing links...</span>
        ) : (
          <span className="flex items-center justify-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Import {count} Link{count !== 1 ? "s" : ""}
          </span>
        )}
      </button>

      {error && <div className="text-red-400/90 text-[13px] text-center tracking-wide">{error}</div>}

      {/* Import results */}
      {state === "done" && progress && (
        <div className="card-glass border-feed-done/20 rounded-2.5xl p-5 flex flex-col gap-3">
          <div className="flex items-center gap-2 text-feed-done text-[13px] font-semibold tracking-wide">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Import complete
          </div>
          <div className="flex flex-col gap-1.5 text-[12px] tracking-wide">
            {progress.added > 0 && <p className="text-feed-done">{progress.added} link{progress.added !== 1 ? "s" : ""} added</p>}
            {progress.duplicates > 0 && <p className="text-feed-dim">{progress.duplicates} duplicate{progress.duplicates !== 1 ? "s" : ""} skipped</p>}
            {progress.errors > 0 && <p className="text-red-400/90">{progress.errors} failed</p>}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Mode Tab Icons ─────────────────────────────────────────

function ModeIcon({ mode, active }: { mode: InputMode; active: boolean }) {
  const cls = `w-4 h-4 ${active ? "text-feed-text" : "text-feed-dim"} transition-colors`;
  switch (mode) {
    case "link":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
      );
    case "image":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
      );
    case "text":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
        </svg>
      );
    case "bulk":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="8" y1="6" x2="21" y2="6" />
          <line x1="8" y1="12" x2="21" y2="12" />
          <line x1="8" y1="18" x2="21" y2="18" />
          <line x1="3" y1="6" x2="3.01" y2="6" />
          <line x1="3" y1="12" x2="3.01" y2="12" />
          <line x1="3" y1="18" x2="3.01" y2="18" />
        </svg>
      );
  }
}

const MODES: { key: InputMode; label: string }[] = [
  { key: "link", label: "Link" },
  { key: "image", label: "Image" },
  { key: "text", label: "Text" },
  { key: "bulk", label: "Bulk" },
];

// ─── Main Add Page ───────────────────────────────────────────

function AddPageContent() {
  const searchParams = useSearchParams();
  const sharedUrl = searchParams.get("url") || searchParams.get("text") || "";
  const [mode, setMode] = useState<InputMode>(sharedUrl ? "link" : "link");
  const [recentLinks, setRecentLinks] = useState<FeedLink[]>([]);

  const fetchRecent = useCallback(() => {
    fetch("/api/links?limit=5")
      .then((res) => res.json())
      .then(setRecentLinks)
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchRecent();
  }, [fetchRecent]);

  return (
    <>
      <div className="flex-1 overflow-y-auto px-5 py-8">
        <h1 className="font-serif text-[22px] text-center mb-8">
          Add to Feed
        </h1>

        {/* Mode selector tabs — glass segmented control */}
        <div className="flex gap-1 mb-6 bg-white/[0.03] rounded-2xl p-1">
          {MODES.map((m) => (
            <button
              key={m.key}
              onClick={() => setMode(m.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[12px] font-semibold tracking-wide transition-all active:scale-[0.96] ${
                mode === m.key
                  ? "bg-white/[0.08] text-feed-text shadow-sm"
                  : "text-feed-dim hover:text-feed-muted"
              }`}
            >
              <ModeIcon mode={m.key} active={mode === m.key} />
              <span>{m.label}</span>
            </button>
          ))}
        </div>

        {/* Active mode content */}
        {mode === "link" && <AddLinkForm initialUrl={sharedUrl} onAdded={fetchRecent} />}
        {mode === "image" && <ImageMode onAdded={fetchRecent} />}
        {mode === "text" && <TextMode onAdded={fetchRecent} />}
        {mode === "bulk" && <BulkMode onAdded={fetchRecent} />}

        {/* Pro tip for link mode */}
        {mode === "link" && (
          <>
            <div className="my-8 flex items-center gap-4">
              <div className="flex-1 h-px bg-white/[0.04]" />
              <span className="text-feed-dim text-[11px] tracking-wider uppercase">Pro tip</span>
              <div className="flex-1 h-px bg-white/[0.04]" />
            </div>
            <p className="text-feed-muted text-[13px] text-center leading-relaxed px-4 tracking-wide">
              Share links directly from any app — tap Share, then choose &ldquo;The Feed&rdquo;
            </p>
          </>
        )}

        {/* Recently added */}
        {recentLinks.length > 0 && (
          <div className="mt-10">
            <h3 className="text-feed-dim text-[11px] font-semibold uppercase tracking-wider mb-4">
              Recently Added
            </h3>
            <div className="flex flex-col gap-2">
              {recentLinks.map((link) => (
                <div
                  key={link.id}
                  className="flex items-center gap-3 card-glass rounded-xl px-4 py-3.5"
                >
                  <ContentIcon type={link.contentType} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] truncate tracking-tight">
                      {link.title || link.url || link.textContent?.slice(0, 50) || "Untitled"}
                    </p>
                  </div>
                  <span className="text-feed-dim text-[11px] flex-shrink-0 tracking-wide">
                    {timeAgo(link.addedAt)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <BottomNav />
    </>
  );
}

export default function AddPage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-pulse text-feed-dim text-[13px] tracking-wide">Loading...</div>
        </div>
      }
    >
      <AddPageContent />
    </Suspense>
  );
}
