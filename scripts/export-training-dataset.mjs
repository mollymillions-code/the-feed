/**
 * Export ranking training rows as JSONL.
 *
 * Usage:
 *   node scripts/export-training-dataset.mjs [daysBack] [outFile]
 *
 * Example:
 *   node scripts/export-training-dataset.mjs 30 tmp/training-dataset.jsonl
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { neon } from "@neondatabase/serverless";

const daysBackArg = Number.parseInt(process.argv[2] || "30", 10);
const daysBack = Number.isNaN(daysBackArg) ? 30 : Math.max(1, daysBackArg);
const defaultOutFile = `tmp/training-dataset-${new Date()
  .toISOString()
  .slice(0, 19)
  .replace(/[:T]/g, "-")}.jsonl`;
const outputFile = resolve(process.argv[3] || defaultOutFile);

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required in .env.local");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);
const cutoff = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

const rows = await sql`
  SELECT
    re.user_id,
    re.session_id,
    re.feed_request_id,
    re.link_id,
    re.algorithm_version,
    re.reranker_version,
    re.active_category,
    re.cards_shown,
    re.candidate_rank,
    re.served_rank,
    re.base_score,
    re.rerank_score,
    re.final_score,
    re.features,
    re.created_at,
    l.content_type,
    l.categories,
    (l.liked_at IS NOT NULL) AS liked,
    COALESCE(ev.open_count, 0) AS open_count,
    COALESCE(ev.max_dwell_ms, 0) AS max_dwell_ms,
    COALESCE(ev.avg_dwell_ms, 0) AS avg_dwell_ms,
    COALESCE(ev.fast_skip_count, 0) AS fast_skip_count
  FROM ranking_events re
  LEFT JOIN links l
    ON l.id = re.link_id
    AND l.user_id = re.user_id
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) FILTER (WHERE e.event_type = 'open')::int AS open_count,
      MAX(CASE WHEN e.event_type = 'dwell' THEN e.dwell_time_ms END)::int AS max_dwell_ms,
      AVG(CASE WHEN e.event_type = 'dwell' THEN e.dwell_time_ms END)::float AS avg_dwell_ms,
      COUNT(*) FILTER (
        WHERE e.event_type = 'dwell'
          AND COALESCE(e.dwell_time_ms, 0) < 1500
      )::int AS fast_skip_count
    FROM engagements e
    WHERE e.user_id = re.user_id
      AND e.link_id = re.link_id
      AND (re.session_id IS NULL OR e.session_id = re.session_id)
      AND (re.feed_request_id IS NULL OR e.feed_request_id = re.feed_request_id)
      AND e.created_at >= re.created_at
      AND e.created_at <= re.created_at + interval '6 hours'
  ) ev ON true
  WHERE re.created_at >= ${cutoff}
  ORDER BY re.created_at DESC
`;

const jsonlLines = rows.map((row) => {
  const served = row.served_rank !== null;
  const openReward = row.open_count > 0 ? 1 : 0;
  const dwellReward = clamp01((row.max_dwell_ms || 0) / 45_000);
  const skipPenalty = row.fast_skip_count > 0 ? 0.3 : 0;
  const likedBonus = row.liked ? 0.35 : 0;
  const reward = served
    ? clamp01(openReward * 0.6 + dwellReward * 0.35 + likedBonus - skipPenalty)
    : 0;

  const features =
    typeof row.features === "object" && row.features !== null ? row.features : {};

  const enrichedFeatures = {
    ...features,
    f_base_score: Number(row.base_score || 0),
    f_candidate_rank_norm: clamp01((Number(row.candidate_rank || 1) - 1) / 60),
    f_cards_shown_norm: clamp01(Number(row.cards_shown || 0) / 60),
    f_is_served: served ? 1 : 0,
    f_content_type_hash: hashContentType(row.content_type || "generic"),
  };

  return JSON.stringify({
    feed_request_id: row.feed_request_id,
    user_id: row.user_id,
    session_id: row.session_id,
    link_id: row.link_id,
    algorithm_version: row.algorithm_version,
    reranker_version: row.reranker_version,
    active_category: row.active_category,
    candidate_rank: Number(row.candidate_rank || 0),
    served_rank: row.served_rank === null ? null : Number(row.served_rank),
    base_score: Number(row.base_score || 0),
    rerank_score: row.rerank_score === null ? null : Number(row.rerank_score),
    final_score: Number(row.final_score || 0),
    created_at: row.created_at,
    content_type: row.content_type || "generic",
    categories: Array.isArray(row.categories) ? row.categories : [],
    open_count: Number(row.open_count || 0),
    max_dwell_ms: Number(row.max_dwell_ms || 0),
    avg_dwell_ms: Number(row.avg_dwell_ms || 0),
    fast_skip_count: Number(row.fast_skip_count || 0),
    liked: Boolean(row.liked),
    reward,
    features: enrichedFeatures,
  });
});

await mkdir(dirname(outputFile), { recursive: true });
await writeFile(outputFile, jsonlLines.join("\n"), "utf8");

console.log(`Exported ${jsonlLines.length} rows to ${outputFile}`);

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function hashContentType(contentType) {
  let hash = 0;
  for (let i = 0; i < contentType.length; i++) {
    hash = (hash * 31 + contentType.charCodeAt(i)) % 997;
  }
  return hash / 997;
}
