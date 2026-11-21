-- Each replace runs in one transaction (a function call is atomic): a failure rolls everything back, so an
-- application is never left without scores, a recommendation, gates, or an active rubric/thesis version.

-- insert JSON rows into a table, using exactly the keys present (absent columns keep their defaults)
create or replace function _insert_json(tbl regclass, rows jsonb) returns setof uuid
language plpgsql set search_path = public as $$
declare cols text;
begin
  if rows is null or jsonb_array_length(rows) = 0 then return; end if;
  select string_agg(quote_ident(k), ', ') into cols
  from (select distinct jsonb_object_keys(r) k from jsonb_array_elements(rows) r) s;
  return query execute format('insert into %s (%s) select %s from jsonb_populate_recordset(null::%s, $1) returning id', tbl, cols, cols, tbl) using rows;
end $$;

create or replace function replace_rank(app uuid, score_rows jsonb, rec jsonb) returns void
language plpgsql set search_path = public as $$
begin
  delete from scores where application_id = app;
  perform _insert_json('scores', score_rows);
  delete from recommendations where application_id = app;
  perform _insert_json('recommendations', jsonb_build_array(rec));
end $$;

create or replace function replace_gates(app uuid, gate_rows jsonb) returns void
language plpgsql set search_path = public as $$
begin
  delete from gates where application_id = app;
  perform _insert_json('gates', gate_rows);
end $$;

-- retire current machine scores (overrides stay current) and insert the new ones, in one step
create or replace function replace_criterion_scores(app uuid, rows jsonb)
returns table (id uuid, application_id uuid, applied_corrections jsonb)
language plpgsql set search_path = public as $$
begin
  update criterion_scores c set is_current = false where c.application_id = app and c.is_current and not c.is_override;
  return query select c.id, c.application_id, c.applied_corrections from criterion_scores c where c.id in (select _insert_json('criterion_scores', rows));
end $$;

create or replace function activate_rubric(cfg jsonb, note_text text) returns int
language plpgsql set search_path = public as $$
declare v int;
begin
  lock table rubric_versions in share row exclusive mode; -- serialise concurrent saves
  select coalesce(max(version), 0) + 1 into v from rubric_versions;
  update rubric_versions set is_active = false where is_active;
  insert into rubric_versions (version, config, note, is_active) values (v, cfg || jsonb_build_object('version', v), note_text, true);
  return v;
end $$;

create or replace function activate_thesis(written_cfg jsonb, revealed_cfg jsonb, note_text text) returns int
language plpgsql set search_path = public as $$
declare v int;
begin
  lock table thesis_versions in share row exclusive mode;
  select coalesce(max(version), 0) + 1 into v from thesis_versions;
  update thesis_versions set is_active = false where is_active;
  insert into thesis_versions (version, written, revealed, note, is_active) values (v, written_cfg, revealed_cfg, note_text, true);
  return v;
end $$;

revoke execute on function _insert_json(regclass, jsonb), replace_rank(uuid, jsonb, jsonb), replace_gates(uuid, jsonb),
  replace_criterion_scores(uuid, jsonb), activate_rubric(jsonb, text), activate_thesis(jsonb, jsonb, text) from public, anon, authenticated;
