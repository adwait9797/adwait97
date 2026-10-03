-- Groups & friends update.
-- Run once in Supabase: SQL Editor -> New query -> paste all of this -> Run. Safe to re-run.
-- (Everything except the one-time steps at the bottom is also part of schema.sql.)

-- Admins can create groups. Can't be changed from the app (see profiles_before_write).
alter table public.profiles add column if not exists is_admin boolean not null default false;

-- New meals analysed today (corrections in the same chat don't count).
alter table public.ai_usage add column if not exists meals int not null default 0;

-- Reject invalid time zone names (get_feed relies on them) and keep updated_at fresh.
create or replace function public.profiles_before_write()
returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from pg_timezone_names where name = new.timezone) then
    new.timezone := 'UTC';
  end if;
  -- Only the dashboard/SQL editor may grant admin; app users can't promote themselves.
  if current_user in ('authenticated', 'anon') then
    new.is_admin := case when tg_op = 'UPDATE' then old.is_admin else false end;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_before_write on public.profiles;
create trigger profiles_before_write
  before insert or update on public.profiles
  for each row execute function public.profiles_before_write();

-- ---------------------------------------------------------------------------
-- Groups and friends
-- ---------------------------------------------------------------------------

create table if not exists public.groups (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique check (char_length(btrim(name)) between 1 and 40),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id  uuid not null references public.groups (id) on delete cascade,
  user_id   uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index if not exists group_members_user_idx on public.group_members (user_id);

-- Friend requests; status 'accepted' makes two people see each other like group-mates.
create table if not exists public.friendships (
  requester    uuid not null references auth.users (id) on delete cascade,
  addressee    uuid not null references auth.users (id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  primary key (requester, addressee),
  check (requester <> addressee)
);
create unique index if not exists friendships_pair_idx
  on public.friendships (least(requester, addressee), greatest(requester, addressee));

alter table public.groups        enable row level security;
alter table public.group_members enable row level security;
alter table public.friendships   enable row level security;

-- Group names are visible to everyone signed in (needed to pick one at sign-up).
drop policy if exists "groups readable" on public.groups;
create policy "groups readable" on public.groups for select to authenticated using (true);
drop policy if exists "admins create groups" on public.groups;
create policy "admins create groups" on public.groups for insert to authenticated
  with check (created_by = auth.uid() and exists (select 1 from profiles where id = auth.uid() and is_admin));
drop policy if exists "admins manage groups" on public.groups;
create policy "admins manage groups" on public.groups for update to authenticated
  using (exists (select 1 from profiles where id = auth.uid() and is_admin));
drop policy if exists "admins delete groups" on public.groups;
create policy "admins delete groups" on public.groups for delete to authenticated
  using (exists (select 1 from profiles where id = auth.uid() and is_admin));

-- You see and manage only your own memberships; member lists come from the functions below.
drop policy if exists "own memberships" on public.group_members;
create policy "own memberships" on public.group_members for select to authenticated using (user_id = auth.uid());
drop policy if exists "join groups" on public.group_members;
create policy "join groups" on public.group_members for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "leave groups" on public.group_members;
create policy "leave groups" on public.group_members for delete to authenticated using (user_id = auth.uid());

-- Friend rows are readable by the two people involved; changes go through the functions below.
drop policy if exists "own friendships" on public.friendships;
create policy "own friendships" on public.friendships for select to authenticated
  using (auth.uid() in (requester, addressee));

insert into public.groups (name) values ('MH14 boyz'), ('gym baddies') on conflict (name) do nothing;

-- Everyone the current user may see: themselves, group-mates and accepted friends.
-- group_ids = groups shared with the current user; is_friend = accepted friend request.
drop function if exists public.visible_people();
create function public.visible_people()
returns table (user_id uuid, group_ids uuid[], is_friend boolean)
language sql stable security definer set search_path = public as $$
  with mates as (
    select gm2.user_id, gm1.group_id
    from group_members gm1
    join group_members gm2 on gm2.group_id = gm1.group_id
    where gm1.user_id = auth.uid()
  ),
  friends as (
    select case when f.requester = auth.uid() then f.addressee else f.requester end as user_id
    from friendships f
    where f.status = 'accepted' and auth.uid() in (f.requester, f.addressee)
  ),
  ids as (
    select auth.uid() as user_id
    union select user_id from mates
    union select user_id from friends
  )
  select ids.user_id,
         coalesce((select array_agg(distinct m.group_id) from mates m where m.user_id = ids.user_id), '{}'),
         exists (select 1 from friends f where f.user_id = ids.user_id)
  from ids
  where auth.uid() is not null;
$$;
revoke all on function public.visible_people() from public, anon;
grant execute on function public.visible_people() to authenticated;

-- All groups with member counts (for the sign-up picker).
drop function if exists public.list_groups();
create function public.list_groups()
returns table (id uuid, name text, member_count int, is_member boolean)
language sql stable security definer set search_path = public as $$
  select g.id, g.name,
         (select count(*)::int from group_members gm where gm.group_id = g.id),
         exists (select 1 from group_members gm where gm.group_id = g.id and gm.user_id = auth.uid())
  from groups g
  where auth.uid() is not null
  order by g.created_at, g.name;
$$;
revoke all on function public.list_groups() from public, anon;
grant execute on function public.list_groups() to authenticated;

-- Find people by display name (partial) or exact email. Emails are never returned.
drop function if exists public.search_users(text);
create function public.search_users(q text)
returns table (user_id uuid, display_name text, avatar_url text, relation text)
language sql stable security definer set search_path = public as $$
  with term as (select btrim(q) as t)
  select p.id, p.display_name, p.avatar_url,
         case
           when f.status = 'accepted' then 'friends'
           when f.status = 'pending' and f.requester = auth.uid() then 'requested'
           when f.status = 'pending' then 'incoming'
           else 'none'
         end
  from profiles p
  join auth.users u on u.id = p.id
  cross join term
  left join friendships f
    on (f.requester = auth.uid() and f.addressee = p.id) or (f.addressee = auth.uid() and f.requester = p.id)
  where auth.uid() is not null
    and p.onboarded
    and p.id <> auth.uid()
    and char_length(term.t) >= 2
    and (p.display_name ilike '%' || replace(replace(replace(term.t, '\', '\\'), '%', '\%'), '_', '\_') || '%'
         or lower(u.email) = lower(term.t))
  order by p.display_name
  limit 20;
$$;
revoke all on function public.search_users(text) from public, anon;
grant execute on function public.search_users(text) to authenticated;

-- Send a request; if they already asked you, this accepts it. Returns 'requested' or 'friends'.
drop function if exists public.send_friend_request(uuid);
create function public.send_friend_request(target uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  existing friendships;
begin
  if auth.uid() is null or target is null or target = auth.uid() then
    raise exception 'Invalid friend request';
  end if;
  if not exists (select 1 from profiles where id = target and onboarded) then
    raise exception 'User not found';
  end if;
  select * into existing from friendships
  where (requester = auth.uid() and addressee = target) or (requester = target and addressee = auth.uid());
  if found then
    if existing.status = 'pending' and existing.addressee = auth.uid() then
      update friendships set status = 'accepted', responded_at = now()
      where requester = target and addressee = auth.uid();
      return 'friends';
    end if;
    return case when existing.status = 'accepted' then 'friends' else 'requested' end;
  end if;
  insert into friendships (requester, addressee) values (auth.uid(), target);
  return 'requested';
end;
$$;
revoke all on function public.send_friend_request(uuid) from public, anon;
grant execute on function public.send_friend_request(uuid) to authenticated;

-- Accept or decline a request someone sent you.
drop function if exists public.respond_friend_request(uuid, boolean);
create function public.respond_friend_request(requester_id uuid, accept boolean)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if accept then
    update friendships set status = 'accepted', responded_at = now()
    where requester = requester_id and addressee = auth.uid() and status = 'pending';
  else
    delete from friendships where requester = requester_id and addressee = auth.uid() and status = 'pending';
  end if;
end;
$$;
revoke all on function public.respond_friend_request(uuid, boolean) from public, anon;
grant execute on function public.respond_friend_request(uuid, boolean) to authenticated;

-- Remove a friend (or cancel a request you sent).
drop function if exists public.remove_friend(uuid);
create function public.remove_friend(other uuid)
returns void
language sql security definer set search_path = public as $$
  delete from friendships
  where (requester = auth.uid() and addressee = other) or (requester = other and addressee = auth.uid());
$$;
revoke all on function public.remove_friend(uuid) from public, anon;
grant execute on function public.remove_friend(uuid) to authenticated;

-- Your friends and pending requests (both directions), with names and photos.
drop function if exists public.get_friendships();
create function public.get_friendships()
returns table (user_id uuid, display_name text, avatar_url text, status text, incoming boolean, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.display_name, p.avatar_url, f.status, f.addressee = auth.uid(), f.created_at
  from friendships f
  join profiles p on p.id = case when f.requester = auth.uid() then f.addressee else f.requester end
  where auth.uid() in (f.requester, f.addressee)
  order by f.status, p.display_name;
$$;
revoke all on function public.get_friendships() from public, anon;
grant execute on function public.get_friendships() to authenticated;

drop function if exists public.get_feed();
create function public.get_feed()
returns table (
  user_id              uuid,
  display_name         text,
  avatar_url           text,
  weekly_target        int,
  local_date           date,
  worked_out_today     boolean,
  today_workout        text,
  last_workout_at      timestamptz,
  week_workouts        int,
  week_workout_dates   date[],
  today_calories       int,
  meals_today          int,
  under_target_today   boolean,
  week_under_target    int,
  status_text          text,       -- banter status, only if set in the last 24 hours
  status_at            timestamptz,
  group_ids            uuid[],     -- groups shared with the viewer
  is_friend            boolean     -- accepted friend of the viewer
)
language sql stable security definer set search_path = public as $$
  with p as (
    select pr.*,
           (now() at time zone pr.timezone)::date as today,
           v.group_ids as shared_groups,
           v.is_friend as friend
    from profiles pr
    join visible_people() v on v.user_id = pr.id
    where pr.onboarded
  ),
  wk as (
    select p.id,
           p.today,
           date_trunc('week', p.today::timestamp)::date as week_start
    from p
  ),
  daily_cals as (
    select m.user_id, m.local_date, sum(m.calories)::int as kcal
    from meals m
    join wk on wk.id = m.user_id and m.local_date between wk.week_start and wk.today
    group by m.user_id, m.local_date
  )
  select
    p.id,
    p.display_name,
    p.avatar_url,
    p.weekly_target,
    p.today,
    exists (select 1 from workouts w where w.user_id = p.id and w.local_date = p.today),
    (select w.day_name from workouts w
       where w.user_id = p.id and w.local_date = p.today
       order by w.created_at desc limit 1),
    (select max(w.created_at) from workouts w where w.user_id = p.id),
    (select count(distinct w.local_date)::int from workouts w
       where w.user_id = p.id and w.local_date between wk.week_start and wk.today),
    coalesce((select array_agg(distinct w.local_date order by w.local_date) from workouts w
       where w.user_id = p.id and w.local_date between wk.week_start and wk.today), '{}'),
    coalesce((select dc.kcal from daily_cals dc
       where dc.user_id = p.id and dc.local_date = p.today), 0),
    (select count(*)::int from meals m where m.user_id = p.id and m.local_date = p.today),
    coalesce((select dc.kcal <= p.calorie_target from daily_cals dc
       where dc.user_id = p.id and dc.local_date = p.today), true),
    (select count(*)::int from daily_cals dc
       where dc.user_id = p.id and dc.kcal <= p.calorie_target),
    case when p.status_at > now() - interval '24 hours' then nullif(btrim(p.status_text), '') end,
    case when p.status_at > now() - interval '24 hours' and nullif(btrim(p.status_text), '') is not null then p.status_at end,
    p.shared_groups,
    p.friend
  from p
  join wk on wk.id = p.id
  where auth.uid() is not null;
$$;

revoke all on function public.get_feed() from public, anon;
grant execute on function public.get_feed() to authenticated;

drop function if exists public.get_friend_stats();
create function public.get_friend_stats()
returns table (
  user_id               uuid,
  strength_pct          numeric, -- median % change of best estimated 1RM: last 14 days vs the 28 days before
  compared_exercises    int,     -- how many exercises that median is based on
  prs_14d               int,     -- exercises that hit a new 8-week best in the last 14 days
  top_exercise          text,    -- most-trained exercise over 8 weeks
  top_exercise_sessions int,
  top_split             text,    -- most-trained day type over 8 weeks
  top_split_sessions    int,
  early_sessions        int,     -- started before 8:00 local time (last 28 days)
  late_sessions         int,     -- started at/after 21:00 local time (last 28 days)
  leg_weeks             int,     -- of the last 4 weeks, how many had a leg/lower day
  volume_7d             numeric  -- kg lifted in the last 7 days
)
language sql stable security definer set search_path = public as $$
  with p as (
    select pr.id, pr.timezone, (now() at time zone pr.timezone)::date as today
    from profiles pr
    join visible_people() v on v.user_id = pr.id
    where pr.onboarded
  ),
  w as (
    select wk.id, wk.user_id, wk.local_date, wk.day_name, wk.exercises, wk.created_at, wk.duration_min,
           p.today, p.timezone
    from workouts wk
    join p on p.id = wk.user_id
    where wk.local_date between p.today - 55 and p.today
  ),
  ex as (
    select w.user_id, w.id as workout_id, w.local_date, w.today, e.value as ex
    from w
    cross join lateral jsonb_array_elements(case when jsonb_typeof(w.exercises) = 'array' then w.exercises else '[]'::jsonb end) e
  ),
  -- One row per logged set. Live workouts store set_log; older entries are expanded from sets x reps @ weight.
  sets as (
    select ex.user_id, ex.workout_id, ex.local_date, ex.today, ex.ex ->> 'name' as name,
           coalesce(nullif(s.value ->> 'weight_kg', '')::numeric, 0) as wt,
           nullif(s.value ->> 'reps', '')::numeric as reps
    from ex
    cross join lateral jsonb_array_elements(ex.ex -> 'set_log') s
    where jsonb_typeof(ex.ex -> 'set_log') = 'array'
    union all
    select ex.user_id, ex.workout_id, ex.local_date, ex.today, ex.ex ->> 'name',
           coalesce(nullif(ex.ex ->> 'weight_kg', '')::numeric, 0),
           nullif(ex.ex ->> 'reps', '')::numeric
    from ex
    cross join lateral generate_series(1, least(greatest(coalesce(nullif(ex.ex ->> 'sets', '')::int, 0), 0), 50)) g
    where coalesce(jsonb_typeof(ex.ex -> 'set_log') <> 'array' or jsonb_array_length(case when jsonb_typeof(ex.ex -> 'set_log') = 'array' then ex.ex -> 'set_log' else '[]'::jsonb end) = 0, true)
      and coalesce((ex.ex ->> 'done')::boolean, false)
  ),
  -- (sets with a null name are dropped in sess)
  -- Per exercise per workout: estimated 1RM (Epley) for weighted lifts, top reps for bodyweight.
  sess as (
    select user_id, name, workout_id, local_date, today,
           case when max(wt) > 0 then max(wt * (1 + reps / 30.0)) filter (where wt > 0)
                else max(reps) end as score,
           sum(wt * coalesce(reps, 0)) as vol
    from sets
    where name is not null and reps is not null and reps > 0
    group by user_id, name, workout_id, local_date, today
  ),
  trend as (
    select user_id, name,
           max(score) filter (where local_date > today - 14) as recent,
           max(score) filter (where local_date <= today - 14 and local_date > today - 42) as base
    from sess
    group by user_id, name
  ),
  strength as (
    select user_id,
           round((percentile_cont(0.5) within group (order by (recent - base) / base * 100))::numeric, 1) as pct,
           count(*)::int as n
    from trend
    where recent is not null and base is not null and base > 0
    group by user_id
  ),
  prs as (
    select user_id, count(distinct name)::int as n
    from (
      select user_id, name, local_date, today, score,
             max(score) over (partition by user_id, name order by local_date, workout_id
                              rows between unbounded preceding and 1 preceding) as prev_best
      from sess
    ) x
    where local_date > today - 14 and prev_best is not null and score > prev_best
    group by user_id
  ),
  top_ex as (
    select distinct on (user_id) user_id, name, count(distinct workout_id)::int as n
    from sess
    group by user_id, name
    order by user_id, count(distinct workout_id) desc, max(score) desc
  ),
  top_split as (
    select distinct on (user_id) user_id, day_name, count(*)::int as n
    from w
    where day_name not in ('Other')
    group by user_id, day_name
    order by user_id, count(*) desc, max(local_date) desc
  ),
  timing as (
    select user_id,
           count(*) filter (where start_local < time '08:00')::int as early,
           count(*) filter (where start_local >= time '21:00')::int as late
    from (
      select user_id,
             ((created_at - make_interval(mins => coalesce(duration_min, 0))) at time zone timezone)::time as start_local
      from w
      where local_date > today - 28
    ) t
    group by user_id
  ),
  legs as (
    select user_id, count(distinct ((today - local_date) / 7))::int as n
    from w
    where local_date > today - 28 and (day_name ilike '%leg%' or day_name ilike '%lower%')
    group by user_id
  ),
  vol as (
    select user_id, sum(vol) as kg
    from sess
    where local_date > today - 7
    group by user_id
  )
  select p.id,
         strength.pct,
         coalesce(strength.n, 0),
         coalesce(prs.n, 0),
         top_ex.name,
         coalesce(top_ex.n, 0),
         top_split.day_name,
         coalesce(top_split.n, 0),
         coalesce(timing.early, 0),
         coalesce(timing.late, 0),
         coalesce(legs.n, 0),
         coalesce(round(vol.kg), 0)
  from p
  left join strength  on strength.user_id  = p.id
  left join prs       on prs.user_id       = p.id
  left join top_ex    on top_ex.user_id    = p.id
  left join top_split on top_split.user_id = p.id
  left join timing    on timing.user_id    = p.id
  left join legs      on legs.user_id      = p.id
  left join vol       on vol.user_id       = p.id
  where auth.uid() is not null;
$$;

revoke all on function public.get_friend_stats() from public, anon;
grant execute on function public.get_friend_stats() to authenticated;

-- ---------------------------------------------------------------------------
-- AI rate limit: 6 new meals per person per day (corrections in the same chat are free),
-- with a hard cap of 30 AI calls per day. Returns 'ok', 'meal_limit' or 'call_limit'.
-- The caps live here (not in the request) so nobody can raise them from the browser.
-- ---------------------------------------------------------------------------

drop function if exists public.consume_ai_credit();
drop function if exists public.consume_ai_credit(boolean);
create function public.consume_ai_credit(new_meal boolean default true)
returns text
language plpgsql security definer set search_path = public as $$
declare
  meal_limit constant int := 6;
  call_limit constant int := 30;
  today date := (now() at time zone 'UTC')::date;
  usage_row ai_usage;
begin
  if auth.uid() is null then
    return 'call_limit';
  end if;
  insert into ai_usage (user_id, day, count, meals) values (auth.uid(), today, 0, 0)
  on conflict (user_id, day) do nothing;
  select * into usage_row from ai_usage where user_id = auth.uid() and day = today for update;
  if usage_row.count >= call_limit then
    return 'call_limit';
  end if;
  if new_meal and usage_row.meals >= meal_limit then
    return 'meal_limit';
  end if;
  update ai_usage
  set count = count + 1, meals = meals + case when new_meal then 1 else 0 end
  where user_id = auth.uid() and day = today;
  return 'ok';
end;
$$;

revoke all on function public.consume_ai_credit(boolean) from public, anon;
grant execute on function public.consume_ai_credit(boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- One-time steps for the existing project
-- ---------------------------------------------------------------------------

-- Everyone who has already signed up joins MH14 boyz (gym baddies starts empty).
insert into public.group_members (group_id, user_id)
select g.id, p.id
from public.groups g
cross join public.profiles p
where g.name = 'MH14 boyz' and p.onboarded
on conflict do nothing;

-- Make Adwait the admin (the only person who can create groups):
-- replace the email below with the one Adwait signs in with before running.
update public.profiles set is_admin = true
where id = (select id from auth.users where lower(email) = lower('ADWAIT-EMAIL-HERE'));
