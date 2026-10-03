-- Friend stats for the Friends tab: strength trend + inputs for fun tags.
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run. Safe to re-run.
-- (Also included in schema.sql.)
--
-- Like get_feed(), this is security definer and returns only per-person aggregates:
-- a strength-change percentage, counts, and the name of their most-trained exercise/split.
-- Individual sets, weights and meals stay private.

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
