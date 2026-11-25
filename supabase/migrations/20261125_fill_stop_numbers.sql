-- Each pump stop inside a fill: gallons, price, total and grade can't be negative, and an ethanol % runs 0 to 100.
-- The fills table already checks its own columns (odometer, miles to empty, sensor readings, target); this covers
-- the numbers inside the stops list too. Every stored fill passed before this was added.
create or replace function public.stops_numbers_ok(p_stops jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select not exists (
    select 1
    from jsonb_array_elements(case when jsonb_typeof(p_stops) = 'array' then p_stops else '[]'::jsonb end) as s
    where (jsonb_typeof(s->'gallons') = 'number' and (s->>'gallons')::numeric < 0)
       or (jsonb_typeof(s->'price') = 'number' and (s->>'price')::numeric < 0)
       or (jsonb_typeof(s->'total') = 'number' and (s->>'total')::numeric < 0)
       or (jsonb_typeof(s->'grade') = 'number' and (s->>'grade')::numeric < 0)
       or (jsonb_typeof(s->'ethanol') = 'number' and ((s->>'ethanol')::numeric < 0 or (s->>'ethanol')::numeric > 100))
  );
$$;

alter table public.fills drop constraint if exists fills_stops_numbers_check;
alter table public.fills add constraint fills_stops_numbers_check check (public.stops_numbers_ok(stops));
