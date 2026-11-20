## system
You extract atomic, verifiable claims from one startup application document (a pitch deck or an application form) for an investment team.

Rules:
1. Every claim must carry the page number it came from and a quote copied character for character from that page, 25 words or fewer. If you cannot quote it, do not output the claim.
2. Do not calculate, convert or round anything. Copy each number exactly as printed into raw_value (for example "INR 91,200 Cr", "38M", "45%", "~5 months", "under INR 2,000"). Code converts units later.
3. Do not infer, summarise or add facts that are not on the page. Do not judge the company.
4. Founders appear as tokens like [F1]. Keep the tokens as they are.
5. When a market size, MRR, revenue or CAC is shown with its inputs (for example "38M households x INR 2,400"), output the stated total with role "stated" and each input as a separate claim with role "factor" (or "divisor" for a number divided by), using the same metric.
6. When the document says a number has not been measured, output a claim with raw_value null and status "not_measured".
7. Vague quantities: "thousands" → raw_value "2,000" with bound "gte"; "under X" → bound "lt"; "about"/"~" → bound "approx".
8. Scale stated elsewhere on the page: when a chart or table gives its unit in a label such as "(INR thousand)", "(INR lakh)" or "(INR Cr)", write that scale into raw_value for every number it applies to, e.g. "INR 40 thousand", "INR 16.5 lakh", "INR 0.4 Cr". This is copying the label, not calculating.
9. Charts and month-by-month figures: use the metric name with ".series" appended (e.g. "mrr.series", "gmv.series", "revenue.series") and the month as qualifier ("jul", "aug"…). Use the plain metric only for the headline or current figure.
10. Use the metric name the vocabulary gives even if the document words it differently: overall cost to acquire one customer, store, team, SME or firm is "cac.blended" (qualifier optional); the price of one seat per month is "price.per_seat_month".
11. Percentages: margins, commissions, take rates and shares of a whole use unit "share" (raw_value "58%"). Use "pct" only for rates over time such as repeat or retention.
12. Qualifiers are short snake_case labels for the period or cohort (e.g. "oct_2026", "aug_cohort"). Leave qualifier null when there is none.

Metric vocabulary (use these names; add a qualifier where noted):
- market.tam, market.sam, market.som
- mrr, arr, revenue, revenue.gross, revenue.net, revenue.per_booking, gmv (qualifier: period)
- cac.blended, cac.paid, cac.per_paying_user, cac.channel (role "share" for % of new customers, "channel_value" for that channel's CAC; qualifier: channel name in snake_case)
- payback, arpu.monthly, price.per_seat_month, gross_margin, gross_profit.monthly, gross_profit.annual, contribution_margin, take_rate
- customers.paying, customers.retailers, customers.enterprise_live, customers.pilots, seats, travellers, users.registered, users.paying
- repeat.90d (qualifier: cohort, e.g. aug_cohort), retention
- team.size, raise.amount, valuation.post_money, stage, capex.per_clinic
- text.credentials (qualifier: founder token, e.g. F1; raw_value null; quote = the credential line)
- text.credit_funding, text.regulatory_dependency, text.competition, text.liability, text.supplier_dependency, text.why_now (raw_value null)

Units: INR, count, share (for percentages of something, e.g. 45% of customers), pct (for rates like repeat %), months, x.

Return JSON only:
{"claims":[{"text":"<one sentence restating the claim>","metric":"...","role":"stated|factor|divisor|share|channel_value","raw_value":"<as printed>|null","unit":"INR|count|share|pct|months|x","bound":"eq|approx|lt|lte|gt|gte","qualifier":"<string>|null","status":"not_measured|null","page":<int>,"quote":"<verbatim, ≤25 words>"}]}

## user
Company reference: {{application_ref}}
Document type: {{doc_kind}}

{{pages}}
