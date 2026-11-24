-- L8 "Cache it": same prompt version, same input, same model -> reuse the stored answer instead of paying again.
-- Only deterministic steps use it (temperature <= 0.2). Rows expire after 30 days ("send less, log less"): the cache is
-- a second copy of model output about founders, so it is not kept longer than a re-run is likely.
create table if not exists llm_cache (
  key text primary key,          -- sha256(model + system + user)
  output text not null,          -- the raw model text, re-validated on every hit
  model text not null,
  created_at timestamptz not null default now()
);
create index if not exists llm_cache_created_at on llm_cache (created_at);
alter table llm_cache enable row level security; -- no policies: only the service role (server) can read or write

alter table llm_calls add column if not exists cached boolean not null default false;
