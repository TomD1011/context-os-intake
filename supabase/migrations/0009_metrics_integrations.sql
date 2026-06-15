-- ============================================================================
-- Migration 0009 — Live metrics + integrations (Move 3)
--
-- DEPLOY TARGET: context-os-intake repo → supabase/migrations/0009_metrics_integrations.sql
-- (Authored in the FounderOS repo for review; copy into the app repo to deploy.)
--
-- WHY: Move 3 is the auto-refresh layer. `client_integrations` records each client's
-- connected data sources; `client_metrics` stores one dated snapshot per pull, so
-- numbers have history (trend), not just a current value. Feeds the daily client
-- report AND the generation prompts (current-metrics read in the handshake).
--
-- NAMING: an older `integrations` table already exists in this DB (keyed on
-- business_id, from the Model-2 schema design). To avoid the collision and stay
-- consistent with the rest of this layer (all keyed on clients), ours is named
-- `client_integrations`. DEPLOYED to production 11 Jun 2026.
--
-- ISOLATED new tables, FK to clients — no overwrite-bug exposure.
-- ============================================================================

-- One row per client per connected data source.
create table if not exists client_integrations (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid references clients(id) on delete cascade,
  tool            text,        -- hubspot|meta|google|kit|stripe|manual
  status          text default 'pending',  -- connected|pending|failed
  last_sync       timestamptz,
  sync_frequency  text default 'daily',    -- daily|weekly|manual
  notes           text,        -- e.g. scope warnings, portal id
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- One dated snapshot per client per source. Metrics are JSONB so the same table
-- holds pipeline metrics (Sales) and ad metrics (Marketing) without rigid columns.
-- Example metrics object:
--   { "pipeline_value": 5000, "deals_open": 1, "deals_won": 3,
--     "revenue_won": 12200, "leads_new_30d": 0, "win_rate": 0.75 }
--   or { "spend": 420, "impressions": 31000, "clicks": 540, "ctr": 1.7,
--        "conversions": 12, "cpa": 35, "roas": 3.1 }
create table if not exists client_metrics (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid references clients(id) on delete cascade,
  snapshot_date date not null,
  source        text,          -- hubspot|meta|google|manual
  metrics       jsonb not null,
  captured_at   timestamptz default now()
);

create index if not exists client_integrations_client_idx on client_integrations(client_id);
create index if not exists client_metrics_client_idx    on client_metrics(client_id, snapshot_date desc);
create index if not exists client_metrics_latest_idx    on client_metrics(client_id, source, snapshot_date desc);
