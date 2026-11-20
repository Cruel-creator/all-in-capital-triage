// Golden fixtures (build prompt section 10). Every claim cites the page and a verbatim quote (≤25 words)
// from seed/text/<file>.json. tests/golden/sources.test.ts proves each quote is really on that page.
// These are the claims the extractor must produce; the pipeline-level goldens (Phase 2) assert the same flags
// against what extraction actually returned.
import type { Bound, ReconCheck, ReconClaim, Role, Severity, Unit } from "../../src/lib/reconcile/types";

export type Src = { file: string; page: number; quote: string };
export type FixtureClaim = ReconClaim & { src: Src };

export type Expected = {
  flags: { check: ReconCheck; metric: string; severity?: Severity[]; computed?: number }[];
  /** no warn/red flags at all */
  clean?: boolean;
  derived?: { metric: string; value: number; tolerance: number }[];
  credentials?: { deck: Src & { text?: string }; form: Src & { text: string }; mustFlag: string[] } | null;
};

export type AppFixture = { app: string; claims: FixtureClaim[]; expected: Expected };

const mk =
  (app: string) =>
  (
    n: number,
    metric: string,
    role: Role,
    value: number | null,
    unit: Unit,
    origin: "deck" | "form",
    src: [string, number, string],
    extra: { bound?: Bound; qualifier?: string; status?: "not_measured" } = {},
  ): FixtureClaim => ({
    id: `${app}-${String(n).padStart(2, "0")}`,
    metric,
    role,
    value,
    unit,
    origin,
    ...extra,
    src: { file: src[0], page: src[1], quote: src[2] },
  });

const RED: Severity[] = ["red"];
const WARN_OR_RED: Severity[] = ["warn", "red"];

// ---------------- GrainKind ----------------
const gk = mk("GK");
const GKD = "GrainKind_Deck.pdf";
const GKF = "GrainKind_Form.pdf";
const grainkind: AppFixture = {
  app: "GrainKind",
  claims: [
    gk(1, "market.tam", "stated", 91_200e7, "INR", "deck", [GKD, 6, "TAM INR 91,200 Cr 38M urban households"]),
    gk(2, "market.tam", "factor", 38e6, "count", "deck", [GKD, 6, "TAM INR 91,200 Cr 38M urban households"]),
    gk(3, "market.tam", "factor", 2_400, "INR", "deck", [GKD, 6, "snacks x INR 2,400 a year"]),
    gk(4, "market.sam", "stated", 14_400e7, "INR", "deck", [GKD, 6, "SAM INR 14,400 Cr 6M households in 8 metros"]),
    gk(5, "market.sam", "factor", 6e6, "count", "deck", [GKD, 6, "SAM INR 14,400 Cr 6M households in 8 metros"]),
    gk(6, "market.sam", "factor", 2_400, "INR", "deck", [GKD, 6, "quick commerce x INR 2,400"]),
    gk(7, "market.som", "stated", 28.8e7, "INR", "deck", [GKD, 6, "SOM INR 28.8 Cr In 3 years: 1.5% of SAM households (90,000) x INR 3,200 a year"]),
    gk(8, "market.som", "factor", 90_000, "count", "deck", [GKD, 6, "SOM INR 28.8 Cr In 3 years: 1.5% of SAM households (90,000) x INR 3,200 a year"]),
    gk(9, "market.som", "factor", 3_200, "INR", "deck", [GKD, 6, "SOM INR 28.8 Cr In 3 years: 1.5% of SAM households (90,000) x INR 3,200 a year"]),
    gk(10, "cac.blended", "stated", 340, "INR", "deck", [GKD, 7, "INR 340 blended CAC"]),
    gk(11, "cac.blended", "stated", 340, "INR", "form", [GKF, 1, "Blended CAC INR 340."]),
    gk(12, "cac.channel", "share", 0.45, "share", "deck", [GKD, 7, "Paid social 45% of new customers"], { qualifier: "paid_social" }),
    gk(13, "cac.channel", "share", 0.2, "share", "deck", [GKD, 7, "Nutritionist referrals 20% of new customers"], { qualifier: "nutritionists" }),
    gk(14, "cac.channel", "share", 0.25, "share", "deck", [GKD, 7, "Quick commerce 25% of new customers"], { qualifier: "quick_commerce" }),
    gk(15, "cac.channel", "share", 0.1, "share", "deck", [GKD, 7, "Gyms and sampling 10% of new customers"], { qualifier: "sampling" }),
    ...(
      [
        [16, "paid_social", 410],
        [17, "nutritionists", 210],
        [18, "quick_commerce", 290],
        [19, "sampling", 380],
      ] as const
    ).map(([n, q, v]) =>
      gk(n, "cac.channel", "channel_value", v, "INR", "deck",
        [GKD, 7, "CAC by channel: paid social INR 410, nutritionists INR 210, quick commerce INR 290 after promos, sampling INR 380."],
        { qualifier: q }),
    ),
    gk(20, "repeat.90d", "stated", 38, "pct", "deck", [GKD, 4, "38% 90-day repeat, August cohort"], { qualifier: "aug_cohort" }),
    gk(21, "repeat.90d", "stated", 38, "pct", "form", [GKF, 1, "and 38% (August)"], { qualifier: "aug_cohort" }),
    gk(22, "raise.amount", "stated", 2.5e7, "INR", "deck", [GKD, 10, "The ask: INR 2.5 Cr"]),
    gk(23, "raise.amount", "stated", 2.5e7, "INR", "form", [GKF, 2, "Amount raising INR 2.5 Cr"]),
  ],
  expected: {
    flags: [
      { check: "tam", metric: "market.tam", severity: RED, computed: 9_120e7 },
      { check: "sam", metric: "market.sam", severity: RED, computed: 1_440e7 },
    ],
    derived: [{ metric: "cac.blended.computed", value: 337, tolerance: 0.5 }],
  },
};

