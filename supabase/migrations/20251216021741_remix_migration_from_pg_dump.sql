CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "plpgsql" WITH SCHEMA "pg_catalog";
CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";
--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.1

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: app_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.app_role AS ENUM (
    'super_admin',
    'chairman',
    'treasurer',
    'zakat_officer',
    'fidyah_officer',
    'viewer'
);


--
-- Name: asnaf_type; Type: TYPE; Schema: public; Owner: -
--

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


--
-- Name: distribution_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.distribution_status AS ENUM (
    'pending',
    'approved',
    'distributed',
    'cancelled'
);


--
-- Name: fidyah_payment_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.fidyah_payment_type AS ENUM (
    'cash',
    'food'
);


--
-- Name: fidyah_reason; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.fidyah_reason AS ENUM (
    'chronic_illness',
    'elderly',
    'pregnancy',
    'breastfeeding',
    'terminal_illness',
    'other'
);


--
-- Name: fund_category; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.fund_category AS ENUM (
    'zakat_fitrah_cash',
    'zakat_fitrah_rice',
    'zakat_mal',
    'fidyah_cash',
    'fidyah_food'
);


--
-- Name: ledger_transaction_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.ledger_transaction_type AS ENUM (
    'collection',
    'distribution',
    'adjustment',
    'transfer_out',
    'transfer_in'
);


--
-- Name: member_relationship; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.member_relationship AS ENUM (
    'head_of_family',
    'wife',
    'child',
    'parent'
);


--
-- Name: period_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.period_status AS ENUM (
    'active',
    'archived'
);


--
-- Name: priority_level; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.priority_level AS ENUM (
    'low',
    'medium',
    'high',
    'urgent'
);


--
-- Name: zakat_mal_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.zakat_mal_type AS ENUM (
    'income',
    'gold',
    'trade'
);


--
-- Name: zakat_payment_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.zakat_payment_type AS ENUM (
    'rice',
    'money'
);


