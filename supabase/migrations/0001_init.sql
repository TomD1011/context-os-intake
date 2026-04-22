-- Context OS Intake — initial schema
-- Creates:
--   public.intake_sessions  — one row per intake (in-progress or complete)
--   public.intake_files     — optional file uploads attached to a session
--
-- Safe to re-run: uses IF NOT EXISTS / OR REPLACE throughout.

-- ─────────────────────────────────────────────
-- Extensions
-- ─────────────────────────────────────────────
create extension if not exists "pgcrypto";

-- ─────────────────────────────────────────────
-- intake_sessions
-- ─────────────────────────────────────────────
create table if not exists public.intake_sessions (
  id             uuid        primary key default gen_random_uuid(),
  created_at     timestamptz not null    default now(),
  updated_at     timestamptz not null    default now(),
  completed_at   timestamptz,
  status         text        not null    default 'in_progress'
                 check (status in ('in_progress', 'complete')),
  business_name  text,
  messages       jsonb       not null    default '[]'::jsonb,
  summary        jsonb
);

create index if not exists intake_sessions_status_idx
  on public.intake_sessions (status);

create index if not exists intake_sessions_updated_at_idx
  on public.intake_sessions (updated_at desc);

-- Keep updated_at fresh on every row update
create or replace function public.tg_intake_sessions_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists intake_sessions_touch on public.intake_sessions;
create trigger intake_sessions_touch
  before update on public.intake_sessions
  for each row
  execute function public.tg_intake_sessions_touch();

-- ─────────────────────────────────────────────
-- intake_files
-- ─────────────────────────────────────────────
create table if not exists public.intake_files (
  id             uuid        primary key default gen_random_uuid(),
  session_id     uuid        not null references public.intake_sessions(id) on delete cascade,
  created_at     timestamptz not null    default now(),
  filename       text        not null,
  storage_path   text        not null,
  content_type   text,
  size_bytes     bigint
);

create index if not exists intake_files_session_id_idx
  on public.intake_files (session_id);

-- ─────────────────────────────────────────────
-- Row-Level Security
-- ─────────────────────────────────────────────
-- The backend writes via the SERVICE ROLE key (bypasses RLS), so we
-- lock public/anon access down by default. Founders never read/write
-- directly — everything goes through /api/chat and /api/intake.
alter table public.intake_sessions enable row level security;
alter table public.intake_files   enable row level security;

-- No policies for anon/authenticated = no access. Service role bypasses RLS.
