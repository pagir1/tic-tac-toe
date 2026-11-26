-- =====================================================================
-- Nepaligames: players, scores, weekly leaderboards, guest clean-up
-- Paste all of this into Supabase > SQL Editor > New query > Run.
-- Safe to run again (it replaces functions/policies, keeps your data).
-- =====================================================================

create extension if not exists pg_cron;

-- ---------- Name rules (the app checks the same rules before sending) ----------
-- 2-16 characters; English letters (incl. accents), Nepali/Devanagari, numbers, spaces.
create or replace function public.name_is_ok(n text)
returns boolean language plpgsql immutable as $$
declare
  low text := lower(btrim(coalesce(n, '')));
  squashed text := regexp_replace(low, '[\s0-9]', '', 'g');
  -- blocked anywhere inside the name
  anywhere text[] := array[
    'fuck','shit','cunt','bitch','nigg','fagg','whore','slut','asshole','bastard',
    'machikne','gandu','माचिक्ने','गान्डु'];
  -- blocked as a whole word (so real names like "Mujib" or "Cassie" still work)
  whole text[] := array[
    'ass','dick','cock','porn','sex','sexy','rape','nazi','hitler',
    'muji','randi','rando','lado','puti','chikne','jhatu','khate',
    'मुजी','मूजी','रण्डी','राँडी','लाडो','पुती','चिक्ने','झाटु'];
  w text;
begin
  if char_length(low) < 2 or char_length(low) > 16 then return false; end if;
  if low !~ '^[a-z0-9à-ɏऀ-ॿ ]+$' then return false; end if;
  foreach w in array anywhere loop
    if position(w in squashed) > 0 then return false; end if;
  end loop;
  if squashed = any(whole) then return false; end if;
  if exists (select 1 from regexp_split_to_table(low, '\s+') part where part = any(whole)) then
    return false;
  end if;
  return true;
end $$;

-- ---------- Tables ----------
create table if not exists public.profiles (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (public.name_is_ok(display_name)),
  is_guest     boolean not null default true,
  created_at   timestamptz not null default now()
);

create table if not exists public.scores (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  game       text not null check (game in ('tic-tac-toe', 'bagh-chal')),
  points     int  not null check (points between 1 and 15),
  side       text check (side in ('goat', 'tiger')),
  created_at timestamptz not null default now()
);
create index if not exists scores_created_game_idx on public.scores (created_at, game);
create index if not exists scores_user_created_idx on public.scores (user_id, created_at);

-- One-time tickets that let a guest's scores move into an existing account
create table if not exists public.merge_tokens (
  token      uuid primary key default gen_random_uuid(),
  guest_id   uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ---------- Guards ----------
-- Profiles: tidy the name, and take "is guest" from the real login (not from the browser)
create or replace function public.profile_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.display_name := btrim(regexp_replace(new.display_name, '\s+', ' ', 'g'));
  if not public.name_is_ok(new.display_name) then
    raise exception 'name_not_allowed' using errcode = '22023';
  end if;
  new.is_guest := coalesce((select u.is_anonymous from auth.users u where u.id = new.user_id), true);
  if tg_op = 'UPDATE' then
    new.user_id := old.user_id;
    new.created_at := old.created_at;
  else
    new.created_at := now();
  end if;
  return new;
end $$;
drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before insert or update on public.profiles
  for each row execute function public.profile_guard();

-- When a guest saves their account, flip is_guest to false
create or replace function public.sync_guest_flag()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set is_guest = new.is_anonymous where user_id = new.id;
  return new;
end $$;
drop trigger if exists on_auth_user_guest_change on auth.users;
create trigger on_auth_user_guest_change after update of is_anonymous on auth.users
  for each row execute function public.sync_guest_flag();

-- Scores: only real point values, at most one result per player every 15 seconds,
-- and at most 300 points per player per game per day (Nepal time)
create or replace function public.score_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  new.created_at := now();
  if not (
       (new.game = 'tic-tac-toe' and new.side is null    and new.points in (10, 3))
    or (new.game = 'bagh-chal'   and new.side = 'goat'   and new.points in (15, 3))
    or (new.game = 'bagh-chal'   and new.side = 'tiger'  and new.points in (10, 3))
  ) then
    raise exception 'score_not_allowed' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext(new.user_id::text));
  if (select coalesce(sum(points), 0) from public.scores
       where user_id = new.user_id and game = new.game
         and created_at >= date_trunc('day', now() at time zone 'Asia/Kathmandu') at time zone 'Asia/Kathmandu'
     ) + new.points > 300 then
    raise exception 'daily_limit' using errcode = '22023';
  end if;
  if exists (select 1 from public.scores
             where user_id = new.user_id and created_at > now() - interval '15 seconds') then
    raise exception 'too_soon' using errcode = '22023';
  end if;
  return new;
