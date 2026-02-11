export type ContentType = "youtube" | "tweet" | "article" | "instagram" | "image" | "text" | "generic";

export type LinkStatus = "active" | "archived";

export interface FeedLink {
  id: string;
  url: string | null;
  title: string | null;
  description: string | null;
  thumbnail: string | null;
  siteName: string | null;
  contentType: ContentType;
  categories: string[] | null;
  aiSummary: string | null;
  status: LinkStatus;
  addedAt: string;
  archivedAt: string | null;
  lastShownAt: string | null;
  shownCount: number;
  metadata: Record<string, unknown> | null;
  textContent: string | null;
  imageData: string | null;
  // Recommendation engine fields
  embedding: number[] | null;
  engagementScore: number;
  avgDwellMs: number;
  openCount: number;
}

export interface UnfurlResult {
  title: string | null;
  description: string | null;
  thumbnail: string | null;
  siteName: string | null;
  contentType: ContentType;
  metadata: Record<string, unknown>;
}

export interface CategorizeResult {
  categories: string[];
  summary: string | null;
}

export const CATEGORIES = [
  "Tech",
  "AI",
  "Design",
  "Startups",
  "Health",
  "Science",
  "Finance",
  "Creativity",
  "Wisdom",
  "Fun",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_COLORS: Record<string, string> = {
  Tech: "#6366f1",
  AI: "#8b5cf6",
  Design: "#ec4899",
  Startups: "#f59e0b",
  Health: "#22c55e",
  Science: "#06b6d4",
  Finance: "#14b8a6",
  Creativity: "#f97316",
  Wisdom: "#a78bfa",
  Fun: "#ef4444",
};
