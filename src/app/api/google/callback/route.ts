// Google redirects here: verify state, store tokens, set the signed session cookie, return to the pipeline.
import { NextResponse, type NextRequest } from "next/server";
import { connect, signSession } from "@/lib/google/client";

export async function GET(req: NextRequest) {
  const u = new URL(req.url);
  const code = u.searchParams.get("code");
  const state = u.searchParams.get("state");
  if (u.searchParams.get("error")) return NextResponse.redirect(new URL("/?google=denied", req.url));
  if (!code || !state || state !== req.cookies.get("oauth_state")?.value) return NextResponse.redirect(new URL("/?google=bad_state", req.url));
  try {
    const email = await connect(code);
    const res = NextResponse.redirect(new URL("/?google=connected", req.url));
    res.cookies.set("session", signSession(email), { httpOnly: true, sameSite: "lax", secure: u.protocol === "https:", maxAge: 7 * 86400, path: "/" });
    res.cookies.delete("oauth_state");
    return res;
  } catch (e) {
    return NextResponse.redirect(new URL(`/?google=error&reason=${encodeURIComponent((e as Error).message.slice(0, 120))}`, req.url));
  }
}
