/**
 * Migration script: Add userId to existing data.
 *
 * Run AFTER `npm run db:push` with the updated schema (userId columns added).
 *
 * Usage:
 *   node scripts/migrate-add-user.mjs <email> <password>
 *
 * Example:
 *   node scripts/migrate-add-user.mjs me@example.com mypassword123
 *
 * This will:
 * 1. Create a user account with the given email/password
 * 2. Assign all existing links, engagements, and timePreferences to that user
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";
import { hash } from "bcryptjs";
import { nanoid } from "nanoid";

const email = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
  console.error("Usage: node scripts/migrate-add-user.mjs <email> <password>");
  process.exit(1);
}

if (password.length < 8) {
  console.error("Password must be at least 8 characters");
  process.exit(1);
}

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  const userId = nanoid(12);
  const passwordHash = await hash(password, 12);
  const normalizedEmail = email.toLowerCase().trim();

  // 1. Create user
  await sql`INSERT INTO users (id, email, password_hash, created_at) VALUES (${userId}, ${normalizedEmail}, ${passwordHash}, NOW())`;
  console.log(`Created user: ${normalizedEmail} (ID: ${userId})`);

  // 2. Backfill userId on all existing rows
  const linksResult = await sql`UPDATE links SET user_id = ${userId} WHERE user_id IS NULL OR user_id = ''`;
  console.log(`Updated links: ${linksResult.count} rows`);

  const engResult = await sql`UPDATE engagements SET user_id = ${userId} WHERE user_id IS NULL OR user_id = ''`;
  console.log(`Updated engagements: ${engResult.count} rows`);

  const tpResult = await sql`UPDATE time_preferences SET user_id = ${userId} WHERE user_id IS NULL OR user_id = ''`;
  console.log(`Updated time_preferences: ${tpResult.count} rows`);

  console.log("\nMigration complete! You can now log in with your email and password.");
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
