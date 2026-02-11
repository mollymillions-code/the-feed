import { GoogleGenerativeAI } from "@google/generative-ai";
import { CategorizeResult, CATEGORIES } from "@/types";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export async function categorizeContent(
  title: string | null,
  description: string | null,
  siteName: string | null,
  contentType: string
): Promise<CategorizeResult> {
  if (!process.env.GEMINI_API_KEY) {
    return { categories: ["Fun"], summary: null };
  }

  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const categoryList = CATEGORIES.join(", ");

  const prompt = `You are a content categorizer. Given the following content metadata, assign 1-2 categories and optionally generate a brief 2-sentence summary.

Title: ${title || "Unknown"}
Description: ${description || "None"}
Site: ${siteName || "Unknown"}
Content Type: ${contentType}

Available categories: ${categoryList}

Respond with ONLY valid JSON in this exact format:
{"categories": ["Category1", "Category2"], "summary": "Brief 2-sentence summary or null if not enough info."}

Rules:
- Pick 1-2 categories that best match
- Only use categories from the list above
- Summary should be concise and informative
- If you can't determine a good summary, set it to null
- For tweets and short content, summary is usually null`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    // Extract JSON from the response (handle markdown code blocks)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { categories: ["Fun"], summary: null };
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate categories
    const validCategories = (parsed.categories || []).filter(
      (c: string) => CATEGORIES.includes(c as (typeof CATEGORIES)[number])
    );

    return {
      categories: validCategories.length > 0 ? validCategories : ["Fun"],
      summary: parsed.summary || null,
    };
  } catch {
    return { categories: ["Fun"], summary: null };
  }
}

/**
 * Generate a semantic embedding vector for a piece of content.
 *
 * This uses Gemini's text-embedding-004 model to create a 768-dimensional
 * vector that captures the MEANING of the content — not just its category.
 *
 * Two links about "how neural networks learn" will have very similar embeddings
 * even if one is a YouTube video and the other is a blog post.
 *
 * We embed the concatenation of title + description + categories for a
 * rich semantic representation.
 */
export async function generateEmbedding(
  title: string | null,
  description: string | null,
  categories: string[],
  siteName: string | null
): Promise<number[] | null> {
  if (!process.env.GEMINI_API_KEY) return null;

  // Build a rich text representation of the content
  const parts = [
    title || "",
    description || "",
    categories.length > 0 ? `Topics: ${categories.join(", ")}` : "",
    siteName ? `Source: ${siteName}` : "",
  ].filter(Boolean);

  const text = parts.join(". ");
  if (!text.trim()) return null;

  try {
    const model = genAI.getGenerativeModel({ model: "text-embedding-004" });
    const result = await model.embedContent(text);
    return result.embedding.values;
  } catch {
    return null;
  }
}

/**
 * Compute cosine similarity between two embedding vectors.
 * Returns a value between -1 (opposite) and 1 (identical).
 * Content with similarity > 0.7 is usually very related.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}
