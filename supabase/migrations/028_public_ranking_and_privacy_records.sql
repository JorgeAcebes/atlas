-- 028_public_ranking_and_privacy_records.sql
-- 1. Updates get_user_ranking() to include private profiles with activity (ascents_count > 0).
-- 2. Adds get_user_completed_summits(p_user_id) function to safely fetch completed summit IDs
--    for private profiles without exposing notes, exact dates, or photos.

-- 1. Update get_user_ranking to include private profiles
CREATE OR REPLACE FUNCTION public.get_user_ranking(
  p_summit_ids text[] default null,
  p_following_only boolean default false,
  p_follower uuid default null,
  p_mode text default 'countries'
) RETURNS TABLE (
  user_id uuid,
  username text,
  avatar_url text,
  ascents_count bigint
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id AS user_id,
    p.username,
    p.avatar_url,
    count(distinct a.summit_id) AS ascents_count
  FROM public.profiles p
  LEFT JOIN public.ascents a ON p.id = a.user_id 
    AND a.is_wishlist = false
    AND (p_summit_ids is null or a.summit_id = any(p_summit_ids))
    AND (
      (p_mode = 'countries' and a.summit_id like 'country-%') or
      (p_mode = 'peaks' and a.summit_id not like 'country-%' and a.summit_id not like 'region-%')
    )
  WHERE 
    (p.is_test IS NOT TRUE)
    AND (p_following_only = false or p.id = p_follower or p.id in (
      select following_id from public.connections where follower_id = p_follower and status = 'accepted'
    ))
  GROUP BY p.id, p.username, p.avatar_url
  HAVING count(distinct a.summit_id) > 0
  ORDER BY ascents_count desc, p.username asc;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Function to safely fetch completed summit IDs of any user (including private)
CREATE OR REPLACE FUNCTION public.get_user_completed_summits(p_user_id uuid)
RETURNS TABLE (summit_id text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT a.summit_id
  FROM public.ascents a
  WHERE a.user_id = p_user_id
    AND a.is_wishlist = false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_completed_summits(uuid) TO authenticated, anon;
