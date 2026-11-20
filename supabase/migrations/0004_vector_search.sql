-- Vector search for memo retrieval (score step), portfolio conflict (G3) and remembered corrections (Phase 4).
create index if not exists memo_chunks_embedding on memo_chunks using hnsw (embedding extensions.vector_cosine_ops);
create index if not exists portfolio_embedding on portfolio using hnsw (embedding extensions.vector_cosine_ops);
create index if not exists corrections_embedding on corrections using hnsw (embedding extensions.vector_cosine_ops);

create or replace function match_memo_chunks(q extensions.vector(768), k int)
returns table (id uuid, memo_id uuid, meeting_id uuid, section text, text text, page_no int, document_id uuid, similarity float)
language sql stable set search_path = public, extensions as $$
  select id, memo_id, meeting_id, section, text, page_no, document_id, 1 - (embedding <=> q)
  from memo_chunks where embedding is not null order by embedding <=> q limit k
$$;

-- G3 compares against EVERY portfolio row (Meeting 4), so this returns all rows ranked, not a top-k.
create or replace function match_portfolio(q extensions.vector(768))
returns table (id uuid, company text, one_liner text, sector text, tags text[], source_url text, similarity float)
language sql stable set search_path = public, extensions as $$
  select id, company, one_liner, sector, tags, source_url, 1 - (embedding <=> q)
  from portfolio where embedding is not null order by embedding <=> q
$$;

create or replace function match_corrections(q extensions.vector(768), k int)
returns table (id uuid, application_id uuid, criterion criterion_id, old_score numeric, new_score numeric, reason text, tags text[], pattern text, similarity float)
language sql stable set search_path = public, extensions as $$
  select id, application_id, criterion, old_score, new_score, reason, tags, pattern, 1 - (embedding <=> q)
  from corrections where embedding is not null order by embedding <=> q limit k
$$;

revoke execute on function match_memo_chunks(extensions.vector, int) from anon, public;
revoke execute on function match_portfolio(extensions.vector) from anon, public;
revoke execute on function match_corrections(extensions.vector, int) from anon, public;
