-- Cadangan (backup) dan reset data operasional.
--
-- Kedua fungsi berjalan sebagai security definer supaya lengkap dan tidak
-- terhalang row level security, tetapi keduanya menolak pemanggil yang bukan
-- super admin. Peran setara admin lain (ketua, sekretaris, bendahara) sengaja
-- tidak diberi akses karena operasi ini menyentuh seluruh basis data.

-- ---------------------------------------------------------------------------
-- 1. Ekspor seluruh isi tabel sebagai JSON
-- ---------------------------------------------------------------------------
create or replace function public.export_all_data()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  result json;
begin
  if not public.has_role(auth.uid(), 'super_admin'::public.app_role) then
    raise exception 'Akses ditolak: hanya super admin yang boleh mengekspor data';
  end if;

  select json_build_object(
    'generated_at', now(),
    'tables', json_build_object(
      'asnaf_settings', coalesce((select json_agg(t) from public.asnaf_settings t), '[]'::json),
      'profiles', coalesce((select json_agg(t) from public.profiles t), '[]'::json),
      'user_roles', coalesce((select json_agg(t) from public.user_roles t), '[]'::json),
      'periods', coalesce((select json_agg(t) from public.periods t), '[]'::json),
      'muzakki', coalesce((select json_agg(t) from public.muzakki t), '[]'::json),
      'muzakki_members', coalesce((select json_agg(t) from public.muzakki_members t), '[]'::json),
      'mustahik', coalesce((select json_agg(t) from public.mustahik t), '[]'::json),
      'distribution_calculation_batches',
        coalesce((select json_agg(t) from public.distribution_calculation_batches t), '[]'::json),
      'zakat_fitrah_transactions',
        coalesce((select json_agg(t) from public.zakat_fitrah_transactions t), '[]'::json),
      'zakat_fitrah_transaction_items',
        coalesce((select json_agg(t) from public.zakat_fitrah_transaction_items t), '[]'::json),
      'zakat_mal_transactions',
        coalesce((select json_agg(t) from public.zakat_mal_transactions t), '[]'::json),
      'fidyah_transactions',
        coalesce((select json_agg(t) from public.fidyah_transactions t), '[]'::json),
      'distribution_calculation_batch_items',
        coalesce((select json_agg(t) from public.distribution_calculation_batch_items t), '[]'::json),
      'zakat_distributions', coalesce((select json_agg(t) from public.zakat_distributions t), '[]'::json),
      'fidyah_distributions', coalesce((select json_agg(t) from public.fidyah_distributions t), '[]'::json),
      'distribution_assignments',
        coalesce((select json_agg(t) from public.distribution_assignments t), '[]'::json),
      'fund_ledger', coalesce((select json_agg(t) from public.fund_ledger t), '[]'::json)
    )
  )
  into result;

  return result;
end;
$$;

revoke all on function public.export_all_data() from public;
grant execute on function public.export_all_data() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Reset data
--    _scope = 'transactions' : hapus transaksi, distribusi, batch, dan ledger.
--                              Periode, muzakki, mustahik, dan asnaf tetap ada.
--    _scope = 'all'          : tambah hapus muzakki, anggota, mustahik, periode.
--
--    Akun login (profiles, user_roles) dan konfigurasi asnaf tidak pernah
--    dihapus supaya aplikasi tetap bisa dipakai setelah reset.
-- ---------------------------------------------------------------------------
create or replace function public.reset_all_data(_scope text default 'transactions')
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted jsonb := '{}'::jsonb;
  affected bigint;
begin
  if not public.has_role(auth.uid(), 'super_admin'::public.app_role) then
    raise exception 'Akses ditolak: hanya super admin yang boleh mereset data';
  end if;

  if _scope is null or _scope not in ('transactions', 'all') then
    raise exception 'Cakupan reset tidak dikenal: %', coalesce(_scope, '(kosong)');
  end if;

  -- Trigger guard_locked_transaction_mutation menolak hapus/ubah transaksi yang
  -- batch-nya berstatus locked atau distributed. Membatalkan batch lebih dulu
  -- membuat guard itu melepas transaksinya, sehingga penghapusan bisa berjalan.
  update public.distribution_calculation_batches
     set status = 'cancelled'
   where status in ('locked', 'distributed');

  delete from public.fund_ledger;
  get diagnostics affected = row_count;
  deleted := deleted || jsonb_build_object('fund_ledger', affected);

  delete from public.distribution_assignments;
  get diagnostics affected = row_count;
  deleted := deleted || jsonb_build_object('distribution_assignments', affected);

  delete from public.zakat_distributions;
  get diagnostics affected = row_count;
  deleted := deleted || jsonb_build_object('zakat_distributions', affected);

  delete from public.fidyah_distributions;
  get diagnostics affected = row_count;
  deleted := deleted || jsonb_build_object('fidyah_distributions', affected);

  delete from public.distribution_calculation_batch_items;
  get diagnostics affected = row_count;
  deleted := deleted || jsonb_build_object('distribution_calculation_batch_items', affected);

  delete from public.zakat_fitrah_transaction_items;
  get diagnostics affected = row_count;
  deleted := deleted || jsonb_build_object('zakat_fitrah_transaction_items', affected);

  delete from public.zakat_fitrah_transactions;
  get diagnostics affected = row_count;
  deleted := deleted || jsonb_build_object('zakat_fitrah_transactions', affected);

  delete from public.zakat_mal_transactions;
  get diagnostics affected = row_count;
  deleted := deleted || jsonb_build_object('zakat_mal_transactions', affected);

  delete from public.fidyah_transactions;
  get diagnostics affected = row_count;
  deleted := deleted || jsonb_build_object('fidyah_transactions', affected);

  -- Batch dihapus paling akhir karena transaksi masih mengacu ke kolom locked_batch_id.
  delete from public.distribution_calculation_batches;
  get diagnostics affected = row_count;
  deleted := deleted || jsonb_build_object('distribution_calculation_batches', affected);

  if _scope = 'all' then
    delete from public.muzakki_members;
    get diagnostics affected = row_count;
    deleted := deleted || jsonb_build_object('muzakki_members', affected);

    delete from public.muzakki;
    get diagnostics affected = row_count;
    deleted := deleted || jsonb_build_object('muzakki', affected);

    delete from public.mustahik;
    get diagnostics affected = row_count;
    deleted := deleted || jsonb_build_object('mustahik', affected);

    delete from public.periods;
    get diagnostics affected = row_count;
    deleted := deleted || jsonb_build_object('periods', affected);
  end if;

  return json_build_object(
    'scope', _scope,
    'reset_at', now(),
    'deleted', deleted
  );
end;
$$;

revoke all on function public.reset_all_data(text) from public;
grant execute on function public.reset_all_data(text) to authenticated;
