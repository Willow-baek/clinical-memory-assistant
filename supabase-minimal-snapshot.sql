create extension if not exists pgcrypto;

create table if not exists public.app_snapshots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  label text not null default 'manual backup',
  data jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.app_snapshots enable row level security;

drop policy if exists "snapshots owner access" on public.app_snapshots;
create policy "snapshots owner access"
on public.app_snapshots
for all
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

