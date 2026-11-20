// A claim's quote must appear verbatim on the page it cites (after whitespace normalisation), and be ≤25 words.
// This stops a model citing a real page with an invented quote.
const collapse = (s: string) =>
  s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

export const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

export type QuoteCheck = { ok: true; char_start: number; char_end: number } | { ok: false; reason: string };

export function verifyQuote(pageText: string | undefined, quote: string): QuoteCheck {
  if (!pageText) return { ok: false, reason: "cited page does not exist" };
  if (!quote.trim()) return { ok: false, reason: "empty quote" };
  if (wordCount(quote) > 25) return { ok: false, reason: `quote is ${wordCount(quote)} words (max 25)` };
  const hay = collapse(pageText);
  const needle = collapse(quote);
  const i = hay.indexOf(needle);
  if (i < 0) return { ok: false, reason: "quote not found on the cited page" };
  return { ok: true, char_start: i, char_end: i + needle.length };
}