end $$;
drop trigger if exists scores_guard on public.scores;
create trigger scores_guard before insert on public.scores
  for each row execute function public.score_guard();

-- ---------- Row Level Security ----------
alter table public.profiles     enable row level security;
alter table public.scores       enable row level security;
alter table public.merge_tokens enable row level security;  -- no policies: invisible to browsers

drop policy if exists "Anyone can read profiles" on public.profiles;
create policy "Anyone can read profiles" on public.profiles for select using (true);
drop policy if exists "Create own profile" on public.profiles;
create policy "Create own profile" on public.profiles for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists "Edit own profile" on public.profiles;
create policy "Edit own profile" on public.profiles for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "Anyone can read scores" on public.scores;
create policy "Anyone can read scores" on public.scores for select using (true);
drop policy if exists "Add own scores" on public.scores;
create policy "Add own scores" on public.scores for insert to authenticated
  with check (user_id = auth.uid());
-- No update/delete policies on scores: browsers can never change or remove them.

revoke update, delete, truncate on public.scores   from anon, authenticated;
revoke delete, truncate         on public.profiles from anon, authenticated;
revoke all                      on public.merge_tokens from anon, authenticated;

-- ---------- Leaderboards (weeks start Monday 00:00 Nepal time) ----------
create or replace function public.week_start()
returns timestamptz language sql stable as $$
  select date_trunc('week', now() at time zone 'Asia/Kathmandu') at time zone 'Asia/Kathmandu'
$$;

-- This week's ranking for one game, or all games when p_game is null.
-- Ties go to whoever reached the total first.
create or replace function public.week_board(p_game text default null)
returns table (user_id uuid, display_name text, is_guest boolean, points bigint, rnk bigint)
language sql stable set search_path = public as $$
  select s.user_id,
         coalesce(p.display_name, 'Player'),
         coalesce(p.is_guest, true),
         sum(s.points),
         row_number() over (order by sum(s.points) desc, max(s.created_at) asc)
  from public.scores s
  left join public.profiles p on p.user_id = s.user_id
  where s.created_at >= public.week_start()
    and (p_game is null or s.game = p_game)
  group by s.user_id, p.display_name, p.is_guest
$$;

-- Everything the home screen needs, in one request
create or replace function public.home_snapshot()
returns jsonb language sql stable set search_path = public as $$
  select jsonb_build_object(
    'week_start', public.week_start(),
    'games', (
      select jsonb_object_agg(g, jsonb_build_object(
        'champion', (select jsonb_build_object('name', b.display_name, 'points', b.points,
                                               'is_me', coalesce(b.user_id = auth.uid(), false))
                     from public.week_board(g) b where b.rnk = 1),
        'me',       (select jsonb_build_object('points', b.points, 'rank', b.rnk)
                     from public.week_board(g) b where b.user_id = auth.uid())))
      from unnest(array['tic-tac-toe', 'bagh-chal']) as g),
    'top', coalesce((
      select jsonb_agg(jsonb_build_object('name', b.display_name, 'points', b.points, 'rank', b.rnk,
                                          'is_me', coalesce(b.user_id = auth.uid(), false))
                       order by b.rnk)
      from public.week_board(null) b where b.rnk <= 5), '[]'::jsonb),
    'me', (select jsonb_build_object('points', b.points, 'rank', b.rnk)
           from public.week_board(null) b where b.user_id = auth.uid()),
    'best_week', (select max(t) from (
                    select sum(points) as t from public.scores where user_id = auth.uid()
                    group by date_trunc('week', created_at at time zone 'Asia/Kathmandu')) w)
  )
$$;

-- Save one vs-Computer result and report the new weekly total, rank and crown change
create or replace function public.submit_score(p_game text, p_points int, p_side text default null)
returns jsonb language plpgsql set search_path = public as $$
declare
  me uuid := auth.uid();
  before_id uuid;
  after_id uuid;
  my_points bigint;
  my_rank bigint;
