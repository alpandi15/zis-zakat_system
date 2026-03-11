-- =====================================================
-- ZAKAT MANAGEMENT SYSTEM - COMPLETE DATABASE SCHEMA
-- =====================================================
-- This script creates all tables, enums, functions, triggers,
-- and RLS policies for the Zakat Management application.
-- Compatible with Supabase Postgres.
-- =====================================================

-- =====================================================
-- SECTION 1: ENUM TYPES
-- =====================================================

-- Application roles enum
CREATE TYPE public.app_role AS ENUM (
  'super_admin',
  'chairman',
  'treasurer',
  'zakat_officer',
  'fidyah_officer',
  'viewer'
);

-- Period status enum
CREATE TYPE public.period_status AS ENUM (
  'active',
  'archived'
);

-- Zakat payment type enum
CREATE TYPE public.zakat_payment_type AS ENUM (
  'rice',
  'cash',
  'mixed'
);

-- Zakat mal type enum
CREATE TYPE public.zakat_mal_type AS ENUM (
  'income',
  'gold',
  'trade'
);

-- Fidyah payment type enum
CREATE TYPE public.fidyah_payment_type AS ENUM (
  'cash',
  'food'
);

-- Fidyah reason enum
CREATE TYPE public.fidyah_reason AS ENUM (
  'illness',
  'old_age',
  'pregnancy',
  'breastfeeding',
  'other'
);

-- Member relationship enum
CREATE TYPE public.member_relationship AS ENUM (
  'head',
  'wife',
  'husband',
  'child',
  'parent',
  'sibling',
  'other'
);

-- Asnaf (beneficiary category) type enum
CREATE TYPE public.asnaf_type AS ENUM (
  'fakir',
  'miskin',
  'amil',
  'muallaf',
  'riqab',
  'gharimin',
  'fisabilillah',
  'ibnu_sabil'
);

-- Priority level enum
CREATE TYPE public.priority_level AS ENUM (
  'high',
  'medium',
  'low'
);

-- Distribution status enum
CREATE TYPE public.distribution_status AS ENUM (
  'pending',
  'approved',
  'distributed',
  'cancelled'
);

-- Fund category enum
CREATE TYPE public.fund_category AS ENUM (
  'zakat_fitrah_cash',
  'zakat_fitrah_rice',
  'zakat_mal',
  'fidyah_cash',
  'fidyah_food'
);

-- Ledger transaction type enum
CREATE TYPE public.ledger_transaction_type AS ENUM (
  'income',
  'distribution',
  'adjustment'
);

-- =====================================================
-- SECTION 2: CORE TABLES
-- =====================================================

