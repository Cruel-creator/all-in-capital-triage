# Code review: logic, security, UI (after Phase 4)

Three independent reviewers read the code without seeing each other's notes: logic and correctness, security and privacy, and a six-pillar UI audit (full report in `UI-REVIEW.md`, scored 15/24). External AI CLIs (Codex) were not used, because they would send the private code, and could read `.env.local`, off this machine.

## Fixed

| Finding | Fix |
|---|---|
| Any Google account could sign in and become the sending mailbox | Team allowlist (`ALLOWED_EMAILS` + `PARTNER_EMAILS` + `MAILBOX_EMAIL`), verified email required, fixed sending mailbox via `MAILBOX_EMAIL`; empty lists fail closed in production |
| Partner checks open when `PARTNER_EMAILS` is blank | Open only locally; closed in production |
| Pages and API routes readable by anyone once deployed | `middleware.ts` sign-in gate in production (or `REQUIRE_SIGNIN=1`), `/signin` page |
| Draft actions (generate, redo, edit, restore) had no sign-in check; could edit sent drafts or another application's draft | Sign-in required; sent drafts and mismatched applications refused |
| Session secret fell back to the DB key or "dev-only" | `SESSION_SECRET` required (32+ chars), generated locally |
| Cookies not `secure` behind a proxy; sign-out was a GET; raw errors in redirects | `secure` in production, POST sign-out, short error codes, redirects from `APP_URL` |
| Double click could send an email twice; a failure after sending left it unrecorded | Draft is claimed before sending and released only if nothing went out; post-send writes never throw |
| Approvals could run twice; a failed confirmation after booking left the thread stuck | Pending action claimed first; booking stores the event id first so retries never double-book |
| Client-supplied slots not re-checked against Tue/Thu afternoons | Must match a real candidate slot and be free |
| Research finding IDs (r01…) could differ between scorer and UI | Same order (`retrieved_at`, `id`) in both |
| Empty sector counted as in-thesis | Treated as stretch |
| Zero weights could make subtotals NaN and break re-ranking | Guard in maths; Settings requires a weight in each group |
| Backtest accepted duplicate criteria | Must return C1-C6 exactly once |
| Reply reader read "friend", "month", "first week" as slot picks | Real day names only; "first/second" must refer to a slot |
| Scraper accepted any URL scheme or private address | Public http(s) only |
| Correction reasons could carry emails or phones into prompts | Redacted at write time |
| Portfolio edits and backtest runs open to any signed-in user | Partners only |
| No security headers | Frame, sniffing, referrer, permissions, HSTS in production |
| Raw DB errors from `/api/source` and the backtest | Generic messages; details logged on the server |

Tests added for each pure fix (114 passing).

## Needs a decision or larger change

- **Transactions:** score, rank and gate writes delete then insert, and rubric/rules versioning deactivates then inserts. A crash in between leaves gaps. Move each into one database function (RPC).
- **G1 with an unreadable amount** passes silently; it should name the gap.
- **"To" address** is free text (the seed founders have no email). Once real founder emails exist, restrict sends to the address on file.
- **Refresh tokens** are stored in plain text, protected by RLS with no policies. Consider Supabase Vault.
- **Supabase dashboard:** confirm email sign-ups are off.
- **No rate limiting** on actions.

## UI (for the UI rebuild)

Blockers: no navigation on phones; `/` and j/k don't work on the Board view; the command palette lists no screens. Then: one primary button per view, accent colour on neutral ratings, off-scale radii, developer text in the UI. Design calls for the owner: keep or drop BlurText/spotlight (DESIGN.md says no glows), Board vs table as the default, compact lane tiles.