begin
  if me is null then raise exception 'not_signed_in'; end if;
  select b.user_id into before_id from public.week_board(p_game) b where b.rnk = 1;
  insert into public.scores (user_id, game, points, side) values (me, p_game, p_points, p_side);
  select b.user_id into after_id from public.week_board(p_game) b where b.rnk = 1;
  select b.points, b.rnk into my_points, my_rank from public.week_board(p_game) b where b.user_id = me;
  return jsonb_build_object('points', p_points, 'weekly', my_points, 'rank', my_rank,
                            'new_champion', after_id = me and before_id is distinct from me);
end $$;

-- ---------- Guest -> existing account, and account deletion ----------
create or replace function public.start_guest_merge()
returns uuid language plpgsql security definer set search_path = public as $$
declare t uuid;
begin
  if auth.uid() is null or not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'guests_only';
  end if;
  delete from public.merge_tokens where guest_id = auth.uid();
  insert into public.merge_tokens (guest_id) values (auth.uid()) returning token into t;
  return t;
end $$;

create or replace function public.finish_guest_merge(p_token uuid)
returns int language plpgsql security definer set search_path = public as $$
declare g uuid; moved int := 0;
begin
  if auth.uid() is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'saved_players_only';
  end if;
  delete from public.merge_tokens
   where token = p_token and created_at > now() - interval '1 hour'
  returning guest_id into g;
  if g is null or g = auth.uid() then return 0; end if;
  update public.scores set user_id = auth.uid() where user_id = g;
  get diagnostics moved = row_count;
  delete from auth.users where id = g and is_anonymous;  -- also removes the guest profile
  return moved;
end $$;

create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  delete from public.scores   where user_id = auth.uid();
  delete from public.profiles where user_id = auth.uid();
  delete from auth.users      where id = auth.uid();
end $$;

-- Who may call what
revoke execute on function public.submit_score(text, int, text) from public, anon;
revoke execute on function public.start_guest_merge()           from public, anon;
revoke execute on function public.finish_guest_merge(uuid)      from public, anon;
revoke execute on function public.delete_my_account()           from public, anon;
grant  execute on function public.submit_score(text, int, text) to authenticated;
grant  execute on function public.start_guest_merge()           to authenticated;
grant  execute on function public.finish_guest_merge(uuid)      to authenticated;
grant  execute on function public.delete_my_account()           to authenticated;
grant  execute on function public.home_snapshot(), public.week_board(text), public.week_start()
  to anon, authenticated;

-- ---------- Daily clean-up: guests older than 4 days (06:15 Nepal time) ----------
-- Saved players (is_anonymous = false) are never touched.
select cron.schedule('delete-old-guests', '30 0 * * *', $job$
  delete from public.scores
   where user_id in (select id from auth.users where is_anonymous and created_at < now() - interval '4 days');
  delete from public.profiles
   where user_id in (select id from auth.users where is_anonymous and created_at < now() - interval '4 days');
  delete from auth.users where is_anonymous and created_at < now() - interval '4 days';
  delete from public.merge_tokens where created_at < now() - interval '1 day';
$job$);

-- ---------- Unique names (not case-sensitive) ----------
-- "Pawan", "pawan" and "PAWAN" count as the same name
create unique index if not exists profiles_name_unique on public.profiles (lower(display_name));

-- Is this name free? (Your own current name counts as free.)
create or replace function public.name_available(p_name text)
returns boolean language sql stable set search_path = public as $$
  select not exists (
    select 1 from public.profiles
    where lower(display_name) = lower(btrim(regexp_replace(p_name, '\s+', ' ', 'g')))
      and user_id is distinct from auth.uid())
$$;

-- A free name close to the one asked for, e.g. "Pawan" -> "Pawan7"
create or replace function public.suggest_name(p_name text)
returns text language plpgsql volatile set search_path = public as $$
declare
  base text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  n int;
  cand text;
begin
  for i in 1..60 loop
    n := case when i <= 15 then 1 + floor(random() * 9)::int
              when i <= 40 then 10 + floor(random() * 90)::int
              else 100 + floor(random() * 900)::int end;
    cand := rtrim(left(base, 16 - length(n::text))) || n::text;
    if public.name_is_ok(cand) and public.name_available(cand) then
      return cand;
    end if;
  end loop;
  return null;
end $$;

grant execute on function public.name_available(text), public.suggest_name(text) to anon, authenticated;
