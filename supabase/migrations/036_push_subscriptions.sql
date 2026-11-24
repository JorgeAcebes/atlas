-- 036_push_subscriptions.sql
-- Web Push API (VAPID) subscriptions for mobile & PWA notifications.

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  notify_following_posts boolean NOT NULL DEFAULT true,
  notify_shared_records boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON public.push_subscriptions(user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'push_subscriptions' AND policyname = 'Users can view their own push subscriptions'
  ) THEN
    CREATE POLICY "Users can view their own push subscriptions"
      ON public.push_subscriptions FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'push_subscriptions' AND policyname = 'Users can create their own push subscriptions'
  ) THEN
    CREATE POLICY "Users can create their own push subscriptions"
      ON public.push_subscriptions FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'push_subscriptions' AND policyname = 'Users can update their own push subscriptions'
  ) THEN
    CREATE POLICY "Users can update their own push subscriptions"
      ON public.push_subscriptions FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'push_subscriptions' AND policyname = 'Users can delete their own push subscriptions'
  ) THEN
    CREATE POLICY "Users can delete their own push subscriptions"
      ON public.push_subscriptions FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END
$$;
