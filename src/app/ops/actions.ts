"use server";
// Cost & ops controls (build prompt §9.7): daily limit, alert address, concurrency, and resuming a paused queue.
import { revalidatePath } from "next/cache";
import { admin, must } from "@/lib/db/admin";
import { currentUser } from "@/lib/google/session";

async function partner(): Promise<{ error: string } | { email: string }> {
  const u = await currentUser();
  if (!u) return { error: "Sign in with Google first." };
  if (!u.partner) return { error: "Only partners can change spending limits." };
  return { email: u.email };
}

export async function saveLimits(dailyUsd: number, alertEmail: string, maxInFlight: number) {
  const who = await partner();
  if ("error" in who) return who;
  if (!(dailyUsd > 0 && dailyUsd <= 500)) return { error: "The daily limit must be between $0.01 and $500." };
  if (!(Number.isInteger(maxInFlight) && maxInFlight >= 1 && maxInFlight <= 10)) return { error: "Run between 1 and 10 applications at a time." };
  const email = alertEmail.trim();
  if (email && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) return { error: "That alert address doesn't look right." };
  must(await admin().from("cost_limits").update({ daily_usd: Math.round(dailyUsd * 100) / 100, alert_email: email || null, max_in_flight: maxInFlight }).eq("id", 1), "limits");
  revalidatePath("/ops");
  return { ok: true };
}

/** Resume after a pause. If today's spend is still over the limit the next model call pauses it again. */
export async function resumeQueue() {
  const who = await partner();
  if ("error" in who) return who;
  must(await admin().from("cost_limits").update({ paused_at: null, pause_reason: null }).eq("id", 1), "resume");
  revalidatePath("/ops");
  revalidatePath("/", "layout");
  return { ok: true };
}
