-- A short record of each weekly station-list update, for the About page (v28).
create table if not exists public.station_updates (
  id bigserial primary key,
  source text not null check (source in ('afdc', 'e85prices')),
  ran_at timestamptz not null default now(),
  listed int,          -- stations in the source's list this week
  added int,           -- new stations on the map
  removed int,         -- stations taken off the map
  total int,           -- stations from this source on the map afterward
  recent_prices int    -- E85prices.com only: prices reported in the past 7 days
);
alter table public.station_updates enable row level security;
revoke all on public.station_updates from anon, authenticated;

-- Called by the afdc and e85prices edge functions (service role) at the end of a run.
create or replace function public.log_station_update(p_source text, p_started timestamptz, p_listed int, p_removed int)
returns void language sql security definer set search_path to 'public' as $$
  insert into public.station_updates (source, ran_at, listed, added, removed, total, recent_prices)
  select p_source, now(), p_listed,
    (select count(*) from public.stations where source = p_source and created_at >= p_started),
    p_removed,
    (select count(*) from public.stations where source = p_source and merged_into is null),
    case when p_source = 'e85prices' then (select count(*) from public.e85p_stations where price_date >= current_date - 7) end
$$;
revoke all on function public.log_station_update(text, timestamptz, int, int) from public, anon, authenticated;

-- What the About page shows: stations on the map now, and the latest update from each list.
create or replace function public.station_summary()
returns json language sql stable security definer set search_path to 'public' as $$
  select case when not public.is_approved() then null else json_build_object(
    'total', (select count(*) from public.stations where merged_into is null and source in ('afdc', 'e85prices')),
    'doe', (select row_to_json(u) from (select ran_at, listed, added, removed, total from public.station_updates where source = 'afdc' order by ran_at desc limit 1) u),
    'e85prices', (select row_to_json(u) from (select ran_at, listed, added, removed, total, recent_prices from public.station_updates where source = 'e85prices' order by ran_at desc limit 1) u)
  ) end
$$;
revoke all on function public.station_summary() from public, anon;
grant execute on function public.station_summary() to authenticated;

-- The runs before this log existed (removed count for the DOE run wasn't kept).
insert into public.station_updates (source, ran_at, listed, added, removed, total, recent_prices)
select 'afdc', '2026-11-16 09:17:05+00', null, 5, null, (select count(*) from public.stations where source = 'afdc' and merged_into is null), null
where not exists (select 1 from public.station_updates where source = 'afdc');
insert into public.station_updates (source, ran_at, listed, added, removed, total, recent_prices)
select 'e85prices', '2026-11-23 05:30:03+00', 6316, 9, 0, (select count(*) from public.stations where source = 'e85prices' and merged_into is null),
  (select count(*) from public.e85p_stations where price_date >= date '2026-11-16')
where not exists (select 1 from public.station_updates where source = 'e85prices');
