create or replace function public.public_dashboard_summary()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  result json;
begin
  with active_period as (
    select *
    from public.periods
    where status = 'active'
    order by hijri_year desc
    limit 1
  ),
  fitrah as (
    select
      coalesce(sum(money_amount), 0) as cash,
      coalesce(sum(rice_amount_kg), 0) as rice,
      coalesce(sum(total_members), 0) as jiwa,
      count(*) as trx
    from public.zakat_fitrah_transactions
    where period_id = (select id from active_period)
      and coalesce(is_void, false) = false
  ),
  mal as (
    select
      coalesce(sum(final_zakat_amount), 0) as cash,
      count(*) as trx
    from public.zakat_mal_transactions
    where period_id = (select id from active_period)
      and coalesce(is_void, false) = false
  ),
  fidyah as (
    select
      coalesce(sum(cash_amount), 0) as cash,
      coalesce(sum(food_amount_kg), 0) as food,
      count(*) as trx
    from public.fidyah_transactions
    where period_id = (select id from active_period)
      and coalesce(is_void, false) = false
  ),
  households as (
    select count(*) as total
    from (
      select distinct zft.muzakki_id as muzakki_id
      from public.zakat_fitrah_transactions zft
      where zft.period_id = (select id from active_period)
        and coalesce(zft.is_void, false) = false
        and zft.muzakki_id is not null
      union
      select distinct zmt.muzakki_id as muzakki_id
      from public.zakat_mal_transactions zmt
      where zmt.period_id = (select id from active_period)
        and coalesce(zmt.is_void, false) = false
        and zmt.muzakki_id is not null
      union
      select distinct ft.payer_muzakki_id as muzakki_id
      from public.fidyah_transactions ft
      where ft.period_id = (select id from active_period)
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
      where period_id = (select id from active_period)
        and coalesce(is_void, false) = false
      union all
      select transaction_date as received_at
      from public.zakat_mal_transactions
      where period_id = (select id from active_period)
        and coalesce(is_void, false) = false
      union all
      select transaction_date as received_at
      from public.fidyah_transactions
      where period_id = (select id from active_period)
        and coalesce(is_void, false) = false
    ) receipt_points
  ),
  distributions as (
    select
      (
        select count(*)
        from public.zakat_distributions
        where period_id = (select id from active_period)
          and status = 'distributed'
      ) +
      (
        select count(*)
        from public.fidyah_distributions
        where period_id = (select id from active_period)
          and status = 'distributed'
      ) as total
  )
  select json_build_object(
    'period', (
      select row_to_json(active_period)
      from active_period
    ),
    'received', json_build_object(
      'zakatFitrahCash', coalesce((select cash from fitrah), 0),
      'zakatFitrahRice', coalesce((select rice from fitrah), 0),
      'zakatMal', coalesce((select cash from mal), 0),
      'fidyahCash', coalesce((select cash from fidyah), 0),
      'fidyahFood', coalesce((select food from fidyah), 0)
    ),
    'summary', json_build_object(
      'totalTransactionsFitrah', coalesce((select total from households), 0),
      'totalMuzakkiHouseholds', coalesce((select total from households), 0),
      'totalTransactions',
        coalesce((select trx from fitrah), 0) +
        coalesce((select trx from mal), 0) +
        coalesce((select trx from fidyah), 0),
      'totalJiwaFitrah', coalesce((select jiwa from fitrah), 0),
      'totalDistributions', coalesce((select total from distributions), 0)
    ),
    'receiptWindow', json_build_object(
      'firstReceiptAt', (select first_receipt_at from receipt_window),
      'latestReceiptAt', (select latest_receipt_at from receipt_window)
    )
  )
  into result;

  return result;
end;
$$;

grant execute on function public.public_dashboard_summary() to anon;
grant execute on function public.public_dashboard_summary() to authenticated;
