-- Align delete roles with edit roles for transaction tables
-- Edit roles: super_admin, chairman, zakat_officer

DROP POLICY IF EXISTS "Admins can delete zakat fitrah transactions in active periods" ON public.zakat_fitrah_transactions;
CREATE POLICY "Admins and Zakat Officers can delete zakat fitrah transactions"
  ON public.zakat_fitrah_transactions FOR DELETE
  USING (
    public.has_any_role(auth.uid(), ARRAY['super_admin', 'chairman', 'zakat_officer']::public.app_role[])
    AND public.is_period_active(period_id)
  );

DROP POLICY IF EXISTS "Admins can delete zakat fitrah transaction items in active periods" ON public.zakat_fitrah_transaction_items;
CREATE POLICY "Admins and Zakat Officers can delete zakat fitrah transaction items"
  ON public.zakat_fitrah_transaction_items FOR DELETE
  USING (
    public.has_any_role(auth.uid(), ARRAY['super_admin', 'chairman', 'zakat_officer']::public.app_role[])
    AND public.is_period_active(period_id)
  );

DROP POLICY IF EXISTS "Admins can delete zakat mal transactions in active periods" ON public.zakat_mal_transactions;
CREATE POLICY "Admins and Zakat Officers can delete zakat mal transactions"
  ON public.zakat_mal_transactions FOR DELETE
  USING (
    public.has_any_role(auth.uid(), ARRAY['super_admin', 'chairman', 'zakat_officer']::public.app_role[])
    AND public.is_period_active(period_id)
  );

DROP POLICY IF EXISTS "Admins can delete fidyah transactions in active periods" ON public.fidyah_transactions;
CREATE POLICY "Admins and Zakat Officers can delete fidyah transactions"
  ON public.fidyah_transactions FOR DELETE
  USING (
    public.has_any_role(auth.uid(), ARRAY['super_admin', 'chairman', 'zakat_officer']::public.app_role[])
    AND public.is_period_active(period_id)
  );
