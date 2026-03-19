ALTER TABLE public.periods
  ADD COLUMN IF NOT EXISTS packaging_amil_count_override INTEGER,
  ADD COLUMN IF NOT EXISTS packaging_non_amil_count_override INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'periods_packaging_amil_count_override_check'
  ) THEN
    ALTER TABLE public.periods
      ADD CONSTRAINT periods_packaging_amil_count_override_check
      CHECK (packaging_amil_count_override IS NULL OR packaging_amil_count_override >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'periods_packaging_non_amil_count_override_check'
  ) THEN
    ALTER TABLE public.periods
      ADD CONSTRAINT periods_packaging_non_amil_count_override_check
      CHECK (packaging_non_amil_count_override IS NULL OR packaging_non_amil_count_override >= 0);
  END IF;
END $$;
