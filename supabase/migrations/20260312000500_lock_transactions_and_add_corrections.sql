-- Lock transactions to calculation batch + correction metadata/guards

-- 1) Add lock/correction columns to transaction headers
ALTER TABLE public.zakat_fitrah_transactions
  ADD COLUMN IF NOT EXISTS locked_batch_id UUID REFERENCES public.distribution_calculation_batches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_void BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS void_reason TEXT,
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS voided_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS correction_of_transaction_id UUID REFERENCES public.zakat_fitrah_transactions(id) ON DELETE SET NULL;

ALTER TABLE public.zakat_mal_transactions
  ADD COLUMN IF NOT EXISTS locked_batch_id UUID REFERENCES public.distribution_calculation_batches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_void BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS void_reason TEXT,
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS voided_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS correction_of_transaction_id UUID REFERENCES public.zakat_mal_transactions(id) ON DELETE SET NULL;

ALTER TABLE public.fidyah_transactions
  ADD COLUMN IF NOT EXISTS locked_batch_id UUID REFERENCES public.distribution_calculation_batches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_void BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS void_reason TEXT,
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS voided_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS correction_of_transaction_id UUID REFERENCES public.fidyah_transactions(id) ON DELETE SET NULL;

-- 2) Add void metadata for fitrah items, then switch unique constraint to partial unique (active rows only)
ALTER TABLE public.zakat_fitrah_transaction_items
  ADD COLUMN IF NOT EXISTS is_void BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE public.zakat_fitrah_transaction_items
  DROP CONSTRAINT IF EXISTS zakat_fitrah_transaction_items_muzakki_member_id_period_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_zakat_fitrah_items_member_period_active_unique
  ON public.zakat_fitrah_transaction_items (muzakki_member_id, period_id)
  WHERE is_void = false;

-- 3) Helpful indexes
CREATE INDEX IF NOT EXISTS idx_zakat_fitrah_transactions_locked_batch_id
  ON public.zakat_fitrah_transactions (locked_batch_id);
CREATE INDEX IF NOT EXISTS idx_zakat_fitrah_transactions_is_void
  ON public.zakat_fitrah_transactions (is_void)
  WHERE is_void = true;

CREATE INDEX IF NOT EXISTS idx_zakat_mal_transactions_locked_batch_id
  ON public.zakat_mal_transactions (locked_batch_id);
CREATE INDEX IF NOT EXISTS idx_zakat_mal_transactions_is_void
  ON public.zakat_mal_transactions (is_void)
  WHERE is_void = true;

CREATE INDEX IF NOT EXISTS idx_fidyah_transactions_locked_batch_id
  ON public.fidyah_transactions (locked_batch_id);
CREATE INDEX IF NOT EXISTS idx_fidyah_transactions_is_void
  ON public.fidyah_transactions (is_void)
  WHERE is_void = true;

CREATE INDEX IF NOT EXISTS idx_zakat_fitrah_items_is_void
  ON public.zakat_fitrah_transaction_items (is_void)
  WHERE is_void = true;

-- 4) Guard transaction mutation once row is in locked/distributed batch
CREATE OR REPLACE FUNCTION public.guard_locked_transaction_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _batch_id UUID;
  _batch_status TEXT;
  _old_sanitized JSONB;
  _new_sanitized JSONB;
