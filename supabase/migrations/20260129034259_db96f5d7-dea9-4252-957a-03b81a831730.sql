-- =====================================================
-- SECURITY HARDENING MIGRATION
-- Fixes: PUBLIC_DATA_EXPOSURE, DEFINER_OR_RPC_BYPASS
-- =====================================================

-- =====================================================
-- PART 1: RESTRICT OVERLY PERMISSIVE SELECT POLICIES
-- =====================================================

-- 1.1 fund_ledger - restrict to authorized roles only
DROP POLICY IF EXISTS "Authenticated users can view fund ledger" ON public.fund_ledger;
CREATE POLICY "Authorized roles can view fund ledger"
ON public.fund_ledger FOR SELECT
USING (has_any_role(auth.uid(), ARRAY['super_admin', 'chairman', 'treasurer', 'zakat_officer', 'fidyah_officer']::app_role[]));

-- 1.2 fidyah_distributions - restrict to authorized roles only
DROP POLICY IF EXISTS "Authenticated users can view fidyah distributions" ON public.fidyah_distributions;
CREATE POLICY "Authorized roles can view fidyah distributions"
ON public.fidyah_distributions FOR SELECT
USING (has_any_role(auth.uid(), ARRAY['super_admin', 'chairman', 'treasurer', 'zakat_officer', 'fidyah_officer']::app_role[]));

-- 1.3 zakat_distributions - restrict to authorized roles only
DROP POLICY IF EXISTS "Authenticated users can view zakat distributions" ON public.zakat_distributions;
CREATE POLICY "Authorized roles can view zakat distributions"
ON public.zakat_distributions FOR SELECT
USING (has_any_role(auth.uid(), ARRAY['super_admin', 'chairman', 'treasurer', 'zakat_officer', 'fidyah_officer']::app_role[]));

-- 1.4 zakat_fitrah_transactions - restrict to authorized roles only
DROP POLICY IF EXISTS "Authenticated users can view zakat fitrah transactions" ON public.zakat_fitrah_transactions;
CREATE POLICY "Authorized roles can view zakat fitrah transactions"
ON public.zakat_fitrah_transactions FOR SELECT
USING (has_any_role(auth.uid(), ARRAY['super_admin', 'chairman', 'treasurer', 'zakat_officer', 'fidyah_officer']::app_role[]));

-- 1.5 zakat_fitrah_transaction_items - restrict to authorized roles only
DROP POLICY IF EXISTS "Authenticated users can view zakat fitrah transaction items" ON public.zakat_fitrah_transaction_items;
CREATE POLICY "Authorized roles can view zakat fitrah transaction items"
ON public.zakat_fitrah_transaction_items FOR SELECT
USING (has_any_role(auth.uid(), ARRAY['super_admin', 'chairman', 'treasurer', 'zakat_officer', 'fidyah_officer']::app_role[]));

-- 1.6 fidyah_transactions - restrict to authorized roles only
DROP POLICY IF EXISTS "Authenticated users can view fidyah transactions" ON public.fidyah_transactions;
CREATE POLICY "Authorized roles can view fidyah transactions"
ON public.fidyah_transactions FOR SELECT
USING (has_any_role(auth.uid(), ARRAY['super_admin', 'chairman', 'treasurer', 'zakat_officer', 'fidyah_officer']::app_role[]));

-- 1.7 zakat_mal_transactions - restrict to authorized roles only
DROP POLICY IF EXISTS "Authenticated users can view zakat mal transactions" ON public.zakat_mal_transactions;
CREATE POLICY "Authorized roles can view zakat mal transactions"
ON public.zakat_mal_transactions FOR SELECT
USING (has_any_role(auth.uid(), ARRAY['super_admin', 'chairman', 'treasurer', 'zakat_officer', 'fidyah_officer']::app_role[]));

-- 1.8 muzakki - restrict to authorized roles only
DROP POLICY IF EXISTS "Authenticated users can view muzakki" ON public.muzakki;
CREATE POLICY "Authorized roles can view muzakki"
ON public.muzakki FOR SELECT
USING (has_any_role(auth.uid(), ARRAY['super_admin', 'chairman', 'treasurer', 'zakat_officer', 'fidyah_officer']::app_role[]));

-- 1.9 muzakki_members - restrict to authorized roles only
DROP POLICY IF EXISTS "Authenticated users can view muzakki members" ON public.muzakki_members;
CREATE POLICY "Authorized roles can view muzakki members"
ON public.muzakki_members FOR SELECT
USING (has_any_role(auth.uid(), ARRAY['super_admin', 'chairman', 'treasurer', 'zakat_officer', 'fidyah_officer']::app_role[]));

-- 1.10 mustahik - restrict to authorized roles only
DROP POLICY IF EXISTS "Authenticated users can view mustahik" ON public.mustahik;
CREATE POLICY "Authorized roles can view mustahik"
ON public.mustahik FOR SELECT
USING (has_any_role(auth.uid(), ARRAY['super_admin', 'chairman', 'treasurer', 'zakat_officer', 'fidyah_officer']::app_role[]));

