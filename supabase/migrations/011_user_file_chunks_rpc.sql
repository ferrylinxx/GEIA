-- ============================================
-- RPC: match_user_file_chunks (semantic search)
-- Search across the current user's ingested file_chunks, optionally limited to a set of file IDs.
-- ============================================

CREATE INDEX IF NOT EXISTS idx_file_chunks_user ON public.file_chunks(user_id);

CREATE OR REPLACE FUNCTION public.match_user_file_chunks(
  p_user_id UUID,
  p_query_embedding vector(1536),
  p_match_count INT DEFAULT 8,
  p_similarity_threshold FLOAT DEFAULT 0.65,
  p_file_ids UUID[] DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  file_id UUID,
  chunk_index INT,
  page INT,
  content TEXT,
  content_hash TEXT,
  meta_json JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    fc.id,
    fc.file_id,
    fc.chunk_index,
    fc.page,
    fc.content,
    fc.content_hash,
    fc.meta_json,
    1 - (fc.embedding <=> p_query_embedding) AS similarity
  FROM public.file_chunks fc
  WHERE fc.user_id = p_user_id
    AND (p_file_ids IS NULL OR fc.file_id = ANY(p_file_ids))
    AND 1 - (fc.embedding <=> p_query_embedding) > p_similarity_threshold
  ORDER BY fc.embedding <=> p_query_embedding
  LIMIT p_match_count;
END;
$$;