// ---------------- Talkbook ----------------
const tb = mk("TB");
const TBD = "Talkbook_Deck.pdf";
const TBF = "Talkbook_Form.pdf";
const talkbook: AppFixture = {
  app: "Talkbook",
  claims: [
    tb(1, "mrr", "stated", 2.1e5, "INR", "deck", [TBD, 5, "INR 2.1 L monthly recurring revenue"]),
    tb(2, "mrr", "stated", 1.9e5, "INR", "form", [TBF, 1, "MRR INR 1.9 L (INR 500 per seat per month)"]),
    tb(3, "mrr", "factor", 340, "count", "form", [TBF, 1, "16 paying teams, 340 paid seats"]),
    tb(4, "mrr", "factor", 500, "INR", "form", [TBF, 1, "MRR INR 1.9 L (INR 500 per seat per month)"]),
    tb(5, "seats", "stated", 340, "count", "deck", [TBD, 5, "340 paid seats"]),
    tb(6, "seats", "stated", 340, "count", "form", [TBF, 1, "16 paying teams, 340 paid seats"]),
    tb(7, "cac.blended", "stated", 48_000, "INR", "deck", [TBD, 7, "INR 48,000 CAC per team"]),
    tb(8, "payback", "stated", 5, "months", "deck", [TBD, 7, "~5 months payback"], { bound: "approx" }),
    tb(9, "arpu.monthly", "stated", 13_000, "INR", "deck", [TBD, 7, "Average team pays INR 13,000 a month."]),
    tb(10, "gross_margin", "stated", 0.7, "share", "deck", [TBD, 7, "70% gross margin"]),
    tb(11, "market.tam", "stated", 4_200e7, "INR", "deck", [TBD, 6, "TAM INR 4,200 Cr 7M sales reps in India x INR 6,000 per seat a year"]),
    tb(12, "market.tam", "factor", 7e6, "count", "deck", [TBD, 6, "TAM INR 4,200 Cr 7M sales reps in India x INR 6,000 per seat a year"]),
    tb(13, "market.tam", "factor", 6_000, "INR", "deck", [TBD, 6, "TAM INR 4,200 Cr 7M sales reps in India x INR 6,000 per seat a year"]),
  ],
  expected: {
    flags: [
      { check: "deck_vs_form", metric: "mrr", severity: WARN_OR_RED },
      { check: "mrr", metric: "mrr", computed: 1.7e5 },
    ],
  },
};

