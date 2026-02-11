import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { links } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// PATCH /api/links/[id] — update a link (archive, update shown count, etc.)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  const updates: Record<string, unknown> = {};

  if (body.status === "archived") {
    updates.status = "archived";
    updates.archivedAt = new Date();
  }

  if (body.shownCount !== undefined) {
    updates.shownCount = body.shownCount;
    updates.lastShownAt = new Date();
  }

  if (body.incrementShown) {
    // Use raw SQL for increment
    const existing = await db
      .select()
      .from(links)
      .where(eq(links.id, id))
      .limit(1);

    if (existing.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    updates.shownCount = existing[0].shownCount + 1;
    updates.lastShownAt = new Date();
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No updates provided" }, { status: 400 });
  }

  const [updated] = await db
    .update(links)
    .set(updates)
    .where(eq(links.id, id))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(updated);
}

// DELETE /api/links/[id] — permanently delete a link
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const [deleted] = await db
    .delete(links)
    .where(eq(links.id, id))
    .returning();

  if (!deleted) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
