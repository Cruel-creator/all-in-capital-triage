-- What a thread was sent with (subject, offered slots, sign-off, first name), so replies and follow-ups stay in context.
alter table threads add column context jsonb not null default '{}',
  add column draft_id uuid references email_drafts on delete set null;
create index threads_application_idx on threads (application_id);
alter table meetings_booked add column thread_id uuid references threads on delete set null;