-- Profiles table (linked to auth.users)
CREATE TABLE public.profiles (
  id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- User roles table (RBAC)
CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Periods table (Hijri year tracking)
CREATE TABLE public.periods (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  hijri_year INTEGER NOT NULL,
  gregorian_year INTEGER NOT NULL,
  start_date DATE,
  end_date DATE,
  status public.period_status NOT NULL DEFAULT 'active',
  rice_amount_per_person NUMERIC DEFAULT 2.5,
  cash_amount_per_person NUMERIC DEFAULT 35000,
  fidyah_daily_rate NUMERIC DEFAULT 35000,
  nisab_gold_price_per_gram NUMERIC DEFAULT 1200000,
  nisab_silver_price_per_gram NUMERIC DEFAULT 15000,
  amil_distribution_mode TEXT NOT NULL DEFAULT 'percentage',
  amil_share_factor NUMERIC NOT NULL DEFAULT 0.5,
  archived_at TIMESTAMP WITH TIME ZONE,
  archived_by UUID REFERENCES auth.users(id),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT periods_amil_distribution_mode_check
    CHECK (amil_distribution_mode IN ('percentage', 'proportional_with_factor')),
  CONSTRAINT periods_amil_share_factor_check
    CHECK (amil_share_factor >= 0 AND amil_share_factor <= 1)
);

-- Muzakki (zakat payers) table
CREATE TABLE public.muzakki (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  email TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Muzakki members (family members)
CREATE TABLE public.muzakki_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  muzakki_id UUID NOT NULL REFERENCES public.muzakki(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  relationship public.member_relationship NOT NULL,
  birth_date DATE,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_dependent BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Mustahik (zakat recipients/beneficiaries)
CREATE TABLE public.mustahik (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  email TEXT,
  asnaf public.asnaf_type NOT NULL, -- Legacy enum column (kept for backward compatibility)
  asnaf_id UUID NOT NULL REFERENCES public.asnaf_settings(id), -- New FK reference to asnaf_settings
  priority public.priority_level NOT NULL DEFAULT 'medium',
  family_members INTEGER DEFAULT 1,
  monthly_income NUMERIC,
  monthly_expense NUMERIC,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL, -- Soft delete timestamp
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index for asnaf_id lookups
CREATE INDEX idx_mustahik_asnaf_id ON public.mustahik(asnaf_id);

-- Index for faster filtering of active (non-deleted) records
CREATE INDEX idx_mustahik_deleted_at ON public.mustahik(deleted_at) WHERE deleted_at IS NULL;

-- Asnaf settings (eligibility and distribution percentages)
CREATE TABLE public.asnaf_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  asnaf_code TEXT NOT NULL UNIQUE,
  asnaf_name TEXT NOT NULL,
  receives_zakat_fitrah BOOLEAN NOT NULL DEFAULT true,
  receives_zakat_mal BOOLEAN NOT NULL DEFAULT true,
  receives_fidyah BOOLEAN NOT NULL DEFAULT false,
  distribution_percentage NUMERIC NOT NULL DEFAULT 10.00,
  is_system_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Insert default 8 Asnaf (system defaults - cannot be deleted)
-- Only Amil has a distribution percentage (12.5%), others are 0% (eligibility only)
INSERT INTO public.asnaf_settings (asnaf_code, asnaf_name, receives_zakat_fitrah, receives_zakat_mal, receives_fidyah, distribution_percentage, is_system_default, sort_order) VALUES
  ('fakir', 'Fakir', true, true, true, 0, true, 1),
  ('miskin', 'Miskin', true, true, true, 0, true, 2),
  ('amil', 'Amil', true, true, false, 12.50, true, 3),
  ('muallaf', 'Muallaf', true, true, false, 0, true, 4),
  ('riqab', 'Riqab', true, true, false, 0, true, 5),
  ('gharimin', 'Gharimin', true, true, false, 0, true, 6),
  ('fisabilillah', 'Fisabilillah', true, true, false, 0, true, 7),
  ('ibnu_sabil', 'Ibnu Sabil', true, true, false, 0, true, 8);

-- Insert Anak Yatim as an editable (non-system) Asnaf that receives Fidyah
INSERT INTO public.asnaf_settings (asnaf_code, asnaf_name, receives_zakat_fitrah, receives_zakat_mal, receives_fidyah, distribution_percentage, is_system_default, sort_order) VALUES
  ('anak_yatim', 'Anak Yatim', true, true, true, 0, false, 9);

-- =====================================================
-- SECTION 3: TRANSACTION TABLES
-- =====================================================

-- Zakat Fitrah transactions (header)
CREATE TABLE public.zakat_fitrah_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  period_id UUID NOT NULL REFERENCES public.periods(id) ON DELETE RESTRICT,
  muzakki_id UUID NOT NULL REFERENCES public.muzakki(id) ON DELETE RESTRICT,
  transaction_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  payment_type public.zakat_payment_type NOT NULL DEFAULT 'rice',
  total_members INTEGER NOT NULL DEFAULT 0,
  is_custom_total_rice BOOLEAN NOT NULL DEFAULT false,
  rice_amount_kg NUMERIC,
  money_amount NUMERIC,
  rice_price_per_kg NUMERIC,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Zakat Fitrah transaction items (per member)
CREATE TABLE public.zakat_fitrah_transaction_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_id UUID NOT NULL REFERENCES public.zakat_fitrah_transactions(id) ON DELETE CASCADE,
  period_id UUID NOT NULL REFERENCES public.periods(id) ON DELETE RESTRICT,
  muzakki_member_id UUID NOT NULL REFERENCES public.muzakki_members(id) ON DELETE RESTRICT,
  rice_amount_kg NUMERIC,
  money_amount NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (muzakki_member_id, period_id)
);

-- Zakat Mal transactions
CREATE TABLE public.zakat_mal_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  period_id UUID NOT NULL REFERENCES public.periods(id) ON DELETE RESTRICT,
  muzakki_id UUID NOT NULL REFERENCES public.muzakki(id) ON DELETE RESTRICT,
  muzakki_member_id UUID REFERENCES public.muzakki_members(id) ON DELETE SET NULL,
  transaction_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  zakat_type public.zakat_mal_type NOT NULL,
  gross_amount NUMERIC NOT NULL,
  deductions NUMERIC DEFAULT 0,
  net_amount NUMERIC NOT NULL,
  nisab_value NUMERIC NOT NULL,
  nisab_gold_price_per_gram NUMERIC,
  nisab_silver_price_per_gram NUMERIC,
  is_above_nisab BOOLEAN NOT NULL DEFAULT true,
  zakat_percentage NUMERIC NOT NULL DEFAULT 2.5,
  calculated_zakat NUMERIC NOT NULL,
  is_manually_overridden BOOLEAN NOT NULL DEFAULT false,
  override_reason TEXT,
  final_zakat_amount NUMERIC NOT NULL,
  income_source TEXT,
  gold_type TEXT,
  gold_weight_gram NUMERIC,
  inventory_value NUMERIC,
  receivables NUMERIC,
  payables NUMERIC,
  payment_method TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Fidyah transactions
CREATE TABLE public.fidyah_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  period_id UUID NOT NULL REFERENCES public.periods(id) ON DELETE RESTRICT,
  payer_muzakki_id UUID REFERENCES public.muzakki(id),
  payer_member_id UUID REFERENCES public.muzakki_members(id) ON DELETE SET NULL,
  payer_name TEXT NOT NULL,
  payer_phone TEXT,
  payer_address TEXT,
  is_paying_for_self BOOLEAN NOT NULL DEFAULT true,
  beneficiary_name TEXT,
  beneficiary_relationship TEXT,
  reason public.fidyah_reason NOT NULL,
  reason_notes TEXT,
  missed_days INTEGER NOT NULL,
  daily_rate NUMERIC NOT NULL,
  total_amount NUMERIC NOT NULL,
  payment_type public.fidyah_payment_type NOT NULL DEFAULT 'cash',
  cash_amount NUMERIC,
  food_amount_kg NUMERIC,
  food_type TEXT,
  transaction_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- =====================================================
-- SECTION 4: FUND LEDGER
-- =====================================================

-- Fund ledger (tracks all fund movements)
CREATE TABLE public.fund_ledger (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  period_id UUID NOT NULL REFERENCES public.periods(id) ON DELETE RESTRICT,
  category public.fund_category NOT NULL,
  transaction_type public.ledger_transaction_type NOT NULL,
  transaction_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  description TEXT,
  notes TEXT,
  reference_id UUID,
  reference_type TEXT,
  amount_cash NUMERIC DEFAULT 0,
  amount_rice_kg NUMERIC DEFAULT 0,
  amount_food_kg NUMERIC DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- =====================================================
-- SECTION 5: DISTRIBUTION TABLES
-- =====================================================

-- Zakat distributions
CREATE TABLE public.zakat_distributions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  period_id UUID NOT NULL REFERENCES public.periods(id) ON DELETE RESTRICT,
  mustahik_id UUID NOT NULL REFERENCES public.mustahik(id) ON DELETE RESTRICT,
  fund_category public.fund_category NOT NULL,
  distribution_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  status public.distribution_status NOT NULL DEFAULT 'pending',
  cash_amount NUMERIC DEFAULT 0,
  rice_amount_kg NUMERIC DEFAULT 0,
  notes TEXT,
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMP WITH TIME ZONE,
  distributed_by UUID REFERENCES auth.users(id),
  distributed_at TIMESTAMP WITH TIME ZONE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Fidyah distributions
CREATE TABLE public.fidyah_distributions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  period_id UUID NOT NULL REFERENCES public.periods(id) ON DELETE RESTRICT,
  mustahik_id UUID NOT NULL REFERENCES public.mustahik(id) ON DELETE RESTRICT,
  fund_category public.fund_category NOT NULL,
  distribution_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  status public.distribution_status NOT NULL DEFAULT 'pending',
  cash_amount NUMERIC DEFAULT 0,
  food_amount_kg NUMERIC DEFAULT 0,
  food_type TEXT,
  notes TEXT,
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMP WITH TIME ZONE,
  distributed_by UUID REFERENCES auth.users(id),
  distributed_at TIMESTAMP WITH TIME ZONE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Distribution assignments (staff assignment for delivery)
CREATE TABLE public.distribution_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  period_id UUID NOT NULL REFERENCES public.periods(id) ON DELETE RESTRICT,
  mustahik_id UUID NOT NULL REFERENCES public.mustahik(id) ON DELETE RESTRICT,
  assigned_to UUID NOT NULL REFERENCES auth.users(id),
  assigned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'pending',
  delivery_notes TEXT,
  delivered_at TIMESTAMP WITH TIME ZONE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- =====================================================
-- SECTION 6: INDEXES
-- =====================================================

-- Profiles indexes
CREATE INDEX idx_profiles_email ON public.profiles(email);

-- User roles indexes
CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX idx_user_roles_role ON public.user_roles(role);

-- Periods indexes
CREATE INDEX idx_periods_status ON public.periods(status);
CREATE INDEX idx_periods_hijri_year ON public.periods(hijri_year);

-- Muzakki indexes
CREATE INDEX idx_muzakki_name ON public.muzakki(name);
CREATE INDEX idx_muzakki_is_active ON public.muzakki(is_active);

-- Muzakki members indexes
CREATE INDEX idx_muzakki_members_muzakki_id ON public.muzakki_members(muzakki_id);
CREATE INDEX idx_muzakki_members_is_active ON public.muzakki_members(is_active);
CREATE INDEX idx_muzakki_members_is_dependent ON public.muzakki_members(is_dependent);

-- Mustahik indexes
CREATE INDEX idx_mustahik_name ON public.mustahik(name);
CREATE INDEX idx_mustahik_asnaf ON public.mustahik(asnaf);
CREATE INDEX idx_mustahik_is_active ON public.mustahik(is_active);

-- Zakat fitrah transactions indexes
CREATE INDEX idx_zakat_fitrah_transactions_period_id ON public.zakat_fitrah_transactions(period_id);
CREATE INDEX idx_zakat_fitrah_transactions_muzakki_id ON public.zakat_fitrah_transactions(muzakki_id);
CREATE INDEX idx_zakat_fitrah_transactions_date ON public.zakat_fitrah_transactions(transaction_date);

-- Zakat fitrah transaction items indexes
CREATE INDEX idx_zakat_fitrah_transaction_items_transaction_id ON public.zakat_fitrah_transaction_items(transaction_id);
CREATE INDEX idx_zakat_fitrah_transaction_items_period_id ON public.zakat_fitrah_transaction_items(period_id);

-- Zakat mal transactions indexes
CREATE INDEX idx_zakat_mal_transactions_period_id ON public.zakat_mal_transactions(period_id);
CREATE INDEX idx_zakat_mal_transactions_muzakki_id ON public.zakat_mal_transactions(muzakki_id);
CREATE INDEX idx_zakat_mal_transactions_muzakki_member_id ON public.zakat_mal_transactions(muzakki_member_id);
CREATE INDEX idx_zakat_mal_transactions_date ON public.zakat_mal_transactions(transaction_date);

-- Fidyah transactions indexes
CREATE INDEX idx_fidyah_transactions_period_id ON public.fidyah_transactions(period_id);
CREATE INDEX idx_fidyah_transactions_payer_member_id ON public.fidyah_transactions(payer_member_id);
CREATE INDEX idx_fidyah_transactions_date ON public.fidyah_transactions(transaction_date);

-- Fund ledger indexes
CREATE INDEX idx_fund_ledger_period_id ON public.fund_ledger(period_id);
CREATE INDEX idx_fund_ledger_category ON public.fund_ledger(category);
CREATE INDEX idx_fund_ledger_reference ON public.fund_ledger(reference_id, reference_type);

-- Zakat distributions indexes
CREATE INDEX idx_zakat_distributions_period_id ON public.zakat_distributions(period_id);
CREATE INDEX idx_zakat_distributions_mustahik_id ON public.zakat_distributions(mustahik_id);
CREATE INDEX idx_zakat_distributions_status ON public.zakat_distributions(status);

-- Fidyah distributions indexes
CREATE INDEX idx_fidyah_distributions_period_id ON public.fidyah_distributions(period_id);
CREATE INDEX idx_fidyah_distributions_mustahik_id ON public.fidyah_distributions(mustahik_id);
CREATE INDEX idx_fidyah_distributions_status ON public.fidyah_distributions(status);

-- Distribution assignments indexes
CREATE INDEX idx_distribution_assignments_period_id ON public.distribution_assignments(period_id);
CREATE INDEX idx_distribution_assignments_assigned_to ON public.distribution_assignments(assigned_to);
CREATE INDEX idx_distribution_assignments_status ON public.distribution_assignments(status);

-- =====================================================
-- SECTION 7: SECURITY DEFINER FUNCTIONS
-- (With internal authorization checks for security)
-- =====================================================

-- Check if user has a specific role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Check if user has any of the specified roles
CREATE OR REPLACE FUNCTION public.has_any_role(_user_id UUID, _roles public.app_role[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = ANY(_roles)
  )
$$;

-- Check if user is admin (super_admin or chairman)
CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_any_role(_user_id, ARRAY['super_admin', 'chairman']::public.app_role[])
$$;

-- Get all roles for a user
CREATE OR REPLACE FUNCTION public.get_user_roles(_user_id UUID)
RETURNS public.app_role[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(role), ARRAY[]::public.app_role[])
  FROM public.user_roles
  WHERE user_id = _user_id
$$;

-- Check if period is active
CREATE OR REPLACE FUNCTION public.is_period_active(_period_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.periods
    WHERE id = _period_id
      AND status = 'active'
  )
$$;

-- Get fund balance for a specific category (WITH AUTHORIZATION CHECK)
CREATE OR REPLACE FUNCTION public.get_fund_balance(_period_id UUID, _category public.fund_category)
RETURNS TABLE(total_cash NUMERIC, total_rice_kg NUMERIC, total_food_kg NUMERIC)
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

-- Get all fund balances for a period (WITH AUTHORIZATION CHECK)
CREATE OR REPLACE FUNCTION public.get_all_fund_balances(_period_id UUID)
RETURNS TABLE(category public.fund_category, total_cash NUMERIC, total_rice_kg NUMERIC, total_food_kg NUMERIC)
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

-- Check fund availability before distribution (WITH AUTHORIZATION CHECK)
CREATE OR REPLACE FUNCTION public.check_fund_availability(
  _period_id UUID, 
  _category public.fund_category, 
  _cash_needed NUMERIC DEFAULT 0, 
  _rice_needed NUMERIC DEFAULT 0, 
  _food_needed NUMERIC DEFAULT 0
)
RETURNS BOOLEAN
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

-- Public TV dashboard function - returns limited non-sensitive aggregated data
CREATE OR REPLACE FUNCTION public.get_public_fund_summary(_period_id UUID)
RETURNS TABLE(
  category TEXT,
  total_collected NUMERIC,
  total_distributed NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- This function returns ONLY aggregated summary data
  -- No personal information, no individual transaction details
  SELECT 
    fl.category::TEXT,
    COALESCE(SUM(CASE WHEN fl.transaction_type = 'collection' THEN fl.amount_cash ELSE 0 END), 0) AS total_collected,
    COALESCE(SUM(CASE WHEN fl.transaction_type = 'distribution' THEN ABS(fl.amount_cash) ELSE 0 END), 0) AS total_distributed
  FROM public.fund_ledger fl
  WHERE fl.period_id = _period_id
  GROUP BY fl.category
$$;

-- =====================================================
-- SECTION 8: TRIGGER FUNCTIONS
-- =====================================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Handle new user creation (create profile and default role)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Create profile
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email)
  )
  ON CONFLICT (id) DO NOTHING;
  
  -- Create default user role (viewer) if not exists
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'viewer')
  ON CONFLICT (user_id, role) DO NOTHING;
  
  RETURN NEW;
END;
$$;

-- Handle period archiving
CREATE OR REPLACE FUNCTION public.handle_period_archive()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'archived' AND OLD.status = 'active' THEN
    NEW.archived_at = now();
    NEW.archived_by = auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

-- =====================================================
-- SECTION 9: TRIGGERS
-- =====================================================

-- Updated_at triggers
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_user_roles_updated_at
  BEFORE UPDATE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_periods_updated_at
  BEFORE UPDATE ON public.periods
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_muzakki_updated_at
  BEFORE UPDATE ON public.muzakki
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_muzakki_members_updated_at
  BEFORE UPDATE ON public.muzakki_members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_mustahik_updated_at
  BEFORE UPDATE ON public.mustahik
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_zakat_fitrah_transactions_updated_at
  BEFORE UPDATE ON public.zakat_fitrah_transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_zakat_mal_transactions_updated_at
  BEFORE UPDATE ON public.zakat_mal_transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_fidyah_transactions_updated_at
  BEFORE UPDATE ON public.fidyah_transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_fund_ledger_updated_at
  BEFORE UPDATE ON public.fund_ledger
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_zakat_distributions_updated_at
  BEFORE UPDATE ON public.zakat_distributions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_fidyah_distributions_updated_at
  BEFORE UPDATE ON public.fidyah_distributions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_distribution_assignments_updated_at
  BEFORE UPDATE ON public.distribution_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_asnaf_settings_updated_at
  BEFORE UPDATE ON public.asnaf_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- New user trigger (on auth.users)
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Period archive trigger
CREATE TRIGGER on_period_archive
  BEFORE UPDATE ON public.periods
  FOR EACH ROW EXECUTE FUNCTION public.handle_period_archive();

-- =====================================================
-- SECTION 10: ENABLE ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.muzakki ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.muzakki_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mustahik ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zakat_fitrah_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zakat_fitrah_transaction_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zakat_mal_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fidyah_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fund_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zakat_distributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fidyah_distributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.distribution_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asnaf_settings ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- SECTION 11: RLS POLICIES - PROFILES
-- =====================================================

CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Admins can update all profiles"
  ON public.profiles FOR UPDATE
  USING (public.is_admin(auth.uid()));

-- =====================================================
-- SECTION 12: RLS POLICIES - USER ROLES
-- =====================================================

CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all roles"
  ON public.user_roles FOR SELECT
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Super admins can manage all roles"
  ON public.user_roles FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Admins can insert roles except super_admin"
  ON public.user_roles FOR INSERT
  WITH CHECK (public.is_admin(auth.uid()) AND role <> 'super_admin');

CREATE POLICY "Admins can delete roles except super_admin"
  ON public.user_roles FOR DELETE
  USING (public.is_admin(auth.uid()) AND role <> 'super_admin');

-- =====================================================
-- SECTION 13: RLS POLICIES - PERIODS
-- =====================================================

CREATE POLICY "Authenticated users can view periods"
  ON public.periods FOR SELECT
  USING (true);

CREATE POLICY "Admins can create periods"
  ON public.periods FOR INSERT
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update active periods"
  ON public.periods FOR UPDATE
  USING (public.is_admin(auth.uid()) AND status = 'active')
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Super admins can delete active periods"
  ON public.periods FOR DELETE
  USING (public.has_role(auth.uid(), 'super_admin') AND status = 'active');

-- =====================================================
-- SECTION 14: RLS POLICIES - MUZAKKI (HARDENED)
-- =====================================================

-- Only authorized roles can view muzakki (not all authenticated users)
CREATE POLICY "Authorized roles can view muzakki"
  ON public.muzakki FOR SELECT
  USING (public.has_any_role(auth.uid(), ARRAY['super_admin', 'chairman', 'treasurer', 'zakat_officer', 'fidyah_officer']::public.app_role[]));

CREATE POLICY "Admins and Zakat Officers can create muzakki"
  ON public.muzakki FOR INSERT
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['super_admin', 'chairman', 'zakat_officer']::public.app_role[]));

CREATE POLICY "Admins and Zakat Officers can update muzakki"
  ON public.muzakki FOR UPDATE
  USING (public.has_any_role(auth.uid(), ARRAY['super_admin', 'chairman', 'zakat_officer']::public.app_role[]));

CREATE POLICY "Admins and Zakat Officers can delete muzakki"
  ON public.muzakki FOR DELETE
  USING (public.has_any_role(auth.uid(), ARRAY['super_admin', 'chairman', 'zakat_officer']::public.app_role[]));

-- =====================================================
-- SECTION 15: RLS POLICIES - MUZAKKI MEMBERS (HARDENED)
-- =====================================================

-- Only authorized roles can view muzakki members (not all authenticated users)
CREATE POLICY "Authorized roles can view muzakki members"
  ON public.muzakki_members FOR SELECT
  USING (public.has_any_role(auth.uid(), ARRAY['super_admin', 'chairman', 'treasurer', 'zakat_officer', 'fidyah_officer']::public.app_role[]));

CREATE POLICY "Admins and Zakat Officers can create muzakki members"
  ON public.muzakki_members FOR INSERT
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['super_admin', 'chairman', 'zakat_officer']::public.app_role[]));

