-- GymBuddies database schema.
-- Run this once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- Safe to re-run: everything is created with "if not exists" / "or replace".
--
-- Privacy model:
--   * profiles, workouts, meals and plans are readable/writable ONLY by their owner (RLS).
--   * The shared Friends feed is served by get_feed(), a security-definer function that
--     returns only aggregates: display name, avatar, today's workout status/day type,
--     weekly workout count and today's total calories. Never individual meals or body stats.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  display_name   text not null default '',
  avatar_url     text,
  weight_kg      numeric(5, 1),
  height_cm      numeric(5, 1),
  goal           text not null default 'maintain' check (goal in ('lose', 'maintain', 'gain')),
  weekly_target  int  not null default 4 check (weekly_target between 1 and 7),
  split          text not null default 'ppl',
  calorie_target int  not null default 2200 check (calorie_target between 800 and 8000),
  timezone       text not null default 'UTC',
  onboarded      boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- One row per day of the user's plan, e.g. "Push", "Pull", "Legs".
create table if not exists public.plan_days (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  position   int  not null default 0,
  name       text not null,
  -- [{ "name": "Bench Press", "sets": 3, "reps": 8 }]
  exercises  jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists plan_days_user_idx on public.plan_days (user_id, position);

create table if not exists public.workouts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  -- The user's own calendar date when they trained (friends live in different time zones).
  local_date   date not null,
  day_name     text not null,
  -- [{ "name": "Bench Press", "sets": 3, "reps": 8, "weight_kg": 60, "done": true }]
  exercises    jsonb not null default '[]'::jsonb,
  duration_min int check (duration_min between 0 and 600),
  notes        text,
  created_at   timestamptz not null default now()
);
create index if not exists workouts_user_date_idx on public.workouts (user_id, local_date);

create table if not exists public.meals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  local_date  date not null,
  name        text not null,
  -- [{ "name": "Rice", "quantity": "1 cup", "calories": 200, ... }]
  items       jsonb not null default '[]'::jsonb,
  calories    int not null check (calories between 0 and 10000),
  protein_g   int not null default 0,
  carbs_g     int not null default 0,
  fat_g       int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists meals_user_date_idx on public.meals (user_id, local_date);

-- Daily counter for AI meal analyses, so the monthly API bill stays predictable.
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day     date not null,
  count   int  not null default 0,
  primary key (user_id, day)
);

-- ---------------------------------------------------------------------------
-- Row level security: owner-only everywhere
-- ---------------------------------------------------------------------------

alter table public.profiles  enable row level security;
alter table public.plan_days enable row level security;
alter table public.workouts  enable row level security;
alter table public.meals     enable row level security;
alter table public.ai_usage  enable row level security;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "own plan" on public.plan_days;
create policy "own plan" on public.plan_days
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own workouts" on public.workouts;
create policy "own workouts" on public.workouts
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own meals" on public.meals;
create policy "own meals" on public.meals
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ai_usage has no policies: only the security-definer function below touches it.

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- Create an empty profile row as soon as someone signs up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Reject invalid time zone names (get_feed relies on them) and keep updated_at fresh.
create or replace function public.profiles_before_write()
returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from pg_timezone_names where name = new.timezone) then
    new.timezone := 'UTC';
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
-- Shared feed (aggregates only)
-- ---------------------------------------------------------------------------

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
  week_under_target    int
)
language sql stable security definer set search_path = public as $$
  with p as (
    select pr.*,
           (now() at time zone pr.timezone)::date as today
    from profiles pr
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
       where dc.user_id = p.id and dc.kcal <= p.calorie_target)
  from p
  join wk on wk.id = p.id
  where auth.uid() is not null;
$$;

revoke all on function public.get_feed() from public, anon;
grant execute on function public.get_feed() to authenticated;

-- ---------------------------------------------------------------------------
-- Friend stats: strength trend + inputs for fun tags (aggregates only).
-- Also available standalone in friend_stats.sql.
-- ---------------------------------------------------------------------------

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
-- AI rate limit: returns true and counts the call if the user is under today's cap.
-- The cap lives here (not in the request) so nobody can raise it from the browser.
-- ---------------------------------------------------------------------------

create or replace function public.consume_ai_credit()
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  daily_limit constant int := 12;
  used int;
begin
  if auth.uid() is null then
    return false;
  end if;
  insert into ai_usage (user_id, day, count)
  values (auth.uid(), (now() at time zone 'UTC')::date, 1)
  on conflict (user_id, day) do update set count = ai_usage.count + 1
  returning count into used;
  return used <= daily_limit;
end;
$$;

revoke all on function public.consume_ai_credit() from public, anon;
grant execute on function public.consume_ai_credit() to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: public bucket for profile pictures, each user writes only their own folder.
-- (Meal photos are never stored - they're sent to the AI once and discarded.)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatar read" on storage.objects;
create policy "avatar read" on storage.objects
  for select to authenticated using (bucket_id = 'avatars');

drop policy if exists "avatar upload own folder" on storage.objects;
create policy "avatar upload own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatar update own folder" on storage.objects;
create policy "avatar update own folder" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatar delete own folder" on storage.objects;
create policy "avatar delete own folder" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