// ---------------- Settlr ----------------
const st = mk("ST");
const STD = "Settlr_Deck.pdf";
const STF = "Settlr_Form.pdf";
const settlr: AppFixture = {
  app: "Settlr",
  claims: [
    st(1, "cac.blended", "stated", 14_500, "INR", "deck", [STD, 6, "INR 14,500 CAC per SME"]),
    st(2, "payback", "stated", 7, "months", "deck", [STD, 6, "7 months payback"]),
    st(3, "payback", "stated", 7, "months", "form", [STF, 1, "CAC INR 14,500 per SME, payback 7 months"]),
    st(4, "arpu.monthly", "stated", 6_800, "INR", "deck", [STD, 6, "Average SME pays INR 6,800 a month in fees and financing charges."]),
    st(5, "gross_margin", "stated", 0.58, "share", "deck", [STD, 6, "Gross margin 58%."]),
    st(6, "market.tam", "stated", 9.4e12, "INR", "deck", [STD, 5, "TAM INR 9.4 lakh Cr 2.1M B2B-trading SMEs x INR 4.5 Cr annual B2B payments"]),
    st(7, "market.tam", "factor", 2.1e6, "count", "deck", [STD, 5, "TAM INR 9.4 lakh Cr 2.1M B2B-trading SMEs x INR 4.5 Cr annual B2B payments"]),
    st(8, "market.tam", "factor", 4.5e7, "INR", "deck", [STD, 5, "TAM INR 9.4 lakh Cr 2.1M B2B-trading SMEs x INR 4.5 Cr annual B2B payments"]),
    st(9, "market.sam", "stated", 1.8e12, "INR", "deck", [STD, 5, "SAM INR 1.8 lakh Cr 400K SMEs in 6 metros x INR 4.5 Cr"]),
    st(10, "market.sam", "factor", 4e5, "count", "deck", [STD, 5, "SAM INR 1.8 lakh Cr 400K SMEs in 6 metros x INR 4.5 Cr"]),
    st(11, "market.sam", "factor", 4.5e7, "INR", "deck", [STD, 5, "SAM INR 1.8 lakh Cr 400K SMEs in 6 metros x INR 4.5 Cr"]),
    st(12, "market.som", "stated", 6_750e7, "INR", "deck", [STD, 5, "SOM INR 6,750 Cr In 3 years: 15,000 SMEs x INR 4.5 Cr"]),
    st(13, "market.som", "factor", 15_000, "count", "deck", [STD, 5, "SOM INR 6,750 Cr In 3 years: 15,000 SMEs x INR 4.5 Cr"]),
    st(14, "market.som", "factor", 4.5e7, "INR", "deck", [STD, 5, "SOM INR 6,750 Cr In 3 years: 15,000 SMEs x INR 4.5 Cr"]),
  ],
  expected: {
    flags: [
      { check: "payback", metric: "payback", severity: RED },
      // found while verifying the seed data; not in the prompt's table. TAM, SAM and SOM are all 10x low:
      // 2.1M × ₹4.5 Cr = ₹94.5 lakh Cr (deck ₹9.4 lakh Cr) — caught by the live run, corrected here
      { check: "tam", metric: "market.tam", severity: RED, computed: 9.45e13 },
      { check: "sam", metric: "market.sam", severity: RED, computed: 1.8e13 },
      { check: "som", metric: "market.som", severity: RED, computed: 6.75e11 },
    ],
    derived: [{ metric: "payback.computed", value: 3.7, tolerance: 0.05 }],
  },
};

