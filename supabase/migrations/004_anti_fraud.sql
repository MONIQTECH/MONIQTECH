-- ============================================================
-- Phase 5: Anti-Fraud & Bot Protection
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================================


-- ============================================================
-- FIX 1: Max 20 habits per user
-- Prevents bots/abusers from creating thousands of habits
-- (resource exhaustion, DB bloat, cron overload)
-- ============================================================
CREATE OR REPLACE FUNCTION check_habit_limit()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  habit_count integer;
BEGIN
  SELECT COUNT(*) INTO habit_count FROM habits WHERE user_id = NEW.user_id;
  IF habit_count >= 20 THEN
    RAISE EXCEPTION 'Habit limit reached. Maximum 20 habits per account.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_habit_limit ON habits;
CREATE TRIGGER enforce_habit_limit
  BEFORE INSERT ON habits
  FOR EACH ROW EXECUTE FUNCTION check_habit_limit();


-- ============================================================
-- FIX 2: Withdraw cooldown — track last deposit time
-- Fraudsters deposit and immediately withdraw to test stolen cards.
-- We enforce: cannot withdraw within 1 hour of last deposit.
-- The API route checks this column before processing withdrawal.
-- ============================================================
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS last_deposit_at timestamptz;

-- Update last_deposit_at whenever a deposit transaction is inserted
CREATE OR REPLACE FUNCTION update_last_deposit_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.type = 'deposit' AND NEW.amount > 0 THEN
    UPDATE profiles SET last_deposit_at = now() WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_deposit_transaction ON transactions;
CREATE TRIGGER on_deposit_transaction
  AFTER INSERT ON transactions
  FOR EACH ROW EXECUTE FUNCTION update_last_deposit_at();


-- ============================================================
-- FIX 3: Suspicious activity log
-- Centralised table to record fraud signals for review.
-- All inserts go through the API (service role only).
-- ============================================================
CREATE TABLE IF NOT EXISTS fraud_signals (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ip          text,
  event       text NOT NULL,  -- 'deposit_flood', 'withdraw_flood', 'habit_limit', etc.
  details     jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fraud_signals_user_id_idx  ON fraud_signals (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS fraud_signals_event_idx    ON fraud_signals (event, created_at DESC);

-- Only service role can read/write fraud signals
ALTER TABLE fraud_signals ENABLE ROW LEVEL SECURITY;
-- No policies = only service_role (bypasses RLS) can access
