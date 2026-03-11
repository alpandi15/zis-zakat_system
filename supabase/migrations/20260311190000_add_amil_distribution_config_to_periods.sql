-- Store amil distribution configuration per period
ALTER TABLE public.periods
  ADD COLUMN IF NOT EXISTS amil_distribution_mode TEXT NOT NULL DEFAULT 'percentage',
  ADD COLUMN IF NOT EXISTS amil_share_factor NUMERIC NOT NULL DEFAULT 0.5;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'periods_amil_distribution_mode_check'
      AND conrelid = 'public.periods'::regclass
  ) THEN
    ALTER TABLE public.periods
      ADD CONSTRAINT periods_amil_distribution_mode_check
      CHECK (amil_distribution_mode IN ('percentage', 'proportional_with_factor'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'periods_amil_share_factor_check'
      AND conrelid = 'public.periods'::regclass
  ) THEN
    ALTER TABLE public.periods
      ADD CONSTRAINT periods_amil_share_factor_check
      CHECK (amil_share_factor >= 0 AND amil_share_factor <= 1);
  END IF;
END $$;