// ---------------- EarnWise ----------------
const ew = mk("EW");
const EWD = "EarnWise_Deck.pdf";
const EWF = "EarnWise_Form.pdf";
const earnwise: AppFixture = {
  app: "EarnWise",
  claims: [
    ew(1, "market.tam", "stated", 14_400e7, "INR", "deck", [EWD, 6, "TAM INR 14,400 Cr 10M gig and shift workers x INR 12,000 average monthly advance x 12"]),
    ew(2, "market.tam", "factor", 10e6, "count", "deck", [EWD, 6, "TAM INR 14,400 Cr 10M gig and shift workers x INR 12,000 average monthly advance x 12"]),
    ew(3, "market.tam", "factor", 12_000, "INR", "deck", [EWD, 6, "TAM INR 14,400 Cr 10M gig and shift workers x INR 12,000 average monthly advance x 12"]),
    ew(4, "market.tam", "factor", 12, "x", "deck", [EWD, 6, "TAM INR 14,400 Cr 10M gig and shift workers x INR 12,000 average monthly advance x 12"]),
    ew(5, "team.size", "stated", 12, "count", "deck", [EWD, 7, "Team of 12."]),
    ew(6, "team.size", "stated", 5, "count", "form", [EWF, 1, "Team size 5 (founder, 2 outsourced developers, 1 operations, 1 sales)"]),
    ew(7, "customers.enterprise_live", "stated", 3, "count", "deck", [EWD, 5, "3 enterprise clients live"]),
    ew(8, "customers.enterprise_live", "stated", 1, "count", "form", [EWF, 1, "1 enterprise client live and 2 in pilot."]),
  ],
  expected: {
    flags: [
      { check: "tam", metric: "market.tam", severity: RED, computed: 1.44e12 },
      { check: "deck_vs_form", metric: "team.size", severity: RED },
      // found while verifying the seed data; not in the prompt's table
      { check: "deck_vs_form", metric: "customers.enterprise_live", severity: RED },
    ],
    credentials: {
      deck: { file: EWD, page: 7, quote: "Ex-Goldman Sachs. Ex-Google. MBA, IIM Ahmedabad.", text: "Rohit Arora, Founder and CEO Ex-Goldman Sachs. Ex-Google. MBA, IIM Ahmedabad." },
      form: {
        file: EWF,
        page: 1,
        quote: "Summer analyst internship (10 weeks) at an investment bank. 5-month contract role through a vendor at a large technology company.",
        text: "Rohit Arora, Founder and CEO. Summer analyst internship (10 weeks) at an investment bank. 5-month contract role through a vendor at a large technology company. MBA at a tier-2 business school (2022 to 2024). 18 months at a payments startup.",
      },
      mustFlag: ["Goldman Sachs", "Google", "IIM Ahmedabad"],
    },
  },
};

