create or replace function public.dashboard_period_summary(_period_id uuid)
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
    where id = _period_id
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
      and is_void = false
  ),
  mal as (
    select
      coalesce(sum(final_zakat_amount), 0) as cash,
      count(*) as trx
    from public.zakat_mal_transactions
    where period_id = (select id from selected_period)
      and is_void = false
  ),
  fidyah as (
    select
      coalesce(sum(cash_amount), 0) as cash,
      coalesce(sum(food_amount_kg), 0) as food,
      count(*) as trx
    from public.fidyah_transactions
    where period_id = (select id from selected_period)
      and is_void = false
  ),
  households as (
    select count(*) as total
    from (
      select distinct zft.muzakki_id as muzakki_id
      from public.zakat_fitrah_transactions zft
      where zft.period_id = (select id from selected_period)
        and zft.is_void = false
        and zft.muzakki_id is not null
      union
      select distinct zmt.muzakki_id as muzakki_id
      from public.zakat_mal_transactions zmt
      where zmt.period_id = (select id from selected_period)
        and zmt.is_void = false
        and zmt.muzakki_id is not null
      union
      select distinct ft.payer_muzakki_id as muzakki_id
      from public.fidyah_transactions ft
      where ft.period_id = (select id from selected_period)
        and ft.is_void = false
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
        and is_void = false
      union all
      select transaction_date as received_at
      from public.zakat_mal_transactions
      where period_id = (select id from selected_period)
        and is_void = false
      union all
      select transaction_date as received_at
      from public.fidyah_transactions
      where period_id = (select id from selected_period)
        and is_void = false
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
    'period_id', sp.id,
    'period_name', sp.name,
    'hijri_year', sp.hijri_year,
    'gregorian_year', sp.gregorian_year,
    'zakat_fitrah_cash', coalesce((select cash from fitrah), 0),
    'zakat_fitrah_rice_kg', coalesce((select rice from fitrah), 0),
    'zakat_mal', coalesce((select cash from mal), 0),
    'fidyah_cash', coalesce((select cash from fidyah), 0),
    'fidyah_food_kg', coalesce((select food from fidyah), 0),
    'total_muzakki', coalesce((select total from households), 0),
    'total_muzakki_households', coalesce((select total from households), 0),
    'total_jiwa_fitrah', coalesce((select jiwa from fitrah), 0),
    'total_mustahik', coalesce((select total from distributed_mustahik), 0),
    'total_distributions', coalesce((select total from distributions), 0),
    'total_combined_cash',
      coalesce((select cash from fitrah), 0) +
      coalesce((select cash from mal), 0) +
      coalesce((select cash from fidyah), 0),
    'first_receipt_at', (select first_receipt_at from receipt_window),
    'latest_receipt_at', (select latest_receipt_at from receipt_window)
  )
  into result
  from selected_period sp;

  return result;
end;
$$;

grant execute on function public.dashboard_period_summary(uuid) to authenticated;
