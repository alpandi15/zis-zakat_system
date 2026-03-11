-- Batch lock/snapshot for distribution calculations while collections are still ongoing

CREATE TABLE IF NOT EXISTS public.distribution_calculation_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id UUID NOT NULL REFERENCES public.periods(id) ON DELETE RESTRICT,
  batch_no INTEGER NOT NULL DEFAULT 0,
  batch_code TEXT NOT NULL DEFAULT '',
  amil_distribution_mode TEXT NOT NULL DEFAULT 'percentage',
  amil_share_factor NUMERIC NOT NULL DEFAULT 0.5,
  status TEXT NOT NULL DEFAULT 'locked',
  notes TEXT,
  total_allocated_cash NUMERIC NOT NULL DEFAULT 0,
  total_allocated_rice_kg NUMERIC NOT NULL DEFAULT 0,
  total_allocated_food_kg NUMERIC NOT NULL DEFAULT 0,
  locked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  locked_by UUID REFERENCES auth.users(id),
  distributed_at TIMESTAMP WITH TIME ZONE,
  distributed_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT distribution_calculation_batches_status_check
    CHECK (status IN ('locked', 'distributed', 'cancelled')),
  CONSTRAINT distribution_calculation_batches_mode_check
    CHECK (amil_distribution_mode IN ('percentage', 'proportional_with_factor')),
  CONSTRAINT distribution_calculation_batches_factor_check
    CHECK (amil_share_factor >= 0 AND amil_share_factor <= 1),
  CONSTRAINT distribution_calculation_batches_batch_no_positive_check
    CHECK (batch_no > 0),
  CONSTRAINT distribution_calculation_batches_period_batch_no_key UNIQUE (period_id, batch_no),
  CONSTRAINT distribution_calculation_batches_period_batch_code_key UNIQUE (period_id, batch_code)
);

CREATE TABLE IF NOT EXISTS public.distribution_calculation_batch_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.distribution_calculation_batches(id) ON DELETE CASCADE,
  period_id UUID NOT NULL REFERENCES public.periods(id) ON DELETE RESTRICT,
  mustahik_id UUID NOT NULL REFERENCES public.mustahik(id) ON DELETE RESTRICT,
  fund_category public.fund_category NOT NULL,
  is_amil BOOLEAN NOT NULL DEFAULT false,
  asnaf_code TEXT,
  priority public.priority_level,
  cash_amount NUMERIC NOT NULL DEFAULT 0,
  rice_amount_kg NUMERIC NOT NULL DEFAULT 0,
  food_amount_kg NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT distribution_calculation_batch_items_amount_non_negative_check
    CHECK (cash_amount >= 0 AND rice_amount_kg >= 0 AND food_amount_kg >= 0),
  CONSTRAINT distribution_calculation_batch_items_unique_key
    UNIQUE (batch_id, mustahik_id, fund_category)
);

CREATE INDEX IF NOT EXISTS idx_distribution_calculation_batches_period_id
  ON public.distribution_calculation_batches(period_id);
CREATE INDEX IF NOT EXISTS idx_distribution_calculation_batches_status
  ON public.distribution_calculation_batches(status);
CREATE INDEX IF NOT EXISTS idx_distribution_calculation_batch_items_batch_id
  ON public.distribution_calculation_batch_items(batch_id);
CREATE INDEX IF NOT EXISTS idx_distribution_calculation_batch_items_period_id
  ON public.distribution_calculation_batch_items(period_id);
CREATE INDEX IF NOT EXISTS idx_distribution_calculation_batch_items_mustahik_id
  ON public.distribution_calculation_batch_items(mustahik_id);

CREATE OR REPLACE FUNCTION public.set_distribution_calculation_batch_meta()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.batch_no IS NULL OR NEW.batch_no <= 0 THEN
    PERFORM pg_advisory_xact_lock(62001, hashtext(NEW.period_id::text));

    SELECT COALESCE(MAX(b.batch_no), 0) + 1
    INTO NEW.batch_no
    FROM public.distribution_calculation_batches b
    WHERE b.period_id = NEW.period_id;
  END IF;

  IF NEW.batch_code IS NULL OR btrim(NEW.batch_code) = '' THEN
    NEW.batch_code := 'BATCH-' || LPAD(NEW.batch_no::text, 3, '0');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_distribution_calculation_batch_meta_before_insert
  ON public.distribution_calculation_batches;
