// GET /api/logo?d=<domain>: a portfolio company's site icon, fetched server-side so viewers' browsers never call a
// third party. Only domains on the portfolio list are served (not an open proxy). 404 means "show the lettered badge".
import { NextResponse } from "next/server";
import { admin } from "@/lib/db/admin";

const DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;

export async function GET(req: Request) {
  const d = new URL(req.url).searchParams.get("d")?.toLowerCase() ?? "";
  if (!DOMAIN.test(d)) return new NextResponse(null, { status: 400 });
  const { data } = await admin().from("portfolio").select("id").eq("website", d).limit(1);
  if (!data?.length) return new NextResponse(null, { status: 404 });
  // Google's icon service first (sharp, sized); if it has nothing on file (404 with a generic globe), the site's own
  // /favicon.ico. Neither: 404, and the UI shows the lettered badge.
  for (const src of [`https://www.google.com/s2/favicons?domain=${encodeURIComponent(d)}&sz=128`, `https://${d}/favicon.ico`]) {
    try {
      const res = await fetch(src, { signal: AbortSignal.timeout(8000), next: { revalidate: 604800 } });
      const type = res.headers.get("content-type") ?? "";
      if (!res.ok || !(type.startsWith("image/") || type === "application/octet-stream")) continue;
      const body = await res.arrayBuffer();
      if (body.byteLength < 64) continue;
      return new NextResponse(body, { headers: { "Content-Type": type.startsWith("image/") ? type : "image/x-icon", "Cache-Control": "private, max-age=604800, immutable" } });
    } catch {
      // try the next source
    }
  }
  return new NextResponse(null, { status: 404, headers: { "Cache-Control": "private, max-age=86400" } });
}
