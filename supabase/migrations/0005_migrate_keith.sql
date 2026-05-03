-- Context OS V2 — backfill Keith's brain into domain columns
--
-- Reads Keith's existing client_brain JSONB and populates the 7 domain
-- columns added in 0004_brain_domains.sql.
--
-- Safe to re-run: uses ON CONFLICT DO UPDATE (upsert on slug).
-- Does NOT delete or modify client_brain — kept for reference.
--
-- Run this AFTER 0004_brain_domains.sql has been applied.
-- ─────────────────────────────────────────────────────────────────────

update public.clients
set
  brain_identity = jsonb_build_object(
    'business_name',    client_brain #>> '{business,identity,business_name}',
    'what_they_do',     client_brain #>> '{business,identity,what_they_do}',
    'where_and_tenure', client_brain #>> '{business,identity,where_and_tenure}',
    'structure',        client_brain #>> '{business,identity,structure}',
    'owner',            client_brain #>> '{business,identity,owner}',
    'endgame',          client_brain #>> '{business,identity,endgame}'
  ),

  brain_revenue = jsonb_build_object(
    'products_services',             client_brain #>> '{business,revenue_model,products_services}',
    'payment_model',                 client_brain #>> '{business,revenue_model,payment_model}',
    'active_recurring_customers',    client_brain #>> '{business,revenue_model,active_recurring_customers}',
    'avg_monthly_value',             client_brain #>> '{business,revenue_model,avg_monthly_value}',
    'avg_sale_value',                client_brain #>> '{business,revenue_model,avg_sale_value}',
    'sales_per_month',               client_brain #>> '{business,revenue_model,sales_per_month}',
    'customer_tenure',               client_brain #>> '{business,revenue_model,customer_tenure}',
    'repeat_purchase_rate',          client_brain #>> '{business,revenue_model,repeat_purchase_rate}',
    'gross_margin',                  client_brain #>> '{business,revenue_model,gross_margin}',
    'monthly_revenue',               client_brain #>> '{business,financials,monthly_revenue}',
    'revenue_concentration',         client_brain #>> '{business,financials,revenue_concentration}',
    'profitability_and_owner_income',client_brain #>> '{business,financials,profitability_and_owner_income}',
    'twelve_month_target',           client_brain #>> '{business,financials,twelve_month_target}',
    'cash_position',                 client_brain #>> '{business,financials,cash_position}'
  ),

  brain_customers = jsonb_build_object(
    'icp',            client_brain #>> '{business,customer_reality,icp}',
    'not_a_fit',      client_brain #>> '{business,customer_reality,not_a_fit}',
    'pain_on_arrival',client_brain #>> '{business,customer_reality,pain_on_arrival}',
    'buying_trigger', client_brain #>> '{business,customer_reality,buying_trigger}',
    'objections',     coalesce(
                        client_brain #>> '{business,customer_reality,objections}',
                        client_brain #>> '{sales,objections_seed,common_objections}'
                      ),
    'voice_notes',    client_brain #>> '{marketing,voice,voice_notes}'
  ),

  brain_acquisition = jsonb_build_object(
    'lead_sources',          coalesce(
                               client_brain #>> '{business,acquisition,lead_sources}',
                               client_brain #>> '{sales,pipeline_seed,lead_sources}'
                             ),
    'full_flow',             coalesce(
                               client_brain #>> '{business,acquisition,full_flow}',
                               client_brain #>> '{sales,pipeline_seed,conversion_flow}'
                             ),
    'progression_triggers',  coalesce(
                               client_brain #>> '{business,acquisition,progression_triggers}',
                               client_brain #>> '{sales,pipeline_seed,progression_triggers}'
                             ),
    'no_buy_process',        client_brain #>> '{business,acquisition,no_buy_process}',
    'follow_up_process',     coalesce(
                               client_brain #>> '{sales,pipeline_seed,follow_up_process}',
                               client_brain #>> '{business,acquisition,no_buy_process}'
                             ),
    'conversion_rate',       coalesce(
                               client_brain #>> '{business,acquisition,conversion_rate}',
                               client_brain #>> '{sales,pipeline_seed,conversion_rate}'
                             ),
    'time_to_cash',          client_brain #>> '{business,acquisition,time_to_cash}',
    'referral_share',        coalesce(
                               client_brain #>> '{business,acquisition,referral_share}',
                               client_brain #>> '{sales,pipeline_seed,referral_share}'
                             )
  ),

  brain_operations = jsonb_build_object(
    'delivery', jsonb_build_object(
      'unit_of_delivery',  client_brain #>> '{business,delivery,unit_of_delivery}',
      'how_work_happens',  client_brain #>> '{business,delivery,how_work_happens}',
      'documented_status', client_brain #>> '{business,delivery,documented_status}',
      'current_capacity',  client_brain #>> '{business,delivery,current_capacity}'
    ),
    'team', jsonb_build_object(
      'who_works_on_it', client_brain #>> '{business,team,who_works_on_it}',
      'next_hire',       client_brain #>> '{business,team,next_hire}',
      'operating_rhythm',client_brain #>> '{business,team,operating_rhythm}'
    ),
    'systems', jsonb_build_object(
      'tools_in_use',    client_brain #>> '{business,systems,tools_in_use}',
      'automations',     client_brain #>> '{business,systems,automations}',
      'numbers_reviewed',client_brain #>> '{business,systems,numbers_reviewed}'
    )
  ),

  brain_constraints = jsonb_build_object(
    'weekly_revenue_actions',     client_brain #>> '{business,constraints,weekly_revenue_actions}',
    'inconsistencies',            client_brain #>> '{business,constraints,inconsistencies}',
    'founder_hours',              client_brain #>> '{business,constraints,founder_hours}',
    'regular_decisions',          client_brain #>> '{business,constraints,regular_decisions}',
    'unnecessary_dependency',     client_brain #>> '{business,constraints,unnecessary_dependency}',
    'system_breakpoints',         client_brain #>> '{business,constraints,system_breakpoints}',
    'what_has_been_tried',        client_brain #>> '{business,constraints,what_has_been_tried}',
    'founder_perceived_bottleneck',client_brain #>> '{business,constraints,founder_perceived_bottleneck}',
    'seasonality_and_milestones', client_brain #>> '{business,temporal,seasonality_and_milestones}',
    'additional_context',         client_brain #>> '{additional_context}',
    'unresolved_gaps',            coalesce(client_brain -> 'unresolved_gaps', '[]'::jsonb),
    'synthesized_statement',      null
  ),

  -- brain_connections: store the raw tools string; tier1_domains left empty
  -- (no server-side tool mapper in SQL — will be re-mapped on next intake
  -- or when the admin triggers a re-process from the Review UI).
  brain_connections = jsonb_build_object(
    'raw_tools_mentioned',  coalesce(client_brain #>> '{business,systems,tools_in_use}', ''),
    'automations_in_place', coalesce(client_brain #>> '{business,systems,automations}', ''),
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
  brain_identity  ->> 'business_name' as identity_check,
  brain_revenue   ->> 'payment_model' as revenue_check,
  brain_constraints ->> 'founder_perceived_bottleneck' as constraint_check
from public.clients
where slug = 'flow-kayaks';
