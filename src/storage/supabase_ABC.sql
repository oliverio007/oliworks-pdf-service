-- A + B + C (Ruta A): Tablas + RLS (SIN FK a public.users)
-- Ejecuta en Supabase SQL Editor.

-- Requiere extension para gen_random_uuid
create extension if not exists pgcrypto;

-- ---------------- Projects ----------------
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  local_id text not null,
  title text not null,
  status text not null,
  progress int not null default 0,
  data jsonb not null,
  deleted_at timestamptz null,
  updated_at timestamptz not null default now()
);

create unique index if not exists projects_user_local_id_uidx
  on public.projects(user_id, local_id);

create index if not exists projects_user_updated_at_idx
  on public.projects(user_id, updated_at);

alter table public.projects enable row level security;

drop policy if exists "projects_select_own" on public.projects;
create policy "projects_select_own" on public.projects
  for select using (user_id = auth.uid());

drop policy if exists "projects_insert_own" on public.projects;
create policy "projects_insert_own" on public.projects
  for insert with check (user_id = auth.uid());

drop policy if exists "projects_update_own" on public.projects;
create policy "projects_update_own" on public.projects
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- (Opcional) bloquear deletes físicos desde cliente
-- drop policy if exists "projects_delete_own" on public.projects;
-- create policy "projects_delete_own" on public.projects
--   for delete using (false);

-- ---------------- Artist Profiles ----------------
create table if not exists public.artist_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  artist_key text not null,
  display_name text not null,
  note text null,
  advance_total numeric not null default 0,
  deleted_at timestamptz null,
  updated_at timestamptz not null default now()
);

create unique index if not exists artist_profiles_user_key_uidx
  on public.artist_profiles(user_id, artist_key);

create index if not exists artist_profiles_user_updated_at_idx
  on public.artist_profiles(user_id, updated_at);

alter table public.artist_profiles enable row level security;

drop policy if exists "artist_profiles_select_own" on public.artist_profiles;
create policy "artist_profiles_select_own" on public.artist_profiles
  for select using (user_id = auth.uid());

drop policy if exists "artist_profiles_insert_own" on public.artist_profiles;
create policy "artist_profiles_insert_own" on public.artist_profiles
  for insert with check (user_id = auth.uid());

drop policy if exists "artist_profiles_update_own" on public.artist_profiles;
create policy "artist_profiles_update_own" on public.artist_profiles
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------- Wallet Movements ----------------
create table if not exists public.wallet_movements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  local_id text not null,
  date_label text not null, -- "YYYY-MM-DD"
  kind text not null,       -- "IN" | "OUT" | "ABONO" | "GASTO" ...
  amount numeric not null,
  currency text not null default 'MXN',
  project_id text null,     -- local_id del proyecto (si aplica)
  artist text null,         -- display_name (si aplica)
  note text null,
  deleted_at timestamptz null,
  updated_at timestamptz not null default now()
);

create unique index if not exists wallet_movements_user_local_id_uidx
  on public.wallet_movements(user_id, local_id);

create index if not exists wallet_movements_user_updated_at_idx
  on public.wallet_movements(user_id, updated_at);

alter table public.wallet_movements enable row level security;

drop policy if exists "wallet_movements_select_own" on public.wallet_movements;
create policy "wallet_movements_select_own" on public.wallet_movements
  for select using (user_id = auth.uid());

drop policy if exists "wallet_movements_insert_own" on public.wallet_movements;
create policy "wallet_movements_insert_own" on public.wallet_movements
  for insert with check (user_id = auth.uid());

drop policy if exists "wallet_movements_update_own" on public.wallet_movements;
create policy "wallet_movements_update_own" on public.wallet_movements
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
