"use server";
// Re-runs the backtest on demand (partners only: about 12 scoring calls plus one per disagreement).
import { revalidatePath } from "next/cache";
import { currentUser } from "@/lib/google/session";
import { runBacktest } from "@/lib/calibration";

export async function rerunBacktest() {
  const user = await currentUser();
  if (!user) return { error: "Sign in with Google first." };
  if (!user.partner) return { error: "Only partners can re-run the backtest (it makes about 20 model calls)." };
  try {
    const r = await runBacktest();
    revalidatePath("/calibration");
    return { ok: true, agreement: r.confusion.agreement_pct };
  } catch (e) {
    console.error("backtest failed:", (e as Error).message);
    return { error: "The backtest failed. Check the model gateway is running, then try again." };
  }
}
