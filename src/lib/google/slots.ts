// Scheduling rules (build prompt §8, Meeting 5): Tuesday or Thursday afternoons IST, 30 minutes.
// Pure; tested. Times are handled as UTC instants; IST is UTC+5:30 with no daylight saving.
const IST_MS = 5.5 * 3600 * 1000;
export const SLOT_MIN = 30;
export const AFTERNOON = { startHour: 14, endHour: 18 }; // IST

export type Busy = { start: string; end: string };
export type Slot = { start: string; end: string };

const ist = (d: Date) => new Date(d.getTime() + IST_MS);

/** Candidate 30-minute slots on Tue/Thu 14:00-18:00 IST, from tomorrow for `days` days. */
export function candidateSlots(now: Date, days = 14): Slot[] {
  const out: Slot[] = [];
  const startIst = ist(now);
  for (let d = 1; d <= days; d++) {
    const day = new Date(Date.UTC(startIst.getUTCFullYear(), startIst.getUTCMonth(), startIst.getUTCDate() + d));
    const dow = day.getUTCDay();
    if (dow !== 2 && dow !== 4) continue;
    for (let h = AFTERNOON.startHour; h < AFTERNOON.endHour; h += SLOT_MIN / 60) {
      const s = new Date(day.getTime() + h * 3600 * 1000 - IST_MS);
      out.push({ start: s.toISOString(), end: new Date(s.getTime() + SLOT_MIN * 60 * 1000).toISOString() });
    }
  }
  return out;
}

const overlaps = (a: Slot, b: Busy) => new Date(a.start) < new Date(b.end) && new Date(b.start) < new Date(a.end);

/** Free slots, spread out: no two offered on the same day when avoidable. */
export function pickSlots(now: Date, busy: Busy[], count = 2): Slot[] {
  const free = candidateSlots(now).filter((s) => !busy.some((b) => overlaps(s, b)));
  const picked: Slot[] = [];
  for (const s of free) {
    if (picked.length >= count) break;
    if (!picked.some((p) => p.start.slice(0, 10) === s.start.slice(0, 10))) picked.push(s);
  }
  for (const s of free) if (picked.length < count && !picked.includes(s)) picked.push(s);
  return picked;
}

export const isFree = (slot: Slot, busy: Busy[]) => !busy.some((b) => overlaps(slot, b));

/** "Thursday, 26 Nov, 2:00 pm IST" */
export function formatSlot(s: Slot): string {
  return `${new Date(s.start).toLocaleString("en-IN", { weekday: "long", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })} IST`;
}

/** The instant 3 working days (Mon-Fri, IST) after `from`: when a follow-up becomes due. */
export function addWorkingDays(from: Date, n = 3): Date {
  let d = new Date(from.getTime());
  let added = 0;
  while (added < n) {
    d = new Date(d.getTime() + 24 * 3600 * 1000);
    const dow = ist(d).getUTCDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return d;
}
