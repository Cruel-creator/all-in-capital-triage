-- Fields the scoring and ranking steps record for display and audit.
alter table applications
  add column sector_reason text,
  add column sector_label_matches boolean;
-- the short IDs the model cited (d03, f12, r01), kept alongside claims_used uuids for display and audit
alter table criterion_scores add column claim_keys text[] not null default '{}';
