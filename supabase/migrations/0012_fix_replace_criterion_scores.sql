-- Return the inserted rows: collect the new ids first (a separate statement), so the lookup can see them.
create or replace function replace_criterion_scores(app uuid, rows jsonb)
returns table (id uuid, application_id uuid, applied_corrections jsonb)
language plpgsql set search_path = public as $$
declare ids uuid[];
begin
  update criterion_scores c set is_current = false where c.application_id = app and c.is_current and not c.is_override;
  ids := array(select _insert_json('criterion_scores', rows));
  return query select c.id, c.application_id, c.applied_corrections from criterion_scores c where c.id = any(ids);
end $$;
revoke execute on function replace_criterion_scores(uuid, jsonb) from public, anon, authenticated;
