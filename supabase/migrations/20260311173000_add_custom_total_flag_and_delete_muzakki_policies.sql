-- Add explicit flag to mark custom total rice overrides on zakat fitrah transactions
ALTER TABLE public.zakat_fitrah_transactions
  ADD COLUMN IF NOT EXISTS is_custom_total_rice BOOLEAN NOT NULL DEFAULT false;

-- Allow authorized admin roles to delete muzakki and members
DROP POLICY IF EXISTS "Admins and Zakat Officers can delete muzakki" ON public.muzakki;
CREATE POLICY "Admins and Zakat Officers can delete muzakki"
  ON public.muzakki FOR DELETE
  TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['super_admin', 'chairman', 'zakat_officer']::public.app_role[]));

DROP POLICY IF EXISTS "Admins and Zakat Officers can delete muzakki members" ON public.muzakki_members;
CREATE POLICY "Admins and Zakat Officers can delete muzakki members"
  ON public.muzakki_members FOR DELETE
  TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['super_admin', 'chairman', 'zakat_officer']::public.app_role[]));