CREATE POLICY "Admins and Zakat Officers can update muzakki members"
  ON public.muzakki_members FOR UPDATE
  USING (public.has_any_role(auth.uid(), ARRAY['super_admin', 'chairman', 'zakat_officer']::public.app_role[]));

CREATE POLICY "Admins and Zakat Officers can delete muzakki members"
  ON public.muzakki_members FOR DELETE
  USING (public.has_any_role(auth.uid(), ARRAY['super_admin', 'chairman', 'zakat_officer']::public.app_role[]));

-- =====================================================
-- SECTION 16: RLS POLICIES - MUSTAHIK (HARDENED)
-- =====================================================

-- Only authorized roles can view mustahik (not all authenticated users)
CREATE POLICY "Authorized roles can view mustahik"
  ON public.mustahik FOR SELECT
  USING (public.has_any_role(auth.uid(), ARRAY['super_admin', 'chairman', 'treasurer', 'zakat_officer', 'fidyah_officer']::public.app_role[]));

CREATE POLICY "Admins and Zakat Officers can create mustahik"
  ON public.mustahik FOR INSERT
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['super_admin', 'chairman', 'zakat_officer']::public.app_role[]));

CREATE POLICY "Admins and Zakat Officers can update mustahik"
  ON public.mustahik FOR UPDATE
  USING (public.has_any_role(auth.uid(), ARRAY['super_admin', 'chairman', 'zakat_officer']::public.app_role[]));

