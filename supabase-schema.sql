create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  local_id text,
  code text not null,
  name text not null,
  sex text,
  age text,
  region text,
  flags text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, code)
);

create table if not exists public.schedule_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  local_id text,
  visit_date date not null,
  visit_time time,
  patient_name text,
  patient_code text,
  visit_type text,
  note text,
  source_file text,
  matched_visit_id uuid,
  status text not null default 'scheduled',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.raw_inbox (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  local_id text,
  type text not null,
  file_name text,
  recorded_date date,
  recorded_time time,
  patient_hint text,
  visit_type text,
  raw_text text,
  corrected_text text,
  ocr_text text,
  status text not null default 'new',
  matched_visit_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.visits (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  local_id text,
  patient_id uuid references public.patients(id) on delete set null,
  source_inbox_id uuid references public.raw_inbox(id) on delete set null,
  visit_date date not null,
  visit_time time,
  visit_type text,
  transcript text,
  summary text,
  signals text[] not null default '{}',
  secondary_signals text[] not null default '{}',
  noise text,
  tracking jsonb not null default '[]'::jsonb,
  treatment text,
  hep text,
  homework text,
  next_focus text,
  draft text,
  confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.terms (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  local_id text,
  from_phrase text not null,
  to_phrase text not null,
  chart_phrase text,
  category text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, from_phrase)
);

create table if not exists public.app_snapshots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  label text not null default 'manual backup',
  data jsonb not null,
  created_at timestamptz not null default now()
);

drop trigger if exists set_patients_updated_at on public.patients;
create trigger set_patients_updated_at
before update on public.patients
for each row execute function public.set_updated_at();

drop trigger if exists set_schedule_items_updated_at on public.schedule_items;
create trigger set_schedule_items_updated_at
before update on public.schedule_items
for each row execute function public.set_updated_at();

drop trigger if exists set_raw_inbox_updated_at on public.raw_inbox;
create trigger set_raw_inbox_updated_at
before update on public.raw_inbox
for each row execute function public.set_updated_at();

drop trigger if exists set_visits_updated_at on public.visits;
create trigger set_visits_updated_at
before update on public.visits
for each row execute function public.set_updated_at();

drop trigger if exists set_terms_updated_at on public.terms;
create trigger set_terms_updated_at
before update on public.terms
for each row execute function public.set_updated_at();

create index if not exists patients_owner_code_idx on public.patients(owner_id, code);
create index if not exists schedule_items_owner_date_idx on public.schedule_items(owner_id, visit_date, visit_time);
create index if not exists raw_inbox_owner_status_idx on public.raw_inbox(owner_id, status, created_at desc);
create index if not exists visits_owner_patient_date_idx on public.visits(owner_id, patient_id, visit_date desc);
create index if not exists terms_owner_category_idx on public.terms(owner_id, category);

alter table public.patients enable row level security;
alter table public.schedule_items enable row level security;
alter table public.raw_inbox enable row level security;
alter table public.visits enable row level security;
alter table public.terms enable row level security;
alter table public.app_snapshots enable row level security;

drop policy if exists "patients owner access" on public.patients;
create policy "patients owner access"
on public.patients
for all
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "schedule owner access" on public.schedule_items;
create policy "schedule owner access"
on public.schedule_items
for all
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "raw inbox owner access" on public.raw_inbox;
create policy "raw inbox owner access"
on public.raw_inbox
for all
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "visits owner access" on public.visits;
create policy "visits owner access"
on public.visits
for all
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "terms owner access" on public.terms;
create policy "terms owner access"
on public.terms
for all
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "snapshots owner access" on public.app_snapshots;
create policy "snapshots owner access"
on public.app_snapshots
for all
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

