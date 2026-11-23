-- U.S. ZIP codes and towns (GeoNames, CC BY 4.0, https://www.geonames.org) so station search can find a place
-- without an outside service (v28). Filled by the zips edge function; run it again to refresh:
--   select net.http_post(url := '<project>/functions/v1/zips', body := '{}'::jsonb,
--     headers := jsonb_build_object('Content-Type', 'application/json', 'x-fn-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'fn_secret')),
--     timeout_milliseconds := 150000);
create table if not exists public.zip_places (
  zip text primary key,
  city text not null,
  state text not null,
  lat double precision not null,
  lon double precision not null,
  city_key text not null
);
create index if not exists zip_places_city_key on public.zip_places (city_key, state);
alter table public.zip_places enable row level security;
revoke all on public.zip_places from anon, authenticated;

create table if not exists public.us_states (abbr text primary key, name text not null, name_key text not null unique);
alter table public.us_states enable row level security;
revoke all on public.us_states from anon, authenticated;
insert into public.us_states (abbr, name, name_key) values
('AL','Alabama','alabama'),('AK','Alaska','alaska'),('AZ','Arizona','arizona'),('AR','Arkansas','arkansas'),('CA','California','california'),
('CO','Colorado','colorado'),('CT','Connecticut','connecticut'),('DE','Delaware','delaware'),('DC','District of Columbia','district of columbia'),
('FL','Florida','florida'),('GA','Georgia','georgia'),('HI','Hawaii','hawaii'),('ID','Idaho','idaho'),('IL','Illinois','illinois'),('IN','Indiana','indiana'),
('IA','Iowa','iowa'),('KS','Kansas','kansas'),('KY','Kentucky','kentucky'),('LA','Louisiana','louisiana'),('ME','Maine','maine'),('MD','Maryland','maryland'),
('MA','Massachusetts','massachusetts'),('MI','Michigan','michigan'),('MN','Minnesota','minnesota'),('MS','Mississippi','mississippi'),('MO','Missouri','missouri'),
('MT','Montana','montana'),('NE','Nebraska','nebraska'),('NV','Nevada','nevada'),('NH','New Hampshire','new hampshire'),('NJ','New Jersey','new jersey'),
('NM','New Mexico','new mexico'),('NY','New York','new york'),('NC','North Carolina','north carolina'),('ND','North Dakota','north dakota'),('OH','Ohio','ohio'),
('OK','Oklahoma','oklahoma'),('OR','Oregon','oregon'),('PA','Pennsylvania','pennsylvania'),('RI','Rhode Island','rhode island'),('SC','South Carolina','south carolina'),
('SD','South Dakota','south dakota'),('TN','Tennessee','tennessee'),('TX','Texas','texas'),('UT','Utah','utah'),('VT','Vermont','vermont'),('VA','Virginia','virginia'),
('WA','Washington','washington'),('WV','West Virginia','west virginia'),('WI','Wisconsin','wisconsin'),('WY','Wyoming','wyoming'),('PR','Puerto Rico','puerto rico')
on conflict (abbr) do nothing;