-- =====================================================
-- SECTION 17: RLS POLICIES - ZAKAT FITRAH TRANSACTIONS (HARDENED)
-- =====================================================

-- Only authorized roles can view zakat fitrah transactions (not all authenticated users)
CREATE POLICY "Authorized roles can view zakat fitrah transactions"
  ON public.zakat_fitrah_transactions FOR SELECT
  USING (public.has_any_role(auth.uid(), ARRAY['super_admin', 'chairman', 'treasurer', 'zakat_officer', 'fidyah_officer']::public.app_role[]));

CREATE POLICY "Admins and Zakat Officers can create zakat fitrah transactions"
  ON public.zakat_fitrah_transactions FOR INSERT
  WITH CHECK (
    public.has_any_role(auth.uid(), ARRAY['super_admin', 'chairman', 'zakat_officer']::public.app_role[])
    AND public.is_period_active(period_id)
  );

CREATE POLICY "Admins and Zakat Officers can update zakat fitrah transactions"
  ON public.zakat_fitrah_transactions FOR UPDATE
  USING (
    public.has_any_role(auth.uid(), ARRAY['super_admin', 'chairman', 'zakat_officer']::public.app_role[])
    AND public.is_period_active(period_id)
  );

CREATE POLICY "Admins can delete zakat fitrah transactions in active periods"
  ON public.zakat_fitrah_transactions FOR DELETE
  USING (public.is_admin(auth.uid()) AND public.is_period_active(period_id));

