-- ============================================
-- PROFILE EXTRA FIELDS
-- ============================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS bio TEXT,
  ADD COLUMN IF NOT EXISTS gender TEXT,
  ADD COLUMN IF NOT EXISTS birth_date DATE;

-- Optional sane bounds for birth date.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_birth_date_valid'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_birth_date_valid
      CHECK (
        birth_date IS NULL
        OR (birth_date >= DATE '1900-01-01' AND birth_date <= CURRENT_DATE)
      );
  END IF;
END $$;
