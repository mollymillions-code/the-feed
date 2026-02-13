import {
  pgTable,
  text,
  timestamp,
  integer,
  jsonb,
  real,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const links = pgTable(
  "links",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").default("").notNull(),
    url: text("url"),                           // nullable — images/text don't have URLs
    title: text("title"),
    description: text("description"),
    thumbnail: text("thumbnail"),
    siteName: text("site_name"),
    contentType: text("content_type").notNull(), // 'youtube' | 'tweet' | 'article' | 'image' | 'text' | 'generic'
    textContent: text("text_content"),           // for plain text/writing entries
    imageData: text("image_data"),               // base64 data URI for uploaded images
    categories: text("categories").array(),
    aiSummary: text("ai_summary"),
    status: text("status").default("active").notNull(),
    addedAt: timestamp("added_at", { withTimezone: true }).defaultNow().notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    lastShownAt: timestamp("last_shown_at", { withTimezone: true }),
    shownCount: integer("shown_count").default(0).notNull(),
    metadata: jsonb("metadata"),
    // Semantic embedding vector from Gemini (stored as JSON array of floats)
    embedding: jsonb("embedding").$type<number[]>(),
    // Aggregated engagement score (learned from behavior)
    engagementScore: real("engagement_score").default(0).notNull(),
    // Average dwell time in ms across all views
    avgDwellMs: integer("avg_dwell_ms").default(0).notNull(),
    // Number of times user opened the actual content
    openCount: integer("open_count").default(0).notNull(),
    // Like/heart
    likedAt: timestamp("liked_at", { withTimezone: true }),
  },
  (table) => ({
    userStatusIdx: index("links_user_status_idx").on(table.userId, table.status),
    userAddedAtIdx: index("links_user_added_at_idx").on(table.userId, table.addedAt),
    userUrlIdx: index("links_user_url_idx").on(table.userId, table.url),
  })
);

/**
 * Every interaction with a card is logged here.
 * This is the raw behavioral data that drives the algorithm.
 *
 * Events:
 * - impression: card was shown to user
 * - dwell: user spent time on the card (logged on swipe away)
 * - open: user tapped through to the content (YouTube play, article link, etc.)
 * - done: user archived the card
 */
export const engagements = pgTable(
  "engagements",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").default("").notNull(),
    linkId: text("link_id").notNull(),
    eventType: text("event_type").notNull(), // 'impression' | 'dwell' | 'open' | 'done'
    dwellTimeMs: integer("dwell_time_ms"),   // how long user stayed on card
    swipeVelocity: real("swipe_velocity"),    // px/ms — fast = disinterest
    cardIndex: integer("card_index"),         // position in the feed when viewed
    // Temporal context
    hourOfDay: integer("hour_of_day"),        // 0-23
    dayOfWeek: integer("day_of_week"),        // 0=Sun, 6=Sat
    // Session tracking
    sessionId: text("session_id"),
    feedRequestId: text("feed_request_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userLinkCreatedIdx: index("engagements_user_link_created_idx").on(
      table.userId,
      table.linkId,
      table.createdAt
    ),
    userEventCreatedIdx: index("engagements_user_event_created_idx").on(
      table.userId,
      table.eventType,
      table.createdAt
    ),
    sessionCreatedIdx: index("engagements_session_created_idx").on(
      table.userId,
      table.sessionId,
      table.createdAt
    ),
    feedRequestCreatedIdx: index("engagements_feed_request_created_idx").on(
      table.userId,
      table.feedRequestId,
      table.createdAt
    ),
  })
);

/**
 * Learned preferences by time slot.
 * Updated incrementally as engagement data comes in.
 *
 * Tracks: "On weekday mornings (9am), user engages most with Tech and AI"
 */
export const timePreferences = pgTable(
  "time_preferences",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").default("").notNull(),
    hourSlot: integer("hour_slot").notNull(),   // 0-23
    dayType: text("day_type").notNull(),        // 'weekday' | 'weekend'
    category: text("category").notNull(),
    // Running average of engagement scores for this time+category
    avgEngagement: real("avg_engagement").default(0).notNull(),
    sampleCount: integer("sample_count").default(0).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userSlotCategoryUnique: uniqueIndex("time_prefs_user_slot_category_uniq").on(
      table.userId,
      table.hourSlot,
      table.dayType,
      table.category
    ),
    userSlotLookupIdx: index("time_prefs_user_slot_lookup_idx").on(
      table.userId,
      table.hourSlot,
      table.dayType
    ),
  })
);

/**
 * Ranking snapshots used for model training/evaluation.
 * One row per candidate link per feed request.
 */
export const rankingEvents = pgTable(
  "ranking_events",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").default("").notNull(),
    sessionId: text("session_id"),
    feedRequestId: text("feed_request_id").notNull(),
    linkId: text("link_id").notNull(),
    algorithmVersion: text("algorithm_version").notNull(),
    rerankerVersion: text("reranker_version"),
    activeCategory: text("active_category"),
    cardsShown: integer("cards_shown").default(0).notNull(),
    candidateRank: integer("candidate_rank").notNull(),
    servedRank: integer("served_rank"),
    baseScore: real("base_score").notNull(),
    rerankScore: real("rerank_score"),
    finalScore: real("final_score").notNull(),
    features: jsonb("features").$type<Record<string, number>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userCreatedIdx: index("ranking_events_user_created_idx").on(
      table.userId,
      table.createdAt
    ),
    requestRankIdx: index("ranking_events_request_rank_idx").on(
      table.userId,
      table.feedRequestId,
      table.candidateRank
    ),
    userLinkCreatedIdx: index("ranking_events_user_link_created_idx").on(
      table.userId,
      table.linkId,
      table.createdAt
    ),
    requestLinkUnique: uniqueIndex("ranking_events_request_link_uniq").on(
      table.feedRequestId,
      table.linkId
    ),
  })
);
