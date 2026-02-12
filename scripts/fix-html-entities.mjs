/**
 * One-time migration: decode HTML entities in existing DB records.
 * Fixes &#x27; → ', &amp; → &, etc. in title, description, and ai_summary fields.
 */

import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const sql = neon(process.env.DATABASE_URL);

function decodeHtmlEntities(str) {
  if (!str) return str;
  return str
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

async function main() {
  // Find all rows with HTML entities in title, description, ai_summary, or site_name
  const rows = await sql`
    SELECT id, title, description, ai_summary, site_name, thumbnail
    FROM links
    WHERE title LIKE '%&#%' OR title LIKE '%&amp;%'
       OR description LIKE '%&#%' OR description LIKE '%&amp;%'
       OR ai_summary LIKE '%&#%' OR ai_summary LIKE '%&amp;%'
       OR site_name LIKE '%&#%' OR site_name LIKE '%&amp;%'
       OR thumbnail LIKE '%&amp;%'
  `;

  console.log(`Found ${rows.length} rows with HTML entities to fix`);

  let updated = 0;
  for (const row of rows) {
    const newTitle = decodeHtmlEntities(row.title);
    const newDesc = decodeHtmlEntities(row.description);
    const newSummary = decodeHtmlEntities(row.ai_summary);
    const newSiteName = decodeHtmlEntities(row.site_name);
    const newThumbnail = decodeHtmlEntities(row.thumbnail);

    const changed =
      newTitle !== row.title ||
      newDesc !== row.description ||
      newSummary !== row.ai_summary ||
      newSiteName !== row.site_name ||
      newThumbnail !== row.thumbnail;

    if (changed) {
      await sql`
        UPDATE links SET
          title = ${newTitle},
          description = ${newDesc},
          ai_summary = ${newSummary},
          site_name = ${newSiteName},
          thumbnail = ${newThumbnail}
        WHERE id = ${row.id}
      `;
      updated++;
      if (updated % 50 === 0) console.log(`  Updated ${updated}/${rows.length}...`);
    }
  }

  console.log(`Done. Updated ${updated} rows.`);
}

main().catch(console.error);
