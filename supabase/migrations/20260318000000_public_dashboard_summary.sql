-- ============================================
-- PUBLIC DASHBOARD SUMMARY FUNCTION
-- Safe for ANON (TV Dashboard)
-- ============================================

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
      count(*) as trx,
      min(transaction_date) as first_at,
      max(transaction_date) as last_at
    from public.zakat_fitrah_transactions
    where period_id = (select id from active_period)
  ),

  mal as (
    select
      coalesce(sum(final_zakat_amount), 0) as cash,
      count(*) as trx,
      min(transaction_date) as first_at,
      max(transaction_date) as last_at
    from public.zakat_mal_transactions
    where period_id = (select id from active_period)
  ),

  fidyah as (
    select
      coalesce(sum(cash_amount), 0) as cash,
      coalesce(sum(food_amount_kg), 0) as food,
      count(*) as trx,
      min(transaction_date) as first_at,
      max(transaction_date) as last_at
    from public.fidyah_transactions
    where period_id = (select id from active_period)
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
      'zakatFitrahCash', (select cash from fitrah),
      'zakatFitrahRice', (select rice from fitrah),
      'zakatMal', (select cash from mal),
      'fidyahCash', (select cash from fidyah),
      'fidyahFood', (select food from fidyah)
    ),

    'summary', json_build_object(
      'totalTransactionsFitrah',
        coalesce((select trx from fitrah), 0),
      'totalTransactions',
        coalesce((select trx from fitrah), 0) +
        coalesce((select trx from mal), 0) +
        coalesce((select trx from fidyah), 0),

      'totalJiwaFitrah', coalesce((select jiwa from fitrah), 0),

      'totalDistributions', coalesce((select total from distributions), 0)
    ),

    'receiptWindow', json_build_object(
      'firstReceiptAt',
        least(
          (select first_at from fitrah),
          (select first_at from mal),
          (select first_at from fidyah)
        ),
      'latestReceiptAt',
        greatest(
          (select last_at from fitrah),
          (select last_at from mal),
          (select last_at from fidyah)
        )
    )

  )
  into result;

  return result;
end;
$$;

-- ============================================
-- PERMISSIONS (ALLOW PUBLIC / ANON)
-- ============================================

grant execute on function public.public_dashboard_summary() to anon;

-- Optional: also allow authenticated (biar konsisten)
grant execute on function public.public_dashboard_summary() to authenticated;