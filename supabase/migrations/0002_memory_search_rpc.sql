-- Vector similarity search RPC function
create or replace function match_memory_chunks(
  query_embedding vector(1536),
  match_user_id text,
  match_count int default 20
)
returns table (
  id uuid,
  user_id text,
  source_type text,
  source_id uuid,
  text text,
  similarity float,
  created_at timestamptz
)
language plpgsql
as $$
begin
  return query
  select
    mc.id,
    mc.user_id,
    mc.source_type,
    mc.source_id,
    mc.text,
    1 - (mc.embedding <=> query_embedding) as similarity,
    mc.created_at
  from memory_chunks mc
  where mc.user_id = match_user_id
  order by mc.embedding <=> query_embedding
  limit match_count;
end;
$$;
