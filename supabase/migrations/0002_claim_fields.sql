-- Claim fields the deterministic reconciler needs (see src/lib/reconcile/types.ts).
alter table claims
  add column role text not null default 'stated' check (role in ('stated','factor','divisor','share','channel_value')),
  add column bound text not null default 'eq' check (bound in ('eq','approx','lt','lte','gt','gte')),
  add column qualifier text,
  add column status text check (status is null or status = 'not_measured'),
  add column raw_value text;
create index claims_app_metric on claims (application_id, metric);

-- Private bucket for application PDFs.
insert into storage.buckets (id, name, public) values ('documents', 'documents', false) on conflict (id) do nothing;
