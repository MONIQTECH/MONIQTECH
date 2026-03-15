-- ============================================================
-- Phase 2: Wallet & Transactions
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id         uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance    integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT USING (auth.uid() = id);

-- Auto-create profile on new user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO profiles (id) VALUES (NEW.id) ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Backfill existing users
INSERT INTO profiles (id)
  SELECT id FROM auth.users
  ON CONFLICT (id) DO NOTHING;

-- 2. transactions table (no FK to habits — simpler)
CREATE TABLE IF NOT EXISTS transactions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount      integer NOT NULL,
  type        text NOT NULL,
  description text NOT NULL DEFAULT '',
  habit_id    uuid,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS transactions_user_id_idx ON transactions (user_id, created_at DESC);

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own transactions" ON transactions;
CREATE POLICY "Users can view own transactions"
  ON transactions FOR SELECT USING (auth.uid() = user_id);

-- 3. deduct_penalty function
CREATE OR REPLACE FUNCTION deduct_penalty(
  p_user_id   uuid,
  p_habit_id  uuid,
  p_amount    integer,
  p_desc      text
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE profiles SET balance = balance - p_amount WHERE id = p_user_id;
  INSERT INTO transactions (user_id, amount, type, description, habit_id)
    VALUES (p_user_id, -p_amount, 'penalty', p_desc, p_habit_id);
  RETURN 'ok';
END;
$$;

-- 4. credit_balance function
CREATE OR REPLACE FUNCTION credit_balance(
  p_user_id   uuid,
  p_amount    integer,
  p_type      text,
  p_desc      text
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE profiles SET balance = balance + p_amount WHERE id = p_user_id;
  INSERT INTO transactions (user_id, amount, type, description)
    VALUES (p_user_id, p_amount, p_type, p_desc);
  RETURN 'ok';
END;
$$;
