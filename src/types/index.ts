export type ContentType = "youtube" | "tweet" | "article" | "instagram" | "image" | "text" | "generic";

export type LinkStatus = "active" | "archived";

export interface FeedLink {
  id: string;
  userId: string;
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
  likedAt: string | null;
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
  "Music",
  "Fun",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_COLORS: Record<string, string> = {
  Tech: "#5E9B8A",
  AI: "#9B7ECB",
  Design: "#D4708A",
  Startups: "#D4A04B",
  Health: "#7BA67E",
  Science: "#5B9BC4",
  Finance: "#4E9E97",
  Creativity: "#D07845",
  Wisdom: "#A08BC4",
  Music: "#C75B8E",
  Fun: "#D06B60",
};
