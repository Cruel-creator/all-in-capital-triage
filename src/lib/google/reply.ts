// Reads a founder's reply to a call invite, without a model: did they take one of the offered slots, propose
// their own times, or say something a person needs to read? Pure; tested. Times are IST (UTC+5:30, no DST).
import type { Slot } from "./slots";
import { SLOT_MIN } from "./slots";

const IST_MS = 5.5 * 3600 * 1000;
const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

export type ReplyRead = { kind: "accept"; slot: Slot } | { kind: "propose"; slots: Slot[] } | { kind: "unclear" };

/** Drops quoted history ("On … wrote:", "> …", forwarded headers) and signatures. */
export function stripQuoted(text: string): string {
  const cut = text.search(/^(On .{4,200}wrote:|-{2,} ?Original Message|From: .+@.+)$/im);
  const head = cut >= 0 ? text.slice(0, cut) : text;
  const sig = head.search(/^-- ?$/m);
  return (sig >= 0 ? head.slice(0, sig) : head)
    .split(/\r?\n/)
    .filter((l) => !l.trim().startsWith(">"))
    .join("\n")
    .trim();
}

const istParts = (iso: string) => {
  const d = new Date(new Date(iso).getTime() + IST_MS);
  return { dow: d.getUTCDay(), h: d.getUTCHours(), m: d.getUTCMinutes(), y: d.getUTCFullYear(), mo: d.getUTCMonth(), day: d.getUTCDate() };
};
const slotAt = (y: number, mo: number, day: number, h: number, m: number): Slot => {
  const s = new Date(Date.UTC(y, mo, day, h, m) - IST_MS);
  return { start: s.toISOString(), end: new Date(s.getTime() + SLOT_MIN * 60e3).toISOString() };
};

const NEG = /\b(not|cannot|can not|unable|busy|unavailable|tied up)\b|n't\b/;
const TIME = /\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)|\b([01]?\d|2[0-3]):([0-5]\d)\b/;
// full day names, plus only the unambiguous short forms ("mon", "sat", "sun" are ordinary words)
const WEEKDAY = /\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday|tues?|weds?|thu|thurs?|fri)\b\.?/;
const DATE_A = /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/;
const DATE_B = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?\b/;

function timeOf(s: string): { h: number; m: number } | null {
  const t = s.match(TIME);
  if (!t) return null;
  if (t[4] !== undefined) return { h: Number(t[4]), m: Number(t[5]) };
  let h = Number(t[1]) % 12;
  if (t[3].startsWith("p")) h += 12;
  return { h, m: t[2] ? Number(t[2]) : 0 };
}

/** The calendar day (IST) a sentence names: an explicit date, or the next such weekday after `now`. */
function dayOf(s: string, now: Date): { y: number; mo: number; day: number } | null {
  const n = istParts(now.toISOString());
  const a = s.match(DATE_A), b = s.match(DATE_B);
  if (a || b) {
    const day = Number(a ? a[1] : b![2]);
    const mo = MONTHS.indexOf((a ? a[2] : b![1]).slice(0, 3));
    const y = mo < n.mo || (mo === n.mo && day < n.day) ? n.y + 1 : n.y;
    return { y, mo, day };
  }
  const w = s.match(WEEKDAY);
  if (!w) return null;
  const dow = DAYS.indexOf(w[1].slice(0, 3));
  let add = (dow - n.dow + 7) % 7;
  if (add === 0) add = 7; // "Thursday" said on a Thursday means next week
  const d = new Date(Date.UTC(n.y, n.mo, n.day + add));
  return { y: d.getUTCFullYear(), mo: d.getUTCMonth(), day: d.getUTCDate() };
}

export function readReply(raw: string, offered: Slot[], now: Date): ReplyRead {
  const text = stripQuoted(raw).toLowerCase().replace(/’/g, "'");
  const sentences = text.split(/(?<!\d)[.!?;]+(?=\s|$)|\n/).map((s) => s.trim()).filter(Boolean);
  const offeredParts = offered.map((o) => ({ o, p: istParts(o.start) }));

  // 1. explicit day + time in a sentence that isn't a refusal
  const named: Slot[] = [];
  for (const s of sentences) {
    if (NEG.test(s)) continue;
    const t = timeOf(s), d = dayOf(s, now);
    if (t && d) named.push(slotAt(d.y, d.mo, d.day, t.h, t.m));
  }
  for (const s of named) {
    const hit = offered.find((o) => o.start === s.start);
    if (hit) return { kind: "accept", slot: hit };
  }
  const future = named.filter((s) => new Date(s.start) > now);
  if (future.length) return { kind: "propose", slots: future };

  // 2. a weekday alone ("Thursday works"), or "the first/second one", "either works"
  for (const s of sentences) {
    if (NEG.test(s)) continue;
    const w = s.match(WEEKDAY);
    if (w) {
      const hits = offeredParts.filter((x) => x.p.dow === DAYS.indexOf(w[1].slice(0, 3)));
      if (hits.length === 1) return { kind: "accept", slot: hits[0].o };
    }
    if (offered[0] && /\b((the )?(first|1st) (one|slot|option|time)|former|option (1|one))\b/.test(s)) return { kind: "accept", slot: offered[0] };
    if (offered[1] && /\b((the )?(second|2nd) (one|slot|option|time)|latter|option (2|two))\b/.test(s)) return { kind: "accept", slot: offered[1] };
    if (offered[0] && /\b(either|both)( (one|slot|option|time)s?)? (works?|is fine|are fine|suits?)\b/.test(s)) return { kind: "accept", slot: offered[0] };
  }
  return { kind: "unclear" };
}
