-- Station search that works like a map search (v28).
-- zip_places (GeoNames U.S. ZIP codes, CC BY 4.0) and us_states are created and filled by 20261123_zip_places.sql
-- and the zips edge function.

create or replace function public.search_key(t text) returns text language sql immutable as $$
  select btrim(regexp_replace(regexp_replace(replace(lower(coalesce(t, '')), '''', ''), '[^a-z0-9]+', ' ', 'g'), '\s+', ' ', 'g'))
$$;

create or replace function public.station_search_row(s public.stations, p_lat double precision, p_lon double precision, p_place_m double precision)
returns json language sql stable security definer set search_path to 'public' as $$
  select json_build_object(
    'id', s.id, 'source', s.source, 'name', public.station_label(s.id),
    'distance_m', round(public.dist_m(p_lat, p_lon, s.lat, s.lon)::numeric), 'place_m', round(p_place_m::numeric),
    'brand', coalesce(nullif(s.std_brand, ''), s.brand, case when s.source = 'custom' or s.osm_named then s.name end),
    'street', coalesce(nullif(s.std_street, ''), s.street), 'city', s.city, 'state', s.state,
    'standardized', s.std_brand is not null, 'known', public.station_visible(s.id),
    'e85_listed', public.e85_listed_by(s) is not null, 'listed_by', public.e85_listed_by(s), 'e85prices', public.e85p_info(s))
$$;

-- One search box for the whole station list: a ZIP, a town ("Dallas", "Dallas, Texas", "Dallas TX"), a state,
-- a brand, name or street ("Casey's", "Kroger Eldorado"), or a mix ("Shell Dallas", "Casey's 47715").
-- Returns the place it understood, stations nearest that place, and stations whose name or address has every word.
create or replace function public.stations_search(p_q text, p_lat double precision default null, p_lon double precision default null)
returns json language plpgsql stable security definer set search_path to 'public' as $$
declare
  q text := public.search_key(p_q);
  w text[];          -- every word
  rest text[];       -- words left after the place is taken out
  st text;           -- state abbreviation, if the search ends with a state
  pl_lat double precision; pl_lon double precision; pl_label text; pl_kind text;
  others json := '[]';
  k int; n int; cand text;
  brandish boolean := false;
  near json := '[]'; matches json := '[]';
  near_ids uuid[] := '{}';
  words text[];
  radius constant double precision := 80467; -- 50 miles
begin
  if not public.is_approved() or length(q) < 2 then
    return json_build_object('place', null, 'others', '[]'::json, 'name_first', false, 'near', '[]'::json, 'matches', '[]'::json);
  end if;
  w := regexp_split_to_array(q, ' ');
  rest := w;

  -- A ZIP code anywhere in the search.
  select z.lat, z.lon, z.city || ', ' || z.state || ' ' || z.zip into pl_lat, pl_lon, pl_label
    from public.zip_places z where z.zip = (select x from unnest(w) x where x ~ '^\d{5}$' limit 1);
  if pl_lat is not null then
    pl_kind := 'zip';
    rest := array(select x from unnest(w) x where x !~ '^\d{5}$');
  end if;

  -- A state at the end: "texas", "new york", or "tx" after another word.
  n := coalesce(array_length(rest, 1), 0);
  if n >= 2 then
    select s.abbr into st from public.us_states s where s.name_key = rest[n-1] || ' ' || rest[n];
    if st is not null then rest := rest[1:n-2]; end if;
  end if;
  n := coalesce(array_length(rest, 1), 0);
  if st is null and n >= 1 then
    select s.abbr into st from public.us_states s where s.name_key = rest[n] or (n >= 2 and s.abbr = upper(rest[n]));
    if st is not null then rest := rest[1:n-1]; end if;
  end if;
  n := coalesce(array_length(rest, 1), 0);

  -- A town: the longest run of words at the end (or the start) that names one. With no state given, a town near
  -- you wins, then the biggest (most ZIP codes); the next few go back as other places to try.
  if pl_kind is null and n >= 1 then
    for k in reverse least(n, 4)..1 loop
      foreach cand in array array[array_to_string(rest[n-k+1:n], ' '), array_to_string(rest[1:k], ' ')] loop
        with towns as (
          select min(z.city) || ', ' || z.state as label, avg(z.lat) as lat, avg(z.lon) as lon, count(*) as zips
          from public.zip_places z where z.city_key = cand and (st is null or z.state = st) group by z.state
        ), ranked as (
          select t.*, row_number() over (order by (p_lat is not null and public.dist_m(p_lat, p_lon, t.lat, t.lon) <= radius) desc, t.zips desc, t.label) as rk
          from towns t
        )
        select max(lat) filter (where rk = 1), max(lon) filter (where rk = 1), max(label) filter (where rk = 1),
               coalesce(json_agg(label order by rk) filter (where rk between 2 and 4), '[]'::json)
          into pl_lat, pl_lon, pl_label, others from ranked;
        if pl_lat is not null then
          pl_kind := 'town';
          rest := case when array_to_string(rest[n-k+1:n], ' ') = cand then rest[1:n-k] else rest[k+1:n] end;
          exit;
        end if;
      end loop;
      exit when pl_kind is not null;
    end loop;
    -- A single word that is also a brand ("Shell") is a name first; the town is offered as another place.
    if pl_kind = 'town' and st is null and n = 1 then
      select exists (select 1 from public.stations s where s.merged_into is null and public.search_key(coalesce(s.std_brand, s.brand)) = q) into brandish;
    end if;
  end if;
  if pl_kind is null and st is not null and coalesce(array_length(rest, 1), 0) = 0 then
    pl_kind := 'state'; pl_label := (select name from public.us_states where abbr = st);
  end if;
  rest := coalesce(rest, '{}');

  -- Stations nearest the place, narrowed by any other words ("Shell" in "Shell Dallas").
  if pl_kind in ('zip', 'town') and not brandish then
    with c as (
      select s.id, public.dist_m(pl_lat, pl_lon, s.lat, s.lon) as pd
      from public.stations s
      where s.merged_into is null and s.lat is not null
        and (s.source = 'afdc' or (s.source = 'e85prices' and public.e85p_on()) or (s.source = 'osm' and s.osm_named) or public.station_visible(s.id))
        and (select coalesce(bool_and(public.search_key(concat_ws(' ', s.std_brand, s.brand, s.name, s.std_street, s.street)) like '%' || x || '%'), true) from unnest(rest) x)
    ), pick as (
      (select id, pd from c where pd <= radius order by pd limit 25)
      union
      (select id, pd from c where not exists (select 1 from c c2 where c2.pd <= radius) order by pd limit 5)   -- nothing within 50 miles: the closest few anyway
    )
    select coalesce(json_agg(public.station_search_row(s, p_lat, p_lon, pick.pd) order by pick.pd), '[]'::json), coalesce(array_agg(s.id), '{}')
      into near, near_ids
      from pick join public.stations s on s.id = pick.id;
  end if;

  -- Stations whose name or address has every word typed (a state counts as its abbreviation), nearest you first.
  -- A plain place search ("Dallas TX", "75201") skips this: the nearby list is the answer.
  words := array(select x from unnest(w) x
                 where not (st is not null and (x = lower(st) or x = any (regexp_split_to_array((select name_key from public.us_states where abbr = st), ' ')))));
  if pl_kind is null or pl_kind = 'state' or brandish or rest <> '{}' then
    with c as (
      select s.id, public.dist_m(p_lat, p_lon, s.lat, s.lon) as d
      from public.stations s
      where s.merged_into is null and not (s.id = any (near_ids))
        and (s.source = 'afdc' or (s.source = 'e85prices' and public.e85p_on()) or (s.source = 'osm' and s.osm_named) or public.station_visible(s.id))
        and (st is null or upper(s.state) = st)
        and (select coalesce(bool_and(' ' || public.search_key(concat_ws(' ', s.std_brand, s.brand, s.name, s.std_street, s.street, s.city, s.postcode)) || ' ' like '%' || x || '%'), true) from unnest(words) x)
      order by d nulls last, (s.source in ('afdc', 'e85prices')) desc
      limit case when pl_kind = 'state' then 40 else 20 end
    )
    select coalesce(json_agg(public.station_search_row(s, p_lat, p_lon, null) order by c.d nulls last), '[]'::json)
      into matches from c join public.stations s on s.id = c.id;
  end if;

  return json_build_object(
    'place', case when pl_kind is null then null else json_build_object('kind', pl_kind, 'label', pl_label, 'lat', pl_lat, 'lon', pl_lon) end,
    'others', case when brandish then json_build_array(pl_label) else others end,
    'name_first', brandish, 'near', near, 'matches', matches);
end $$;

revoke all on function public.stations_search(text, double precision, double precision) from public, anon;
grant execute on function public.stations_search(text, double precision, double precision) to authenticated;
revoke all on function public.station_search_row(public.stations, double precision, double precision, double precision) from public, anon, authenticated;
