-- A reliable 5-minute trigger for /api/cron/queue (queue processing and automatic meeting booking). GitHub's scheduled
-- Actions run hours late on free plans; Supabase pg_cron runs on time. The caller's token is generated INSIDE the
-- database and kept in Supabase Vault: it never appears in code, git, logs or a chat. The route checks it through
-- check_cron_token, which only the server's service role may call.

-- 1. the token, created once (re-running this migration keeps the existing one)
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'cron_queue_token') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'cron_queue_token', 'Bearer token pg_cron sends to /api/cron/queue');
  end if;
end $$;

-- 2. the check, callable by the server only
create or replace function public.check_cron_token(token text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select coalesce((select decrypted_secret = token from vault.decrypted_secrets where name = 'cron_queue_token'), false);
$$;
revoke all on function public.check_cron_token(text) from public, anon, authenticated;
grant execute on function public.check_cron_token(text) to service_role;

-- 3. every 5 minutes; the app may take up to 5 minutes, so the request waits that long before giving up
select cron.unschedule(jobid) from cron.job where jobname = 'queue-every-5-min';
select cron.schedule(
  'queue-every-5-min',
  '*/5 * * * *',
  $$
  select net.http_get(
    url := 'https://all-in-capital-triage-orcin.vercel.app/api/cron/queue',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_queue_token')),
    timeout_milliseconds := 300000
  );
  $$
);
