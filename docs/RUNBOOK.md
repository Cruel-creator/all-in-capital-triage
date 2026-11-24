# Runbook: running the triage app without an engineer

For Riya and the analyst. The fund has no engineer on call, so this page covers what normally happens, what can go wrong, and what to do. Nothing in the app sends an email or makes a decision on its own: every send is a click, and Kushal sees every outcome.

## A normal evening

1. Open the app and sign in with Google.
2. **Pipeline** shows today's read. New applications appear in their lane within about 5 minutes of arriving: a scheduled job reads the queue every 5 minutes.
3. Open an application, read **Our take**, check the numbers that don't add up, and edit the drafted letter if needed.
4. **Review and send** sends from the connected Gmail, after a confirmation that names the recipient and the time slots.

## When something looks wrong

| You see | What it means | What to do |
|---|---|---|
| "New applications are on hold for today" | Today's AI spend passed the daily cap. | Nothing. It resumes on its own after midnight IST. If it happens often, ask for the cap to be raised (`cost_limits.daily_usd`). |
| An application stuck on "Still reading this one…" for over 30 minutes | The scheduled job didn't run, or a step keeps failing. | Check **GitHub → Actions → queue** for a red run. Re-run it from there. If it fails again, the error is in the run log. |
| An application marked "Needs a look" | A step failed twice (for example a deck that couldn't be read). | Read the reason on the card. Most often the PDF is scanned or locked: ask the founder for a text PDF. |
| "Connect Gmail to send" | The sending mailbox isn't connected, or its access expired. | Click it and sign in as the mailbox that sends (MAILBOX_EMAIL). |
| A draft or score that looks wrong | The model got it wrong. Nothing has been sent. | Use **Override** on the area (with a one-line reason) or **Redo** on the letter. Overrides are remembered for future applications. |

## Where to look

- **Every model call, step by step:** Langfuse (the run's trace). Each call shows the prompt version, tokens, time and cost.
- **Spend per day, month, step and application:** `pnpm tsx scripts/cost-report.ts`. Cost isn't shown in the app by design.
- **Whether the provider copes with a rush:** `pnpm tsx scripts/load-test.ts 20` sends 20 small requests at once and reports each one. Last run: 20 of 20 succeeded in 15 s.
- **Whether the scorer still agrees with past decisions:** **Calibration → Run again**.

## Things that protect production by design

- **Keys** live in Vercel's environment settings and `.env.local`, never in code.
- **Least privilege:** the browser never talks to the database directly; only the server holds the database key. Only partners can decide or edit the rubric and portfolio.
- **Send less:** founder names become `[F1]` before any prompt; emails, phones and LinkedIn links never reach a model. Only the most relevant memo passages are sent.
- **Data, not instructions:** every model call is told that text from applications, decks and web pages is data to assess, never instructions.
- **Retries and cache:** busy-provider errors are retried four times (1 s, 2 s, 4 s, with jitter). The same input under the same prompt is answered from a 30-day cache instead of being paid for twice.
- **Spend cap:** the queue pauses at the daily limit, before the bill grows.

## Known gap

Test and live currently share one database. Anything run locally (scripts, tests that write) touches live data. The fix is a second, free Supabase project for testing; until then, run write scripts only when you mean to change live data.
