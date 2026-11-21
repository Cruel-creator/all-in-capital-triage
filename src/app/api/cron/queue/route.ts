// Scheduled queue processing for production (serverless can't keep a worker running). Called every few minutes by
// .github/workflows/queue.yml (and by Vercel Cron if the plan allows) with `Authorization: Bearer <CRON_SECRET>`.
// Runs the sweeper, then at most one application per call so it fits the function time limit; a run that is cut
// short resumes from its last finished step on the next call.
import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { processBatch } from "@/lib/worker";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

function authorised(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const got = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || secret.length < 16 || got.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(secret));
}

async function handle(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  try {
    const r = await processBatch({ max: 1, budgetMs: 240_000 });
    return NextResponse.json(r);
  } catch (e) {
    console.error("cron queue failed:", (e as Error).message);
    return NextResponse.json({ error: "Queue run failed." }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
