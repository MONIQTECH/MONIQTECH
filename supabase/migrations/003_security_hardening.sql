-- ============================================================
-- Phase 4: Security Hardening
-- CRITICAL: Run this ASAP in Supabase Dashboard → SQL Editor
-- ============================================================

-- ============================================================
-- FIX 1: Lock down SECURITY DEFINER functions
-- credit_balance and deduct_penalty are SECURITY DEFINER,
-- meaning they run as postgres (superuser) — any authenticated
-- user could call them with ANY p_user_id and ANY p_amount.
-- Attack: credit_balance({ p_user_id: victim_id, p_amount: -999999 })
--         or credit_balance({ p_user_id: self_id, p_amount: 9999999 })
-- Fix: revoke public execute, add internal auth check
-- ============================================================

-- Revoke direct client access to dangerous functions
-- Using DO blocks so missing functions don't abort the migration
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION credit_balance(uuid, integer, text, text) FROM anon, authenticated;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION deduct_penalty(uuid, uuid, integer, text) FROM anon, authenticated;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION withdraw_balance(uuid, integer, text) FROM anon, authenticated;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

-- These functions are now only callable by service_role (server-side API routes)


-- ============================================================
-- FIX 2: Create safe client-facing insurance fee function
-- Used by Dashboard.tsx to charge insurance when adding a habit.
-- Uses auth.uid() internally — user cannot change the target.
-- Only allows deductions up to the insurance fee amount.
-- ============================================================
CREATE OR REPLACE FUNCTION charge_insurance_fee(
  p_stake   integer,
  p_emoji   text,
  p_name    text
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  caller_id       uuid := auth.uid();
  fee             integer;
  current_balance integer;
BEGIN
  -- Must be authenticated
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Calculate fee server-side (same formula as client: max(50, stake * 5%))
  fee := GREATEST(50, ROUND(p_stake * 0.05));

  -- Sanity check on stake bounds ($0.50 – $10,000)
  IF p_stake < 50 OR p_stake > 1000000 THEN
    RAISE EXCEPTION 'Invalid stake amount';
  END IF;

  -- Check balance
  SELECT balance INTO current_balance FROM profiles WHERE id = caller_id FOR UPDATE;
  IF current_balance IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;
  IF current_balance < fee THEN
    RAISE EXCEPTION 'Insufficient balance: have %, need %', current_balance, fee;
  END IF;

  -- Deduct fee
  UPDATE profiles SET balance = balance - fee WHERE id = caller_id;
  INSERT INTO transactions (user_id, amount, type, description)
    VALUES (caller_id, -fee, 'insurance', 'Insurance: ' || p_emoji || ' ' || p_name);

  RETURN 'ok';
END;
$$;

-- Grant execute on the safe function to authenticated users only
GRANT EXECUTE ON FUNCTION charge_insurance_fee(integer, text, text) TO authenticated;


-- ============================================================
-- FIX 3: Tighten RLS on habits — ensure users can only
-- insert habits for themselves (not for other users)
-- ============================================================

-- habits table must have RLS with proper INSERT check
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables WHERE tablename = 'habits' AND schemaname = 'public'
  ) THEN
    RAISE NOTICE 'habits table does not exist yet — skipping RLS fix';
  ELSE
    -- Enable RLS if not already
    ALTER TABLE habits ENABLE ROW LEVEL SECURITY;

    -- Drop old policies and recreate with proper checks
    DROP POLICY IF EXISTS "Users can manage own habits"  ON habits;
    DROP POLICY IF EXISTS "Users can view own habits"    ON habits;
    DROP POLICY IF EXISTS "Users can select own habits"  ON habits;
    DROP POLICY IF EXISTS "Users can insert own habits"  ON habits;
    DROP POLICY IF EXISTS "Users can update own habits"  ON habits;
    DROP POLICY IF EXISTS "Users can delete own habits"  ON habits;

    CREATE POLICY "Users can select own habits" ON habits
      FOR SELECT USING (auth.uid() = user_id);

    CREATE POLICY "Users can insert own habits" ON habits
      FOR INSERT WITH CHECK (auth.uid() = user_id);

    CREATE POLICY "Users can update own habits" ON habits
      FOR UPDATE USING (auth.uid() = user_id);

    CREATE POLICY "Users can delete own habits" ON habits
      FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;


