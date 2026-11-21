// Google redirects here: verify state, check the account is on the team list, store tokens, set the signed session
// cookie, return to the pipeline. Errors go back as short codes, never raw messages.
import { NextResponse, type NextRequest } from "next/server";
import { NotAllowedError, appUrl, connect, signSession } from "@/lib/google/client";

// success returns to the pipeline; failures go to the sign-in page, which explains them
const back = (q: string) => NextResponse.redirect(q === "connected" ? `${appUrl()}/?google=connected` : `${appUrl()}/signin?google=${q}`);

export async function GET(req: NextRequest) {
  const u = new URL(req.url);
  const code = u.searchParams.get("code");
  const state = u.searchParams.get("state");
  if (u.searchParams.get("error")) return back("denied");
  if (!code || !state || state !== req.cookies.get("oauth_state")?.value) return back("bad_state");
  try {
    const email = await connect(code);
    const res = back("connected");
    res.cookies.set("session", signSession(email), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 7 * 86400, path: "/" });
    res.cookies.delete("oauth_state");
    return res;
  } catch (e) {
    if (e instanceof NotAllowedError) return back(e.message === "unverified" ? "unverified" : "not_allowed");
    console.error("google callback failed:", (e as Error).message);
    return back("error");
  }
}
