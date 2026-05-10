-- Migration 0006: Marketing OS Schema Extensions
-- Adds offer_architecture, avatar_deep, voice_tone tables
-- Extends businesses, acquisition_machine
-- Date: 2026-05-10
-- Depends on: 0001 (init), 0004 (brain_domains)
-- Reversible: drop new tables + columns

BEGIN;

-- =====================================================
-- NEW TABLE: offer_architecture
-- Captures offer in marketing-production detail
-- =====================================================
CREATE TABLE IF NOT EXISTS offer_architecture (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,

  -- Offer identity
  mechanism_name TEXT,
  offer_one_liner TEXT,

  -- Value equation (Hormozi)
  value_equation_outcome TEXT,
  value_equation_likelihood TEXT,
  value_equation_risk TEXT,
  value_equation_time_delay TEXT,

  -- Guarantee
  guarantee_text TEXT,
  guarantee_terms TEXT,

  -- Amplifiers (8 levers from Client-Getting Offer)
  -- Structure: {focused_audience, results_oriented, tangible_life_impact,
  --             polarising_message, unique_method, time_bound_result,
  --             guaranteed_safety, pricing_easy_start}
  offer_amplifiers JSONB,

  -- Product ladder (Four Product Empire)
  -- Structure: {incentive: {...}, core: {...}, high_ticket: {...}, subscription: {...}}
  product_ladder JSONB,

  -- Pricing & anchors
  price_anchors TEXT,
  payment_options TEXT,

  -- Audit
  source TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_offer_architecture_business_id ON offer_architecture(business_id);

ALTER TABLE offer_architecture ENABLE ROW LEVEL SECURITY;

-- RLS: service role has full access; user role gets own rows via business_id
CREATE POLICY "service_role_all_offer_architecture" ON offer_architecture
  FOR ALL USING (auth.role() = 'service_role');


-- =====================================================
-- NEW TABLE: avatar_deep
-- Captures avatar in proper depth for marketing copy
-- =====================================================
CREATE TABLE IF NOT EXISTS avatar_deep (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,

  -- Demographics (structured)
  -- {age_range, gender, life_stage, income, location, role}
  demographics JSONB,

  -- Psychographics (structured)
  -- {values, beliefs, identity_markers, aspirations}
  psychographics JSONB,

  -- Pain in their language
  -- Array of "in their words" quotes
  pain_points_voc JSONB,
  daily_frustrations TEXT,
  what_keeps_them_awake TEXT,
  hidden_fears TEXT,
  humiliations TEXT,
  what_they_complain_about TEXT,

  -- Dream outcomes in their language
  dream_outcomes_voc JSONB,
  what_they_want_more_than_anything TEXT,
  cost_of_inaction TEXT,

  -- Identity
  how_they_describe_themselves TEXT,
  who_they_aspire_to_be TEXT,

  -- Where they hang out
  -- Array of {platform, frequency, content_type}
  channels_consumed JSONB,
  influencers_followed TEXT,
  competitors_compared TEXT,

  -- Raw VoC (gold for copy)
  -- Array of actual quotes from reviews, DMs, sales calls
  voc_quotes_raw JSONB,

  -- Audit
  source TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_avatar_deep_business_id ON avatar_deep(business_id);

ALTER TABLE avatar_deep ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_avatar_deep" ON avatar_deep
  FOR ALL USING (auth.role() = 'service_role');


-- =====================================================
-- NEW TABLE: voice_tone
-- Captures voice for bot mimicry. Self-reported + sample-based.
-- =====================================================
CREATE TABLE IF NOT EXISTS voice_tone (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,

  -- 5 projective questions
  camera_for_a_week TEXT,
  rant_about TEXT,
  story_told_often TEXT,
  audience_feel TEXT,
  voice_actor TEXT,

  -- Voice samples (Path B critical)
  -- Array of {source_url, content, type: 'post'|'email'|'transcript'|'about_page'}
  voice_samples JSONB,

  -- Anti-voice (what they don't want to sound like)
  -- Array of {source, content, why_avoid}
  anti_voice_samples JSONB,
  banned_phrases JSONB,

  -- Register & rhythm
  register_formal_casual INTEGER CHECK (register_formal_casual BETWEEN 1 AND 5),
  jargon_level INTEGER CHECK (jargon_level BETWEEN 1 AND 5),
  sentence_rhythm_preference TEXT,
  signature_phrases JSONB,

  -- Audit
  source TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_voice_tone_business_id ON voice_tone(business_id);

ALTER TABLE voice_tone ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_voice_tone" ON voice_tone
  FOR ALL USING (auth.role() = 'service_role');


-- =====================================================
-- EXTEND: businesses
-- Add origin story, why now, sacred cows, competitors
-- =====================================================
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS origin_story TEXT;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS why_now TEXT;

-- Array of contrarian takes / industry practices they stand against
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS sacred_cows JSONB;

-- Array of {name, url, how_we_differ}
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS competitors JSONB;


-- =====================================================
-- EXTEND: acquisition_machine
-- Add content channels, existing assets, past failures
-- =====================================================

-- Array of {platform, audience_size, frequency, what_works, content_pillars}
ALTER TABLE acquisition_machine ADD COLUMN IF NOT EXISTS content_channels JSONB;

-- {website_url, lead_magnets: [], sales_pages: [], social_handles: {}, testimonials: []}
ALTER TABLE acquisition_machine ADD COLUMN IF NOT EXISTS existing_assets JSONB;

-- What they've tried before that didn't work, and why
ALTER TABLE acquisition_machine ADD COLUMN IF NOT EXISTS past_failures TEXT;


-- =====================================================
-- AUDIT LOG
-- =====================================================
INSERT INTO context_os_updates (
  business_id,
  table_updated,
  field_updated,
  old_value,
  new_value,
  source,
  created_at
)
SELECT
  id AS business_id,
  'schema_v6' AS table_updated,
  'migration_0006' AS field_updated,
  'v1.1_brain_domains' AS old_value,
  'v1.2_marketing_os_extensions' AS new_value,
  'migration_0006' AS source,
  NOW() AS created_at
FROM businesses
WHERE EXISTS (
  -- Only log for existing businesses; safe no-op if table is empty
  SELECT 1 FROM businesses LIMIT 1
);

-- Update context_os_version on all existing rows to 1.2
UPDATE businesses SET context_os_version = '1.2' WHERE context_os_version IS NOT NULL;


-- =====================================================
-- VERSION TRACKING
-- =====================================================
COMMENT ON TABLE offer_architecture IS 'Marketing OS: offer in production detail (mechanism, value equation, guarantee, amplifiers, ladder). Added in migration 0006.';
COMMENT ON TABLE avatar_deep IS 'Marketing OS: avatar in copy-production depth (demographics, VoC quotes, daily frustrations, identity markers). Added in migration 0006.';
COMMENT ON TABLE voice_tone IS 'Marketing OS: voice capture for bot mimicry (projective Qs, voice samples, anti-voice, register). Added in migration 0006.';

COMMIT;


-- =====================================================
-- ROLLBACK (run if migration needs reversal)
-- =====================================================
-- BEGIN;
--   DROP TABLE IF EXISTS voice_tone CASCADE;
--   DROP TABLE IF EXISTS avatar_deep CASCADE;
--   DROP TABLE IF EXISTS offer_architecture CASCADE;
--   ALTER TABLE businesses DROP COLUMN IF EXISTS origin_story;
--   ALTER TABLE businesses DROP COLUMN IF EXISTS why_now;
--   ALTER TABLE businesses DROP COLUMN IF EXISTS sacred_cows;
--   ALTER TABLE businesses DROP COLUMN IF EXISTS competitors;
--   ALTER TABLE acquisition_machine DROP COLUMN IF EXISTS content_channels;
--   ALTER TABLE acquisition_machine DROP COLUMN IF EXISTS existing_assets;
--   ALTER TABLE acquisition_machine DROP COLUMN IF EXISTS past_failures;
--   UPDATE businesses SET context_os_version = '1.1' WHERE context_os_version = '1.2';
-- COMMIT;