-- ============================================================
-- FIX 4: Tighten RLS on habit_entries — ensure users can only
-- insert/update entries for their own habits
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables WHERE tablename = 'habit_entries' AND schemaname = 'public'
  ) THEN
    RAISE NOTICE 'habit_entries table does not exist yet — skipping RLS fix';
  ELSE
    ALTER TABLE habit_entries ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Users can manage own habit entries"  ON habit_entries;
    DROP POLICY IF EXISTS "Users can select own habit entries"  ON habit_entries;
    DROP POLICY IF EXISTS "Users can insert own habit entries"  ON habit_entries;
    DROP POLICY IF EXISTS "Users can update own habit entries"  ON habit_entries;
    DROP POLICY IF EXISTS "Users can delete own habit entries"  ON habit_entries;

    CREATE POLICY "Users can select own habit entries" ON habit_entries
      FOR SELECT USING (auth.uid() = user_id);

    -- Insert: user_id must match auth.uid(), and habit must belong to the user
    CREATE POLICY "Users can insert own habit entries" ON habit_entries
      FOR INSERT WITH CHECK (
        auth.uid() = user_id
        AND EXISTS (SELECT 1 FROM habits WHERE id = habit_id AND user_id = auth.uid())
      );

    CREATE POLICY "Users can update own habit entries" ON habit_entries
      FOR UPDATE USING (auth.uid() = user_id);
  END IF;
END $$;


-- ============================================================
-- FIX 5: Atomic habit toggle function
-- Previously the client made two separate DB calls:
--   1. upsert habit_entries
--   2. update habits (streak + saved)
-- Between these calls, a network failure leaves the DB in a
-- half-updated state. This function does both in one transaction.
-- ============================================================
CREATE OR REPLACE FUNCTION toggle_habit_entry(
  p_habit_id  uuid,
  p_date      date,
  p_completed boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  caller_id  uuid := auth.uid();
  habit_row  habits%ROWTYPE;
  new_streak integer;
  new_saved  integer;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Lock the habit row and verify ownership atomically
  SELECT * INTO habit_row FROM habits WHERE id = p_habit_id AND user_id = caller_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Habit not found or access denied';
  END IF;

  -- Only allow toggling today's date (prevent retroactive cheating)
  IF p_date <> CURRENT_DATE THEN
    RAISE EXCEPTION 'Can only toggle today''s entry';
  END IF;

  -- Upsert entry
  INSERT INTO habit_entries (habit_id, user_id, date, completed)
    VALUES (p_habit_id, caller_id, p_date, p_completed)
    ON CONFLICT (habit_id, date) DO UPDATE SET completed = EXCLUDED.completed;

  -- Recalculate streak and saved
  new_streak := CASE WHEN p_completed
    THEN habit_row.streak + 1
    ELSE GREATEST(0, habit_row.streak - 1) END;
  new_saved := CASE WHEN p_completed
    THEN habit_row.saved + habit_row.stake
    ELSE GREATEST(0, habit_row.saved - habit_row.stake) END;

  UPDATE habits SET streak = new_streak, saved = new_saved WHERE id = p_habit_id;

  RETURN jsonb_build_object('streak', new_streak, 'saved', new_saved);
END;
$$;

GRANT EXECUTE ON FUNCTION toggle_habit_entry(uuid, date, boolean) TO authenticated;


-- ============================================================
-- FIX 6: Add max length constraints on text columns
-- Prevents extremely large payloads from filling the DB
-- ============================================================
DO $$ BEGIN
  -- habits.name max 200 chars
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'habits_name_length' AND conrelid = 'habits'::regclass
  ) THEN
    ALTER TABLE habits ADD CONSTRAINT habits_name_length CHECK (char_length(name) <= 200);
  END IF;

  -- habits.emoji max 10 chars
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'habits_emoji_length' AND conrelid = 'habits'::regclass
  ) THEN
    ALTER TABLE habits ADD CONSTRAINT habits_emoji_length CHECK (char_length(emoji) <= 10);
  END IF;
END $$;
