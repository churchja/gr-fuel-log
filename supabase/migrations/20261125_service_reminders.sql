-- Service reminders (v29): every logged service lives beside oil changes, told apart by `item`.
alter table public.oil_changes add column if not exists item text not null default 'oil';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'oil_changes_item_len') then
    alter table public.oil_changes add constraint oil_changes_item_len check (length(item) between 1 and 40);
  end if;
end $$;
create index if not exists oil_changes_user_item on public.oil_changes (user_id, item, date);

-- An owner picked a model year whose Toyota maintenance guide hasn't been checked yet. One warning per model and
-- year goes to the admin, so the guide can be checked and added. The app uses the newest checked year meanwhile.
create or replace function public.report_unchecked_year(p_model text, p_year int)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.is_approved() then return; end if;
  if p_model !~ '^[a-z0-9_]{2,12}$' or p_year is null or p_year not between 2015 and 2040 then return; end if;
  if exists (select 1 from public.alerts where kind = 'unchecked_year' and message like format('%%[%s %s]%%', p_model, p_year)) then return; end if;
  insert into public.alerts (kind, message)
  values ('unchecked_year', format('An owner picked a model year with no checked service schedule yet [%s %s]. The app is using the newest checked year until that Toyota maintenance guide is checked and added.', p_model, p_year));
end $$;
revoke all on function public.report_unchecked_year(text, int) from public, anon;
grant execute on function public.report_unchecked_year(text, int) to authenticated;
