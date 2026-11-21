// Downloads the latest backtest report as Markdown (definition of done: "the backtest report is generated").
import { NextResponse } from "next/server";
import { admin } from "@/lib/db/admin";

export async function GET() {
  const run = (await admin().from("calibration_runs").select("report_md, created_at").order("created_at", { ascending: false }).limit(1).maybeSingle()).data;
  if (!run) return NextResponse.json({ error: "No backtest has run yet. Run it from the Calibration page or with pnpm backtest." }, { status: 404 });
  return new NextResponse(run.report_md, {
    headers: { "content-type": "text/markdown; charset=utf-8", "content-disposition": `attachment; filename="backtest-${run.created_at.slice(0, 10)}.md"` },
  });
}
