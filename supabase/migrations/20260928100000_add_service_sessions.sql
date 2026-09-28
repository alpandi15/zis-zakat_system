-- Status layanan: panitia bisa membuka dan menutup loket beberapa kali dalam
-- satu hari (misalnya sesi siang lalu sesi malam). Satu baris = satu sesi.
-- Sesi yang sedang berjalan ditandai dengan closed_at yang masih null.

create table if not exists public.service_sessions (
  id uuid primary key default gen_random_uuid(),
  opened_at timestamptz not null default now(),
  scheduled_close_at timestamptz,
  closed_at timestamptz,
  note text,
  opened_by uuid references auth.users(id) on delete set null,
  closed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Hanya boleh ada satu sesi yang terbuka pada satu waktu.
create unique index if not exists service_sessions_single_open_idx
  on public.service_sessions ((closed_at is null))
  where closed_at is null;

create index if not exists service_sessions_opened_at_idx
  on public.service_sessions (opened_at desc);

drop trigger if exists update_service_sessions_updated_at on public.service_sessions;
create trigger update_service_sessions_updated_at
  before update on public.service_sessions
  for each row execute function public.update_updated_at_column();

alter table public.service_sessions enable row level security;

drop policy if exists "Authenticated can read service sessions" on public.service_sessions;
create policy "Authenticated can read service sessions"
  on public.service_sessions for select to authenticated
  using (true);

drop policy if exists "Petugas can open service sessions" on public.service_sessions;
create policy "Petugas can open service sessions"
  on public.service_sessions for insert to authenticated
  with check (
    public.has_any_role(
      auth.uid(),
      array['super_admin', 'chairman', 'secretary', 'treasurer', 'zakat_officer', 'fidyah_officer']::public.app_role[]
    )
  );

drop policy if exists "Petugas can close service sessions" on public.service_sessions;
create policy "Petugas can close service sessions"
  on public.service_sessions for update to authenticated
  using (
    public.has_any_role(
      auth.uid(),
      array['super_admin', 'chairman', 'secretary', 'treasurer', 'zakat_officer', 'fidyah_officer']::public.app_role[]
    )
  )
  with check (
    public.has_any_role(
      auth.uid(),
      array['super_admin', 'chairman', 'secretary', 'treasurer', 'zakat_officer', 'fidyah_officer']::public.app_role[]
    )
  );

drop policy if exists "Super admins can delete service sessions" on public.service_sessions;
create policy "Super admins can delete service sessions"
  on public.service_sessions for delete to authenticated
  using (public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- ---------------------------------------------------------------------------
-- Papan publik /tv ikut menampilkan status layanan (sedang buka / tutup).
-- ---------------------------------------------------------------------------
create or replace function public.public_dashboard_summary()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  result json;
begin
  with selected_period as (
    select *
    from public.periods
    order by
      (status = 'active') desc,
      hijri_year desc,
      gregorian_year desc,
      start_date desc nulls last,
      created_at desc
    limit 1
  ),
  fitrah as (
    select
      coalesce(sum(money_amount), 0) as cash,
      coalesce(sum(rice_amount_kg), 0) as rice,
      coalesce(sum(total_members), 0) as jiwa,
      count(*) as trx
    from public.zakat_fitrah_transactions
    where period_id = (select id from selected_period)
      and coalesce(is_void, false) = false
  ),
  mal as (
    select
      coalesce(sum(final_zakat_amount), 0) as cash,
      count(*) as trx
    from public.zakat_mal_transactions
    where period_id = (select id from selected_period)
      and coalesce(is_void, false) = false
  ),
  fidyah as (
    select
      coalesce(sum(cash_amount), 0) as cash,
      coalesce(sum(food_amount_kg), 0) as food,
      count(*) as trx
    from public.fidyah_transactions
    where period_id = (select id from selected_period)
      and coalesce(is_void, false) = false
  ),
  households as (
    select count(*) as total
    from (
      select distinct zft.muzakki_id as muzakki_id
      from public.zakat_fitrah_transactions zft
      where zft.period_id = (select id from selected_period)
        and coalesce(zft.is_void, false) = false
        and zft.muzakki_id is not null
      union
      select distinct zmt.muzakki_id as muzakki_id
      from public.zakat_mal_transactions zmt
      where zmt.period_id = (select id from selected_period)
        and coalesce(zmt.is_void, false) = false
        and zmt.muzakki_id is not null
      union
      select distinct ft.payer_muzakki_id as muzakki_id
      from public.fidyah_transactions ft
      where ft.period_id = (select id from selected_period)
        and coalesce(ft.is_void, false) = false
        and ft.payer_muzakki_id is not null
    ) combined_households
  ),
  receipt_window as (
    select
      min(received_at) as first_receipt_at,
      max(received_at) as latest_receipt_at
    from (
      select transaction_date as received_at
      from public.zakat_fitrah_transactions
      where period_id = (select id from selected_period)
        and coalesce(is_void, false) = false
      union all
      select transaction_date as received_at
      from public.zakat_mal_transactions
      where period_id = (select id from selected_period)
        and coalesce(is_void, false) = false
      union all
      select transaction_date as received_at
      from public.fidyah_transactions
      where period_id = (select id from selected_period)
        and coalesce(is_void, false) = false
    ) receipt_points
  ),
  distributed_mustahik as (
    select count(*) as total
    from (
      select distinct mustahik_id
      from public.zakat_distributions
      where period_id = (select id from selected_period)
        and status = 'distributed'
      union
      select distinct mustahik_id
      from public.fidyah_distributions
      where period_id = (select id from selected_period)
        and status = 'distributed'
    ) distributed_targets
  ),
  open_session as (
    select *
    from public.service_sessions
    where closed_at is null
    order by opened_at desc
    limit 1
  ),
  distributions as (
    select
      (
        select count(*)
        from public.zakat_distributions
        where period_id = (select id from selected_period)
          and status = 'distributed'
      ) +
      (
        select count(*)
        from public.fidyah_distributions
        where period_id = (select id from selected_period)
          and status = 'distributed'
      ) as total
  )
  select json_build_object(
    'period', (
      select row_to_json(selected_period)
      from selected_period
    ),
    'received', json_build_object(
      'zakatFitrahCash', coalesce((select cash from fitrah), 0),
      'zakatFitrahRice', coalesce((select rice from fitrah), 0),
      'zakatMal', coalesce((select cash from mal), 0),
      'fidyahCash', coalesce((select cash from fidyah), 0),
      'fidyahFood', coalesce((select food from fidyah), 0)
    ),
    'summary', json_build_object(
      'totalTransactionsFitrah', coalesce((select trx from fitrah), 0),
      'totalMuzakkiHouseholds', coalesce((select total from households), 0),
      'totalTransactions',
        coalesce((select trx from fitrah), 0) +
        coalesce((select trx from mal), 0) +
        coalesce((select trx from fidyah), 0),
      'totalJiwaFitrah', coalesce((select jiwa from fitrah), 0),
      'totalMustahik', coalesce((select total from distributed_mustahik), 0),
      'totalDistributions', coalesce((select total from distributions), 0)
    ),
    'receiptWindow', json_build_object(
      'firstReceiptAt', (select first_receipt_at from receipt_window),
      'latestReceiptAt', (select latest_receipt_at from receipt_window)
    ),
    'service', json_build_object(
      'isOpen', (select exists (select 1 from public.service_sessions where closed_at is null)),
      'openedAt', (select s.opened_at from open_session s),
      'scheduledCloseAt', (select s.scheduled_close_at from open_session s),
      'note', (select s.note from open_session s),
      'lastClosedAt', (select max(closed_at) from public.service_sessions)
    )
  )
  into result;

  return result;
end;
$$;

grant execute on function public.public_dashboard_summary() to anon;
grant execute on function public.public_dashboard_summary() to authenticated;


-- ---------------------------------------------------------------------------
-- Cadangan dan reset ikut mencakup tabel sesi layanan.
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
      'fund_ledger', coalesce((select json_agg(t) from public.fund_ledger t), '[]'::json),
      'service_sessions', coalesce((select json_agg(t) from public.service_sessions t), '[]'::json)
    )
  )
  into result;

  return result;
end;
$$;

revoke all on function public.export_all_data() from public;
grant execute on function public.export_all_data() to authenticated;

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

  delete from public.service_sessions;
  get diagnostics affected = row_count;
  deleted := deleted || jsonb_build_object('service_sessions', affected);

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

-- ---------------------------------------------------------------------------
-- Daftarkan tabel ke publikasi realtime supaya papan /tv langsung berubah
-- begitu loket dibuka atau ditutup, tanpa menunggu polling 30 detik.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'service_sessions'
    ) then
      alter publication supabase_realtime add table public.service_sessions;
    end if;
  end if;
end
$$;
