// GET /api/source?claim=<uuid> | ?finding=<uuid>: what the source drawer shows. Server-side only data access.
import { NextResponse } from "next/server";
import { loadSource } from "@/lib/data/detail";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const claim = u.searchParams.get("claim");
  const finding = u.searchParams.get("finding");
  const id = claim ?? finding;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Pass ?claim=<id> or ?finding=<id>." }, { status: 400 });
  try {
    const data = await loadSource(claim ? "claim" : "finding", id);
    if (!data) return NextResponse.json({ error: "That source no longer exists. It may have been replaced by a re-run." }, { status: 404 });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: `Couldn't load the source: ${(e as Error).message}` }, { status: 500 });
  }
}
