// Google OAuth (Riya's account), a signed session cookie, Gmail and Calendar. Server-only.
// Tokens live in google_accounts (RLS with no policies: only the service role can read them).
import { createHmac, timingSafeEqual } from "node:crypto";
import { admin, must } from "../db/admin";
import type { Busy } from "./slots";

export const SCOPES = [
  "openid", "email",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.freebusy",
];
export const appUrl = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const redirectUri = () => `${appUrl()}/api/google/callback`;
const cfg = () => {
  const id = process.env.GOOGLE_CLIENT_ID, secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!id || !secret) throw new Error("Google isn't set up: add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env.local");
  return { id, secret };
};
export const googleConfigured = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

// session: an HMAC-signed cookie holding the signed-in Google email. No fallback secret: a missing or short
// SESSION_SECRET is a configuration error, never a guessable default.
const secret = () => {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set to a random string of 32+ characters");
  return s;
};
const isProd = () => process.env.NODE_ENV === "production";
const list = (v: string | undefined) => (v ?? "").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);

/** Who may sign in at all: ALLOWED_EMAILS + PARTNER_EMAILS + MAILBOX_EMAIL. Empty list: allowed locally, nobody in production. */
export function isAllowed(email: string | null) {
  if (!email) return false;
  const all = [...list(process.env.ALLOWED_EMAILS), ...list(process.env.PARTNER_EMAILS), ...list(process.env.MAILBOX_EMAIL)];
  return all.length === 0 ? !isProd() : all.includes(email.toLowerCase());
}
export function signSession(email: string, days = 7) {
  const payload = Buffer.from(JSON.stringify({ email, exp: Date.now() + days * 864e5 })).toString("base64url");
  return `${payload}.${createHmac("sha256", secret()).update(payload).digest("base64url")}`;
}
export function verifySession(token: string | undefined): string | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const want = createHmac("sha256", secret()).update(payload).digest("base64url");
  if (want.length !== sig.length || !timingSafeEqual(Buffer.from(want), Buffer.from(sig))) return null;
  try {
    const { email, exp } = JSON.parse(Buffer.from(payload, "base64url").toString());
    return typeof email === "string" && exp > Date.now() ? email : null;
  } catch {
    return null;
  }
}
/** Partners decide (Kushal, Aditya). PARTNER_EMAILS is a comma-separated list.
 *  Left blank: whoever is signed in may decide locally (testing); nobody may in production. */
export function isPartner(email: string | null) {
  if (!email || !isAllowed(email)) return false;
  const partners = list(process.env.PARTNER_EMAILS);
  return partners.length === 0 ? !isProd() : partners.includes(email.toLowerCase());
}

/** The sending mailbox: MAILBOX_EMAIL if set (Riya's), else the most recent connection (local testing). */
async function mailboxRow() {
  const q = admin().from("google_accounts").select("*");
  const fixed = process.env.MAILBOX_EMAIL?.trim().toLowerCase();
  return (fixed ? await q.eq("email", fixed).maybeSingle() : await q.order("connected_at", { ascending: false }).limit(1).maybeSingle()).data;
}

/** The connected mailbox's address, without touching tokens. */
export async function mailboxEmail(): Promise<string | null> {
  return (await mailboxRow())?.email ?? null;
}

export function authUrl(state: string) {
  const { id } = cfg();
  const p = new URLSearchParams({ client_id: id, redirect_uri: redirectUri(), response_type: "code", scope: SCOPES.join(" "), access_type: "offline", prompt: "consent", state });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

async function tokenCall(body: Record<string, string>) {
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(`Google token error: ${j.error_description ?? j.error}`);
  return j as { access_token: string; refresh_token?: string; expires_in: number; scope: string };
}

/** Exchange the callback code, store the tokens, return the account email. */
export async function connect(code: string): Promise<string> {
  const { id, secret: s } = cfg();
  const t = await tokenCall({ code, client_id: id, client_secret: s, redirect_uri: redirectUri(), grant_type: "authorization_code" });
  const info = await (await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { authorization: `Bearer ${t.access_token}` } })).json();
  if (!info.email || info.email_verified === false) throw new NotAllowedError("unverified");
  if (!isAllowed(info.email)) throw new NotAllowedError("not_allowed");
  if (!t.refresh_token) throw new Error("No refresh token: remove the app's access in your Google account and connect again");
  must(
    await admin().from("google_accounts").upsert({ email: info.email, refresh_token: t.refresh_token, access_token: t.access_token, expires_at: new Date(Date.now() + (t.expires_in - 60) * 1000).toISOString(), scopes: t.scope, connected_at: new Date().toISOString() }),
    "google_accounts",
  );
  return info.email as string;
}

export class NotAllowedError extends Error {}

