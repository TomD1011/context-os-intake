-- Context OS V2 — domain brain columns
-- Adds 7 navigable domain columns to clients, replacing the monolithic
-- client_brain JSONB blob. client_brain is kept for backward compat and
-- will be removed in a future migration once all reads are on domain columns.
--
-- Domain columns let each specialist agent query only the fields it needs
-- (e.g. Sales OS reads brain_acquisition + brain_revenue + brain_constraints)
-- without loading the full brain on every call.

alter table public.clients
  add column if not exists brain_identity    jsonb,
  add column if not exists brain_revenue     jsonb,
  add column if not exists brain_customers   jsonb,
  add column if not exists brain_acquisition jsonb,
  add column if not exists brain_operations  jsonb,
  add column if not exists brain_constraints jsonb,
  add column if not exists brain_connections jsonb,
  add column if not exists recommended_os    text
    check (recommended_os in ('sales_os', 'marketing_os', 'operations_os')),
  add column if not exists brain_version     text not null default '1.0';

-- Index the recommended_os column for future filtering
create index if not exists clients_recommended_os_idx
  on public.clients (recommended_os)
  where recommended_os is not null;