// ---------------- StockSathi ----------------
const ss = mk("SS");
const SSD = "StockSathi_Deck.pdf";
const SSF = "StockSathi_Form.pdf";
const stocksathi: AppFixture = {
  app: "StockSathi",
  claims: [
    ss(1, "customers.retailers", "stated", 38, "count", "deck", [SSD, 5, "38 retailers onboarded"]),
    ss(2, "customers.retailers", "stated", 42, "count", "form", [SSF, 2, "42 retailers onboarded"]),
    ss(3, "cac.blended", "stated", 2_860, "INR", "deck", [SSD, 7, "INR 2,860 blended CAC, October"]),
    ss(4, "cac.blended", "stated", 2_000, "INR", "form", [SSF, 2, "Our CAC is under INR 2,000 per store."], { bound: "lt" }),
    ss(5, "cac.blended", "factor", 40_000, "INR", "deck", [SSD, 7, "CAC = INR 40,000 field cost / 14 stores"]),
    ss(6, "cac.blended", "divisor", 14, "count", "deck", [SSD, 7, "CAC = INR 40,000 field cost / 14 stores"]),
    ss(7, "gross_profit.monthly", "stated", 520, "INR", "deck", [SSD, 7, "INR 520 monthly margin per active store"]),
    ss(8, "payback", "stated", 5.5, "months", "deck", [SSD, 7, "~5.5 months payback on trade margin alone"], { bound: "approx" }),
    ss(9, "market.tam", "stated", 17e12, "INR", "deck", [SSD, 6, "TAM INR 17 lakh Cr 12M kirana stores x INR 1.2 L monthly purchases x 12"]),
    ss(10, "market.tam", "factor", 12e6, "count", "deck", [SSD, 6, "TAM INR 17 lakh Cr 12M kirana stores x INR 1.2 L monthly purchases x 12"]),
    ss(11, "market.tam", "factor", 1.2e5, "INR", "deck", [SSD, 6, "TAM INR 17 lakh Cr 12M kirana stores x INR 1.2 L monthly purchases x 12"]),
    ss(12, "market.tam", "factor", 12, "x", "deck", [SSD, 6, "TAM INR 17 lakh Cr 12M kirana stores x INR 1.2 L monthly purchases x 12"]),
    ss(13, "market.sam", "stated", 64_800e7, "INR", "deck", [SSD, 6, "SAM INR 64,800 Cr ~450K stores in Tier 3 to 5 towns of Telangana and AP x INR 1.2 L x 12"]),
    ss(14, "market.sam", "factor", 4.5e5, "count", "deck", [SSD, 6, "SAM INR 64,800 Cr ~450K stores in Tier 3 to 5 towns of Telangana and AP x INR 1.2 L x 12"]),
    ss(15, "market.sam", "factor", 1.2e5, "INR", "deck", [SSD, 6, "SAM INR 64,800 Cr ~450K stores in Tier 3 to 5 towns of Telangana and AP x INR 1.2 L x 12"]),
    ss(16, "market.sam", "factor", 12, "x", "deck", [SSD, 6, "SAM INR 64,800 Cr ~450K stores in Tier 3 to 5 towns of Telangana and AP x INR 1.2 L x 12"]),
    ss(17, "market.som", "stated", 518e7, "INR", "deck", [SSD, 6, "SOM INR 518 Cr In 3 years: 2% of SAM stores (9,000) x 40% of their purchases (INR 48K a month) x 12"], { bound: "approx" }),
    ss(18, "market.som", "factor", 9_000, "count", "deck", [SSD, 6, "SOM INR 518 Cr In 3 years: 2% of SAM stores (9,000) x 40% of their purchases (INR 48K a month) x 12"]),
    ss(19, "market.som", "factor", 48_000, "INR", "deck", [SSD, 6, "SOM INR 518 Cr In 3 years: 2% of SAM stores (9,000) x 40% of their purchases (INR 48K a month) x 12"]),
    ss(20, "market.som", "factor", 12, "x", "deck", [SSD, 6, "SOM INR 518 Cr In 3 years: 2% of SAM stores (9,000) x 40% of their purchases (INR 48K a month) x 12"]),
  ],
  expected: {
    flags: [
      { check: "deck_vs_form", metric: "customers.retailers", severity: WARN_OR_RED },
      { check: "deck_vs_form", metric: "cac.blended", severity: RED },
    ],
    derived: [{ metric: "cac.blended", value: 2_857, tolerance: 1 }],
  },
};

// ---------------- CAPilot ----------------
const cp = mk("CP");
const CPD = "CAPilot_Deck.pdf";
const CPF = "CAPilot_Form.pdf";
const capilot: AppFixture = {
  app: "CAPilot",
  claims: [
    cp(1, "customers.paying", "stated", 31, "count", "deck", [CPD, 4, "31 paying CA firms"]),
    cp(2, "customers.paying", "stated", 24, "count", "form", [CPF, 1, "Customers 24 paying CA firms, 7 on free trial."]),
    cp(3, "arr", "stated", 9.4e5, "INR", "deck", [CPD, 4, "INR 9.4 L annual recurring revenue"]),
    cp(4, "arr", "factor", 78_000, "INR", "form", [CPF, 1, "Revenue Monthly recurring revenue INR 78,000 (INR 9.4 L annualised)."]),
    cp(5, "arr", "factor", 12, "x", "form", [CPF, 1, "Revenue Monthly recurring revenue INR 78,000 (INR 9.4 L annualised)."]),
    cp(6, "cac.blended", "stated", null, "INR", "form", [CPF, 1, "We have not measured acquisition cost yet."], { status: "not_measured" }),
    cp(7, "market.tam", "stated", 1_400e7, "INR", "deck", [CPD, 5, "Even 1% of this market is a INR 1,400 Cr opportunity for CAPilot."]),
    cp(8, "market.tam", "factor", 1.4e12, "INR", "deck", [CPD, 5, "INR 1.4 lakh Cr Indian tax and compliance services market"]),
    cp(9, "market.tam", "factor", 0.01, "share", "deck", [CPD, 5, "Even 1% of this market is a INR 1,400 Cr opportunity for CAPilot."]),
  ],
  expected: {
    flags: [
      { check: "blended_cac", metric: "cac.blended", severity: ["warn"] },
      { check: "tam", metric: "market.tam", severity: ["info"] },
      // found while verifying the seed data; not in the prompt's table
      // 31 vs 24 is a 22.6% gap: warn by the 25% line; G4 decides integrity in Phase 2
      { check: "deck_vs_form", metric: "customers.paying", severity: WARN_OR_RED },
    ],
  },
};

