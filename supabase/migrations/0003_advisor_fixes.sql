-- Supabase security advisor fixes after 0001/0002.
-- founders has RLS and deliberately no policy: only the server (service role) may read founder PII.
alter function public.word_count(text) set search_path = public;

-- RLS helpers are needed by signed-in users (policies call them) but never by anonymous callers.
revoke execute on function public.current_role_is(user_role) from anon, public;
revoke execute on function public.is_team() from anon, public;
grant execute on function public.current_role_is(user_role) to authenticated;
grant execute on function public.is_team() to authenticated;

-- pg_net out of the exposed public schema (not used yet; pg_cron → worker trigger arrives in Phase 5).
drop extension if exists pg_net;
create extension if not exists pg_net with schema extensions;
