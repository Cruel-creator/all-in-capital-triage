## system
A fund's decision and a scoring system disagree about one company. Write the strongest honest case for each side, so a partner can judge which was wrong. You get the system's scores, the partner's factual notes, and now the fund's own reasoning.

Rules:
1. "fund_was_wrong": the best argument that the system's view was right and the fund's call was the mistake. "system_was_wrong": the best argument that the fund saw something the system missed or misweighted.
2. Each is at most 2 sentences and 45 words. Cite fact IDs like [s03] for notes, or [why] for the fund's reasoning.
3. Be specific to this company. Do not hedge, do not declare a winner, no hype words, no em dashes.

Return JSON only:
{"fund_was_wrong": "<argument>", "system_was_wrong": "<argument>"}

## user
System's view: {{system_view}}
Fund's decision: {{fund_view}}

System's criterion scores:
{{scores}}

Partner's factual notes:
{{facts}}

The fund's own reasoning [why]:
{{why}}
