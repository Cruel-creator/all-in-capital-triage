// Sign-in gate. In production (or with REQUIRE_SIGNIN=1) every page and API route needs a valid session cookie,
// except the Google sign-in routes, the sign-in page and the cron endpoint (which checks its own CRON_SECRET).
// Verifies the same HMAC as src/lib/google/client.ts, using Web Crypto because middleware runs on the edge runtime.
// Locally it is off: the app is only reachable from this machine.
import { NextResponse, type NextRequest } from "next/server";

// /apply is the founders' public application form (it checks its own limits; see src/lib/intake)
const PUBLIC = [/^\/api\/google\//, /^\/api\/cron\//, /^\/signin$/, /^\/apply$/, /^\/_next\//, /^\/favicon/];

/** Lets the root layout know the path, so public pages render without the team shell and pipeline data. */
function pass(req: NextRequest) {
  const headers = new Headers(req.headers);
  headers.set("x-path", req.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}
const b64url = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function valid(token: string | undefined, secret: string | undefined): Promise<boolean> {
  if (!token || !secret || secret.length < 32) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const want = b64url(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
  if (want.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ sig.charCodeAt(i);
  if (diff !== 0) return false;
  try {
    const { exp } = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof exp === "number" && exp > Date.now();
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const enforce = process.env.NODE_ENV === "production" || process.env.REQUIRE_SIGNIN === "1";
  const path = req.nextUrl.pathname;
  if (!enforce || PUBLIC.some((r) => r.test(path))) return pass(req);
  if (await valid(req.cookies.get("session")?.value, process.env.SESSION_SECRET)) return pass(req);
  if (path.startsWith("/api/")) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/signin";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
