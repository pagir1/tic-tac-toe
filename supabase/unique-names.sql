-- =====================================================================
-- Nepaligames: unique player names (not case-sensitive)
-- Paste into Supabase > SQL Editor > New query > Run. Safe to run again.
-- (Already included in setup.sql for new projects.)
-- =====================================================================

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
