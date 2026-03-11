-- Add sequential transaction numbers per transaction type (scoped per period)

-- 1) Add columns (temporary nullable for backfill safety)
ALTER TABLE public.zakat_fitrah_transactions
  ADD COLUMN IF NOT EXISTS transaction_no INTEGER;

ALTER TABLE public.fidyah_transactions
  ADD COLUMN IF NOT EXISTS transaction_no INTEGER;

ALTER TABLE public.zakat_mal_transactions
  ADD COLUMN IF NOT EXISTS transaction_no INTEGER;

-- 2) Backfill existing rows per period ordered by transaction date
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY period_id
      ORDER BY transaction_date ASC, created_at ASC, id ASC
    ) AS rn
  FROM public.zakat_fitrah_transactions
)
UPDATE public.zakat_fitrah_transactions t
SET transaction_no = r.rn
FROM ranked r
WHERE t.id = r.id
  AND (t.transaction_no IS NULL OR t.transaction_no <= 0);

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY period_id
      ORDER BY transaction_date ASC, created_at ASC, id ASC
    ) AS rn
  FROM public.fidyah_transactions
)
UPDATE public.fidyah_transactions t
SET transaction_no = r.rn
FROM ranked r
WHERE t.id = r.id
  AND (t.transaction_no IS NULL OR t.transaction_no <= 0);

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY period_id
      ORDER BY transaction_date ASC, created_at ASC, id ASC
    ) AS rn
  FROM public.zakat_mal_transactions
)
UPDATE public.zakat_mal_transactions t
SET transaction_no = r.rn
FROM ranked r
WHERE t.id = r.id
  AND (t.transaction_no IS NULL OR t.transaction_no <= 0);

-- 3) Make columns required and trigger-friendly (default 0, trigger will assign > 0)
ALTER TABLE public.zakat_fitrah_transactions
  ALTER COLUMN transaction_no SET DEFAULT 0,
  ALTER COLUMN transaction_no SET NOT NULL;

ALTER TABLE public.fidyah_transactions
  ALTER COLUMN transaction_no SET DEFAULT 0,
  ALTER COLUMN transaction_no SET NOT NULL;

ALTER TABLE public.zakat_mal_transactions
  ALTER COLUMN transaction_no SET DEFAULT 0,
  ALTER COLUMN transaction_no SET NOT NULL;

-- 4) Add checks and uniqueness (period + transaction_no)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'zakat_fitrah_transactions_transaction_no_positive_check'
      AND conrelid = 'public.zakat_fitrah_transactions'::regclass
  ) THEN
    ALTER TABLE public.zakat_fitrah_transactions
      ADD CONSTRAINT zakat_fitrah_transactions_transaction_no_positive_check
      CHECK (transaction_no > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'zakat_fitrah_transactions_period_transaction_no_key'
      AND conrelid = 'public.zakat_fitrah_transactions'::regclass
  ) THEN
    ALTER TABLE public.zakat_fitrah_transactions
      ADD CONSTRAINT zakat_fitrah_transactions_period_transaction_no_key
      UNIQUE (period_id, transaction_no);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fidyah_transactions_transaction_no_positive_check'
      AND conrelid = 'public.fidyah_transactions'::regclass
  ) THEN
    ALTER TABLE public.fidyah_transactions
      ADD CONSTRAINT fidyah_transactions_transaction_no_positive_check
      CHECK (transaction_no > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fidyah_transactions_period_transaction_no_key'
      AND conrelid = 'public.fidyah_transactions'::regclass
  ) THEN
    ALTER TABLE public.fidyah_transactions
      ADD CONSTRAINT fidyah_transactions_period_transaction_no_key
      UNIQUE (period_id, transaction_no);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'zakat_mal_transactions_transaction_no_positive_check'
      AND conrelid = 'public.zakat_mal_transactions'::regclass
  ) THEN
    ALTER TABLE public.zakat_mal_transactions
      ADD CONSTRAINT zakat_mal_transactions_transaction_no_positive_check
      CHECK (transaction_no > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'zakat_mal_transactions_period_transaction_no_key'
      AND conrelid = 'public.zakat_mal_transactions'::regclass
  ) THEN
    ALTER TABLE public.zakat_mal_transactions
      ADD CONSTRAINT zakat_mal_transactions_period_transaction_no_key
      UNIQUE (period_id, transaction_no);
  END IF;
END $$;

-- 5) Trigger functions for auto numbering
CREATE OR REPLACE FUNCTION public.set_zakat_fitrah_transaction_no()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.transaction_no IS NULL OR NEW.transaction_no <= 0 THEN
    PERFORM pg_advisory_xact_lock(61001, hashtext(NEW.period_id::text));

    SELECT COALESCE(MAX(t.transaction_no), 0) + 1
    INTO NEW.transaction_no
    FROM public.zakat_fitrah_transactions t
    WHERE t.period_id = NEW.period_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_fidyah_transaction_no()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.transaction_no IS NULL OR NEW.transaction_no <= 0 THEN
    PERFORM pg_advisory_xact_lock(61002, hashtext(NEW.period_id::text));

    SELECT COALESCE(MAX(t.transaction_no), 0) + 1
    INTO NEW.transaction_no
    FROM public.fidyah_transactions t
    WHERE t.period_id = NEW.period_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_zakat_mal_transaction_no()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.transaction_no IS NULL OR NEW.transaction_no <= 0 THEN
    PERFORM pg_advisory_xact_lock(61003, hashtext(NEW.period_id::text));

    SELECT COALESCE(MAX(t.transaction_no), 0) + 1
    INTO NEW.transaction_no
    FROM public.zakat_mal_transactions t
    WHERE t.period_id = NEW.period_id;
  END IF;

  RETURN NEW;
END;
$$;

-- 6) Attach triggers
DROP TRIGGER IF EXISTS set_zakat_fitrah_transaction_no_before_insert ON public.zakat_fitrah_transactions;
CREATE TRIGGER set_zakat_fitrah_transaction_no_before_insert
  BEFORE INSERT ON public.zakat_fitrah_transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_zakat_fitrah_transaction_no();

DROP TRIGGER IF EXISTS set_fidyah_transaction_no_before_insert ON public.fidyah_transactions;
CREATE TRIGGER set_fidyah_transaction_no_before_insert
  BEFORE INSERT ON public.fidyah_transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_fidyah_transaction_no();

DROP TRIGGER IF EXISTS set_zakat_mal_transaction_no_before_insert ON public.zakat_mal_transactions;
CREATE TRIGGER set_zakat_mal_transaction_no_before_insert
  BEFORE INSERT ON public.zakat_mal_transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_zakat_mal_transaction_no();
