-- Context OS — diagnostic reviews (V1)
-- Append-only record of every review written against a client_brain.
-- Safe to re-run.
--
-- V1 SCOPE: Claude produces drafts via POST /api/review/[clientId]. Rows
-- are written as (review_status='draft', reviewer_type='ai') and never
-- mutated. The status and reviewer_type columns exist so V2 can wire up
-- approval / edit flows without a schema migration.

create table if not exists public.diagnostic_reviews (
  id                       uuid        primary key default gen_random_uuid(),
  client_id                uuid        not null
                            references public.clients(id) on delete cascade,
  source_intake_session_id uuid
                            references public.intake_sessions(id) on delete set null,
  created_at               timestamptz not null default now(),

  -- Workflow state: lifecycle of this review row.
  review_status            text        not null default 'draft'
                           check (review_status in ('draft', 'approved', 'revised')),

  -- Author: who produced this version.
  reviewer_type            text        not null default 'ai'
                           check (reviewer_type in ('ai', 'tom')),

  review                   jsonb       not null
);

create index if not exists diagnostic_reviews_client_id_idx
  on public.diagnostic_reviews (client_id, created_at desc);

create index if not exists diagnostic_reviews_status_idx
  on public.diagnostic_reviews (review_status);

-- Service-role-only, same pattern as intake_sessions / clients.
alter table public.diagnostic_reviews enable row level security;
