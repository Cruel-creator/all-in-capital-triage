// Clears the session cookie. The connected mailbox stays connected (Riya's tokens stay in google_accounts).
import { NextResponse, type NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const res = NextResponse.redirect(new URL("/", req.url));
  res.cookies.delete("session");
  return res;
}