/** The sending mailbox (Riya's): MAILBOX_EMAIL when set, so a partner signing in never takes over sending. */
export async function mailbox(): Promise<{ email: string; token: string } | null> {
  const db = admin();
  const acc = await mailboxRow();
  if (!acc) return null;
  if (acc.access_token && acc.expires_at && new Date(acc.expires_at) > new Date()) return { email: acc.email, token: acc.access_token };
  const { id, secret: s } = cfg();
  const t = await tokenCall({ refresh_token: acc.refresh_token, client_id: id, client_secret: s, grant_type: "refresh_token" });
  await db.from("google_accounts").update({ access_token: t.access_token, expires_at: new Date(Date.now() + (t.expires_in - 60) * 1000).toISOString() }).eq("email", acc.email);
  return { email: acc.email, token: t.access_token };
}

async function g<T>(url: string, token: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(init?.headers ?? {}) } });
  const body = await r.text();
  if (!r.ok) throw new Error(`Google API ${r.status}: ${body.slice(0, 300)}`);
  return (body ? JSON.parse(body) : {}) as T;
}

/** RFC 2822 message, base64url. Pure; tested. */
export function buildRaw(m: { from: string; to: string; subject: string; body: string; inReplyTo?: string | null }) {
  const subject = /^[\x20-\x7e]*$/.test(m.subject) ? m.subject : `=?UTF-8?B?${Buffer.from(m.subject).toString("base64")}?=`;
  const headers = [`From: ${m.from}`, `To: ${m.to}`, `Subject: ${subject}`, "MIME-Version: 1.0", 'Content-Type: text/plain; charset="UTF-8"', "Content-Transfer-Encoding: 8bit"];
  if (m.inReplyTo) headers.push(`In-Reply-To: ${m.inReplyTo}`, `References: ${m.inReplyTo}`);
  return Buffer.from(`${headers.join("\r\n")}\r\n\r\n${m.body}`).toString("base64url");
}

export async function sendMail(m: { to: string; subject: string; body: string; threadId?: string | null; inReplyTo?: string | null }) {
  const box = await mailbox();
  if (!box) throw new Error("Gmail isn't connected");
  const raw = buildRaw({ from: box.email, to: m.to, subject: m.subject, body: m.body, inReplyTo: m.inReplyTo });
  return g<{ id: string; threadId: string }>("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", box.token, {
    method: "POST",
    body: JSON.stringify({ raw, ...(m.threadId ? { threadId: m.threadId } : {}) }),
  });
}

export type GmailMessage = { id: string; from: string; date: string; messageIdHeader: string | null; text: string };
export async function readThread(threadId: string): Promise<GmailMessage[]> {
  const box = await mailbox();
  if (!box) throw new Error("Gmail isn't connected");
  type Part = { mimeType: string; body?: { data?: string } };
  const t = await g<{ messages: { id: string; internalDate: string; payload: { headers: { name: string; value: string }[]; body?: { data?: string }; parts?: Part[] } }[] }>(
    `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=full`, box.token,
  );
  return t.messages.map((m) => {
    const h = (n: string) => m.payload.headers.find((x) => x.name.toLowerCase() === n)?.value ?? null;
    const data = m.payload.parts?.find((p) => p.mimeType === "text/plain")?.body?.data ?? m.payload.body?.data ?? "";
    return { id: m.id, from: h("from") ?? "", date: new Date(Number(m.internalDate)).toISOString(), messageIdHeader: h("message-id"), text: Buffer.from(data, "base64url").toString("utf8") };
  });
}

export async function busy(fromIso: string, toIso: string): Promise<Busy[]> {
  const box = await mailbox();
  if (!box) throw new Error("Calendar isn't connected");
  const r = await g<{ calendars: Record<string, { busy: Busy[] }> }>("https://www.googleapis.com/calendar/v3/freeBusy", box.token, {
    method: "POST",
    body: JSON.stringify({ timeMin: fromIso, timeMax: toIso, timeZone: "Asia/Kolkata", items: [{ id: "primary" }] }),
  });
  return r.calendars.primary?.busy ?? [];
}

/** Books the call in Riya's calendar and invites the founder (and Aditya for deeptech), with a Meet link. */
export async function bookEvent(e: { summary: string; start: string; end: string; attendees: string[]; description: string }) {
  const box = await mailbox();
  if (!box) throw new Error("Calendar isn't connected");
  return g<{ id: string; htmlLink: string }>("https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all&conferenceDataVersion=1", box.token, {
    method: "POST",
    body: JSON.stringify({
      summary: e.summary, description: e.description,
      start: { dateTime: e.start, timeZone: "Asia/Kolkata" }, end: { dateTime: e.end, timeZone: "Asia/Kolkata" },
      attendees: e.attendees.map((email) => ({ email })),
      conferenceData: { createRequest: { requestId: `allin-${Date.now()}` } },
    }),
  });
}
