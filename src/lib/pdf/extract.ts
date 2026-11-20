import { createHash } from "node:crypto";
import { extractText, getDocumentProxy } from "unpdf";

export type ExtractedDoc = {
  sha256: string;
  pages: { page_no: number; text: string }[];
};

/** Page-numbered text extraction. Page numbers are 1-based, matching what a reader sees. */
export async function extractPages(bytes: Uint8Array): Promise<ExtractedDoc> {
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const pdf = await getDocumentProxy(bytes.slice());
  const { text } = await extractText(pdf, { mergePages: false });
  const pages = (text as string[]).map((t, i) => ({ page_no: i + 1, text: normalise(t) }));
  return { sha256, pages };
}

export function normalise(s: string): string {
  return s
    .replace(/ /g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}
