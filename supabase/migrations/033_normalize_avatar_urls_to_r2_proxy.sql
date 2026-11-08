-- 033_normalize_avatar_urls_to_r2_proxy.sql
-- Normalizar URLs de avatares de perfil hacia el proxy resiliente de Cloudflare R2 (/api/photos/view/...)
-- para esquivar bloqueos de dominios *.r2.dev y Supabase Storage en España durante eventos deportivos (LaLiga).

UPDATE public.profiles
SET avatar_url = regexp_replace(avatar_url, '^https?://[^/]+\.r2\.dev/', '/api/photos/view/')
WHERE avatar_url LIKE '%r2.dev/%';

UPDATE public.profiles
SET avatar_url = regexp_replace(avatar_url, '^https?://[^/]+/storage/v1/object/public/summit-photos/', '/api/photos/view/')
WHERE avatar_url LIKE '%/storage/v1/object/public/summit-photos/%';
