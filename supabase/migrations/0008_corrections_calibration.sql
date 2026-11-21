-- Phase 4: overrides recorded by signed-in email (like decisions), which corrections each score used, calibration runs.
alter table corrections alter column by_user drop not null;
alter table corrections add column by_email text,
  add column reason_for_model text, -- founder names of the corrected company replaced; this is what prompts see
  add constraint correction_by_someone check (by_user is not null or by_email is not null);
alter table criterion_scores add column applied_corrections jsonb not null default '[]',
  add column override_by_email text,
  add column override_reason text;

create table calibration_runs (
  id uuid primary key default gen_random_uuid(),
  rubric_version_id uuid references rubric_versions,
  prompt_version_id uuid references prompt_versions,
  agreement_pct numeric(5,1) not null,
  confusion jsonb not null,
  results jsonb not null,
  report_md text not null,
  cost_usd numeric(10,4),
  created_at timestamptz not null default now()
);
alter table calibration_runs enable row level security;
create index correction_applications_correction_idx on correction_applications (correction_id);
