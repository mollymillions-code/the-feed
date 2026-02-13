/**
 * Migration script: add performance indexes + uniqueness guardrails.
 *
 * Usage:
 *   node scripts/migrate-performance-indexes.mjs
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required in .env.local");
  process.exit(1);
}

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("Cleaning duplicate time_preferences rows...");
  await sql`
    WITH ranked AS (
      SELECT
        id,
        ROW_NUMBER() OVER (
          PARTITION BY user_id, hour_slot, day_type, category
          ORDER BY sample_count DESC, updated_at DESC, id DESC
        ) AS rn
      FROM time_preferences
    )
    DELETE FROM time_preferences tp
    USING ranked r
    WHERE tp.id = r.id
      AND r.rn > 1
  `;

  console.log("Creating indexes...");
  await sql`CREATE INDEX IF NOT EXISTS links_user_status_idx ON links (user_id, status)`;
  await sql`CREATE INDEX IF NOT EXISTS links_user_added_at_idx ON links (user_id, added_at)`;
  await sql`CREATE INDEX IF NOT EXISTS links_user_url_idx ON links (user_id, url)`;

  await sql`CREATE INDEX IF NOT EXISTS engagements_user_link_created_idx ON engagements (user_id, link_id, created_at)`;
  await sql`CREATE INDEX IF NOT EXISTS engagements_user_event_created_idx ON engagements (user_id, event_type, created_at)`;
  await sql`CREATE INDEX IF NOT EXISTS engagements_session_created_idx ON engagements (user_id, session_id, created_at)`;

  await sql`CREATE INDEX IF NOT EXISTS time_prefs_user_slot_lookup_idx ON time_preferences (user_id, hour_slot, day_type)`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS time_prefs_user_slot_category_uniq ON time_preferences (user_id, hour_slot, day_type, category)`;

  console.log("Migration complete.");
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
