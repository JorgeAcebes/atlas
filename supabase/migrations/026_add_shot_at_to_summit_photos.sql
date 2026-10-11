-- 026_add_shot_at_to_summit_photos.sql
-- Añadir columna shot_at para registrar la hora/instante exacto de toma de la foto
-- y permitir ordenar las fotos cronológicamente en las cuadrículas.

ALTER TABLE public.summit_photos
ADD COLUMN IF NOT EXISTS shot_at TIMESTAMPTZ;

-- Para registros históricos sin shot_at, inicializar con created_at
UPDATE public.summit_photos
SET shot_at = created_at
WHERE shot_at IS NULL;
