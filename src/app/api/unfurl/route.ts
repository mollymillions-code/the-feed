import { NextRequest, NextResponse } from "next/server";
import { unfurlUrl } from "@/lib/unfurl";

// POST /api/unfurl — preview a URL before saving
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { url } = body;

  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }

  try {
    new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  const result = await unfurlUrl(url);
  return NextResponse.json(result);
}
