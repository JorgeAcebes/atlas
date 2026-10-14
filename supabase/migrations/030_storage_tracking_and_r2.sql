-- 030_storage_tracking_and_r2.sql
-- Añadir seguimiento de tamaño de archivo (en bytes) a summit_photos para controlar el límite estricto de 9.5 GB en Cloudflare R2

ALTER TABLE public.summit_photos
ADD COLUMN IF NOT EXISTS file_size BIGINT DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_summit_photos_file_size ON public.summit_photos(file_size);

-- Función segura para calcular el consumo total de almacenamiento de fotos en bytes
CREATE OR REPLACE FUNCTION public.get_total_photos_storage_bytes()
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(file_size), 0)::BIGINT FROM public.summit_photos;
$$;

GRANT EXECUTE ON FUNCTION public.get_total_photos_storage_bytes() TO authenticated, service_role, anon;
