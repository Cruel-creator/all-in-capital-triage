// INR parsing and display with Indian units. 1 L (lakh) = 1e5, 1 Cr = 1e7, 1 lakh Cr = 1e12.
import type { Unit } from "./types";

const round = (n: number, dp = 2) => Number(n.toFixed(dp));
const inGroup = (n: number, dp = 2) => round(n, dp).toLocaleString("en-IN", { maximumFractionDigits: dp });

/** Parses "INR 91,200 Cr", "₹1.9 L", "INR 1.44 lakh Cr", "INR 340", "38M", "300K". Returns rupees or a count. */
export function parseAmount(raw: string): number | null {
  const s = raw.replace(/[₹,]/g, "").replace(/\bINR\b/gi, "").trim();
  const m = s.match(/^(-?\d+(?:\.\d+)?)\s*(lakh\s*cr|lakh\s*crore|cr|crore|l|lakh|lac|k|thousand|m|mn|million|bn|b|billion)?\b/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const u = (m[2] ?? "").toLowerCase().replace(/\s+/g, " ");
  const mult: Record<string, number> = {
    "": 1,
    "lakh cr": 1e12,
    "lakh crore": 1e12,
    cr: 1e7,
    crore: 1e7,
    l: 1e5,
    lakh: 1e5,
    lac: 1e5,
    k: 1e3,
    thousand: 1e3,
    m: 1e6,
    mn: 1e6,
    million: 1e6,
    bn: 1e9,
    b: 1e9,
    billion: 1e9,
  };
  return n * (mult[u] ?? 1);
}

export function formatInr(n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (a >= 1e12) return `${sign}₹${inGroup(a / 1e12)} lakh Cr`;
  if (a >= 1e7) return `${sign}₹${inGroup(a / 1e7)} Cr`;
  if (a >= 1e5) return `${sign}₹${inGroup(a / 1e5)} L`;
  return `${sign}₹${inGroup(a, 0)}`;
}

export function formatCount(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e6) return `${round(n / 1e6)}M`;
  return inGroup(n, 2);
}

export function formatValue(n: number, unit: Unit): string {
  switch (unit) {
    case "INR":
      return formatInr(n);
    case "share":
      return `${round(n * 100, 2)}%`;
    case "pct":
      return `${round(n, 2)}%`;
    case "months":
      return `${round(n, 1)} months`;
    case "x":
      return `${round(n, 2)}x`;
    default:
      return formatCount(n);
  }
}

export function deltaPct(stated: number, computed: number): number {
  if (computed === 0) return stated === 0 ? 0 : Infinity;
  return round((Math.abs(stated - computed) / Math.abs(computed)) * 100, 1);
}
