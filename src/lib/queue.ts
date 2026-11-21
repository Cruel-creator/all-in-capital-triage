// The pipeline queue (pgmq "pipeline"), through server-only database functions. A message is one application id.
import { admin, must } from "./db/admin";

export type QueueMsg = { msg_id: number; read_ct: number; message: { application_id: string } };

export async function enqueue(applicationIds: string[], delayS = 0) {
  const db = admin();
  for (const id of applicationIds) {
    must(await db.rpc("queue_send", { app: id, delay_s: delayS }), "queue_send");
    await db.from("applications").update({ status: "queued", status_reason: null, current_step: null }).eq("id", id);
  }
}

/** Takes up to `qty` messages and hides them for `vtS` seconds (they reappear if the worker dies). */
export async function take(qty: number, vtS: number): Promise<QueueMsg[]> {
  if (qty <= 0) return [];
  return must(await admin().rpc("queue_read", { vt_s: vtS, qty }), "queue_read") as QueueMsg[];
}

export const done = async (msgId: number) => must(await admin().rpc("queue_delete", { id: msgId }), "queue_delete");
export const giveUp = async (msgId: number) => must(await admin().rpc("queue_archive", { id: msgId }), "queue_archive");
export const retryIn = async (msgId: number, seconds: number) => { const r = await admin().rpc("queue_set_vt", { id: msgId, vt_s: seconds }); if (r.error) throw new Error(`queue_set_vt: ${r.error.message}`); };

export async function waiting() {
  return must(await admin().rpc("queue_waiting"), "queue_waiting") as { msg_id: number; read_ct: number; application_id: string; vt: string; enqueued_at: string }[];
}

/** Retry backoff: 30s, 2 min, 8 min. Pure; tested. */
export const backoffSeconds = (attempt: number) => 30 * 4 ** Math.max(0, attempt - 1);
export const MAX_ATTEMPTS = 3;
