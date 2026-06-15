-- ============================================================================
-- Migration 0008 — Asset + Performance tables (Move 2)
--
-- DEPLOY TARGET: context-os-intake repo → supabase/migrations/0008_assets_performance.sql
-- (The Context OS app is a separate repo: github.com/TomD1011/context-os-intake.
--  This file is authored in the FounderOS repo for review; copy it into the app
--  repo's migrations folder and run via the normal Supabase migration flow.)
--
-- WHY: today assets are built and forgotten — no record of hook, format, cost, or
-- result. These tables are the system's memory. They are NEW and ISOLATED (own
-- tables, FK to clients) so they do NOT touch the monolithic client_brain JSONB
-- and are therefore unaffected by the V1 intake-overwrite bug (no merge-fix needed
-- to ship this).
--
-- MIRRORS: Builds/Marketing OS/01 — Context OS Extension/Asset Performance Schema.md
--          and the Notion "Asset Performance Tracker" DB (read-only human mirror).
-- ============================================================================

-- One row per asset: identity + content + signal + learning.
create table if not exists assets (
  id                   uuid primary key default gen_random_uuid(),
  client_id            uuid references clients(id) on delete cascade,
  title                text not null,
  os                   text,        -- 'marketing' | 'sales'
  asset_type           text,        -- ad|post|email|sequence|campaign|landing-page|sales-script|call-list|sop|pipeline|other
  status               text default 'draft',  -- draft|active|paused|retired
  campaign             text,
  platform             text,        -- meta|google|linkedin|youtube|email|web|other
  format               text,        -- single-image|carousel|video|story|search|text|n/a
  audience             text,
  link                 text,
  hook                 text,
  copy_excerpt         text,
  cta                  text,
  creative_direction   text,
  competitor_pattern   text,        -- filled by the Apify signal layer (Move 4); null until then
  verdict              text,        -- winner|loser|inconclusive — the field the engine reads to decide what to repeat
  notes                text,
  live_date            date,
  created_at           timestamptz default now(),
  updated_at           timestamptz default now()
);

-- One row per metrics snapshot, so performance HISTORY is preserved (never overwritten).
-- Move 3 (auto-refresh) inserts a new row per pull; latest row = current numbers.
create table if not exists asset_performance (
  id            uuid primary key default gen_random_uuid(),
  asset_id      uuid references assets(id) on delete cascade,
  snapshot_date date not null,
  impressions   integer,
  clicks        integer,
  ctr           numeric,     -- percentage
  cpc           numeric,
  conversions   integer,
  cpa           numeric,
  spend         numeric,
  roas          numeric,
  reach         integer,     -- organic
  engagement    integer,     -- organic
  source        text default 'manual',  -- manual|meta|google|hubspot|linkedin (set by Move 3)
  captured_at   timestamptz default now()
);

create index if not exists assets_client_idx          on assets(client_id);
create index if not exists assets_type_idx            on assets(client_id, asset_type);
create index if not exists asset_perf_asset_idx       on asset_performance(asset_id);
create index if not exists asset_perf_latest_idx      on asset_performance(asset_id, snapshot_date desc);