BEGIN
  IF TG_OP = 'DELETE' THEN
    _batch_id := OLD.locked_batch_id;
  ELSE
    _batch_id := COALESCE(OLD.locked_batch_id, NEW.locked_batch_id);
  END IF;

  IF _batch_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  SELECT b.status INTO _batch_status
  FROM public.distribution_calculation_batches b
  WHERE b.id = _batch_id;

  IF COALESCE(_batch_status, 'locked') NOT IN ('locked', 'distributed') THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Transaksi sudah masuk batch % dan tidak bisa dihapus.', _batch_status;
  END IF;

  -- Allow system to assign lock id from NULL -> batch id without changing business payload
  IF OLD.locked_batch_id IS NULL AND NEW.locked_batch_id IS NOT NULL THEN
    _old_sanitized := to_jsonb(OLD) - ARRAY['locked_batch_id', 'updated_at'];
    _new_sanitized := to_jsonb(NEW) - ARRAY['locked_batch_id', 'updated_at'];

    IF _old_sanitized IS DISTINCT FROM _new_sanitized THEN
      RAISE EXCEPTION 'Transaksi sudah batch lock. Hanya penguncian sistem yang diizinkan.';
    END IF;

    RETURN NEW;
  END IF;

  -- For locked transactions, only allow void metadata update (not financial fields)
  _old_sanitized := to_jsonb(OLD) - ARRAY['is_void', 'void_reason', 'voided_at', 'voided_by', 'updated_at'];
  _new_sanitized := to_jsonb(NEW) - ARRAY['is_void', 'void_reason', 'voided_at', 'voided_by', 'updated_at'];

  IF _old_sanitized IS DISTINCT FROM _new_sanitized THEN
    RAISE EXCEPTION 'Transaksi sudah batch lock. Edit nilai tidak diizinkan, gunakan proses koreksi (void + transaksi pengganti).';
  END IF;

  IF OLD.is_void = true AND NEW.is_void = false THEN
    RAISE EXCEPTION 'Transaksi yang sudah di-void tidak bisa diaktifkan kembali.';
  END IF;

  IF NEW.is_void = true AND OLD.is_void = false THEN
    IF NEW.void_reason IS NULL OR btrim(NEW.void_reason) = '' THEN
      RAISE EXCEPTION 'Alasan koreksi (void_reason) wajib diisi.';
    END IF;

    IF NEW.voided_at IS NULL THEN
      NEW.voided_at := now();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 5) Guard fitrah item mutation via parent transaction lock status
CREATE OR REPLACE FUNCTION public.guard_locked_zakat_fitrah_item_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _transaction_id UUID;
  _batch_status TEXT;
  _old_sanitized JSONB;
  _new_sanitized JSONB;
BEGIN
  IF TG_OP = 'DELETE' THEN
    _transaction_id := OLD.transaction_id;
  ELSE
    _transaction_id := COALESCE(OLD.transaction_id, NEW.transaction_id);
  END IF;

  SELECT b.status INTO _batch_status
  FROM public.zakat_fitrah_transactions t
  LEFT JOIN public.distribution_calculation_batches b ON b.id = t.locked_batch_id
  WHERE t.id = _transaction_id;

  IF COALESCE(_batch_status, '') NOT IN ('locked', 'distributed') THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Item transaksi zakat fitrah sudah masuk batch lock dan tidak bisa dihapus.';
  END IF;

  _old_sanitized := to_jsonb(OLD) - ARRAY['is_void', 'voided_at'];
  _new_sanitized := to_jsonb(NEW) - ARRAY['is_void', 'voided_at'];

  IF _old_sanitized IS DISTINCT FROM _new_sanitized THEN
    RAISE EXCEPTION 'Item transaksi zakat fitrah sudah batch lock. Edit nilai tidak diizinkan.';
  END IF;

  IF OLD.is_void = true AND NEW.is_void = false THEN
    RAISE EXCEPTION 'Item transaksi yang sudah di-void tidak bisa diaktifkan kembali.';
  END IF;

  IF NEW.is_void = true AND OLD.is_void = false AND NEW.voided_at IS NULL THEN
    NEW.voided_at := now();
  END IF;

  RETURN NEW;
END;
$$;

-- 6) Attach guards
DROP TRIGGER IF EXISTS guard_locked_zakat_fitrah_transactions_before_mutation ON public.zakat_fitrah_transactions;
CREATE TRIGGER guard_locked_zakat_fitrah_transactions_before_mutation
  BEFORE UPDATE OR DELETE ON public.zakat_fitrah_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_locked_transaction_mutation();

DROP TRIGGER IF EXISTS guard_locked_zakat_mal_transactions_before_mutation ON public.zakat_mal_transactions;
CREATE TRIGGER guard_locked_zakat_mal_transactions_before_mutation
  BEFORE UPDATE OR DELETE ON public.zakat_mal_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_locked_transaction_mutation();

DROP TRIGGER IF EXISTS guard_locked_fidyah_transactions_before_mutation ON public.fidyah_transactions;
CREATE TRIGGER guard_locked_fidyah_transactions_before_mutation
  BEFORE UPDATE OR DELETE ON public.fidyah_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_locked_transaction_mutation();

DROP TRIGGER IF EXISTS guard_locked_zakat_fitrah_items_before_mutation ON public.zakat_fitrah_transaction_items;
CREATE TRIGGER guard_locked_zakat_fitrah_items_before_mutation
  BEFORE UPDATE OR DELETE ON public.zakat_fitrah_transaction_items
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_locked_zakat_fitrah_item_mutation();
