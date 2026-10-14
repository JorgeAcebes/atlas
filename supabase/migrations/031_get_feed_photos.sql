-- 031_get_feed_photos.sql
-- Función RPC optimizada para obtener fotos del feed social sin producto cartesiano

CREATE OR REPLACE FUNCTION public.get_feed_photos(pairs jsonb)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  summit_id text,
  public_url text,
  taken_on date,
  caption text,
  created_at timestamp with time zone,
  storage_path text,
  shot_at timestamp with time zone
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT 
    p.id, 
    p.user_id, 
    p.summit_id, 
    p.public_url, 
    p.taken_on, 
    p.caption, 
    p.created_at, 
    p.storage_path, 
    p.shot_at
  FROM public.summit_photos p
  JOIN jsonb_to_recordset(pairs) AS target(user_id uuid, summit_id text)
    ON p.user_id = target.user_id AND p.summit_id = target.summit_id
  ORDER BY p.created_at ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_feed_photos(jsonb) TO authenticated, anon, service_role;