-- =====================================================
-- SECTION 18: RLS POLICIES - ZAKAT FITRAH TRANSACTION ITEMS (HARDENED)
-- =====================================================

-- Only authorized roles can view zakat fitrah transaction items (not all authenticated users)
CREATE POLICY "Authorized roles can view zakat fitrah transaction items"
  ON public.zakat_fitrah_transaction_items FOR SELECT
  USING (public.has_any_role(auth.uid(), ARRAY['super_admin', 'chairman', 'treasurer', 'zakat_officer', 'fidyah_officer']::public.app_role[]));

CREATE POLICY "Admins and Zakat Officers can create zakat fitrah transaction items"
  ON public.zakat_fitrah_transaction_items FOR INSERT
  WITH CHECK (
    public.has_any_role(auth.uid(), ARRAY['super_admin', 'chairman', 'zakat_officer']::public.app_role[])
    AND public.is_period_active(period_id)
  );

CREATE POLICY "Admins and Zakat Officers can update zakat fitrah transaction items"
  ON public.zakat_fitrah_transaction_items FOR UPDATE
  USING (
    public.has_any_role(auth.uid(), ARRAY['super_admin', 'chairman', 'zakat_officer']::public.app_role[])
    AND public.is_period_active(period_id)
  );

CREATE POLICY "Admins can delete zakat fitrah transaction items in active periods"
  ON public.zakat_fitrah_transaction_items FOR DELETE
  USING (public.is_admin(auth.uid()) AND public.is_period_active(period_id));

