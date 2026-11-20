// Splits the deal memo pack and partner meeting notes into retrievable passages, each with its page number.
// Retrieval sends only the relevant passages to the model (non-negotiable 5), never the whole pack.
export type MemoHeader = {
  memo_no: number;
  company: string;
  outcome: "invested" | "passed";
  sector: string;
  stage: string | null;
  source: string | null;
  page_from: number;
  page_to: number;
};
export type Chunk = { section: string; text: string; page_no: number };
export type MemoParsed = MemoHeader & { chunks: Chunk[] };
export type MeetingParsed = { meeting_no: number; title: string; page_no: number; chunks: Chunk[] };

type Line = { text: string; page_no: number };
const collapse = (s: string) => s.replace(/\s+/g, " ").trim();

const toLines = (pages: { page_no: number; text: string }[]): Line[] =>
  pages.flatMap((p) => p.text.split("\n").map((text) => ({ text: text.trim(), page_no: p.page_no }))).filter((l) => l.text);

const SECTIONS = ["What it does.", "Founder assessment.", "Risks and open questions.", "Why we invested.", "Why we passed."];

export function parseMemos(pages: { page_no: number; text: string }[]): MemoParsed[] {
  const lines = toLines(pages);
  const starts = lines.flatMap((l, i) => (/^Memo \d+: /.test(l.text) ? [i] : []));
  return starts.map((start, k) => {
    const end = k + 1 < starts.length ? starts[k + 1] : lines.length;
    const block = lines.slice(start, end);
    const [, no, company] = block[0].text.match(/^Memo (\d+): (.+)$/)!;
    // header runs until the first section marker
    const firstSection = block.findIndex((l, i) => i > 0 && SECTIONS.some((s) => l.text.startsWith(s)));
    const header = collapse(block.slice(1, firstSection).map((l) => l.text).join(" "));
    const field = (name: string) => header.match(new RegExp(`${name}:\\s*([^|]+?)(?:\\s*\\||$)`))?.[1]?.trim() ?? null;
    const decision = (field("Decision") ?? "").toUpperCase();

    const chunks: Chunk[] = [];
    let cur: Chunk | null = null;
    for (const l of block.slice(firstSection)) {
      const sec = SECTIONS.find((s) => l.text.startsWith(s));
      if (sec) {
        if (cur) chunks.push(cur);
        cur = { section: sec.replace(/\.$/, ""), text: l.text, page_no: l.page_no };
      } else if (cur) cur.text = collapse(cur.text + " " + l.text);
    }
    if (cur) chunks.push(cur);
    for (const c of chunks) c.text = `${company} (${decision === "INVESTED" ? "invested" : "passed"}). ${c.text}`;

    return {
      memo_no: Number(no),
      company: company.trim(),
      outcome: decision.startsWith("INVEST") ? "invested" : "passed",
      sector: field("Sector") ?? "unknown",
      stage: field("Stage"),
      source: field("Source"),
      page_from: block[0].page_no,
      page_to: block[block.length - 1].page_no,
      chunks,
    };
  });
}

export function parseMeetings(pages: { page_no: number; text: string }[]): MeetingParsed[] {
  const out: MeetingParsed[] = [];
  for (const p of pages) {
    const lines = p.text.split("\n").map((t) => t.trim()).filter(Boolean);
    const hi = lines.findIndex((l) => /^Meeting \d+ [-–—] /.test(l));
    if (hi < 0) continue;
    const [, no, title] = lines[hi].match(/^Meeting (\d+) [-–—] (.+)$/)!;
    const chunks: Chunk[] = [];
    let heading = "General";
    let buf: string[] = [];
    const flush = () => {
      if (buf.length) chunks.push({ section: heading, text: `Meeting ${no} (${title}), ${heading}: ${collapse(buf.join(" "))}`, page_no: p.page_no });
      buf = [];
    };
    for (const l of lines.slice(hi + 1)) {
      if (l.startsWith("Present:")) continue;
      if (l.startsWith("●")) {
        // each bullet starts a new sentence group; keep groups under ~700 chars
        if (buf.join(" ").length > 700) flush();
        buf.push(l.replace(/^●\s*/, ""));
      } else if (!/[.:'’]$/.test(l) && l.length < 80 && buf.length === 0) {
        heading = l;
      } else if (!/[.:'’]$/.test(l) && l.length < 80 && !l.startsWith("●") && /^[A-Z]/.test(l) && !/[a-z]\s[a-z]+\s[a-z]+\s[a-z]+\s[a-z]+\s[a-z]+/.test(l)) {
        flush();
        heading = l;
      } else buf.push(l);
    }
    flush();
    out.push({ meeting_no: Number(no), title, page_no: p.page_no, chunks });
  }
  return out;
}
