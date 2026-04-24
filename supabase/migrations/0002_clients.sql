-- Context OS Intake — clients layer (V1)
-- Adds:
--   public.clients                         — one row per persistent client
--   public.intake_sessions.client_id       — link from intake to client
--
-- Safe to re-run: uses IF NOT EXISTS throughout.
--
-- ─────────────────────────────────────────────────────────────────────
-- V1 SCOPE AND TEMPORARY DECISIONS
-- ─────────────────────────────────────────────────────────────────────
-- This migration is deliberately minimal. Two things will change later:
--
-- 1. client_brain OVERWRITE BEHAVIOUR (temporary).
--    For V1, each completed intake overwrites clients.client_brain with
--    the latest summary. Historical summaries are still preserved on
--    intake_sessions.summary, so no data is lost — but an intake cannot
--    yet "update" the Brain without clobbering manually-approved edits.
--    REPLACE LATER with merge logic that respects manually-edited fields
--    and layers intake data on top without overwriting Tom's corrections.
--
-- 2. SLUG-BASED CLIENT MATCHING (temporary).
--    For V1, a completed intake is matched to a client by slugifying the
--    business_name from the summary. If two founders enter the same
--    business_name (or one founder types it differently on re-intake),
--    they'll collide or create duplicates. Acceptable for V1 — Tom runs
--    every intake and can clean up manually if it happens.
--    REPLACE LATER with manual client selection at intake start, or an
--    admin-assign step after intake completion, to guarantee identity.
-- ─────────────────────────────────────────────────────────────────────


-- ─────────────────────────────────────────────
-- clients
-- ─────────────────────────────────────────────
create table if not exists public.clients (
  id             uuid        primary key default gen_random_uuid(),
  slug           text        unique not null,
  display_name   text        not null,
  owner_name     text,
  status         text        not null default 'active'
                 check (status in ('active', 'archived')),
  -- TEMPORARY: V1 overwrites this on every completed intake.
  -- Replace with merge-aware update logic once we add manual Brain edits.
  client_brain   jsonb       not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists clients_status_idx
  on public.clients (status);

-- Reuse the existing touch-updated_at trigger function from 0001_init.sql
drop trigger if exists clients_touch on public.clients;
create trigger clients_touch
  before update on public.clients
  for each row
  execute function public.tg_intake_sessions_touch();


-- ─────────────────────────────────────────────
-- intake_sessions.client_id  (link intakes → clients)
-- ─────────────────────────────────────────────
alter table public.intake_sessions
  add column if not exists client_id uuid
    references public.clients(id) on delete set null;

create index if not exists intake_sessions_client_id_idx
  on public.intake_sessions (client_id);


-- ─────────────────────────────────────────────
-- Row-Level Security
-- ─────────────────────────────────────────────
-- Same pattern as intake_sessions: service-role-only.
alter table public.clients enable row level security;
-- No policies for anon/authenticated = no access. Service role bypasses RLS.