-- =====================================================
-- SECTION 19: RLS POLICIES - ZAKAT MAL TRANSACTIONS (HARDENED)
-- =====================================================

-- Only authorized roles can view zakat mal transactions (not all authenticated users)
CREATE POLICY "Authorized roles can view zakat mal transactions"
  ON public.zakat_mal_transactions FOR SELECT
  USING (public.has_any_role(auth.uid(), ARRAY['super_admin', 'chairman', 'treasurer', 'zakat_officer', 'fidyah_officer']::public.app_role[]));

CREATE POLICY "Admins and Zakat Officers can create zakat mal transactions"
  ON public.zakat_mal_transactions FOR INSERT
  WITH CHECK (
    public.has_any_role(auth.uid(), ARRAY['super_admin', 'chairman', 'zakat_officer']::public.app_role[])
    AND public.is_period_active(period_id)
  );

CREATE POLICY "Admins and Zakat Officers can update zakat mal transactions"
  ON public.zakat_mal_transactions FOR UPDATE
  USING (
    public.has_any_role(auth.uid(), ARRAY['super_admin', 'chairman', 'zakat_officer']::public.app_role[])
    AND public.is_period_active(period_id)
  );

CREATE POLICY "Admins can delete zakat mal transactions in active periods"
  ON public.zakat_mal_transactions FOR DELETE
  USING (public.is_admin(auth.uid()) AND public.is_period_active(period_id));

