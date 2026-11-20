-- All In Capital triage: core schema. See PLAN.md section 4.
create extension if not exists vector with schema extensions;
create extension if not exists pgmq;
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ---------- enums ----------
create type user_role as enum ('associate','partner');
create type app_status as enum ('queued','processing','scored','needs_attention');
create type app_source as enum ('form','warm_intro');
create type doc_kind as enum ('deck','form','memo','meeting_notes');
create type claim_origin as enum ('deck','form','research');
create type link_kind as enum ('page','form_field','memo','meeting_note','url');
create type recon_check as enum ('deck_vs_form','tam','sam','som','blended_cac','payback','mrr','credentials','revenue','unit_count');
create type severity as enum ('info','warn','red');
create type source_type as enum ('primary','secondary','aggregator');
create type gate_id as enum ('G1','G2','G3','G4');
create type criterion_id as enum ('C1','C2','C3','C4','C5','C6');
create type confidence as enum ('high','med','low');
create type crit_status as enum ('ok','needs_attention');
create type score_view as enum ('revealed','written');
create type written_fit as enum ('in','stretch','outside');
create type bucket as enum ('clear','flagged','outside_mandate');
create type rec_action as enum ('take_call','dig','pass');
create type decision_kind as enum ('advance','hold','pass');
create type memo_outcome as enum ('invested','passed');
create type email_template as enum ('invite','dig','pass','follow_up');
create type draft_status as enum ('draft','approved','sent');
create type version_origin as enum ('generated','redo','riya_edit','restore');
create type thread_state as enum ('sent','replied','followed_up','counter_proposed','booked','closed');
create type job_status as enum ('queued','running','done','failed','needs_attention');
create type pipeline_step as enum ('ingest','extract_claims','reconcile','research','gates','score','rank','draft_email');

-- ---------- people ----------
create table profiles (
  user_id uuid primary key references auth.users on delete cascade,
  display_name text not null,
  role user_role not null,
  created_at timestamptz not null default now()
);

