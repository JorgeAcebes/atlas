-- 034_security_hardening.sql
-- Hardens SECURITY DEFINER & trigger functions with explicit search_path = public,
-- excludes stealth test accounts (is_test) from get_user_ranking() & get_mutual_followers(),
-- and restricts RPC EXECUTE grants to the minimum required Postgres roles.

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
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.get_user_ranking(text[], boolean, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_ranking(text[], boolean, uuid, text) TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.get_mutual_followers()
RETURNS SETOF public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT p.*
  FROM public.profiles p
  JOIN public.connections c1 ON c1.following_id = p.id AND c1.follower_id = auth.uid() AND c1.status = 'accepted'
  JOIN public.connections c2 ON c2.follower_id = p.id AND c2.following_id = auth.uid() AND c2.status = 'accepted'
  WHERE p.id != auth.uid()
    AND (p.is_test IS NOT TRUE)
  ORDER BY p.username ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_mutual_followers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_mutual_followers() TO authenticated;

-- Pin search_path = public on remaining public functions flagged by Supabase Security Advisor
ALTER FUNCTION public.get_collective_summits(text, boolean) SET search_path = public;
ALTER FUNCTION public.get_recommended_profiles() SET search_path = public;
ALTER FUNCTION public.cleanup_legacy_shared_peaks_photos() SET search_path = public;
ALTER FUNCTION public.cleanup_category_overrides() SET search_path = public;
ALTER FUNCTION public.check_custom_category_not_predefined() SET search_path = public;

-- Restrict SECURITY DEFINER helpers to minimum required roles
REVOKE ALL ON FUNCTION public.get_recommended_profiles() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_recommended_profiles() TO authenticated;

REVOKE ALL ON FUNCTION public.get_total_photos_storage_bytes() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_total_photos_storage_bytes() TO service_role;

REVOKE ALL ON FUNCTION public.get_email_for_login(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_email_for_login(text) TO service_role;

REVOKE ALL ON FUNCTION public.get_email_for_login(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_email_for_login(text, text) TO service_role;

REVOKE ALL ON FUNCTION public.get_collective_visited_countries() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_collective_visited_countries() TO service_role;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
