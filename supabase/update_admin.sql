-- Admin update: join requests need approval + admin overview of groups.
-- Run once in Supabase: SQL Editor -> New query -> paste all of this -> Run. Safe to re-run.
-- Existing members stay in their groups. (Everything here is also part of schema.sql.)

-- Asking to join a group; an admin approves (-> group_members) or declines.
create table if not exists public.group_join_requests (
  group_id   uuid not null references public.groups (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

alter table public.group_join_requests enable row level security;

-- True if the signed-in user is an admin.
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from profiles where id = auth.uid()), false);
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- Joining needs admin approval: only admins add members. People can still leave on their own.
drop policy if exists "join groups" on public.group_members;
drop policy if exists "admins add members" on public.group_members;
create policy "admins add members" on public.group_members for insert to authenticated with check (public.is_admin());
drop policy if exists "leave groups" on public.group_members;
create policy "leave groups" on public.group_members for delete to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- You see, send and cancel only your own join requests (not for groups you're already in).
drop policy if exists "own join requests" on public.group_join_requests;
create policy "own join requests" on public.group_join_requests for select to authenticated using (user_id = auth.uid());
drop policy if exists "request to join" on public.group_join_requests;
create policy "request to join" on public.group_join_requests for insert to authenticated
  with check (user_id = auth.uid()
              and not exists (select 1 from group_members gm where gm.group_id = group_join_requests.group_id and gm.user_id = auth.uid()));
drop policy if exists "cancel join request" on public.group_join_requests;
create policy "cancel join request" on public.group_join_requests for delete to authenticated using (user_id = auth.uid());

-- All groups with member counts (for the sign-up picker), plus your membership / pending request.
drop function if exists public.list_groups();
create function public.list_groups()
returns table (id uuid, name text, member_count int, is_member boolean, requested boolean)
language sql stable security definer set search_path = public as $$
  select g.id, g.name,
         (select count(*)::int from group_members gm where gm.group_id = g.id),
         exists (select 1 from group_members gm where gm.group_id = g.id and gm.user_id = auth.uid()),
         exists (select 1 from group_join_requests r where r.group_id = g.id and r.user_id = auth.uid())
  from groups g
  where auth.uid() is not null
  order by g.created_at, g.name;
$$;
revoke all on function public.list_groups() from public, anon;
grant execute on function public.list_groups() to authenticated;

-- ---------------------------------------------------------------------------
-- Admin: overview and management of groups (every function checks is_admin()).
-- ---------------------------------------------------------------------------

-- Every signed-up person with their groups and pending join requests. Admins only.
drop function if exists public.admin_users();
create function public.admin_users()
returns table (user_id uuid, display_name text, avatar_url text, email text, joined_at timestamptz,
               group_ids uuid[], requested_group_ids uuid[], requested_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.display_name, p.avatar_url, u.email::text, p.created_at,
         coalesce((select array_agg(gm.group_id order by gm.joined_at) from group_members gm where gm.user_id = p.id), '{}'),
         coalesce((select array_agg(r.group_id order by r.created_at) from group_join_requests r where r.user_id = p.id), '{}'),
         (select min(r.created_at) from group_join_requests r where r.user_id = p.id)
  from profiles p
  join auth.users u on u.id = p.id
  where public.is_admin() and p.onboarded
  order by p.display_name;
$$;
revoke all on function public.admin_users() from public, anon;
grant execute on function public.admin_users() to authenticated;

-- Approve (adds to the group) or decline a join request.
drop function if exists public.admin_review_request(uuid, uuid, boolean);
create function public.admin_review_request(p_group uuid, p_user uuid, approve boolean)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if approve then
    insert into group_members (group_id, user_id) values (p_group, p_user) on conflict do nothing;
  end if;
  delete from group_join_requests where group_id = p_group and user_id = p_user;
end;
$$;
revoke all on function public.admin_review_request(uuid, uuid, boolean) from public, anon;
grant execute on function public.admin_review_request(uuid, uuid, boolean) to authenticated;

-- Add someone straight into a group (clears any pending request for it).
drop function if exists public.admin_add_member(uuid, uuid);
create function public.admin_add_member(p_group uuid, p_user uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  insert into group_members (group_id, user_id) values (p_group, p_user) on conflict do nothing;
  delete from group_join_requests where group_id = p_group and user_id = p_user;
end;
$$;
revoke all on function public.admin_add_member(uuid, uuid) from public, anon;
grant execute on function public.admin_add_member(uuid, uuid) to authenticated;

-- Take someone out of a group.
drop function if exists public.admin_remove_member(uuid, uuid);
create function public.admin_remove_member(p_group uuid, p_user uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  delete from group_members where group_id = p_group and user_id = p_user;
end;
$$;
revoke all on function public.admin_remove_member(uuid, uuid) from public, anon;
grant execute on function public.admin_remove_member(uuid, uuid) to authenticated;
