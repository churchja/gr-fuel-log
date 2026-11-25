-- Partner versions (branded copies of the app for a kit seller, for example LIMIT+1 Flex Fuel).
-- Nobody is let into a partner version automatically: each account asks, the admin gets an email at the app's own
-- address, and the admin approves or rejects it in Admin. A GR Fuel Log account alone doesn't open a partner version.
create table if not exists public.partners (
  id text primary key check (id ~ '^[a-z0-9_]{2,24}$'),
  name text not null,
  created_at timestamptz not null default now()
);
alter table public.partners enable row level security;
revoke all on public.partners from anon, authenticated;
insert into public.partners (id, name) values ('limitplus1', 'LIMIT+1 Flex Fuel') on conflict (id) do nothing;

create table if not exists public.partner_access (
  user_id uuid not null references auth.users (id) on delete cascade,
  partner text not null references public.partners (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  primary key (user_id, partner)
);
alter table public.partner_access enable row level security;
revoke all on public.partner_access from anon, authenticated;
grant select on public.partner_access to authenticated;
drop policy if exists partner_access_read on public.partner_access;
create policy partner_access_read on public.partner_access for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

-- Called when someone signs in to a partner version. The first call records the request and emails the admin.
-- Returns 'approved', 'pending' or 'rejected'. The admin's own account is let straight in.
create or replace function public.partner_request(p_partner text)
returns text language plpgsql security definer set search_path to 'public' as $$
declare uid uuid := auth.uid(); st text; em text; pname text;
begin
  if uid is null then return null; end if;
  select name into pname from public.partners where id = p_partner;
  if pname is null then return null; end if;
  select status into st from public.partner_access where user_id = uid and partner = p_partner;
  if st is not null then return st; end if;
  if public.is_admin() then
    insert into public.partner_access (user_id, partner, status, decided_at) values (uid, p_partner, 'approved', now());
    return 'approved';
  end if;
  insert into public.partner_access (user_id, partner) values (uid, p_partner);
  select email into em from auth.users where id = uid;
  insert into public.alerts (kind, message)
  values ('partner_request', format('%s asked to use %s. It stays locked on their phone until you approve it in Admin.', coalesce(em, '(no email)'), pname));
  return 'pending';
end $$;
revoke all on function public.partner_request(text) from public, anon;
grant execute on function public.partner_request(text) to authenticated;

-- Whether this account may use a partner version. Server-side checks for partner-only features use this.
create or replace function public.partner_ok(p_partner text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select coalesce((select a.status = 'approved' from public.partner_access a where a.user_id = auth.uid() and a.partner = p_partner), false)
$$;
revoke all on function public.partner_ok(text) from public, anon;
grant execute on function public.partner_ok(text) to authenticated;

-- Admin: who is waiting and who has access.
create or replace function public.admin_partner_list()
returns json language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  return coalesce((select json_agg(x order by (x.status = 'pending') desc, x.requested_at desc) from (
    select a.user_id, a.partner, p.name as partner_name, a.status, a.requested_at, a.decided_at, u.email, pr.handle
    from public.partner_access a join public.partners p on p.id = a.partner
    left join auth.users u on u.id = a.user_id left join public.profiles pr on pr.id = a.user_id
    where not coalesce(pr.is_admin, false)) x), '[]'::json);
end $$;
revoke all on function public.admin_partner_list() from public, anon;
grant execute on function public.admin_partner_list() to authenticated;

-- Admin: approve, reject or take access away again.
create or replace function public.admin_partner_decide(p_user uuid, p_partner text, p_approve boolean)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  update public.partner_access set status = case when p_approve then 'approved' else 'rejected' end, decided_at = now()
  where user_id = p_user and partner = p_partner;
end $$;
revoke all on function public.admin_partner_decide(uuid, text, boolean) from public, anon;
grant execute on function public.admin_partner_decide(uuid, text, boolean) to authenticated;
