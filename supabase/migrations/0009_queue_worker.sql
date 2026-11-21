-- Phase 5: queue wrappers around pgmq (service role only), and alert bookkeeping for the daily cost limit.
create or replace function queue_send(app uuid, delay_s int default 0) returns bigint
language sql security definer set search_path = public, pgmq as $$
  select pgmq.send('pipeline', jsonb_build_object('application_id', app), delay_s)
$$;

create or replace function queue_read(vt_s int, qty int)
returns table (msg_id bigint, read_ct int, message jsonb)
language sql security definer set search_path = public, pgmq as $$
  select msg_id, read_ct, message from pgmq.read('pipeline', vt_s, qty)
$$;

create or replace function queue_delete(id bigint) returns boolean
language sql security definer set search_path = public, pgmq as $$ select pgmq.delete('pipeline', id) $$;

create or replace function queue_archive(id bigint) returns boolean
language sql security definer set search_path = public, pgmq as $$ select pgmq.archive('pipeline', id) $$;

create or replace function queue_set_vt(id bigint, vt_s int) returns void
language sql security definer set search_path = public, pgmq as $$ select pgmq.set_vt('pipeline', id, vt_s); select null::void $$;

-- depth and the application ids waiting (for the ops page and the sweeper)
create or replace function queue_waiting()
returns table (msg_id bigint, read_ct int, application_id uuid, vt timestamptz, enqueued_at timestamptz)
language sql security definer set search_path = public, pgmq as $$
  select msg_id, read_ct, (message->>'application_id')::uuid, vt, enqueued_at from pgmq.q_pipeline order by msg_id
$$;

revoke execute on function queue_send(uuid, int), queue_read(int, int), queue_delete(bigint), queue_archive(bigint), queue_set_vt(bigint, int), queue_waiting() from public, anon, authenticated;

alter table cost_limits add column alerted_at timestamptz;
