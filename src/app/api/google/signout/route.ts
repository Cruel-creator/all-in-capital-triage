// Clears the session cookie. POST only, so another site can't sign you out with a link or image.
// The connected mailbox stays connected (its tokens stay in google_accounts).
import { NextResponse } from "next/server";
import { appUrl } from "@/lib/google/client";

export async function POST() {
  const res = NextResponse.redirect(`${appUrl()}/`, 303);
  res.cookies.delete("session");
  return res;
}