-- ---------- versioning ----------
create table thesis_versions (
  id uuid primary key default gen_random_uuid(),
  version int not null unique,
  written jsonb not null,
  revealed jsonb not null,
  note text,
  created_by uuid references auth.users,
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index one_active_thesis on thesis_versions (is_active) where is_active;

create table rubric_versions (
  id uuid primary key default gen_random_uuid(),
  version int not null unique,
  config jsonb not null,
  note text,
  created_by uuid references auth.users,
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index one_active_rubric on rubric_versions (is_active) where is_active;

create table prompt_versions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  version int not null,
  template text not null,
  sha256 text not null,
  langfuse_prompt_ref text,
  created_at timestamptz not null default now(),
  unique (name, version)
);

-- ---------- intake ----------
create table applications (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  one_liner text,
  sector_label text,
  sector_inferred text,
  stage_label text,
  source app_source not null default 'form',
  intro_by text,
  received_at timestamptz not null default now(),
  status app_status not null default 'queued',
  status_reason text,
  current_step pipeline_step,
  dedupe_key text not null unique,
  is_synthetic boolean not null default false,
  rubric_version_id uuid references rubric_versions,
  thesis_version_id uuid references thesis_versions,
  created_at timestamptz not null default now(),
  -- an application in needs_attention must say why (Case 4, Task 2)
  constraint attention_has_reason check (status <> 'needs_attention' or coalesce(length(status_reason),0) > 0)
);

-- the ONLY table holding founder PII. Model code receives founders.id only.
create table founders (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications on delete cascade,
  position int not null default 1,
  full_name text not null,
  role_title text,
  email text,
  phone text,
  linkedin_url text,
  created_at timestamptz not null default now()
);

create table documents (
  id uuid primary key default gen_random_uuid(),
  application_id uuid references applications on delete cascade,
  kind doc_kind not null,
  file_name text not null,
  storage_path text not null,
  sha256 text not null unique,
  page_count int not null,
  raw_text text not null,
  created_at timestamptz not null default now()
);

create table pages (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents on delete cascade,
  page_no int not null check (page_no >= 1),
  text text not null,
  unique (document_id, page_no)
);

create or replace function word_count(t text) returns int language sql immutable as
$$ select coalesce(array_length(regexp_split_to_array(trim(t), '\s+'), 1), 0) $$;

create table claims (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications on delete cascade,
  claim_key text not null,
  text text not null,
  metric text,
  value numeric,
  unit text,
  period text,
  source_doc_id uuid references documents,
  page_no int,
  quote text not null check (word_count(quote) <= 25),
  quote_verified boolean not null default false,
  origin claim_origin not null,
  created_at timestamptz not null default now(),
  unique (application_id, claim_key)
);

create table source_links (
  id uuid primary key default gen_random_uuid(),
  kind link_kind not null,
  document_id uuid references documents,
  page_no int,
  char_start int,
  char_end int,
  url text,
  publisher text,
  retrieved_at timestamptz,
  quote text check (quote is null or word_count(quote) <= 25),
  created_at timestamptz not null default now(),
  constraint link_points_somewhere check (document_id is not null or url is not null)
);

-- ---------- analysis ----------
create table reconciliation_flags (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications on delete cascade,
  "check" recon_check not null,
  metric text not null,
  stated_value numeric,
  stated_label text,
  computed_value numeric,
  delta_pct numeric,
  severity severity not null,
  formula text not null,
  explanation text not null,
  claim_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

create table research_queries (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications on delete cascade,
  founder_id uuid references founders,
  purpose text not null,
  query text not null,
  engine text not null,
  ran_at timestamptz not null default now(),
  result_count int not null,
  error text
);

create table research_findings (
  id uuid primary key default gen_random_uuid(),
  query_id uuid not null references research_queries on delete cascade,
  application_id uuid not null references applications on delete cascade,
  url text not null,
  title text,
  publisher text,
  published_at date,
  retrieved_at timestamptz not null default now(),
  quote text not null check (word_count(quote) <= 25),
  source_type source_type not null,
  corroborated_by uuid[] not null default '{}',
  cites_url text,
  parent_finding_id uuid references research_findings,
  conflicts_with uuid references research_findings,
  extracted_claim text,
  is_match boolean not null default true,
  mismatch_reason text
);

create table gates (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications on delete cascade,
  gate gate_id not null,
  tripped boolean not null,
  reasons jsonb not null default '[]',
  created_at timestamptz not null default now(),
  unique (application_id, gate)
);

create table memos (
  id uuid primary key default gen_random_uuid(),
  memo_no int not null unique,
  company text not null unique,
  outcome memo_outcome not null,
  sector text not null,
  stage text,
  source text,
  document_id uuid references documents,
  page_from int,
  page_to int,
  summary text
);

create table criterion_scores (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications on delete cascade,
  criterion criterion_id not null,
  score numeric(3,1) not null check (score between 0 and 10),
  confidence confidence not null,
  rationale text not null,
  claims_used uuid[] not null default '{}',
  rules_applied text[] not null default '{}',
  precedent_memo_id uuid references memos,
  precedent_note text,
  gap text,
  question_for_call text,
  status crit_status not null default 'ok',
  status_reason text,
  is_override boolean not null default false,
  supersedes uuid references criterion_scores,
  is_current boolean not null default true,
  rubric_version_id uuid references rubric_versions,
  prompt_version_id uuid references prompt_versions,
  llm_call_id uuid,
  created_at timestamptz not null default now(),
  -- non-negotiable 1: a scored criterion carries at least one claim unless it is the named-gap floor
  constraint cited_or_gap check (cardinality(claims_used) > 0 or gap is not null or status = 'needs_attention')
);
create unique index one_current_score on criterion_scores (application_id, criterion) where is_current;

create table scores (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications on delete cascade,
  view score_view not null,
  total numeric(3,1) not null,
  founder_subtotal numeric(3,1) not null,
  market_subtotal numeric(3,1) not null,
  weights_used jsonb not null,
  lens text,
  evidence_coverage_pct int not null,
  written_fit written_fit,
  written_fit_reason text,
  rubric_version_id uuid references rubric_versions,
  created_at timestamptz not null default now(),
  unique (application_id, view)
);

create table recommendations (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references applications on delete cascade,
  bucket bucket not null,
  action rec_action not null,
  top_rules text[] not null,
  precedents jsonb not null default '[]',
  dig_questions text[] not null default '{}',
  what_would_change text,
  created_at timestamptz not null default now()
);

create table decisions (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications on delete cascade,
  by_user uuid not null references auth.users,
  decision decision_kind not null,
  note text not null check (length(trim(note)) > 0),
  created_at timestamptz not null default now()
);

create table corrections (
  id uuid primary key default gen_random_uuid(),
  criterion_score_id uuid not null references criterion_scores,
  application_id uuid not null references applications on delete cascade,
  by_user uuid not null references auth.users,
  criterion criterion_id not null,
  old_score numeric(3,1) not null,
  new_score numeric(3,1) not null,
  reason text not null check (length(trim(reason)) > 0),
  tags text[] not null default '{}',
  sector text,
  pattern text,
  embedding extensions.vector(768),
  reuse_count int not null default 0,
  created_at timestamptz not null default now()
);

create table correction_applications (
  id uuid primary key default gen_random_uuid(),
  correction_id uuid not null references corrections on delete cascade,
  application_id uuid not null references applications on delete cascade,
  criterion_score_id uuid references criterion_scores,
  created_at timestamptz not null default now()
);

-- ---------- knowledge ----------
create table meetings (
  id uuid primary key default gen_random_uuid(),
  meeting_no int not null unique,
  title text not null,
  document_id uuid references documents,
  page_no int not null
);

create table memo_chunks (
  id uuid primary key default gen_random_uuid(),
  memo_id uuid references memos on delete cascade,
  meeting_id uuid references meetings on delete cascade,
  section text,
  text text not null,
  document_id uuid not null references documents,
  page_no int not null,
  embedding extensions.vector(768),
  constraint chunk_has_parent check (memo_id is not null or meeting_id is not null)
);

create table portfolio (
  id uuid primary key default gen_random_uuid(),
  company text not null unique,
  one_liner text not null,
  sector text,
  status text not null default 'active',
  tags text[] not null default '{}',
  source_url text not null,
  source_note text,
  embedding extensions.vector(768),
  updated_at timestamptz not null default now()
);

-- ---------- email + scheduling ----------
create table email_drafts (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications on delete cascade,
  template email_template not null,
  status draft_status not null default 'draft',
  current_version_id uuid,
  opening_claim_id uuid references claims,
  sent_at timestamptz,
  sent_by uuid references auth.users,
  created_at timestamptz not null default now()
);

create table email_versions (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references email_drafts on delete cascade,
  n int not null,
  subject text not null,
  body text not null,
  origin version_origin not null,
  redo_chip text,
  redo_note text,
  lint_report jsonb not null default '{}',
  author uuid references auth.users,
  created_at timestamptz not null default now(),
  unique (draft_id, n)
);
alter table email_drafts add constraint current_version_fk foreign key (current_version_id) references email_versions;

create table threads (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications on delete cascade,
  gmail_thread_id text unique,
  state thread_state not null default 'sent',
  follow_up_due_at timestamptz,
  followed_up_at timestamptz,
  created_at timestamptz not null default now()
);

create table meetings_booked (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications on delete cascade,
  gcal_event_id text not null unique,
  start_at timestamptz not null,
  end_at timestamptz not null,
  includes_aditya boolean not null default false,
  created_at timestamptz not null default now()
);

create table timeline_events (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications on delete cascade,
  kind text not null,
  payload jsonb not null default '{}',
  actor uuid references auth.users,
  created_at timestamptz not null default now()
);

create table style_examples (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid references email_drafts,
  template email_template not null,
  draft_text text not null,
  sent_text text not null,
  diff text not null,
  created_at timestamptz not null default now()
);

-- ---------- ops ----------
create table jobs (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications on delete cascade,
  step pipeline_step not null,
  status job_status not null default 'queued',
  attempts int not null default 0,
  last_error text,
  langfuse_trace_id text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);
create index jobs_app on jobs (application_id, created_at desc);

create table llm_calls (
  id uuid primary key default gen_random_uuid(),
  application_id uuid references applications on delete set null,
  step text not null,
  criterion criterion_id,
  prompt_version_id uuid references prompt_versions,
  provider text not null,
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cost_usd numeric(12,6) not null default 0,
  latency_ms int,
  langfuse_trace_id text,
  portkey_request_id text,
  retries int not null default 0,
  fell_back boolean not null default false,
  payload_hash text,
  ok boolean not null default true,
  error text,
  created_at timestamptz not null default now()
);
create index llm_calls_day on llm_calls (created_at);

create table cost_limits (
  id int primary key default 1 check (id = 1),
  daily_usd numeric(10,2) not null default 5,
  alert_email text,
  paused_at timestamptz,
  pause_reason text,
  max_in_flight int not null default 4
);
insert into cost_limits (id) values (1);

-- ---------- views ----------
create view v_cost_daily with (security_invoker = true) as
  select date_trunc('day', created_at at time zone 'Asia/Kolkata') as day,
         sum(cost_usd) as cost_usd, count(*) as calls
  from llm_calls group by 1;
create view v_cost_weekly with (security_invoker = true) as
  select date_trunc('week', created_at at time zone 'Asia/Kolkata') as week,
         sum(cost_usd) as cost_usd, count(*) as calls
  from llm_calls group by 1;
create view v_cost_monthly with (security_invoker = true) as
  select date_trunc('month', created_at at time zone 'Asia/Kolkata') as month,
         sum(cost_usd) as cost_usd, count(*) as calls
  from llm_calls group by 1;
create view v_cost_by_application with (security_invoker = true) as
  select application_id, sum(cost_usd) as cost_usd, count(*) as calls,
         sum(input_tokens) as input_tokens, sum(output_tokens) as output_tokens
  from llm_calls group by 1;

-- ---------- queue ----------
select pgmq.create('pipeline');

-- ---------- RLS ----------
create or replace function current_role_is(r user_role) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from profiles where user_id = auth.uid() and role = r) $$;

create or replace function is_team() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from profiles where user_id = auth.uid()) $$;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','thesis_versions','rubric_versions','prompt_versions','applications','founders',
    'documents','pages','claims','source_links','reconciliation_flags','research_queries',
    'research_findings','gates','memos','criterion_scores','scores','recommendations','decisions',
    'corrections','correction_applications','meetings','memo_chunks','portfolio','email_drafts',
    'email_versions','threads','meetings_booked','timeline_events','style_examples','jobs',
    'llm_calls','cost_limits']
  loop
    execute format('alter table %I enable row level security', t);
  end loop;
  -- team-readable tables (founders deliberately excluded)
  foreach t in array array[
    'profiles','thesis_versions','rubric_versions','prompt_versions','applications',
    'documents','pages','claims','source_links','reconciliation_flags','research_queries',
    'research_findings','gates','memos','criterion_scores','scores','recommendations','decisions',
    'corrections','correction_applications','meetings','memo_chunks','portfolio','email_drafts',
    'email_versions','threads','meetings_booked','timeline_events','style_examples','jobs',
    'llm_calls','cost_limits']
  loop
    execute format('create policy team_read on %I for select to authenticated using (is_team())', t);
  end loop;
end $$;

-- team writes (the worker uses the service role and bypasses RLS)
create policy team_write on corrections for insert to authenticated with check (is_team() and by_user = auth.uid());
create policy team_write on criterion_scores for insert to authenticated with check (is_team() and is_override);
create policy team_write on email_versions for insert to authenticated with check (is_team());
create policy team_update on email_drafts for update to authenticated using (is_team());
create policy team_write on portfolio for all to authenticated using (is_team()) with check (is_team());
create policy team_write on timeline_events for insert to authenticated with check (is_team());
create policy partner_settings on thesis_versions for insert to authenticated with check (current_role_is('partner'));
create policy partner_settings on rubric_versions for insert to authenticated with check (current_role_is('partner'));
create policy partner_limits on cost_limits for update to authenticated using (current_role_is('partner'));
-- Humans decide: only partners can record a decision (Kushal sees every outcome)
create policy partner_decides on decisions for insert to authenticated
  with check (current_role_is('partner') and by_user = auth.uid());
