-- Google (Gmail + Calendar) for Riya's account, and partner decisions recorded by email until full auth lands.
create table google_accounts (
  email text primary key,
  refresh_token text not null,
  access_token text,
  expires_at timestamptz,
  scopes text,
  connected_at timestamptz not null default now()
);
alter table google_accounts enable row level security; -- no policies: server (service role) only

alter table decisions alter column by_user drop not null;
alter table decisions add column decided_by_email text;
alter table decisions add constraint decided_by_someone check (by_user is not null or decided_by_email is not null);

-- a reply or follow-up waiting for Riya's one click (never sent automatically)
alter table threads add column pending_action text check (pending_action in ('follow_up', 'counter_proposal', 'book')),
  add column pending_payload jsonb,
  add column founder_email text,
  add column last_seen_message_id text;
