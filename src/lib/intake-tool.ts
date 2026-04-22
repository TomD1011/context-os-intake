/**
 * submit_intake_summary tool definition
 * Matches the Client Brain Template 10-domain schema defined in System Prompt.md
 */

import type Anthropic from '@anthropic-ai/sdk'

// Helper for building "object of string fields" at each leaf of the tree
const stringObject = (fields: string[]) => ({
  type: 'object' as const,
  properties: Object.fromEntries(fields.map((f) => [f, { type: 'string' }])),
  required: fields,
})

export const INTAKE_TOOL: Anthropic.Tool = {
  name: 'submit_intake_summary',
  description:
    'Submit the completed Context OS intake summary as a single structured JSON object. Call this ONCE at the end of the conversation, after every required section is complete and every consistency check has been resolved or logged. Every field must be populated — use an empty string "" for questions that were pushed three times and accepted empty, and add a matching entry to unresolved_gaps. The JSON goes through this tool only — never output it in chat.',
  input_schema: {
    type: 'object',
    properties: {
      _intake_version: { type: 'string' },
      _completed_at: {
        type: 'string',
        description: 'ISO 8601 timestamp of completion, e.g. 2026-04-20T21:45:00Z',
      },
      _brain_schema: { type: 'string' },

      context: stringObject([
        'business_name',
        'what_they_do',
        'where_and_tenure',
        'structure',
        'owner',
      ]),

      business: {
        type: 'object',
        properties: {
          identity: stringObject([
            'business_name',
            'what_they_do',
            'where_and_tenure',
            'structure',
            'owner',
            'endgame',
          ]),
          revenue_model: stringObject([
            'products_services',
            'payment_model',
            'active_recurring_customers',
            'avg_monthly_value',
            'avg_sale_value',
            'sales_per_month',
            'customer_tenure',
            'repeat_purchase_rate',
            'gross_margin',
          ]),
          financials: stringObject([
            'monthly_revenue',
            'revenue_concentration',
            'profitability_and_owner_income',
            'twelve_month_target',
            'cash_position',
          ]),
          customer_reality: stringObject([
            'icp',
            'not_a_fit',
            'pain_on_arrival',
            'buying_trigger',
            'objections',
          ]),
          acquisition: stringObject([
            'lead_sources',
            'full_flow',
            'progression_triggers',
            'no_buy_process',
            'conversion_rate',
            'referral_share',
          ]),
          delivery: stringObject([
            'unit_of_delivery',
            'how_work_happens',
            'documented_status',
            'current_capacity',
          ]),
          team: stringObject(['who_works_on_it', 'next_hire', 'operating_rhythm']),
          systems: stringObject(['tools_in_use', 'automations']),
          constraints: stringObject([
            'weekly_revenue_actions',
            'inconsistencies',
            'founder_hours',
            'regular_decisions',
            'unnecessary_dependency',
            'system_breakpoints',
            'what_has_been_tried',
          ]),
          temporal: stringObject(['seasonality_and_milestones']),
        },
        required: [
          'identity',
          'revenue_model',
          'financials',
          'customer_reality',
          'acquisition',
          'delivery',
          'team',
          'systems',
          'constraints',
          'temporal',
        ],
      },

      marketing: {
        type: 'object',
        properties: {
          voice: stringObject(['voice_notes']),
        },
        required: ['voice'],
      },

      sales: {
        type: 'object',
        properties: {
          objections_seed: stringObject(['common_objections']),
          pipeline_seed: stringObject([
            'lead_sources',
            'conversion_flow',
            'progression_triggers',
            'follow_up_process',
            'conversion_rate',
            'referral_share',
          ]),
        },
        required: ['objections_seed', 'pipeline_seed'],
      },

      sources: {
        type: 'array',
        description:
          'Array of file references for any supporting documents uploaded during the intake. May be empty.',
        items: { type: 'object' },
      },

      additional_context: { type: 'string' },

      unresolved_gaps: {
        type: 'array',
        description:
          'Each entry describes a consistency issue, missing answer, or incomplete response that was pushed three times and accepted empty. Format per system prompt rules.',
        items: { type: 'string' },
      },
    },
    required: [
      '_intake_version',
      '_completed_at',
      '_brain_schema',
      'context',
      'business',
      'marketing',
      'sales',
      'sources',
      'additional_context',
      'unresolved_gaps',
    ],
  },
}

/** Shape of the JSON that submit_intake_summary produces (for TS consumers). */
export type IntakeSummary = {
  _intake_version: string
  _completed_at: string
  _brain_schema: string
  context: Record<string, string>
  business: Record<string, Record<string, string>>
  marketing: { voice: { voice_notes: string } }
  sales: {
    objections_seed: { common_objections: string }
    pipeline_seed: Record<string, string>
  }
  sources: Array<Record<string, unknown>>
  additional_context: string
  unresolved_gaps: string[]
}
