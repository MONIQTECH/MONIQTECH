-- ============================================================
-- Phase 3: Missing columns, RLS fixes, push subscriptions
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Add missing columns to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS avatar_color  text,
  ADD COLUMN IF NOT EXISTS avatar_url    text;

-- 2. RLS: allow users to INSERT and UPDATE their own profile
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE USING (auth.uid() = id);

-- 3. Add missing columns to habits
ALTER TABLE habits
  ADD COLUMN IF NOT EXISTS insured       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS grace_used_at date;

-- 4. Balance floor — prevent negative balance at DB level
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'balance_non_negative' AND conrelid = 'profiles'::regclass
  ) THEN
    ALTER TABLE profiles ADD CONSTRAINT balance_non_negative CHECK (balance >= 0);
  END IF;
END $$;

-- 5. Unique index on deposit tx hash — stronger idempotency
CREATE UNIQUE INDEX IF NOT EXISTS transactions_deposit_txhash
  ON transactions (description)
  WHERE type = 'deposit';

-- 6. push_subscriptions table (for web push notifications)
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint     text NOT NULL,
  subscription jsonb NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, endpoint)
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own push subscriptions" ON push_subscriptions;
CREATE POLICY "Users can manage own push subscriptions"
  ON push_subscriptions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 7. withdraw_balance function (called by /api/withdraw server-side)
--    Atomically deducts balance and logs transaction.
--    Returns 'ok' or raises exception if insufficient funds.
CREATE OR REPLACE FUNCTION withdraw_balance(
  p_user_id   uuid,
  p_amount    integer,
  p_desc      text
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  current_balance integer;
BEGIN
  SELECT balance INTO current_balance FROM profiles WHERE id = p_user_id FOR UPDATE;
  IF current_balance IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;
  IF current_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient balance: have %, need %', current_balance, p_amount;
  END IF;
  UPDATE profiles SET balance = balance - p_amount WHERE id = p_user_id;
  INSERT INTO transactions (user_id, amount, type, description)
    VALUES (p_user_id, -p_amount, 'withdrawal', p_desc);
  RETURN 'ok';
END;
$$;
