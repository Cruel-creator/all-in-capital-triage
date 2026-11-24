# B6 · Fine-tuning case: Riya's first email

**Decision: don't fine-tune. A rewritten prompt with Riya's own emails as examples meets the pass mark on the sealed test (90% sent as-is, against 35% today) for about ₹10 a month. A fine-tuned model could add at most ~5 minutes of Riya's time a month, and it has no affordable, compliant place to run.** Stopping is the result the numbers support.

## Step 1 · Which step to fine-tune

Ten-plus rows from each export, compared with Riya's final version (all 40 and all 60 were read):

| | Loop 1: screening call | Loop 2: first email |
|---|---|---|
| How often Riya changes it | 12 of 40 calls overturned (agreement 70%) | 35 of 60 drafts rewritten (58%) |
| What changes | Judgement on a moving thesis: a missing number should count against, pedigree over evidence, portfolio overlap, owning credit risk, "founder got defensive" on a call | The same edit every time: praise removed (29 praise words in drafts, 0 in her emails), opens with one traction number, one sharp question about it, two concrete Tue/Thu slots, "Riya / All In Capital" |
| Fit for fine-tuning | Poor. The reasons change as the thesis moves (training would freeze last year's view), and several depend on facts outside the application. The build handles these with the revealed-thesis rules, the conflict gate and remembered corrections. | Good on paper. One consistent house style, many examples, and Riya never writes a reason (so retrieval of reasons can't teach it). |

**Picked: Loop 2, the first email.** Hardware is the weakest slice: 0 of 4 hardware drafts were sent unchanged.

## Step 2 · The Brief

| Line | Answer |
|---|---|
| 1. Task | Draft Riya's first email to a founder worth a call, from the application's traction and background, so she can send it unchanged. |
| 2. Pass mark | At least 80% of drafts on the sealed test that Riya would send as-is: every check passes (no praise, opens with a fact from their traction, one business question or request, two concrete slots, at most 65 words, correct sign-off) and a judge that sees her real email says she'd send it. That cuts her rewrites from 58% to at most 20%. |
| 3. Baseline today | 35% (7 of 20 on the sealed test, exactly what Riya did with those drafts). The current build's prompt scores 0 of 20: too long, and it asks two things. |
| 4. Route | If trained: Unsloth LoRA on the RTX 2060 here (data stays on this machine), or a free Colab T4 with synthetic rows only (Colab is Google's infrastructure; founders were promised their decks stay inside). **Where it would live is the blocker:** the fund has no cloud account and no engineer, and a self-hosted model must answer between 7 and 9 pm while Riya waits. |
| 5. Base model | Qwen2.5-1.5B-Instruct, 4-bit with LoRA (fits 6 GB, trains in minutes on ~280 short rows). |
| 6. Data | 300 examples: **58 real** (the 60 exported emails minus 2 dirty rows that break Riya's own standard: a 136-word boilerplate email and a "Dear Ms… Kind regards" email) and **242 synthetic**, each labelled `"source": "synthetic"`, generated from training rows only and kept only if it passes the same checks as her real emails (140 more were rejected). Hardware is weighted up (63 synthetic). Founder names are masked as [F1] everywhere. |
| 7. Split | **20 real rows sealed** before any training or prompt work, stratified by founder type (16 software, 3 services, 1 hardware), SHA-256 `f3a91cca0749285f7be89963184adfc381331d272b1765d4c31f0e8a653bbc96`. The harness refuses to run if the file changes. Synthetic rows never appear in the test. 10% of training rows are held for validation during a run. |
| 8. Stop rule | Stop if a cheaper fix (prompt and examples, no training) reaches the pass mark on the sealed test, if a fine-tune doesn't beat the best prompt by 10 points, or if payback is longer than 12 months. **Triggered:** the prompt reached 90%. |
| 9. Payback | No. The most a perfect model could save over the prompt fix is ~5 minutes of Riya's time a month (about ₹85). Any compliant place to run it costs far more each month, plus retraining as her style and the thesis move. |

## Steps 3–5 · Results on the sealed test (20 real emails)

| Version | Sent as-is | Checks pass | Judge "would send" |
|---|---|---|---|
| A · Old system's draft (what Riya actually saw) | **7 / 20 (35%)** | 7 | 9 |
| B · Current build's prompt (email_draft@v1) | **0 / 20 (0%)** | 0 | 0 |
| C · New prompt (email_draft@v2) + Riya's 3 most similar past emails | **18 / 20 (90%)** | 20 | 18 |
| E · New prompt, no examples | **14 / 20 (70%)** | 20 | 14 |
| D · Fine-tuned model | not trained: the stop rule triggered on C | | |

- **The judge is calibrated.** On version A, where Riya's real choices are known, it agreed with her on 18 of 20.
- **The checks are calibrated.** All 58 of Riya's clean emails pass them. The first version failed 6 of her emails (spelled-out numbers like "every nine days", a request instead of a question), so the checks were fixed before sealing.
- **Both misses on C are the same mistake:** opening with a volume number (₹ processed, retailers onboarded) when a stronger repeat number was available. That's a hypothesis for the next prompt version, to be checked on new emails. Tuning the prompt against the sealed test would invalidate it.
- **Examples are worth 20 points** (C against E), so production needs Riya's real sent emails in its example store, not just in-app edits.
- **The production linter accepts every C and E draft** (20 of 20 each).

## Step 6 · Cost and break-even

Facts (Operating Facts sheet): about 17 emails sent a month; ~1 minute when a draft needs no change, ~4 when she rewrites. Riya's time is taken as ₹1,000 an hour (the L8 baseline: ₹50,000 for 50 hours of screening).

| | Riya's minutes a month on emails | AI cost a month |
|---|---|---|
| Today (58% rewritten) | 17 × (0.42 × 1 + 0.58 × 4) ≈ **47 min** | under ₹1,500 for both loops |
| Prompt fix, C (10% rewritten) | 17 × (0.9 × 1 + 0.1 × 4) ≈ **22 min** | about +₹10 (3 examples add ~700 tokens to ~100 drafts) |
| Perfect fine-tune (0% rewritten) | 17 × 1 = **17 min** | hosting plus retraining |

The fine-tune's ceiling over the prompt fix is ~5 minutes (about ₹85) a month. A provider-hosted fine-tune means uploading deck facts to a training provider, which the founder agreement rules out without consent. Self-hosting needs a GPU on call every evening and someone to run it, and the fund has neither. Even a one-off build of a day or two pays back over decades. **Stop.**

## What was spent

**₹41 ($0.48) in model calls**: 48 synthetic-data calls, 60 harness drafts, 80 judge calls, a 20-request load test. No GPU time was used.

## Files

- `seed/b6/out/dataset.jsonl`: all 300 rows, each with `source` (real/synthetic) and `split` (train / test (sealed)). Git-ignored: it holds deck facts shared in confidence.
- `seed/b6/out/train.chat.jsonl`: the 280 training rows in chat format for Unsloth. `test.prompts.jsonl` holds the 20 test inputs without answers.
- `seed/b6/out/eval.results.json`: every draft, check and judge reason per variant.
- `scripts/b6/`: `prepare.ts` (clean, mask, seal), `synth.ts` (labelled synthetic rows), `eval.ts` (the harness), `export-chat.ts`, `lint-check.ts`.
- `train_unsloth.py`: the training run, if the decision is ever revisited. Results come back as variant D in the harness.

Reproduce: `pnpm tsx scripts/b6/prepare.ts` → `synth.ts` → `eval.ts ABCE` (the Drive exports go in `seed/b6/`).