CREATE TRIGGER set_distribution_calculation_batch_meta_before_insert
  BEFORE INSERT ON public.distribution_calculation_batches
  FOR EACH ROW EXECUTE FUNCTION public.set_distribution_calculation_batch_meta();

DROP TRIGGER IF EXISTS update_distribution_calculation_batches_updated_at
  ON public.distribution_calculation_batches;
CREATE TRIGGER update_distribution_calculation_batches_updated_at
  BEFORE UPDATE ON public.distribution_calculation_batches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.distribution_calculation_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.distribution_calculation_batch_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authorized roles can view distribution calculation batches" ON public.distribution_calculation_batches;
CREATE POLICY "Authorized roles can view distribution calculation batches"
  ON public.distribution_calculation_batches FOR SELECT
  USING (public.has_any_role(auth.uid(), ARRAY['super_admin', 'chairman', 'treasurer', 'zakat_officer', 'fidyah_officer']::public.app_role[]));

DROP POLICY IF EXISTS "Admins and Zakat Officers can create distribution calculation batches" ON public.distribution_calculation_batches;
CREATE POLICY "Admins and Zakat Officers can create distribution calculation batches"
  ON public.distribution_calculation_batches FOR INSERT
  WITH CHECK (
    public.has_any_role(auth.uid(), ARRAY['super_admin', 'zakat_officer']::public.app_role[])
    AND public.is_period_active(period_id)
  );

DROP POLICY IF EXISTS "Admins and Zakat Officers can update distribution calculation batches" ON public.distribution_calculation_batches;
CREATE POLICY "Admins and Zakat Officers can update distribution calculation batches"
  ON public.distribution_calculation_batches FOR UPDATE
  USING (
    public.has_any_role(auth.uid(), ARRAY['super_admin', 'zakat_officer']::public.app_role[])
    AND public.is_period_active(period_id)
  )
  WITH CHECK (
    public.has_any_role(auth.uid(), ARRAY['super_admin', 'zakat_officer']::public.app_role[])
    AND public.is_period_active(period_id)
  );

DROP POLICY IF EXISTS "Admins can delete distribution calculation batches" ON public.distribution_calculation_batches;
CREATE POLICY "Admins can delete distribution calculation batches"
  ON public.distribution_calculation_batches FOR DELETE
  USING (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    AND public.is_period_active(period_id)
  );

DROP POLICY IF EXISTS "Authorized roles can view distribution calculation batch items" ON public.distribution_calculation_batch_items;
CREATE POLICY "Authorized roles can view distribution calculation batch items"
  ON public.distribution_calculation_batch_items FOR SELECT
  USING (public.has_any_role(auth.uid(), ARRAY['super_admin', 'chairman', 'treasurer', 'zakat_officer', 'fidyah_officer']::public.app_role[]));

DROP POLICY IF EXISTS "Admins and Zakat Officers can create distribution calculation batch items" ON public.distribution_calculation_batch_items;
CREATE POLICY "Admins and Zakat Officers can create distribution calculation batch items"
  ON public.distribution_calculation_batch_items FOR INSERT
  WITH CHECK (
    public.has_any_role(auth.uid(), ARRAY['super_admin', 'zakat_officer']::public.app_role[])
    AND public.is_period_active(period_id)
  );

DROP POLICY IF EXISTS "Admins and Zakat Officers can update distribution calculation batch items" ON public.distribution_calculation_batch_items;
CREATE POLICY "Admins and Zakat Officers can update distribution calculation batch items"
  ON public.distribution_calculation_batch_items FOR UPDATE
  USING (
    public.has_any_role(auth.uid(), ARRAY['super_admin', 'zakat_officer']::public.app_role[])
    AND public.is_period_active(period_id)
  )
  WITH CHECK (
    public.has_any_role(auth.uid(), ARRAY['super_admin', 'zakat_officer']::public.app_role[])
    AND public.is_period_active(period_id)
  );

DROP POLICY IF EXISTS "Admins can delete distribution calculation batch items" ON public.distribution_calculation_batch_items;
CREATE POLICY "Admins can delete distribution calculation batch items"
  ON public.distribution_calculation_batch_items FOR DELETE
  USING (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    AND public.is_period_active(period_id)
  );
