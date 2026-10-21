-- 032_record_companions.sql
-- Companions for trips, mountain routes, and experiences with mutual-following validation,
-- acceptance/rejection flow, and group linkage.

ALTER TABLE public.ascents
  ADD COLUMN IF NOT EXISTS trip_group_id uuid;

ALTER TABLE public.experience_records
  ADD COLUMN IF NOT EXISTS trip_group_id uuid;

CREATE TABLE IF NOT EXISTS public.record_companions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  trip_group_id uuid NOT NULL,
  inviter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  companion_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  record_type text NOT NULL CHECK (record_type IN ('ascent', 'experience')),
  inviter_record_id uuid,
  companion_record_id uuid,
  item_type text NOT NULL CHECK (item_type IN ('peaks', 'countries', 'experience')),
  item_id text NOT NULL,
  sub_item_id text,
  location_name text,
  start_date date NOT NULL,
  end_date date,
  original_start_date date NOT NULL,
  original_end_date date,
  lat double precision,
  lng double precision,
  status text NOT NULL CHECK (status IN ('pending', 'accepted', 'rejected', 'separated')) DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_trip_companion UNIQUE (trip_group_id, companion_id)
);

CREATE INDEX IF NOT EXISTS idx_record_companions_companion ON public.record_companions(companion_id);
CREATE INDEX IF NOT EXISTS idx_record_companions_inviter ON public.record_companions(inviter_id);
CREATE INDEX IF NOT EXISTS idx_record_companions_trip_group ON public.record_companions(trip_group_id);
CREATE INDEX IF NOT EXISTS idx_ascents_trip_group ON public.ascents(trip_group_id);
CREATE INDEX IF NOT EXISTS idx_experience_records_trip_group ON public.experience_records(trip_group_id);

ALTER TABLE public.record_companions ENABLE ROW LEVEL SECURITY;

-- 1. SELECT policy:
-- The inviter and the companion can always see their companion records.
-- Third parties can view accepted companion records only if the companion profile is public,
-- or if the third party is an accepted follower of the private companion.
CREATE POLICY "View record companions policy" ON public.record_companions
FOR SELECT USING (
  auth.uid() = inviter_id
  OR auth.uid() = companion_id
  OR (
    status = 'accepted'
    AND (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = record_companions.companion_id
          AND p.is_public = true
      )
      OR EXISTS (
        SELECT 1 FROM public.connections c
        WHERE c.following_id = record_companions.companion_id
          AND c.follower_id = auth.uid()
          AND c.status = 'accepted'
      )
    )
  )
);

-- 2. INSERT policy:
-- The authenticated user must be the inviter.
-- The companion and inviter must be mutual followers.
CREATE POLICY "Insert record companions policy" ON public.record_companions
FOR INSERT WITH CHECK (
  auth.uid() = inviter_id
  AND EXISTS (
    SELECT 1 FROM public.connections c1
    WHERE c1.follower_id = auth.uid() AND c1.following_id = companion_id AND c1.status = 'accepted'
  )
  AND EXISTS (
    SELECT 1 FROM public.connections c2
    WHERE c2.follower_id = companion_id AND c2.following_id = auth.uid() AND c2.status = 'accepted'
  )
);

-- 3. UPDATE policy:
-- Either the companion (to accept/reject) or the inviter (to update dates/details or separate).
CREATE POLICY "Update record companions policy" ON public.record_companions
FOR UPDATE USING (
  auth.uid() = companion_id OR auth.uid() = inviter_id
);

-- 4. DELETE policy:
-- Either party can remove the companion link.
CREATE POLICY "Delete record companions policy" ON public.record_companions
FOR DELETE USING (
  auth.uid() = inviter_id OR auth.uid() = companion_id
);

-- RPC to retrieve all mutual followers of the current authenticated user
CREATE OR REPLACE FUNCTION public.get_mutual_followers()
RETURNS SETOF public.profiles AS $$
BEGIN
  RETURN QUERY
  SELECT p.*
  FROM public.profiles p
  JOIN public.connections c1 ON c1.following_id = p.id AND c1.follower_id = auth.uid() AND c1.status = 'accepted'
  JOIN public.connections c2 ON c2.follower_id = p.id AND c2.following_id = auth.uid() AND c2.status = 'accepted'
  WHERE p.id != auth.uid()
  ORDER BY p.username ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
