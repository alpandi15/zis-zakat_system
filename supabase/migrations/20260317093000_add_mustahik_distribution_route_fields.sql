alter table public.mustahik
  add column if not exists distribution_rt text,
  add column if not exists distribution_lane text,
  add column if not exists delivery_order integer;

alter table public.mustahik
  drop constraint if exists mustahik_delivery_order_check;

alter table public.mustahik
  add constraint mustahik_delivery_order_check
  check (delivery_order is null or delivery_order > 0);

create index if not exists mustahik_distribution_rt_idx
  on public.mustahik (distribution_rt);

create index if not exists mustahik_distribution_lane_idx
  on public.mustahik (distribution_lane);

create index if not exists mustahik_delivery_route_idx
  on public.mustahik (distribution_rt, distribution_lane, delivery_order, name);
