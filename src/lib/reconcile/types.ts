// Shared types for deterministic reconciliation (non-negotiable 3: arithmetic in code, not the LLM).

export type Origin = "deck" | "form";

/** How a stated number should be read. "Under INR 2,000" is lt 2000; "thousands" is gte 2000. */
export type Bound = "eq" | "approx" | "lt" | "lte" | "gt" | "gte";

/**
 * role:
 *  - stated:        the number the founder states for `metric`
 *  - factor:        multiplied together to recompute `metric`
 *  - divisor:       divides the product of factors
 *  - share/channel_value: channel mix for blended CAC (qualifier = channel name)
 */
export type Role = "stated" | "factor" | "divisor" | "share" | "channel_value";

export type Unit = "INR" | "count" | "share" | "months" | "x" | "pct";

export interface ReconClaim {
  id: string;
  metric: string;
  role: Role;
  value: number | null;
  unit: Unit;
  origin: Origin;
  bound?: Bound;
  qualifier?: string;
  /** e.g. the founder says a number was never measured */
  status?: "not_measured";
  text?: string;
}

export type ReconCheck =
  | "deck_vs_form"
  | "tam"
  | "sam"
  | "som"
  | "blended_cac"
  | "payback"
  | "mrr"
  | "credentials"
  | "revenue"
  | "unit_count";

export type Severity = "info" | "warn" | "red";

export interface ReconFlag {
  check: ReconCheck;
  metric: string;
  stated: number | null;
  stated_label: string | null;
  computed: number | null;
  delta_pct: number | null;
  severity: Severity;
  formula: string;
  explanation: string;
  claim_ids: string[];
}

export interface Derived {
  metric: string;
  value: number;
  unit: Unit;
  formula: string;
  claim_ids: string[];
}

export interface ReconResult {
  flags: ReconFlag[];
  derived: Derived[];
}