// ---------------- Yatrika ----------------
const yt = mk("YT");
const YTD = "Yatrika_Deck.pdf";
const YTF = "Yatrika_Form.pdf";
const yatrika: AppFixture = {
  app: "Yatrika",
  claims: [
    yt(1, "travellers", "stated", 2_000, "count", "deck", [YTD, 3, "we have served thousands of travellers across Rajasthan and Uttarakhand"], { bound: "gte" }),
    yt(2, "travellers", "stated", 1_300, "count", "form", [YTF, 1, "410 bookings since launch, covering about 1,300 travellers."], { bound: "approx" }),
    yt(3, "revenue", "stated", 4.6e5, "INR", "form", [YTF, 1, "We earn a 12% commission, so revenue is INR 4.6 L."]),
    yt(4, "revenue", "factor", 38.6e5, "INR", "form", [YTF, 1, "Revenue Total booking value INR 38.6 L."]),
    yt(5, "revenue", "factor", 0.12, "share", "form", [YTF, 1, "We earn a 12% commission, so revenue is INR 4.6 L."]),
    yt(6, "revenue.per_booking", "factor", 4.6e5, "INR", "form", [YTF, 1, "We earn a 12% commission, so revenue is INR 4.6 L."]),
    yt(7, "revenue.per_booking", "divisor", 410, "count", "form", [YTF, 1, "410 bookings since launch, covering about 1,300 travellers."]),
    yt(8, "cac.paid", "stated", 640, "INR", "form", [YTF, 1, "Paid acquisition is about INR 640 per booking."], { bound: "approx" }),
    yt(9, "raise.amount", "stated", 1.2e7, "INR", "form", [YTF, 2, "Amount raising INR 1.2 Cr"]),
  ],
  expected: {
    flags: [
      { check: "deck_vs_form", metric: "travellers", severity: RED },
      { check: "deck_vs_form", metric: "raise.amount", severity: ["info"] },
    ],
    derived: [{ metric: "revenue.per_booking", value: 1_122, tolerance: 1 }],
  },
};

// ---------------- RentRoute ----------------
const rr = mk("RR");
const RRD = "RentRoute_Deck.pdf";
const RRF = "RentRoute_Form.pdf";
const rentroute: AppFixture = {
  app: "RentRoute",
  claims: [
    rr(1, "revenue.gross", "stated", 11e5, "INR", "form", [RRF, 1, "Users pay a 1.8% fee: INR 11 L gross."]),
    rr(2, "revenue.gross", "factor", 6.1e7, "INR", "form", [RRF, 1, "Rent volume INR 6.1 Cr paid since July 2026 across 2,400 payments."]),
    rr(3, "revenue.gross", "factor", 0.018, "share", "form", [RRF, 1, "Users pay a 1.8% fee: INR 11 L gross."]),
    rr(4, "revenue.net", "stated", 5.5e5, "INR", "form", [RRF, 1, "After the 0.9% we pay the payment partner, net revenue is INR 5.5 L."]),
    rr(5, "revenue.net", "factor", 6.1e7, "INR", "form", [RRF, 1, "Rent volume INR 6.1 Cr paid since July 2026 across 2,400 payments."]),
    rr(6, "revenue.net", "factor", 0.009, "share", "form", [RRF, 1, "After the 0.9% we pay the payment partner, net revenue is INR 5.5 L."]),
    rr(7, "cac.per_paying_user", "stated", null, "INR", "form", [RRF, 1, "We have not measured cost per paying user."], { status: "not_measured" }),
    rr(8, "market.tam", "stated", 1_500e7, "INR", "deck", [RRD, 5, "Capturing just 1% would mean INR 1,500 Cr of annual rent volume."]),
    rr(9, "market.tam", "factor", 1.5e12, "INR", "deck", [RRD, 5, "INR 1.5 lakh Cr annual urban rent paid in India"]),
    rr(10, "market.tam", "factor", 0.01, "share", "deck", [RRD, 5, "Capturing just 1% would mean INR 1,500 Cr of annual rent volume."]),
  ],
  expected: {
    flags: [
      { check: "blended_cac", metric: "cac.per_paying_user", severity: ["warn"] },
      { check: "tam", metric: "market.tam", severity: ["info"] },
    ],
  },
};

