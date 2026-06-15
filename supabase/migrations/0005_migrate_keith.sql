-- Context OS V2 — backfill Keith's brain into domain columns
--
-- Keith's client_brain uses the OLD PROTOTYPE SCHEMA (8 top-level keys):
--   meta, stable, working, constraint, priorities, campaigns, outputs, open_questions
--
-- This is NOT the current intake tool's {business,...} structure.
-- Paths were diagnosed via jsonb_object_keys drilling in Supabase (9 May 2026).
-- Confirmed mappings:
--   {stable,business_name}         → brain_identity.business_name       → "Flow Kayaks"
--   {stable,location}              → brain_identity.where_and_tenure
--   {stable,tenure_years}          → brain_identity.where_and_tenure (appended)
--   {working,monthly_revenue_nzd}  → brain_revenue.monthly_revenue      → 14400
--   {constraint,primary}           → brain_constraints.founder_perceived_bottleneck
--   {working,tools_in_use}         → brain_connections.raw_tools_mentioned
--
-- Safe to re-run: updates by slug.
-- Does NOT delete or modify client_brain — kept for reference.
-- Run AFTER 0004_brain_domains.sql has been applied.
-- ─────────────────────────────────────────────────────────────────────

update public.clients
set
  brain_identity = jsonb_build_object(
    'business_name',    client_brain #>> '{stable,business_name}',
    'what_they_do',     client_brain #>> '{stable,what_they_do}',
    'where_and_tenure', concat_ws(', ',
                          client_brain #>> '{stable,location}',
                          client_brain #>> '{stable,tenure_years}'
                        ),
    'structure',        coalesce(
                          client_brain #>> '{meta,structure}',
                          client_brain #>> '{stable,structure}'
                        ),
    'owner',            coalesce(
                          client_brain #>> '{meta,owner}',
                          client_brain #>> '{stable,owner}'
                        ),
    'endgame',          coalesce(
                          client_brain #>> '{stable,endgame}',
                          client_brain #>> '{constraint,endgame}'
                        )
  ),

  brain_revenue = jsonb_build_object(
    'products_services',              coalesce(
                                        client_brain #>> '{stable,products_services}',
                                        client_brain #>> '{stable,products}'
                                      ),
    'payment_model',                  coalesce(
                                        client_brain #>> '{stable,payment_model}',
                                        client_brain #>> '{working,payment_model}'
                                      ),
    'active_recurring_customers',     coalesce(
                                        client_brain #>> '{working,active_recurring_customers}',
                                        client_brain #>> '{working,recurring_customers}'
                                      ),
    'avg_monthly_value',              client_brain #>> '{working,avg_monthly_value}',
    'avg_sale_value',                 client_brain #>> '{working,avg_sale_value}',
    'sales_per_month',                client_brain #>> '{working,sales_per_month}',
    'customer_tenure',                client_brain #>> '{working,customer_tenure}',
    'repeat_purchase_rate',           client_brain #>> '{working,repeat_purchase_rate}',
    'gross_margin',                   client_brain #>> '{working,gross_margin}',
    'monthly_revenue',                client_brain #>> '{working,monthly_revenue_nzd}',
    'revenue_concentration',          client_brain #>> '{working,revenue_concentration}',
    'profitability_and_owner_income', coalesce(
                                        client_brain #>> '{working,profitability}',
                                        client_brain #>> '{working,owner_income}'
                                      ),
    'twelve_month_target',            coalesce(
                                        client_brain #>> '{working,twelve_month_target}',
                                        client_brain #>> '{constraint,twelve_month_target}'
                                      ),
    'cash_position',                  client_brain #>> '{working,cash_position}'
  ),

  brain_customers = jsonb_build_object(
    'icp',             client_brain #>> '{stable,icp}',
    'not_a_fit',       client_brain #>> '{stable,not_a_fit}',
    'pain_on_arrival', client_brain #>> '{stable,pain_on_arrival}',
    'buying_trigger',  client_brain #>> '{stable,buying_trigger}',
    'objections',      client_brain #>> '{stable,objections}',
    'voice_notes',     client_brain #>> '{stable,voice_notes}'
  ),

  brain_acquisition = jsonb_build_object(
    'lead_sources',         coalesce(
                              client_brain #>> '{working,lead_sources}',
                              client_brain #>> '{stable,lead_sources}'
                            ),
    'full_flow',            coalesce(
                              client_brain #>> '{stable,acquisition_flow}',
                              client_brain #>> '{working,acquisition_flow}'
                            ),
    'progression_triggers', client_brain #>> '{stable,progression_triggers}',
    'no_buy_process',       client_brain #>> '{working,no_buy_process}',
    'follow_up_process',    client_brain #>> '{working,follow_up_process}',
    'conversion_rate',      client_brain #>> '{working,conversion_rate}',
    'time_to_cash',         client_brain #>> '{working,time_to_cash}',
    'referral_share',       client_brain #>> '{working,referral_share}'
  ),

  brain_operations = jsonb_build_object(
    'delivery', jsonb_build_object(
      'unit_of_delivery',  client_brain #>> '{stable,unit_of_delivery}',
      'how_work_happens',  client_brain #>> '{stable,how_work_happens}',
      'documented_status', client_brain #>> '{stable,documented_status}',
      'current_capacity',  client_brain #>> '{working,current_capacity}'
    ),
    'team', jsonb_build_object(
      'who_works_on_it',  coalesce(
                            client_brain #>> '{meta,team}',
                            client_brain #>> '{stable,team}'
                          ),
      'next_hire',        client_brain #>> '{constraint,next_hire}',
      'operating_rhythm', client_brain #>> '{stable,operating_rhythm}'
    ),
    'systems', jsonb_build_object(
      'tools_in_use',     client_brain #>> '{working,tools_in_use}',
      'automations',      client_brain #>> '{working,automations}',
      'numbers_reviewed', client_brain #>> '{working,numbers_reviewed}'
    )
  ),

  brain_constraints = jsonb_build_object(
    'weekly_revenue_actions',      client_brain #>> '{constraint,weekly_revenue_actions}',
    'inconsistencies',             client_brain #>> '{constraint,inconsistencies}',
    'founder_hours',               coalesce(
                                     client_brain #>> '{working,founder_hours}',
                                     client_brain #>> '{constraint,founder_hours}'
                                   ),
    'regular_decisions',           client_brain #>> '{constraint,regular_decisions}',
    'unnecessary_dependency',      client_brain #>> '{constraint,unnecessary_dependency}',
    'system_breakpoints',          client_brain #>> '{constraint,system_breakpoints}',
    'what_has_been_tried',         client_brain #>> '{constraint,what_has_been_tried}',
    'founder_perceived_bottleneck',client_brain #>> '{constraint,primary}',
    'seasonality_and_milestones',  client_brain #>> '{constraint,seasonality}',
    'additional_context',          client_brain #>> '{constraint,additional_context}',
    'unresolved_gaps',             coalesce(client_brain -> 'open_questions', '[]'::jsonb),
    'synthesized_statement',       null
  ),

  -- brain_connections: tier1_domains left empty (no server-side mapper in SQL).
  -- Re-mapped automatically on next real intake completion via brain-domains.ts.
  brain_connections = jsonb_build_object(
    'raw_tools_mentioned',  coalesce(client_brain #>> '{working,tools_in_use}', ''),
    'automations_in_place', coalesce(client_brain #>> '{working,automations}', ''),
    'tier1_domains', jsonb_build_object(
      'revenue_financials',    '[]'::jsonb,
      'customer_interactions', '[]'::jsonb,
      'calendar',              '[]'::jsonb,
      'communication',         '[]'::jsonb,
      'project_task_tracking', '[]'::jsonb,
      'meeting_intelligence',  '[]'::jsonb,
      'knowledge_files',       '[]'::jsonb
    ),
    'mapped_at', null
  ),

  brain_version = '2.0'

where slug = 'flow-kayaks';

-- Verify the update landed
select
  slug,
  brain_version,
  brain_identity    ->> 'business_name'              as identity_check,
  brain_revenue     ->> 'monthly_revenue'             as revenue_check,
  brain_constraints ->> 'founder_perceived_bottleneck' as constraint_check
from public.clients
where slug = 'flow-kayaks';
