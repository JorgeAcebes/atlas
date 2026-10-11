-- 027_remove_regions.sql
-- Eliminar columna enable_regions de profiles y purgar registros asociados a regiones

ALTER TABLE public.profiles
DROP COLUMN IF EXISTS enable_regions;

-- Limpiar cualquier registro histórico o ascents con identificador de región si existiera
DELETE FROM public.ascents
WHERE summit_id LIKE 'region-%';