// ---------------- Pumpwise ----------------
const pw = mk("PW");
const PWD = "Pumpwise_Deck.pdf";
const PWF = "Pumpwise_Form.pdf";
const pumpwise: AppFixture = {
  app: "Pumpwise",
  claims: [
    pw(1, "cac.blended", "stated", 73_000, "INR", "deck", [PWD, 7, "INR 73,000 cost per paid customer"]),
    pw(2, "cac.blended", "stated", 73_000, "INR", "form", [PWF, 1, "Cost per paid customer is about INR 73,000"], { bound: "approx" }),
    pw(3, "cac.blended", "factor", 4.4e5, "INR", "deck", [PWD, 7, "CAC = cost of 11 pilots (INR 4.4 L) / 6 paid customers."]),
    pw(4, "cac.blended", "divisor", 6, "count", "deck", [PWD, 7, "CAC = cost of 11 pilots (INR 4.4 L) / 6 paid customers."]),
    pw(5, "gross_profit.annual", "stated", 3.1e5, "INR", "deck", [PWD, 8, "Average customer: 23 sensors and INR 3.1 L first-year gross profit."]),
    pw(6, "payback", "stated", 4, "months", "deck", [PWD, 7, "< 4 months payback on first-year gross profit"], { bound: "lt" }),
    pw(7, "mrr", "stated", 1.05e5, "INR", "deck", [PWD, 5, "140 sensors live INR 1.05 L monthly recurring"]),
    pw(8, "mrr", "factor", 140, "count", "deck", [PWD, 5, "140 sensors live INR 1.05 L monthly recurring"]),
    pw(9, "mrr", "factor", 750, "INR", "deck", [PWD, 8, "INR 750 per sensor a month at about 85% gross margin."]),
    pw(10, "market.tam", "stated", 16_200e7, "INR", "deck", [PWD, 6, "TAM INR 16,200 Cr ~300K manufacturing MSMEs with 20+ motors x 60 sensors x INR 9,000 a year"]),
    pw(11, "market.tam", "factor", 3e5, "count", "deck", [PWD, 6, "TAM INR 16,200 Cr ~300K manufacturing MSMEs with 20+ motors x 60 sensors x INR 9,000 a year"]),
    pw(12, "market.tam", "factor", 60, "count", "deck", [PWD, 6, "TAM INR 16,200 Cr ~300K manufacturing MSMEs with 20+ motors x 60 sensors x INR 9,000 a year"]),
    pw(13, "market.tam", "factor", 9_000, "INR", "deck", [PWD, 6, "TAM INR 16,200 Cr ~300K manufacturing MSMEs with 20+ motors x 60 sensors x INR 9,000 a year"]),
    pw(14, "market.sam", "stated", 4_536e7, "INR", "deck", [PWD, 6, "SAM INR 4,536 Cr ~84K firms in Maharashtra, Tamil Nadu and Gujarat clusters x 60 x INR 9,000"]),
    pw(15, "market.sam", "factor", 84_000, "count", "deck", [PWD, 6, "SAM INR 4,536 Cr ~84K firms in Maharashtra, Tamil Nadu and Gujarat clusters x 60 x INR 9,000"]),
    pw(16, "market.sam", "factor", 60, "count", "deck", [PWD, 6, "SAM INR 4,536 Cr ~84K firms in Maharashtra, Tamil Nadu and Gujarat clusters x 60 x INR 9,000"]),
    pw(17, "market.sam", "factor", 9_000, "INR", "deck", [PWD, 6, "SAM INR 4,536 Cr ~84K firms in Maharashtra, Tamil Nadu and Gujarat clusters x 60 x INR 9,000"]),
    pw(18, "market.som", "stated", 21.6e7, "INR", "deck", [PWD, 6, "SOM INR 21.6 Cr In 3 years: 400 customers x 60 sensors x INR 9,000"]),
    pw(19, "market.som", "factor", 400, "count", "deck", [PWD, 6, "SOM INR 21.6 Cr In 3 years: 400 customers x 60 sensors x INR 9,000"]),
    pw(20, "market.som", "factor", 60, "count", "deck", [PWD, 6, "SOM INR 21.6 Cr In 3 years: 400 customers x 60 sensors x INR 9,000"]),
    pw(21, "market.som", "factor", 9_000, "INR", "deck", [PWD, 6, "SOM INR 21.6 Cr In 3 years: 400 customers x 60 sensors x INR 9,000"]),
  ],
  expected: {
    flags: [],
    clean: true,
    derived: [{ metric: "payback.computed", value: 2.83, tolerance: 0.01 }],
    credentials: {
      deck: { file: PWD, page: 10, quote: "Karthik Subramanian, CEO IIT Madras, mechanical.", text: "Karthik Subramanian, CEO IIT Madras, mechanical. 5 years as a reliability engineer at an engine maker." },
      form: {
        file: PWF,
        page: 1,
        quote: "Karthik Subramanian, CEO. IIT Madras, mechanical engineering.",
        text: "Karthik Subramanian, CEO. IIT Madras, mechanical engineering. 5 years as a reliability engineer at an engine maker.",
      },
      mustFlag: [],
    },
  },
};

