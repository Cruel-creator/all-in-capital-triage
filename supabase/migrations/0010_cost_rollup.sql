-- Cost & ops totals computed in the database: the API caps row reads at 1,000, so summing rows in the app undercounts.
create or replace function cost_rollup(day_start timestamptz)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'today', coalesce((select sum(cost_usd) from llm_calls where created_at >= day_start), 0),
    'week',  coalesce((select sum(cost_usd) from llm_calls where created_at >= now() - interval '7 days'), 0),
    'month', coalesce((select sum(cost_usd) from llm_calls where created_at >= now() - interval '30 days'), 0),
    'by_step', coalesce((select jsonb_agg(x order by x.cost desc) from (
        select step, count(*) n, sum(cost_usd) cost from llm_calls where created_at >= now() - interval '30 days' group by step) x), '[]'),
    'by_app', coalesce((select jsonb_agg(y order by y.cost desc) from (
        select application_id, count(*) n, sum(cost_usd) cost from llm_calls
        where created_at >= now() - interval '30 days' and application_id is not null group by application_id) y), '[]')
  )
$$;
revoke execute on function cost_rollup(timestamptz) from public, anon, authenticated;
