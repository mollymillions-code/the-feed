"use client";

import { useRef } from "react";
import { CATEGORY_COLORS } from "@/types";

interface CategoryTabsProps {
  categories: string[];
  activeCategory: string;
  onSelect: (category: string) => void;
}

export default function CategoryTabs({
  categories,
  activeCategory,
  onSelect,
}: CategoryTabsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const allCategories = ["All", ...categories];

  return (
    <div className="flex-shrink-0 relative">
      <div
        ref={scrollRef}
        className="flex items-center gap-2 px-4 py-3 overflow-x-auto no-scrollbar scroll-fade"
      >
        {allCategories.map((cat) => {
          const isActive = cat === activeCategory;
          const color = cat === "All" ? "#f0f0f0" : CATEGORY_COLORS[cat] || "#737373";

          return (
            <button
              key={cat}
              onClick={() => onSelect(cat)}
              className={`flex-shrink-0 px-4 py-1.5 rounded-full text-[13px] font-semibold transition-all duration-200 active:scale-95 ${
                isActive
                  ? "text-black shadow-sm"
                  : "text-feed-muted bg-white/[0.04] hover:bg-white/[0.06]"
              }`}
              style={
                isActive ? { backgroundColor: color } : undefined
              }
            >
              {cat}
            </button>
          );
        })}
      </div>
    </div>
  );
}
