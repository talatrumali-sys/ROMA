-- Run this entire file once in Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'لاعب',
  role text not null default 'user' check (role in ('user','admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  home_team text not null,
  away_team text not null,
  competition text default '',
  kickoff timestamptz not null,
  status text not null default 'open' check (status in ('open','closed','finished')),
  home_score integer,
  away_score integer,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  check ((home_score is null and away_score is null) or (home_score >= 0 and away_score >= 0))
);

create table if not exists public.predictions (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  home_score integer not null check (home_score >= 0 and home_score <= 20),
  away_score integer not null check (away_score >= 0 and away_score <= 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(match_id,user_id)
);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.profiles where id=auth.uid() and role='admin'); $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  insert into public.profiles(id,display_name)
  values(new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1)))
  on conflict(id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.matches enable row level security;
alter table public.predictions enable row level security;

drop policy if exists "profiles readable by authenticated" on public.profiles;
create policy "profiles readable by authenticated" on public.profiles for select to authenticated using (true);
drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile" on public.profiles for update to authenticated using (id=auth.uid() or public.is_admin()) with check (id=auth.uid() or public.is_admin());

drop policy if exists "matches readable by authenticated" on public.matches;
create policy "matches readable by authenticated" on public.matches for select to authenticated using (true);
drop policy if exists "admins insert matches" on public.matches;
create policy "admins insert matches" on public.matches for insert to authenticated with check (public.is_admin());
drop policy if exists "admins update matches" on public.matches;
create policy "admins update matches" on public.matches for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admins delete matches" on public.matches;
create policy "admins delete matches" on public.matches for delete to authenticated using (public.is_admin());

drop policy if exists "predictions readable after kickoff or own" on public.predictions;
create policy "predictions readable after kickoff or own" on public.predictions for select to authenticated
using (user_id=auth.uid() or exists(select 1 from public.matches m where m.id=match_id and (m.status='finished' or m.kickoff<=now())));
drop policy if exists "users insert own predictions before kickoff" on public.predictions;
create policy "users insert own predictions before kickoff" on public.predictions for insert to authenticated
with check (user_id=auth.uid() and exists(select 1 from public.matches m where m.id=match_id and m.status='open' and m.kickoff>now()));
drop policy if exists "users update own predictions before kickoff" on public.predictions;
create policy "users update own predictions before kickoff" on public.predictions for update to authenticated
using (user_id=auth.uid() and exists(select 1 from public.matches m where m.id=match_id and m.status='open' and m.kickoff>now()))
with check (user_id=auth.uid() and exists(select 1 from public.matches m where m.id=match_id and m.status='open' and m.kickoff>now()));

grant usage on schema public to authenticated;
grant select,insert,update,delete on public.profiles,public.matches,public.predictions to authenticated;
