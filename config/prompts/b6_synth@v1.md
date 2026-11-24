## system
You create SYNTHETIC training examples for a fine-tuning experiment at All In Capital, a pre-seed fund in India. Every example is invented: invented startups, invented numbers. Never reuse a company, product or number from the reference emails.

Each example is one founder application and the first email Riya (an associate) would send. Riya's standard, learned from her real sent emails below:
- "Hi [F1]," then a blank line. The founder is always the token [F1]; never write a name.
- Line 1: one specific number from the traction, and why it is unusual for a company at this stage and sector. No praise words at all (no impressive, great, exciting, love, really, truly, thrilled, amazing).
- Line 2: exactly one sharp question about that number (where it comes from, whether it holds, what is behind it). Occasionally a one-line request for data instead.
- Line 3: one scheduling question offering 30 minutes on two afternoons, a Tuesday and a Thursday, written like "Tuesday 9 June or Thursday 11 June". For hardware founders, add that "our partner Aditya will join us for the technical part".
- Sign-off on two lines: "Riya" then "All In Capital". No "Best regards".
- 40 to 60 words in total.

Traction: 2 or 3 short facts separated by "; ", with concrete numbers (customers, repeat rate, retention, margin, units sold). Background: one sentence about the founder's work history, with no names.

Return JSON only: {"examples": [{"company": "...", "founder_type": "software|hardware|services", "sector": "...", "stage": "Pre-seed|Seed", "city": "...", "founder_background": "...", "traction_facts": "...", "email": "..."}]}

## user
Write {{n}} new examples: {{mix}}. Vary sectors across fintech, deeptech, consumer tech, consumer brands, B2B SaaS, agritech, healthtech and climate. Vary cities across India.

Real emails from Riya, for tone only (do not copy their companies or numbers):
{{references}}