-- =====================================================
-- SECTION 20: RLS POLICIES - FIDYAH TRANSACTIONS (HARDENED)
-- =====================================================

-- Only authorized roles can view fidyah transactions (not all authenticated users)
CREATE POLICY "Authorized roles can view fidyah transactions"
  ON public.fidyah_transactions FOR SELECT
  USING (public.has_any_role(auth.uid(), ARRAY['super_admin', 'chairman', 'treasurer', 'zakat_officer', 'fidyah_officer']::public.app_role[]));

CREATE POLICY "Admins and Zakat Officers can create fidyah transactions"
  ON public.fidyah_transactions FOR INSERT
  WITH CHECK (
    public.has_any_role(auth.uid(), ARRAY['super_admin', 'chairman', 'zakat_officer']::public.app_role[])
    AND public.is_period_active(period_id)
  );

CREATE POLICY "Admins and Zakat Officers can update fidyah transactions"
  ON public.fidyah_transactions FOR UPDATE
  USING (
    public.has_any_role(auth.uid(), ARRAY['super_admin', 'chairman', 'zakat_officer']::public.app_role[])
    AND public.is_period_active(period_id)
  );

CREATE POLICY "Admins can delete fidyah transactions in active periods"
  ON public.fidyah_transactions FOR DELETE
  USING (public.is_admin(auth.uid()) AND public.is_period_active(period_id));

-- =====================================================
-- SECTION 21: RLS POLICIES - FUND LEDGER (HARDENED)
-- =====================================================

-- Only authorized roles can view fund ledger (not all authenticated users)
CREATE POLICY "Authorized roles can view fund ledger"
  ON public.fund_ledger FOR SELECT
  USING (public.has_any_role(auth.uid(), ARRAY['super_admin', 'chairman', 'treasurer', 'zakat_officer', 'fidyah_officer']::public.app_role[]));

CREATE POLICY "Admins and Zakat Officers can create ledger entries"
  ON public.fund_ledger FOR INSERT
  WITH CHECK (
    public.has_any_role(auth.uid(), ARRAY['super_admin', 'chairman', 'zakat_officer']::public.app_role[])
    AND public.is_period_active(period_id)
  );

