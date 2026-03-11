-- Add dependent-status flag for muzakki members (used for zakat fitrah tanggungan)
ALTER TABLE public.muzakki_members
ADD COLUMN IF NOT EXISTS is_dependent BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_muzakki_members_is_dependent
ON public.muzakki_members(is_dependent);

-- Link fidyah payment to a specific family member (payer)
ALTER TABLE public.fidyah_transactions
ADD COLUMN IF NOT EXISTS payer_member_id UUID REFERENCES public.muzakki_members(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_fidyah_transactions_payer_member_id
ON public.fidyah_transactions(payer_member_id);

-- Backfill payer_member_id from existing data when possible
UPDATE public.fidyah_transactions ft
SET payer_member_id = (
  SELECT mm.id
  FROM public.muzakki_members mm
  WHERE lower(mm.name) = lower(ft.payer_name)
    AND (ft.payer_muzakki_id IS NULL OR mm.muzakki_id = ft.payer_muzakki_id)
  ORDER BY mm.created_at
  LIMIT 1
)
WHERE ft.payer_member_id IS NULL;

-- Link zakat mal transaction to a specific family member (muzzaki member)
ALTER TABLE public.zakat_mal_transactions
ADD COLUMN IF NOT EXISTS muzakki_member_id UUID REFERENCES public.muzakki_members(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_zakat_mal_transactions_muzakki_member_id
ON public.zakat_mal_transactions(muzakki_member_id);

-- Backfill muzakki_member_id from household-level muzakki when possible
UPDATE public.zakat_mal_transactions zmt
SET muzakki_member_id = (
  SELECT mm.id
  FROM public.muzakki_members mm
  WHERE mm.muzakki_id = zmt.muzakki_id
  ORDER BY
    CASE WHEN mm.relationship = 'head_of_family' THEN 0 ELSE 1 END,
    mm.created_at
  LIMIT 1
)
WHERE zmt.muzakki_member_id IS NULL;
