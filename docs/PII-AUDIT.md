# PII minimisation audit (Phase 5)

Non-negotiable 5: minimum data to the model. The model sees a founder ID such as `[F1]`, never a name, email or phone. This audit traces every path founder data takes, from the code as it stands (checked by reading every `founders` query and every model call).

## Where founder data lives

- **`founders` table only.** Name, role, email, phone and LinkedIn URL are stored here, under RLS with no read policy for the public key.
- **Read with email or phone in exactly two places:**
  - `extract-claims.ts`, to build the redaction list;
  - `outreach.ts`, to address an email Riya clicked to send.
- **The detail page** reads one founder email only to pre-fill the "To" field.

## What reaches a model

| Path | What the model gets | Guard |
|---|---|---|
| Claim extraction, gates, scoring, email drafting | Deck/form text with founder names as `[F1]`, emails, phones and LinkedIn URLs removed | `redact()` before the prompt; the gateway's `assertNoPii` refuses any payload that still has an email, phone, LinkedIn URL or a known founder name |
| Research extraction | Page excerpts, redacted the same way; personal links stripped before the prompt | Same gateway check; a page that still leaks is skipped and logged, not sent |
| Embeddings (memos, portfolio, corrections) | Memo passages, portfolio one-liners, correction reasons | `embed()` runs the same check on every input |
| Correction reasons | The reason with the corrected company's founder names, and any email, phone or LinkedIn URL, removed at write time (`reason_for_model`) | Redacted before storage; the gateway check again at use |
| Calibration backtest | Memo facts with founder names replaced by "Founder A/B", the company name, outcome and "why" section removed | `redactPeople()`; the gateway check catches emails and phones but not memo names it doesn't know, so redaction relies on the memo's founder sentence (tested) |
| Founder replies to emails | Nothing. Replies are read by deterministic code (`reply.ts`) | No model call exists on this path |

## What leaves the machine besides the model

- **Langfuse** receives the same redacted prompts and outputs as the model, never more.
- **`llm_calls`** stores tokens, cost, latency and a SHA-256 hash of each prompt, not the prompt.
- **Firecrawl** receives web search queries that include founder names (for the founder dossier). This is the one place a name leaves the system, and it goes to a search engine, not a model. Set-aside results about other people keep only a URL, a title and a generic reason.
- **Gmail and Calendar** receive the founder's email address when Riya sends or books, which is the purpose of those actions.

## Logs and errors

Server logs print application IDs, never founder fields. API errors returned to the browser are generic. Raw errors are logged on the server only.

## Residual risks

1. Names of people other than the applicant's founders (for example, a person named on a scraped page) are not in the redaction list, so they can reach the model inside research excerpts.
2. Phone detection matches Indian formats; international numbers in a deck would pass the guard.
3. Calibration redaction depends on the memo naming its founders in the first sentence of "Founder assessment", which holds for all 12 memos today.