CREATE POLICY "Admins can update ledger entries in active periods"
  ON public.fund_ledger FOR UPDATE
  USING (public.is_admin(auth.uid()) AND public.is_period_active(period_id));

CREATE POLICY "Super admins can delete ledger entries in active periods"
  ON public.fund_ledger FOR DELETE
  USING (public.has_role(auth.uid(), 'super_admin') AND public.is_period_active(period_id));

-- =====================================================
-- SECTION 22: RLS POLICIES - ZAKAT DISTRIBUTIONS (HARDENED)
-- =====================================================

-- Only authorized roles can view zakat distributions (not all authenticated users)
CREATE POLICY "Authorized roles can view zakat distributions"
  ON public.zakat_distributions FOR SELECT
  USING (public.has_any_role(auth.uid(), ARRAY['super_admin', 'chairman', 'treasurer', 'zakat_officer', 'fidyah_officer']::public.app_role[]));

CREATE POLICY "Admins and Zakat Officers can create zakat distributions"
  ON public.zakat_distributions FOR INSERT
  WITH CHECK (
    public.has_any_role(auth.uid(), ARRAY['super_admin', 'chairman', 'zakat_officer']::public.app_role[])
    AND public.is_period_active(period_id)
  );

CREATE POLICY "Admins and Zakat Officers can update zakat distributions"
  ON public.zakat_distributions FOR UPDATE
  USING (
    public.has_any_role(auth.uid(), ARRAY['super_admin', 'chairman', 'zakat_officer']::public.app_role[])
    AND public.is_period_active(period_id)
  );

CREATE POLICY "Admins can delete pending zakat distributions"
  ON public.zakat_distributions FOR DELETE
  USING (
    public.is_admin(auth.uid())
    AND public.is_period_active(period_id)
    AND status = 'pending'
  );

-- =====================================================
-- SECTION 23: RLS POLICIES - FIDYAH DISTRIBUTIONS (HARDENED)
-- =====================================================

-- Only authorized roles can view fidyah distributions (not all authenticated users)
CREATE POLICY "Authorized roles can view fidyah distributions"
  ON public.fidyah_distributions FOR SELECT
  USING (public.has_any_role(auth.uid(), ARRAY['super_admin', 'chairman', 'treasurer', 'zakat_officer', 'fidyah_officer']::public.app_role[]));

CREATE POLICY "Admins and Zakat Officers can create fidyah distributions"
  ON public.fidyah_distributions FOR INSERT
  WITH CHECK (
    public.has_any_role(auth.uid(), ARRAY['super_admin', 'chairman', 'zakat_officer']::public.app_role[])
    AND public.is_period_active(period_id)
  );

CREATE POLICY "Admins and Zakat Officers can update fidyah distributions"
  ON public.fidyah_distributions FOR UPDATE
  USING (
    public.has_any_role(auth.uid(), ARRAY['super_admin', 'chairman', 'zakat_officer']::public.app_role[])
    AND public.is_period_active(period_id)
  );

CREATE POLICY "Admins can delete pending fidyah distributions"
  ON public.fidyah_distributions FOR DELETE
  USING (
    public.is_admin(auth.uid())
    AND public.is_period_active(period_id)
    AND status = 'pending'
  );

-- =====================================================
-- SECTION 24: RLS POLICIES - DISTRIBUTION ASSIGNMENTS
-- =====================================================

CREATE POLICY "Admins can view all assignments"
  ON public.distribution_assignments FOR SELECT
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Staff can view their own assignments"
  ON public.distribution_assignments FOR SELECT
  USING (assigned_to = auth.uid());

CREATE POLICY "Admins can create assignments"
  ON public.distribution_assignments FOR INSERT
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update assignments"
  ON public.distribution_assignments FOR UPDATE
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Staff can update their own assignments"
  ON public.distribution_assignments FOR UPDATE
  USING (assigned_to = auth.uid());

CREATE POLICY "Admins can delete assignments"
  ON public.distribution_assignments FOR DELETE
  USING (public.is_admin(auth.uid()));

-- =====================================================
-- SECTION 25: RLS POLICIES - ASNAF SETTINGS
-- =====================================================

CREATE POLICY "Authenticated users can view asnaf settings"
  ON public.asnaf_settings FOR SELECT
  USING (true);

CREATE POLICY "Admins can update asnaf settings"
  ON public.asnaf_settings FOR UPDATE
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can insert non-system asnaf settings"
  ON public.asnaf_settings FOR INSERT
  WITH CHECK (public.is_admin(auth.uid()) AND is_system_default = false);

CREATE POLICY "Admins can delete non-system asnaf settings"
  ON public.asnaf_settings FOR DELETE
  USING (public.is_admin(auth.uid()) AND is_system_default = false);

-- =====================================================
-- END OF SCHEMA
-- =====================================================