--
-- Name: check_fund_availability(uuid, public.fund_category, numeric, numeric, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_fund_availability(_period_id uuid, _category public.fund_category, _cash_needed numeric DEFAULT 0, _rice_needed numeric DEFAULT 0, _food_needed numeric DEFAULT 0) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _balance RECORD;
BEGIN
  SELECT * INTO _balance FROM public.get_fund_balance(_period_id, _category);
  
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


--
-- Name: get_all_fund_balances(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_all_fund_balances(_period_id uuid) RETURNS TABLE(category public.fund_category, total_cash numeric, total_rice_kg numeric, total_food_kg numeric)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT 
    category,
    COALESCE(SUM(amount_cash), 0) AS total_cash,
    COALESCE(SUM(amount_rice_kg), 0) AS total_rice_kg,
    COALESCE(SUM(amount_food_kg), 0) AS total_food_kg
  FROM public.fund_ledger
  WHERE period_id = _period_id
  GROUP BY category
$$;


--
-- Name: get_fund_balance(uuid, public.fund_category); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_fund_balance(_period_id uuid, _category public.fund_category) RETURNS TABLE(total_cash numeric, total_rice_kg numeric, total_food_kg numeric)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT 
    COALESCE(SUM(amount_cash), 0) AS total_cash,
    COALESCE(SUM(amount_rice_kg), 0) AS total_rice_kg,
    COALESCE(SUM(amount_food_kg), 0) AS total_food_kg
  FROM public.fund_ledger
  WHERE period_id = _period_id
    AND category = _category
$$;


--
-- Name: get_user_roles(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_roles(_user_id uuid) RETURNS public.app_role[]
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT COALESCE(array_agg(role), ARRAY[]::app_role[])
  FROM public.user_roles
  WHERE user_id = _user_id
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email)
  );
  RETURN NEW;
END;
$$;


--
-- Name: handle_period_archive(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_period_archive() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.status = 'archived' AND OLD.status = 'active' THEN
    NEW.archived_at = now();
    NEW.archived_by = auth.uid();
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: has_any_role(uuid, public.app_role[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_any_role(_user_id uuid, _roles public.app_role[]) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = ANY(_roles)
  )
$$;


--
-- Name: has_role(uuid, public.app_role); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;


--
-- Name: is_admin(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin(_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT public.has_any_role(_user_id, ARRAY['super_admin', 'chairman']::app_role[])
$$;


--
-- Name: is_period_active(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_period_active(_period_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.periods
    WHERE id = _period_id
      AND status = 'active'
  )
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


SET default_table_access_method = heap;

--
-- Name: fidyah_distributions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fidyah_distributions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    period_id uuid NOT NULL,
    mustahik_id uuid NOT NULL,
    fund_category public.fund_category NOT NULL,
    distribution_date timestamp with time zone DEFAULT now() NOT NULL,
    status public.distribution_status DEFAULT 'pending'::public.distribution_status NOT NULL,
    cash_amount numeric(15,2) DEFAULT 0,
    food_amount_kg numeric(10,2) DEFAULT 0,
    food_type text,
    approved_by uuid,
    approved_at timestamp with time zone,
    distributed_by uuid,
    distributed_at timestamp with time zone,
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT fidyah_distribution_category_check CHECK ((fund_category = ANY (ARRAY['fidyah_cash'::public.fund_category, 'fidyah_food'::public.fund_category])))
);


--
-- Name: fidyah_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fidyah_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    period_id uuid NOT NULL,
    payer_muzakki_id uuid,
    payer_name text NOT NULL,
    payer_phone text,
    payer_address text,
    is_paying_for_self boolean DEFAULT true NOT NULL,
    beneficiary_name text,
    beneficiary_relationship text,
    transaction_date timestamp with time zone DEFAULT now() NOT NULL,
    reason public.fidyah_reason NOT NULL,
    reason_notes text,
    missed_days integer NOT NULL,
    daily_rate numeric(15,2) NOT NULL,
    total_amount numeric(15,2) NOT NULL,
    payment_type public.fidyah_payment_type DEFAULT 'cash'::public.fidyah_payment_type NOT NULL,
    food_type text,
    food_amount_kg numeric(10,2),
    cash_amount numeric(15,2),
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: fund_ledger; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fund_ledger (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    period_id uuid NOT NULL,
    category public.fund_category NOT NULL,
    transaction_type public.ledger_transaction_type NOT NULL,
    transaction_date timestamp with time zone DEFAULT now() NOT NULL,
    reference_type text,
    reference_id uuid,
    amount_cash numeric(15,2) DEFAULT 0,
    amount_rice_kg numeric(10,2) DEFAULT 0,
    amount_food_kg numeric(10,2) DEFAULT 0,
    description text,
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: mustahik; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mustahik (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    address text,
    phone text,
    email text,
    asnaf public.asnaf_type NOT NULL,
    priority public.priority_level DEFAULT 'medium'::public.priority_level NOT NULL,
    family_members integer DEFAULT 1,
    monthly_income numeric(15,2),
    monthly_expense numeric(15,2),
    notes text,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: muzakki; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.muzakki (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    address text,
    phone text,
    email text,
    notes text,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: muzakki_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.muzakki_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    muzakki_id uuid NOT NULL,
    name text NOT NULL,
    relationship public.member_relationship NOT NULL,
    birth_date date,
    notes text,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: periods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.periods (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hijri_year integer NOT NULL,
    gregorian_year integer NOT NULL,
    name text NOT NULL,
    description text,
    status public.period_status DEFAULT 'active'::public.period_status NOT NULL,
    start_date date,
    end_date date,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    archived_at timestamp with time zone,
    archived_by uuid,
    rice_amount_per_person numeric DEFAULT 2.5,
    cash_amount_per_person numeric DEFAULT 35000,
    fidyah_daily_rate numeric DEFAULT 35000,
    nisab_gold_price_per_gram numeric DEFAULT 1200000,
    nisab_silver_price_per_gram numeric DEFAULT 15000
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    email text,
    full_name text,
    avatar_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role public.app_role NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: zakat_distributions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.zakat_distributions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    period_id uuid NOT NULL,
    mustahik_id uuid NOT NULL,
    fund_category public.fund_category NOT NULL,
    distribution_date timestamp with time zone DEFAULT now() NOT NULL,
    status public.distribution_status DEFAULT 'pending'::public.distribution_status NOT NULL,
    cash_amount numeric(15,2) DEFAULT 0,
    rice_amount_kg numeric(10,2) DEFAULT 0,
    approved_by uuid,
    approved_at timestamp with time zone,
    distributed_by uuid,
    distributed_at timestamp with time zone,
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT zakat_distribution_category_check CHECK ((fund_category = ANY (ARRAY['zakat_fitrah_cash'::public.fund_category, 'zakat_fitrah_rice'::public.fund_category, 'zakat_mal'::public.fund_category])))
);


--
-- Name: zakat_fitrah_transaction_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.zakat_fitrah_transaction_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    transaction_id uuid NOT NULL,
    muzakki_member_id uuid NOT NULL,
    period_id uuid NOT NULL,
    rice_amount_kg numeric(10,2),
    money_amount numeric(15,2),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: zakat_fitrah_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.zakat_fitrah_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    period_id uuid NOT NULL,
    muzakki_id uuid NOT NULL,
    transaction_date timestamp with time zone DEFAULT now() NOT NULL,
    payment_type public.zakat_payment_type DEFAULT 'rice'::public.zakat_payment_type NOT NULL,
    rice_amount_kg numeric(10,2),
    money_amount numeric(15,2),
    rice_price_per_kg numeric(15,2),
    total_members integer DEFAULT 0 NOT NULL,
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: zakat_mal_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.zakat_mal_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    period_id uuid NOT NULL,
    muzakki_id uuid NOT NULL,
    zakat_type public.zakat_mal_type NOT NULL,
    transaction_date timestamp with time zone DEFAULT now() NOT NULL,
    gross_amount numeric(15,2) NOT NULL,
    deductions numeric(15,2) DEFAULT 0,
    net_amount numeric(15,2) NOT NULL,
    nisab_value numeric(15,2) NOT NULL,
    nisab_gold_price_per_gram numeric(15,2),
    nisab_silver_price_per_gram numeric(15,2),
    is_above_nisab boolean DEFAULT true NOT NULL,
    zakat_percentage numeric(5,2) DEFAULT 2.5 NOT NULL,
    calculated_zakat numeric(15,2) NOT NULL,
    final_zakat_amount numeric(15,2) NOT NULL,
    is_manually_overridden boolean DEFAULT false NOT NULL,
    override_reason text,
    gold_weight_gram numeric(10,3),
    gold_type text,
    inventory_value numeric(15,2),
    receivables numeric(15,2),
    payables numeric(15,2),
    income_source text,
    payment_method text,
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: fidyah_distributions fidyah_distributions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fidyah_distributions
    ADD CONSTRAINT fidyah_distributions_pkey PRIMARY KEY (id);


--
-- Name: fidyah_transactions fidyah_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fidyah_transactions
    ADD CONSTRAINT fidyah_transactions_pkey PRIMARY KEY (id);


--
-- Name: fund_ledger fund_ledger_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_ledger
    ADD CONSTRAINT fund_ledger_pkey PRIMARY KEY (id);


--
-- Name: mustahik mustahik_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mustahik
    ADD CONSTRAINT mustahik_pkey PRIMARY KEY (id);


--
-- Name: muzakki_members muzakki_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.muzakki_members
    ADD CONSTRAINT muzakki_members_pkey PRIMARY KEY (id);


--
-- Name: muzakki muzakki_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.muzakki
    ADD CONSTRAINT muzakki_pkey PRIMARY KEY (id);


--
-- Name: periods periods_hijri_year_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.periods
    ADD CONSTRAINT periods_hijri_year_key UNIQUE (hijri_year);


--
-- Name: periods periods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.periods
    ADD CONSTRAINT periods_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_user_id_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);


--
-- Name: zakat_distributions zakat_distributions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zakat_distributions
    ADD CONSTRAINT zakat_distributions_pkey PRIMARY KEY (id);


--
-- Name: zakat_fitrah_transaction_items zakat_fitrah_transaction_items_muzakki_member_id_period_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zakat_fitrah_transaction_items
    ADD CONSTRAINT zakat_fitrah_transaction_items_muzakki_member_id_period_id_key UNIQUE (muzakki_member_id, period_id);


--
-- Name: zakat_fitrah_transaction_items zakat_fitrah_transaction_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zakat_fitrah_transaction_items
    ADD CONSTRAINT zakat_fitrah_transaction_items_pkey PRIMARY KEY (id);


--
-- Name: zakat_fitrah_transactions zakat_fitrah_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zakat_fitrah_transactions
    ADD CONSTRAINT zakat_fitrah_transactions_pkey PRIMARY KEY (id);


--
-- Name: zakat_mal_transactions zakat_mal_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zakat_mal_transactions
    ADD CONSTRAINT zakat_mal_transactions_pkey PRIMARY KEY (id);


--
-- Name: idx_fidyah_distributions_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fidyah_distributions_category ON public.fidyah_distributions USING btree (fund_category);


--
-- Name: idx_fidyah_distributions_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fidyah_distributions_date ON public.fidyah_distributions USING btree (distribution_date);


--
-- Name: idx_fidyah_distributions_mustahik; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fidyah_distributions_mustahik ON public.fidyah_distributions USING btree (mustahik_id);


--
-- Name: idx_fidyah_distributions_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fidyah_distributions_period ON public.fidyah_distributions USING btree (period_id);


--
-- Name: idx_fidyah_distributions_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fidyah_distributions_status ON public.fidyah_distributions USING btree (status);


--
-- Name: idx_fidyah_transactions_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fidyah_transactions_date ON public.fidyah_transactions USING btree (transaction_date);


--
-- Name: idx_fidyah_transactions_payer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fidyah_transactions_payer ON public.fidyah_transactions USING btree (payer_muzakki_id);


--
-- Name: idx_fidyah_transactions_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fidyah_transactions_period ON public.fidyah_transactions USING btree (period_id);


--
-- Name: idx_fidyah_transactions_reason; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fidyah_transactions_reason ON public.fidyah_transactions USING btree (reason);


--
-- Name: idx_fund_ledger_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fund_ledger_category ON public.fund_ledger USING btree (category);


--
-- Name: idx_fund_ledger_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fund_ledger_date ON public.fund_ledger USING btree (transaction_date);


--
-- Name: idx_fund_ledger_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fund_ledger_period ON public.fund_ledger USING btree (period_id);


--
-- Name: idx_fund_ledger_reference; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fund_ledger_reference ON public.fund_ledger USING btree (reference_type, reference_id);


--
-- Name: idx_fund_ledger_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fund_ledger_type ON public.fund_ledger USING btree (transaction_type);


--
-- Name: idx_mustahik_asnaf; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mustahik_asnaf ON public.mustahik USING btree (asnaf);


--
-- Name: idx_mustahik_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mustahik_is_active ON public.mustahik USING btree (is_active);


--
-- Name: idx_mustahik_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mustahik_name ON public.mustahik USING gin (to_tsvector('simple'::regconfig, name));


--
-- Name: idx_mustahik_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mustahik_phone ON public.mustahik USING btree (phone);


--
-- Name: idx_mustahik_priority; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mustahik_priority ON public.mustahik USING btree (priority);


--
-- Name: idx_muzakki_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_muzakki_email ON public.muzakki USING btree (email);


--
-- Name: idx_muzakki_members_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_muzakki_members_is_active ON public.muzakki_members USING btree (is_active);


--
-- Name: idx_muzakki_members_muzakki_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_muzakki_members_muzakki_id ON public.muzakki_members USING btree (muzakki_id);


--
-- Name: idx_muzakki_members_relationship; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_muzakki_members_relationship ON public.muzakki_members USING btree (relationship);


--
-- Name: idx_muzakki_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_muzakki_name ON public.muzakki USING gin (to_tsvector('simple'::regconfig, name));


--
-- Name: idx_muzakki_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_muzakki_phone ON public.muzakki USING btree (phone);


--
-- Name: idx_zakat_distributions_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zakat_distributions_category ON public.zakat_distributions USING btree (fund_category);


--
-- Name: idx_zakat_distributions_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zakat_distributions_date ON public.zakat_distributions USING btree (distribution_date);


--
-- Name: idx_zakat_distributions_mustahik; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zakat_distributions_mustahik ON public.zakat_distributions USING btree (mustahik_id);


--
-- Name: idx_zakat_distributions_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zakat_distributions_period ON public.zakat_distributions USING btree (period_id);


--
-- Name: idx_zakat_distributions_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zakat_distributions_status ON public.zakat_distributions USING btree (status);


--
-- Name: idx_zakat_fitrah_items_member; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zakat_fitrah_items_member ON public.zakat_fitrah_transaction_items USING btree (muzakki_member_id);


--
-- Name: idx_zakat_fitrah_items_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zakat_fitrah_items_period ON public.zakat_fitrah_transaction_items USING btree (period_id);


--
-- Name: idx_zakat_fitrah_items_transaction; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zakat_fitrah_items_transaction ON public.zakat_fitrah_transaction_items USING btree (transaction_id);


--
-- Name: idx_zakat_fitrah_transactions_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zakat_fitrah_transactions_date ON public.zakat_fitrah_transactions USING btree (transaction_date);


--
-- Name: idx_zakat_fitrah_transactions_muzakki; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zakat_fitrah_transactions_muzakki ON public.zakat_fitrah_transactions USING btree (muzakki_id);


--
-- Name: idx_zakat_fitrah_transactions_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zakat_fitrah_transactions_period ON public.zakat_fitrah_transactions USING btree (period_id);


--
-- Name: idx_zakat_mal_transactions_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zakat_mal_transactions_date ON public.zakat_mal_transactions USING btree (transaction_date);


--
-- Name: idx_zakat_mal_transactions_muzakki; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zakat_mal_transactions_muzakki ON public.zakat_mal_transactions USING btree (muzakki_id);


--
-- Name: idx_zakat_mal_transactions_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zakat_mal_transactions_period ON public.zakat_mal_transactions USING btree (period_id);


--
-- Name: idx_zakat_mal_transactions_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zakat_mal_transactions_type ON public.zakat_mal_transactions USING btree (zakat_type);


--
-- Name: periods on_period_archive; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_period_archive BEFORE UPDATE ON public.periods FOR EACH ROW EXECUTE FUNCTION public.handle_period_archive();


--
-- Name: fidyah_distributions update_fidyah_distributions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_fidyah_distributions_updated_at BEFORE UPDATE ON public.fidyah_distributions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: fidyah_transactions update_fidyah_transactions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_fidyah_transactions_updated_at BEFORE UPDATE ON public.fidyah_transactions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: fund_ledger update_fund_ledger_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_fund_ledger_updated_at BEFORE UPDATE ON public.fund_ledger FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: mustahik update_mustahik_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_mustahik_updated_at BEFORE UPDATE ON public.mustahik FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: muzakki_members update_muzakki_members_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_muzakki_members_updated_at BEFORE UPDATE ON public.muzakki_members FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: muzakki update_muzakki_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_muzakki_updated_at BEFORE UPDATE ON public.muzakki FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: periods update_periods_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_periods_updated_at BEFORE UPDATE ON public.periods FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: profiles update_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: user_roles update_user_roles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_user_roles_updated_at BEFORE UPDATE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: zakat_distributions update_zakat_distributions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_zakat_distributions_updated_at BEFORE UPDATE ON public.zakat_distributions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: zakat_fitrah_transactions update_zakat_fitrah_transactions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_zakat_fitrah_transactions_updated_at BEFORE UPDATE ON public.zakat_fitrah_transactions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: zakat_mal_transactions update_zakat_mal_transactions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_zakat_mal_transactions_updated_at BEFORE UPDATE ON public.zakat_mal_transactions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: fidyah_distributions fidyah_distributions_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fidyah_distributions
    ADD CONSTRAINT fidyah_distributions_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: fidyah_distributions fidyah_distributions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fidyah_distributions
    ADD CONSTRAINT fidyah_distributions_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: fidyah_distributions fidyah_distributions_distributed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fidyah_distributions
    ADD CONSTRAINT fidyah_distributions_distributed_by_fkey FOREIGN KEY (distributed_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: fidyah_distributions fidyah_distributions_mustahik_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fidyah_distributions
    ADD CONSTRAINT fidyah_distributions_mustahik_id_fkey FOREIGN KEY (mustahik_id) REFERENCES public.mustahik(id) ON DELETE RESTRICT;


--
-- Name: fidyah_distributions fidyah_distributions_period_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fidyah_distributions
    ADD CONSTRAINT fidyah_distributions_period_id_fkey FOREIGN KEY (period_id) REFERENCES public.periods(id) ON DELETE RESTRICT;


--
-- Name: fidyah_transactions fidyah_transactions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fidyah_transactions
    ADD CONSTRAINT fidyah_transactions_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: fidyah_transactions fidyah_transactions_payer_muzakki_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fidyah_transactions
    ADD CONSTRAINT fidyah_transactions_payer_muzakki_id_fkey FOREIGN KEY (payer_muzakki_id) REFERENCES public.muzakki(id) ON DELETE RESTRICT;


--
-- Name: fidyah_transactions fidyah_transactions_period_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fidyah_transactions
    ADD CONSTRAINT fidyah_transactions_period_id_fkey FOREIGN KEY (period_id) REFERENCES public.periods(id) ON DELETE RESTRICT;


--
-- Name: fund_ledger fund_ledger_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_ledger
    ADD CONSTRAINT fund_ledger_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: fund_ledger fund_ledger_period_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_ledger
    ADD CONSTRAINT fund_ledger_period_id_fkey FOREIGN KEY (period_id) REFERENCES public.periods(id) ON DELETE RESTRICT;


--
-- Name: mustahik mustahik_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mustahik
    ADD CONSTRAINT mustahik_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: muzakki muzakki_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.muzakki
    ADD CONSTRAINT muzakki_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: muzakki_members muzakki_members_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.muzakki_members
    ADD CONSTRAINT muzakki_members_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: muzakki_members muzakki_members_muzakki_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.muzakki_members
    ADD CONSTRAINT muzakki_members_muzakki_id_fkey FOREIGN KEY (muzakki_id) REFERENCES public.muzakki(id) ON DELETE CASCADE;


--
-- Name: periods periods_archived_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.periods
    ADD CONSTRAINT periods_archived_by_fkey FOREIGN KEY (archived_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: periods periods_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.periods
    ADD CONSTRAINT periods_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: zakat_distributions zakat_distributions_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zakat_distributions
    ADD CONSTRAINT zakat_distributions_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: zakat_distributions zakat_distributions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zakat_distributions
    ADD CONSTRAINT zakat_distributions_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: zakat_distributions zakat_distributions_distributed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zakat_distributions
    ADD CONSTRAINT zakat_distributions_distributed_by_fkey FOREIGN KEY (distributed_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: zakat_distributions zakat_distributions_mustahik_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zakat_distributions
    ADD CONSTRAINT zakat_distributions_mustahik_id_fkey FOREIGN KEY (mustahik_id) REFERENCES public.mustahik(id) ON DELETE RESTRICT;


--
-- Name: zakat_distributions zakat_distributions_period_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zakat_distributions
    ADD CONSTRAINT zakat_distributions_period_id_fkey FOREIGN KEY (period_id) REFERENCES public.periods(id) ON DELETE RESTRICT;


--
-- Name: zakat_fitrah_transaction_items zakat_fitrah_transaction_items_muzakki_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zakat_fitrah_transaction_items
    ADD CONSTRAINT zakat_fitrah_transaction_items_muzakki_member_id_fkey FOREIGN KEY (muzakki_member_id) REFERENCES public.muzakki_members(id) ON DELETE RESTRICT;


--
-- Name: zakat_fitrah_transaction_items zakat_fitrah_transaction_items_period_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zakat_fitrah_transaction_items
    ADD CONSTRAINT zakat_fitrah_transaction_items_period_id_fkey FOREIGN KEY (period_id) REFERENCES public.periods(id) ON DELETE RESTRICT;


--
-- Name: zakat_fitrah_transaction_items zakat_fitrah_transaction_items_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zakat_fitrah_transaction_items
    ADD CONSTRAINT zakat_fitrah_transaction_items_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.zakat_fitrah_transactions(id) ON DELETE CASCADE;


--
-- Name: zakat_fitrah_transactions zakat_fitrah_transactions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zakat_fitrah_transactions
    ADD CONSTRAINT zakat_fitrah_transactions_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: zakat_fitrah_transactions zakat_fitrah_transactions_muzakki_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zakat_fitrah_transactions
    ADD CONSTRAINT zakat_fitrah_transactions_muzakki_id_fkey FOREIGN KEY (muzakki_id) REFERENCES public.muzakki(id) ON DELETE RESTRICT;


--
-- Name: zakat_fitrah_transactions zakat_fitrah_transactions_period_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zakat_fitrah_transactions
    ADD CONSTRAINT zakat_fitrah_transactions_period_id_fkey FOREIGN KEY (period_id) REFERENCES public.periods(id) ON DELETE RESTRICT;


--
-- Name: zakat_mal_transactions zakat_mal_transactions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zakat_mal_transactions
    ADD CONSTRAINT zakat_mal_transactions_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: zakat_mal_transactions zakat_mal_transactions_muzakki_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zakat_mal_transactions
    ADD CONSTRAINT zakat_mal_transactions_muzakki_id_fkey FOREIGN KEY (muzakki_id) REFERENCES public.muzakki(id) ON DELETE RESTRICT;


--
-- Name: zakat_mal_transactions zakat_mal_transactions_period_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zakat_mal_transactions
    ADD CONSTRAINT zakat_mal_transactions_period_id_fkey FOREIGN KEY (period_id) REFERENCES public.periods(id) ON DELETE RESTRICT;


--
-- Name: fidyah_distributions Admins and Zakat Officers can create fidyah distributions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and Zakat Officers can create fidyah distributions" ON public.fidyah_distributions FOR INSERT TO authenticated WITH CHECK ((public.has_any_role(auth.uid(), ARRAY['super_admin'::public.app_role, 'chairman'::public.app_role, 'zakat_officer'::public.app_role]) AND public.is_period_active(period_id)));


--
-- Name: fidyah_transactions Admins and Zakat Officers can create fidyah transactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and Zakat Officers can create fidyah transactions" ON public.fidyah_transactions FOR INSERT TO authenticated WITH CHECK ((public.has_any_role(auth.uid(), ARRAY['super_admin'::public.app_role, 'chairman'::public.app_role, 'zakat_officer'::public.app_role]) AND public.is_period_active(period_id)));


--
-- Name: fund_ledger Admins and Zakat Officers can create ledger entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and Zakat Officers can create ledger entries" ON public.fund_ledger FOR INSERT TO authenticated WITH CHECK ((public.has_any_role(auth.uid(), ARRAY['super_admin'::public.app_role, 'chairman'::public.app_role, 'zakat_officer'::public.app_role]) AND public.is_period_active(period_id)));


--
-- Name: mustahik Admins and Zakat Officers can create mustahik; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and Zakat Officers can create mustahik" ON public.mustahik FOR INSERT TO authenticated WITH CHECK (public.has_any_role(auth.uid(), ARRAY['super_admin'::public.app_role, 'chairman'::public.app_role, 'zakat_officer'::public.app_role]));


--
-- Name: muzakki Admins and Zakat Officers can create muzakki; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and Zakat Officers can create muzakki" ON public.muzakki FOR INSERT TO authenticated WITH CHECK (public.has_any_role(auth.uid(), ARRAY['super_admin'::public.app_role, 'chairman'::public.app_role, 'zakat_officer'::public.app_role]));


--
-- Name: muzakki_members Admins and Zakat Officers can create muzakki members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and Zakat Officers can create muzakki members" ON public.muzakki_members FOR INSERT TO authenticated WITH CHECK (public.has_any_role(auth.uid(), ARRAY['super_admin'::public.app_role, 'chairman'::public.app_role, 'zakat_officer'::public.app_role]));


--
-- Name: zakat_distributions Admins and Zakat Officers can create zakat distributions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and Zakat Officers can create zakat distributions" ON public.zakat_distributions FOR INSERT TO authenticated WITH CHECK ((public.has_any_role(auth.uid(), ARRAY['super_admin'::public.app_role, 'chairman'::public.app_role, 'zakat_officer'::public.app_role]) AND public.is_period_active(period_id)));


--
-- Name: zakat_fitrah_transaction_items Admins and Zakat Officers can create zakat fitrah transaction i; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and Zakat Officers can create zakat fitrah transaction i" ON public.zakat_fitrah_transaction_items FOR INSERT TO authenticated WITH CHECK ((public.has_any_role(auth.uid(), ARRAY['super_admin'::public.app_role, 'chairman'::public.app_role, 'zakat_officer'::public.app_role]) AND public.is_period_active(period_id)));


--
-- Name: zakat_fitrah_transactions Admins and Zakat Officers can create zakat fitrah transactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and Zakat Officers can create zakat fitrah transactions" ON public.zakat_fitrah_transactions FOR INSERT TO authenticated WITH CHECK ((public.has_any_role(auth.uid(), ARRAY['super_admin'::public.app_role, 'chairman'::public.app_role, 'zakat_officer'::public.app_role]) AND public.is_period_active(period_id)));


--
-- Name: zakat_mal_transactions Admins and Zakat Officers can create zakat mal transactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and Zakat Officers can create zakat mal transactions" ON public.zakat_mal_transactions FOR INSERT TO authenticated WITH CHECK ((public.has_any_role(auth.uid(), ARRAY['super_admin'::public.app_role, 'chairman'::public.app_role, 'zakat_officer'::public.app_role]) AND public.is_period_active(period_id)));


--
-- Name: fidyah_distributions Admins and Zakat Officers can update fidyah distributions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and Zakat Officers can update fidyah distributions" ON public.fidyah_distributions FOR UPDATE TO authenticated USING ((public.has_any_role(auth.uid(), ARRAY['super_admin'::public.app_role, 'chairman'::public.app_role, 'zakat_officer'::public.app_role]) AND public.is_period_active(period_id)));


--
-- Name: fidyah_transactions Admins and Zakat Officers can update fidyah transactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and Zakat Officers can update fidyah transactions" ON public.fidyah_transactions FOR UPDATE TO authenticated USING ((public.has_any_role(auth.uid(), ARRAY['super_admin'::public.app_role, 'chairman'::public.app_role, 'zakat_officer'::public.app_role]) AND public.is_period_active(period_id)));


--
-- Name: mustahik Admins and Zakat Officers can update mustahik; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and Zakat Officers can update mustahik" ON public.mustahik FOR UPDATE TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['super_admin'::public.app_role, 'chairman'::public.app_role, 'zakat_officer'::public.app_role]));


--
-- Name: muzakki Admins and Zakat Officers can update muzakki; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and Zakat Officers can update muzakki" ON public.muzakki FOR UPDATE TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['super_admin'::public.app_role, 'chairman'::public.app_role, 'zakat_officer'::public.app_role]));


--
-- Name: muzakki_members Admins and Zakat Officers can update muzakki members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and Zakat Officers can update muzakki members" ON public.muzakki_members FOR UPDATE TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['super_admin'::public.app_role, 'chairman'::public.app_role, 'zakat_officer'::public.app_role]));


--
-- Name: zakat_distributions Admins and Zakat Officers can update zakat distributions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and Zakat Officers can update zakat distributions" ON public.zakat_distributions FOR UPDATE TO authenticated USING ((public.has_any_role(auth.uid(), ARRAY['super_admin'::public.app_role, 'chairman'::public.app_role, 'zakat_officer'::public.app_role]) AND public.is_period_active(period_id)));


--
-- Name: zakat_fitrah_transaction_items Admins and Zakat Officers can update zakat fitrah transaction i; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and Zakat Officers can update zakat fitrah transaction i" ON public.zakat_fitrah_transaction_items FOR UPDATE TO authenticated USING ((public.has_any_role(auth.uid(), ARRAY['super_admin'::public.app_role, 'chairman'::public.app_role, 'zakat_officer'::public.app_role]) AND public.is_period_active(period_id)));


--
-- Name: zakat_fitrah_transactions Admins and Zakat Officers can update zakat fitrah transactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and Zakat Officers can update zakat fitrah transactions" ON public.zakat_fitrah_transactions FOR UPDATE TO authenticated USING ((public.has_any_role(auth.uid(), ARRAY['super_admin'::public.app_role, 'chairman'::public.app_role, 'zakat_officer'::public.app_role]) AND public.is_period_active(period_id)));


--
-- Name: zakat_mal_transactions Admins and Zakat Officers can update zakat mal transactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and Zakat Officers can update zakat mal transactions" ON public.zakat_mal_transactions FOR UPDATE TO authenticated USING ((public.has_any_role(auth.uid(), ARRAY['super_admin'::public.app_role, 'chairman'::public.app_role, 'zakat_officer'::public.app_role]) AND public.is_period_active(period_id)));


--
-- Name: periods Admins can create periods; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can create periods" ON public.periods FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));


--
-- Name: fidyah_transactions Admins can delete fidyah transactions in active periods; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete fidyah transactions in active periods" ON public.fidyah_transactions FOR DELETE TO authenticated USING ((public.is_admin(auth.uid()) AND public.is_period_active(period_id)));


--
-- Name: fidyah_distributions Admins can delete pending fidyah distributions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete pending fidyah distributions" ON public.fidyah_distributions FOR DELETE TO authenticated USING ((public.is_admin(auth.uid()) AND public.is_period_active(period_id) AND (status = 'pending'::public.distribution_status)));


--
-- Name: zakat_distributions Admins can delete pending zakat distributions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete pending zakat distributions" ON public.zakat_distributions FOR DELETE TO authenticated USING ((public.is_admin(auth.uid()) AND public.is_period_active(period_id) AND (status = 'pending'::public.distribution_status)));


--
-- Name: user_roles Admins can delete roles except super_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete roles except super_admin" ON public.user_roles FOR DELETE USING ((public.is_admin(auth.uid()) AND (role <> 'super_admin'::public.app_role)));


--
-- Name: zakat_fitrah_transaction_items Admins can delete zakat fitrah transaction items in active peri; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete zakat fitrah transaction items in active peri" ON public.zakat_fitrah_transaction_items FOR DELETE TO authenticated USING ((public.is_admin(auth.uid()) AND public.is_period_active(period_id)));


--
-- Name: zakat_fitrah_transactions Admins can delete zakat fitrah transactions in active periods; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete zakat fitrah transactions in active periods" ON public.zakat_fitrah_transactions FOR DELETE TO authenticated USING ((public.is_admin(auth.uid()) AND public.is_period_active(period_id)));


--
-- Name: zakat_mal_transactions Admins can delete zakat mal transactions in active periods; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete zakat mal transactions in active periods" ON public.zakat_mal_transactions FOR DELETE TO authenticated USING ((public.is_admin(auth.uid()) AND public.is_period_active(period_id)));


--
-- Name: user_roles Admins can insert roles except super_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert roles except super_admin" ON public.user_roles FOR INSERT WITH CHECK ((public.is_admin(auth.uid()) AND (role <> 'super_admin'::public.app_role)));


--
-- Name: periods Admins can update active periods; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update active periods" ON public.periods FOR UPDATE TO authenticated USING ((public.is_admin(auth.uid()) AND (status = 'active'::public.period_status))) WITH CHECK (public.is_admin(auth.uid()));


--
-- Name: profiles Admins can update all profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update all profiles" ON public.profiles FOR UPDATE USING (public.is_admin(auth.uid()));


--
-- Name: fund_ledger Admins can update ledger entries in active periods; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update ledger entries in active periods" ON public.fund_ledger FOR UPDATE TO authenticated USING ((public.is_admin(auth.uid()) AND public.is_period_active(period_id)));


--
-- Name: profiles Admins can view all profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT USING (public.is_admin(auth.uid()));


--
-- Name: user_roles Admins can view all roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all roles" ON public.user_roles FOR SELECT USING (public.is_admin(auth.uid()));


--
-- Name: fidyah_distributions Authenticated users can view fidyah distributions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view fidyah distributions" ON public.fidyah_distributions FOR SELECT TO authenticated USING (true);


--
-- Name: fidyah_transactions Authenticated users can view fidyah transactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view fidyah transactions" ON public.fidyah_transactions FOR SELECT TO authenticated USING (true);


--
-- Name: fund_ledger Authenticated users can view fund ledger; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view fund ledger" ON public.fund_ledger FOR SELECT TO authenticated USING (true);


--
-- Name: mustahik Authenticated users can view mustahik; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view mustahik" ON public.mustahik FOR SELECT TO authenticated USING (true);


--
-- Name: muzakki Authenticated users can view muzakki; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view muzakki" ON public.muzakki FOR SELECT TO authenticated USING (true);


--
-- Name: muzakki_members Authenticated users can view muzakki members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view muzakki members" ON public.muzakki_members FOR SELECT TO authenticated USING (true);


--
-- Name: periods Authenticated users can view periods; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view periods" ON public.periods FOR SELECT TO authenticated USING (true);


--
-- Name: zakat_distributions Authenticated users can view zakat distributions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view zakat distributions" ON public.zakat_distributions FOR SELECT TO authenticated USING (true);


--
-- Name: zakat_fitrah_transaction_items Authenticated users can view zakat fitrah transaction items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view zakat fitrah transaction items" ON public.zakat_fitrah_transaction_items FOR SELECT TO authenticated USING (true);


--
-- Name: zakat_fitrah_transactions Authenticated users can view zakat fitrah transactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view zakat fitrah transactions" ON public.zakat_fitrah_transactions FOR SELECT TO authenticated USING (true);


--
-- Name: zakat_mal_transactions Authenticated users can view zakat mal transactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view zakat mal transactions" ON public.zakat_mal_transactions FOR SELECT TO authenticated USING (true);


--
-- Name: periods Super admins can delete active periods; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admins can delete active periods" ON public.periods FOR DELETE TO authenticated USING ((public.has_role(auth.uid(), 'super_admin'::public.app_role) AND (status = 'active'::public.period_status)));


--
-- Name: fund_ledger Super admins can delete ledger entries in active periods; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admins can delete ledger entries in active periods" ON public.fund_ledger FOR DELETE TO authenticated USING ((public.has_role(auth.uid(), 'super_admin'::public.app_role) AND public.is_period_active(period_id)));


--
-- Name: user_roles Super admins can manage all roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admins can manage all roles" ON public.user_roles USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));


--
-- Name: profiles Users can update their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING ((auth.uid() = id));


--
-- Name: profiles Users can view their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING ((auth.uid() = id));


--
-- Name: user_roles Users can view their own roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own roles" ON public.user_roles FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: fidyah_distributions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fidyah_distributions ENABLE ROW LEVEL SECURITY;

--
-- Name: fidyah_transactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fidyah_transactions ENABLE ROW LEVEL SECURITY;

--
-- Name: fund_ledger; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fund_ledger ENABLE ROW LEVEL SECURITY;

--
-- Name: mustahik; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mustahik ENABLE ROW LEVEL SECURITY;

--
-- Name: muzakki; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.muzakki ENABLE ROW LEVEL SECURITY;

--
-- Name: muzakki_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.muzakki_members ENABLE ROW LEVEL SECURITY;

--
-- Name: periods; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.periods ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: zakat_distributions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.zakat_distributions ENABLE ROW LEVEL SECURITY;

--
-- Name: zakat_fitrah_transaction_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.zakat_fitrah_transaction_items ENABLE ROW LEVEL SECURITY;

--
-- Name: zakat_fitrah_transactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.zakat_fitrah_transactions ENABLE ROW LEVEL SECURITY;

--
-- Name: zakat_mal_transactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.zakat_mal_transactions ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--