-- =====================================================
-- PART 2: SECURE SECURITY DEFINER FUNCTIONS
-- Add internal authorization checks
-- =====================================================

-- 2.1 Secure get_fund_balance with role check
CREATE OR REPLACE FUNCTION public.get_fund_balance(_period_id uuid, _category fund_category)
RETURNS TABLE(total_cash numeric, total_rice_kg numeric, total_food_kg numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Authorization check: only authorized roles can access
  IF NOT has_any_role(auth.uid(), ARRAY['super_admin', 'chairman', 'treasurer', 'zakat_officer', 'fidyah_officer']::app_role[]) THEN
    RAISE EXCEPTION 'Access denied: insufficient permissions';
  END IF;

  RETURN QUERY
  SELECT 
    COALESCE(SUM(fl.amount_cash), 0) AS total_cash,
    COALESCE(SUM(fl.amount_rice_kg), 0) AS total_rice_kg,
    COALESCE(SUM(fl.amount_food_kg), 0) AS total_food_kg
  FROM public.fund_ledger fl
  WHERE fl.period_id = _period_id
    AND fl.category = _category;
END;
$$;

-- 2.2 Secure get_all_fund_balances with role check
CREATE OR REPLACE FUNCTION public.get_all_fund_balances(_period_id uuid)
RETURNS TABLE(category fund_category, total_cash numeric, total_rice_kg numeric, total_food_kg numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Authorization check: only authorized roles can access
  IF NOT has_any_role(auth.uid(), ARRAY['super_admin', 'chairman', 'treasurer', 'zakat_officer', 'fidyah_officer']::app_role[]) THEN
    RAISE EXCEPTION 'Access denied: insufficient permissions';
  END IF;

  RETURN QUERY
  SELECT 
    fl.category,
    COALESCE(SUM(fl.amount_cash), 0) AS total_cash,
    COALESCE(SUM(fl.amount_rice_kg), 0) AS total_rice_kg,
    COALESCE(SUM(fl.amount_food_kg), 0) AS total_food_kg
  FROM public.fund_ledger fl
  WHERE fl.period_id = _period_id
  GROUP BY fl.category;
END;
$$;

-- 2.3 Secure check_fund_availability with role check
CREATE OR REPLACE FUNCTION public.check_fund_availability(
  _period_id uuid, 
  _category fund_category, 
  _cash_needed numeric DEFAULT 0, 
  _rice_needed numeric DEFAULT 0, 
  _food_needed numeric DEFAULT 0
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _balance RECORD;
BEGIN
  -- Authorization check: only authorized roles can check fund availability
  IF NOT has_any_role(auth.uid(), ARRAY['super_admin', 'chairman', 'treasurer', 'zakat_officer', 'fidyah_officer']::app_role[]) THEN
    RAISE EXCEPTION 'Access denied: insufficient permissions';
  END IF;

  -- Get balance directly without calling get_fund_balance to avoid nested auth checks
  SELECT 
    COALESCE(SUM(fl.amount_cash), 0) AS total_cash,
    COALESCE(SUM(fl.amount_rice_kg), 0) AS total_rice_kg,
    COALESCE(SUM(fl.amount_food_kg), 0) AS total_food_kg
  INTO _balance
  FROM public.fund_ledger fl
  WHERE fl.period_id = _period_id
    AND fl.category = _category;
  
  -- Check if sufficient balance exists
  IF _cash_needed > 0 AND _balance.total_cash < _cash_needed THEN
    RETURN FALSE;
  END IF;
  
  IF _rice_needed > 0 AND _balance.total_rice_kg < _rice_needed THEN
    RETURN FALSE;
  END IF;
  
  IF _food_needed > 0 AND _balance.total_food_kg < _food_needed THEN
    RETURN FALSE;
  END IF;
  
  RETURN TRUE;
END;
$$;

-- =====================================================
-- PART 3: CREATE PUBLIC TV DASHBOARD FUNCTION
-- Isolated read-only function for public display
-- =====================================================

-- 3.1 Create a public function for TV dashboard (returns limited non-sensitive data)
CREATE OR REPLACE FUNCTION public.get_public_fund_summary(_period_id uuid)
RETURNS TABLE(
  category text,
  total_collected numeric,
  total_distributed numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- This function returns ONLY aggregated summary data
  -- No personal information, no individual transaction details
  SELECT 
    fl.category::text,
    COALESCE(SUM(CASE WHEN fl.transaction_type = 'collection' THEN fl.amount_cash ELSE 0 END), 0) AS total_collected,
    COALESCE(SUM(CASE WHEN fl.transaction_type = 'distribution' THEN ABS(fl.amount_cash) ELSE 0 END), 0) AS total_distributed
  FROM public.fund_ledger fl
  WHERE fl.period_id = _period_id
  GROUP BY fl.category;
$$;