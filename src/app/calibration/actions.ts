"use server";
// Re-runs the backtest on demand (signed-in only). About 12 scoring calls plus one per disagreement.
import { revalidatePath } from "next/cache";
import { currentUser } from "@/lib/google/session";
import { runBacktest } from "@/lib/calibration";

export async function rerunBacktest() {
  if (!(await currentUser())) return { error: "Sign in with Google first." };
  try {
    const r = await runBacktest();
    revalidatePath("/calibration");
    return { ok: true, agreement: r.confusion.agreement_pct };
  } catch (e) {
    return { error: `The backtest failed: ${(e as Error).message}` };
  }
}
