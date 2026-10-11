-- 029_restore_and_protect_default_categories.sql
-- 1. Cleans up any existing overrides for predefined/default categories in custom_experience_categories.
-- 2. Adds a trigger to prevent future overrides of predefined categories via static_id.

CREATE OR REPLACE FUNCTION public.check_custom_category_not_predefined()
RETURNS trigger AS $$
BEGIN
  IF NEW.static_id IS NOT NULL THEN
    RAISE EXCEPTION 'Las categorías por defecto no se pueden modificar.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_prevent_predefined_category_override'
  ) THEN
    CREATE TRIGGER trg_prevent_predefined_category_override
    BEFORE INSERT OR UPDATE ON public.custom_experience_categories
    FOR EACH ROW EXECUTE FUNCTION public.check_custom_category_not_predefined();
  END IF;
END $$;

-- Clean up any residual overrides
DELETE FROM public.custom_experience_categories WHERE static_id IS NOT NULL;