// ---------------- CareCorner ----------------
const cc = mk("CC");
const CCD = "CareCorner_Deck.pdf";
const CCF = "CareCorner_Form.pdf";
const carecorner: AppFixture = {
  app: "CareCorner",
  claims: [
    cc(1, "market.tam", "stated", 1.14e12, "INR", "deck", [CCD, 5, "TAM INR 1.14 lakh Cr 190M Indian households x INR 6,000 a year"]),
    cc(2, "market.tam", "factor", 190e6, "count", "deck", [CCD, 5, "TAM INR 1.14 lakh Cr 190M Indian households x INR 6,000 a year"]),
    cc(3, "market.tam", "factor", 6_000, "INR", "deck", [CCD, 5, "TAM INR 1.14 lakh Cr 190M Indian households x INR 6,000 a year"]),
    cc(4, "market.sam", "stated", 5_400e7, "INR", "deck", [CCD, 5, "SAM INR 5,400 Cr 9M households in Tier-2 cities of Telangana, AP and Karnataka x INR 6,000"]),
    cc(5, "market.sam", "factor", 9e6, "count", "deck", [CCD, 5, "SAM INR 5,400 Cr 9M households in Tier-2 cities of Telangana, AP and Karnataka x INR 6,000"]),
    cc(6, "market.sam", "factor", 6_000, "INR", "deck", [CCD, 5, "SAM INR 5,400 Cr 9M households in Tier-2 cities of Telangana, AP and Karnataka x INR 6,000"]),
    cc(7, "market.som", "stated", 35e7, "INR", "deck", [CCD, 5, "SOM INR 35 Cr In 3 years: 25 clinics x INR 1.4 Cr annual revenue per clinic"]),
    cc(8, "market.som", "factor", 25, "count", "deck", [CCD, 5, "SOM INR 35 Cr In 3 years: 25 clinics x INR 1.4 Cr annual revenue per clinic"]),
    cc(9, "market.som", "factor", 1.4e7, "INR", "deck", [CCD, 5, "SOM INR 35 Cr In 3 years: 25 clinics x INR 1.4 Cr annual revenue per clinic"]),
    cc(10, "capex.per_clinic", "stated", 28e5, "INR", "deck", [CCD, 6, "INR 28 L capex per clinic"]),
    cc(11, "capex.per_clinic", "stated", 28e5, "INR", "form", [CCF, 1, "Capex INR 28 L per clinic"]),
  ],
  expected: { flags: [], clean: true },
};

export const FIXTURES: AppFixture[] = [
  grainkind, talkbook, settlr, earnwise, stocksathi, capilot, yatrika, rentroute, pumpwise, carecorner,
];
