# All In Capital · Inbound triage

An inbound-application triage tool for an early-stage fund. It reads each application's deck and form, checks the numbers, researches the company and founders on the web, runs four gates, scores six criteria against the fund's rubric with a citation for every claim, and drafts the founder email. People decide: nothing is sent without a click, and nothing is decided without a partner.

> The seed applications, founders, deal memos and portfolio in `seed/` are fictional test data.

## What it does

- **Every claim has a source.** Claims link to the PDF page (quote of 25 words or fewer) or the web page they came from.
- **Gaps are named, not filled.** Missing evidence scores low and the app shows the searches that were tried.
- **Arithmetic is done in code.** TAM, MRR, payback and deck-vs-form checks are deterministic (`src/lib/reconcile`).
- **Minimum data to the model.** The model sees founder IDs like `[F1]`, never names, emails or phones (`docs/PII-AUDIT.md`).
- **Corrections are remembered.** A partner's override, with its one-line reason, is shown to the scorer on similar companies.
- **Calibration.** A blind backtest on the fund's 12 deal memos (`/calibration`).
- **Outreach.** Gmail send, reply reading, follow-ups and Calendar booking, each prepared for a human click.
- **Operations.** A queue with retries, a daily cost limit that pauses it, a cost page and Langfuse traces.

## Stack

Next.js 15 (App Router) · TypeScript · Tailwind 4 · Supabase (Postgres, pgvector, pgmq) · OpenRouter (Gemini primary, Claude fallback), through Portkey locally or directly in production · Langfuse · Firecrawl · Google OAuth (Gmail, Calendar).

## Run locally

```bash
pnpm install
cp .env.example .env.local   # fill in the keys
pnpm seed                    # load the seed applications, memos and portfolio
pnpm dev                     # http://localhost:3000
pnpm worker                  # process queued applications
```

Useful scripts: `pnpm enqueue --all` (queue the seed applications), `pnpm backtest` (calibration), `pnpm test`, `pnpm typecheck`, `pnpm check:keys`.

## Deploy (Vercel)

1. Import the repo in Vercel and paste the variables from `.env.example` (production values: `APP_URL`, `SESSION_SECRET`, `ALLOWED_EMAILS`, `PARTNER_EMAILS`, `MAILBOX_EMAIL`, `CRON_SECRET`, `LLM_ROUTER=openrouter`, plus the service keys).
2. In Google Cloud, add `<APP_URL>/api/google/callback` as an authorised redirect URI.
3. In GitHub, add repository secrets `APP_URL` and `CRON_SECRET`: `.github/workflows/queue.yml` then processes the queue every 5 minutes.

In production every page needs a team Google sign-in (`src/middleware.ts`).

## Docs

- `docs/reviews/REVIEWS.md`: logic, security and UI review, and what was fixed
- `docs/PII-AUDIT.md`: where founder data goes
- `docs/ACCESSIBILITY.md` and `docs/POLISH.md`: WCAG 2.1 AA audit and interface polish
- `docs/screenshots/`: desktop and mobile, light and dark
- `docs/RUNBOOK.md`: running it without an engineer (what to do when something looks wrong)
- `docs/fine-tuning/`: the B6 fine-tuning case for Riya's first email (Brief, dataset, sealed-test results, payback)
