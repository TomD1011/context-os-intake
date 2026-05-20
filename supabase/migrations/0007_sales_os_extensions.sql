-- Migration 0007: Sales OS Schema Extensions
-- Adds sales_machine table for Sales OS bot consumption
-- Adds objection_voc column to avatar_deep for verbatim objection language
-- Date: 2026-05-21
-- Depends on: 0001 (init), 0004 (brain_domains), 0006 (marketing_os_extensions)
-- Reversible: drop new table + column

BEGIN;

-- =====================================================
-- NEW TABLE: sales_machine
-- Captures the sales motion in delivery-production detail
-- Mirrors the offer_architecture / avatar_deep / voice_tone pattern from 0006
-- Sales OS bot reads this to generate scripts, pipeline configs, follow-up sequences
-- =====================================================
CREATE TABLE IF NOT EXISTS sales_machine (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,

  -- Sales script (Q5.11)
  -- Either pasted text, a reference to an uploaded file, or a walk-through of
  -- how a typical sales conversation goes if no formal script exists.
  sales_script TEXT,

  -- Closing language (Q5.12)
  -- Exact phrase/question the founder uses to move prospect from interested
  -- to committed. Word-for-word preferred; walk-through fallback acceptable.
  closing_language TEXT,

  -- Qualification criteria (Q5.13)
  -- Filters used to decide a lead is worth pursuing: budget, timeline, role,
  -- business size, decision authority. Becomes Sales OS pipeline qualification logic.
  qualification_criteria TEXT,

  -- Follow-up cadence (Q5.14)
  -- Day-by-day sequence: what is sent, what channel, what trigger.
  -- Becomes the Sales OS follow-up sequence template.
  followup_cadence TEXT,

  -- Pipeline visibility (Q5.15)
  -- Current state of pipeline measurement: where data lives, who looks at it,
  -- how often, what decisions get made. Tells Sales OS what to add vs preserve.
  pipeline_visibility TEXT,

  -- Audit
  source TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sales_machine_business_id_idx
  ON sales_machine(business_id);

COMMENT ON TABLE sales_machine IS
  'Sales OS extension (V2.4, 21 May 2026). Captures sales motion fields the Sales OS bot needs to generate NEPQ-aligned scripts, HubSpot pipeline configs, and follow-up sequences.';

-- =====================================================
-- EXTEND TABLE: avatar_deep
-- Add objection_voc column for verbatim objection language (Q4.6)
-- Complements existing pain_points_voc and voc_quotes_raw columns
-- =====================================================
ALTER TABLE avatar_deep
  ADD COLUMN IF NOT EXISTS objection_voc JSONB;

COMMENT ON COLUMN avatar_deep.objection_voc IS
  'Q4.6 — Verbatim objection phrases prospects use when not buying. Array of strings, exact words, not summaries. Drives Sales OS objection handlers and Marketing OS copy that pre-handles objections.';

COMMIT;

-- =====================================================
-- ROLLBACK (manual, if needed)
-- =====================================================
-- BEGIN;
-- ALTER TABLE avatar_deep DROP COLUMN IF EXISTS objection_voc;
-- DROP INDEX IF EXISTS sales_machine_business_id_idx;
-- DROP TABLE IF EXISTS sales_machine;
-- COMMIT;
