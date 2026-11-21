// Who is signed in (server components and actions only). The session cookie is set by the Google callback.
import { cookies } from "next/headers";
import { isPartner, verifySession } from "./client";

export async function currentUser(): Promise<{ email: string; partner: boolean } | null> {
  const email = verifySession((await cookies()).get("session")?.value);
  return email ? { email, partner: isPartner(email) } : null;
}
