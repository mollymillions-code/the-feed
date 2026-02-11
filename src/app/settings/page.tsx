"use client";

import { useEffect, useState } from "react";
import BottomNav from "@/components/BottomNav";

interface Stats {
  total: number;
  active: number;
  archived: number;
  categories: string[];
}

export default function SettingsPage() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    async function fetchStats() {
      try {
        const [activeRes, archivedRes] = await Promise.all([
          fetch("/api/links?status=active&limit=9999"),
          fetch("/api/links?status=archived&limit=9999"),
        ]);
        const active = await activeRes.json();
        const archived = await archivedRes.json();

        const categorySet = new Set<string>();
        [...active, ...archived].forEach((link: { categories?: string[] }) => {
          if (link.categories) {
            link.categories.forEach((c: string) => categorySet.add(c));
          }
        });

        setStats({
          total: active.length + archived.length,
          active: active.length,
          archived: archived.length,
          categories: Array.from(categorySet).sort(),
        });
      } catch {
        // ignore
      }
    }
    fetchStats();
  }, []);

  async function handleExport() {
    try {
      const res = await fetch("/api/links?status=active&limit=9999");
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `the-feed-export-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto px-5 py-8">
        <h1 className="text-[20px] font-semibold text-center mb-10 tracking-tight">
          Settings
        </h1>

        {/* Feed section */}
        <section className="mb-8">
          <h2 className="text-feed-dim text-[11px] font-semibold uppercase tracking-wider mb-3">
            Feed
          </h2>
          <div className="card-glass rounded-2.5xl divide-y divide-white/[0.04]">
            <div className="px-5 py-4">
              <p className="text-[14px] font-semibold tracking-tight mb-2">Categories</p>
              {stats?.categories && stats.categories.length > 0 ? (
                <div className="flex items-center gap-2 flex-wrap">
                  {stats.categories.map((cat) => (
                    <span
                      key={cat}
                      className="px-3 py-1 rounded-full text-[11px] font-semibold tracking-wider uppercase bg-white/[0.04] text-feed-muted"
                    >
                      {cat}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-feed-dim text-[13px] tracking-wide">
                  {stats ? "No categories yet" : "Loading..."}
                </p>
              )}
            </div>
          </div>
        </section>

        {/* Library section */}
        <section className="mb-8">
          <h2 className="text-feed-dim text-[11px] font-semibold uppercase tracking-wider mb-3">
            Library
          </h2>
          <div className="card-glass rounded-2.5xl divide-y divide-white/[0.04]">
            <div className="flex items-center justify-between px-5 py-4">
              <span className="text-[14px] text-feed-muted tracking-wide">Total links</span>
              <span className="text-[14px] font-semibold tabular-nums">
                {stats?.total ?? (
                  <span className="inline-block w-8 h-4 rounded bg-white/[0.04] animate-pulse" />
                )}
              </span>
            </div>
            <div className="flex items-center justify-between px-5 py-4">
              <span className="text-[14px] text-feed-muted tracking-wide">Active</span>
              <span className="text-[14px] font-semibold text-feed-accent tabular-nums">
                {stats?.active ?? (
                  <span className="inline-block w-8 h-4 rounded bg-white/[0.04] animate-pulse" />
                )}
              </span>
            </div>
            <div className="flex items-center justify-between px-5 py-4">
              <span className="text-[14px] text-feed-muted tracking-wide">Archived</span>
              <span className="text-[14px] font-semibold text-feed-dim tabular-nums">
                {stats?.archived ?? (
                  <span className="inline-block w-8 h-4 rounded bg-white/[0.04] animate-pulse" />
                )}
              </span>
            </div>
          </div>
        </section>

        {/* Data section */}
        <section className="mb-8">
          <h2 className="text-feed-dim text-[11px] font-semibold uppercase tracking-wider mb-3">
            Data
          </h2>
          <div className="card-glass rounded-2.5xl divide-y divide-white/[0.04]">
            <button
              onClick={handleExport}
              className="w-full flex items-center justify-between px-5 py-4 text-left group active:scale-[0.99] transition-transform"
            >
              <div className="flex items-center gap-3">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-feed-dim group-hover:text-feed-accent transition-colors">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                <span className="text-[14px] tracking-wide">Export all links</span>
              </div>
              <span className="text-feed-accent text-[12px] font-semibold tracking-wider uppercase group-hover:translate-x-0.5 transition-transform">JSON</span>
            </button>
          </div>
        </section>

        {/* About */}
        <section className="text-center mt-16 mb-8">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-2xl bg-white/[0.03] mb-4">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#525252" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 11a9 9 0 0 1 9 9" />
              <path d="M4 4a16 16 0 0 1 16 16" />
              <circle cx="5" cy="19" r="1" />
            </svg>
          </div>
          <p className="text-[13px] font-semibold tracking-tight text-feed-muted">The Feed v1.0</p>
          <p className="text-[12px] text-feed-dim mt-1 tracking-wide">Your content. Your feed.</p>
        </section>
      </div>

      <BottomNav />
    </>
  );
}
