// Scheduled queue processing for production (serverless can't keep a worker running). Called every few minutes by
// .github/workflows/queue.yml (and by Vercel Cron if the plan allows) with `Authorization: Bearer <CRON_SECRET>`.
// Runs the sweeper, then at most one application per call so it fits the function time limit; a run that is cut
// short resumes from its last finished step on the next call.
import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { processBatch } from "@/lib/worker";
import { autoSchedule } from "@/lib/google/outreach";
import { admin } from "@/lib/db/admin";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Two callers: the GitHub Action (Bearer CRON_SECRET from Vercel env) and Supabase pg_cron every 5 minutes (Bearer a
 * token generated inside the database and kept in Supabase Vault, checked by check_cron_token; it never leaves the
 * database). Migration 0015.
 */
async function authorised(req: NextRequest) {
  const got = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (got.length < 16 || got.length > 200) return false;
  const secret = process.env.CRON_SECRET;
  if (secret && secret.length >= 16 && got.length === secret.length && timingSafeEqual(Buffer.from(got), Buffer.from(secret))) return true;
  const { data, error } = await admin().rpc("check_cron_token", { token: got });
  return !error && data === true;
}

async function handle(req: NextRequest) {
  if (!(await authorised(req))) return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  try {
    // scheduling first: it uses no model, so it keeps running even when the AI spend cap has paused the queue
    const scheduling = await autoSchedule().catch((e) => ({ error: (e as Error).message }));
    const r = await processBatch({ max: 1, budgetMs: 200_000 });
    return NextResponse.json({ ...r, scheduling });
  } catch (e) {
    console.error("cron queue failed:", (e as Error).message);
    return NextResponse.json({ error: "Queue run failed." }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
