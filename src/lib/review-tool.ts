/**
 * submit_diagnostic_review tool definition (V1)
 *
 * Produces the Diagnostic Review for a single FounderOS client, based on
 * their client_brain plus the unresolved_gaps from the most recent intake.
 *
 * Called ONCE per review by the model in /api/review/[clientId]. The JSON
 * returned goes into diagnostic_reviews.review verbatim.
 */

import type Anthropic from '@anthropic-ai/sdk'

// ─────────────────────────────────────────────────────────────────────
// Enums — kept in one place so tool schema, TS type, and prompt agree.
// ─────────────────────────────────────────────────────────────────────

export const CONSTRAINT_CATEGORIES = [
  'lead_generation',
  'sales_conversion',
  'offer_positioning',
  'pricing_economics',
  'delivery_capacity',
  'fulfilment_quality',
  'retention_compounding',
  'founder_dependency',
  'ops_visibility',
  'team_execution',
  'cash_runway',
] as const

export type ConstraintCategory = (typeof CONSTRAINT_CATEGORIES)[number]

export const OS_NAMES = [
  'marketing_os',
  'sales_os',
  'delivery_os',
  'operations_os',
] as const

export type OsName = (typeof OS_NAMES)[number]

// ─────────────────────────────────────────────────────────────────────
// DiagnosticReview type — consumers can import this for TS safety.
// ─────────────────────────────────────────────────────────────────────

export interface DiagnosticReview {
  _review_version: string
  _reviewed_at: string

  client_id: string
  source_intake_session_id: string | null

  primary_constraint: {
    statement: string
    category: ConstraintCategory
  }

  rationale: {
    evidence: Array<{
      field: string
      value: string
      reads_as: string
    }>
    summary: string
  }

  recommended_os: {
    primary: OsName
    secondary: OsName | null
    justification: string
  }

  do_not_work_on_yet: Array<{
    area: string
    reason: string
  }>

  roadmap: {
    horizon_days: 90
    outcome: string
    phases: [
      { name: 'Install'; focus: string },
      { name: 'Run'; focus: string },
      { name: 'Lock'; focus: string }
    ]
    kpis_to_watch: string[]
  }

  confidence: {
    score: 1 | 2 | 3 | 4 | 5
    reasoning: string
  }

  missing_information: Array<{
    field: string
    why_it_matters: string
    impact_if_known: string
  }>

  assumptions: Array<{
    assumption: string
    basis: string
    if_wrong: string
  }>
}

// ─────────────────────────────────────────────────────────────────────
// Anthropic tool schema
// ─────────────────────────────────────────────────────────────────────

export const REVIEW_TOOL: Anthropic.Tool = {
  name: 'submit_diagnostic_review',
  description:
    'Submit the Diagnostic Review for a single FounderOS client. Call this ONCE per review, after reasoning through the client_brain. Every field is required. Every rationale.evidence item must cite a real dotted field path from the client_brain (e.g. "business.acquisition.conversion_rate"). Never output the JSON in chat.',
  input_schema: {
    type: 'object',
    properties: {
      _review_version: { type: 'string' },
      _reviewed_at: {
        type: 'string',
        description: 'ISO 8601 timestamp, e.g. 2026-04-24T22:10:00Z',
      },
      client_id: { type: 'string' },
      source_intake_session_id: { type: ['string', 'null'] },

      primary_constraint: {
        type: 'object',
        properties: {
          statement: { type: 'string' },
          category: {
            type: 'string',
            enum: [...CONSTRAINT_CATEGORIES],
          },
        },
        required: ['statement', 'category'],
      },

      rationale: {
        type: 'object',
        properties: {
          evidence: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              properties: {
                field: { type: 'string' },
                value: { type: 'string' },
                reads_as: { type: 'string' },
              },
              required: ['field', 'value', 'reads_as'],
            },
          },
          summary: { type: 'string' },
        },
        required: ['evidence', 'summary'],
      },

      recommended_os: {
        type: 'object',
        properties: {
          primary: { type: 'string', enum: [...OS_NAMES] },
          secondary: {
            type: ['string', 'null'],
            enum: [...OS_NAMES, null] as unknown as string[],
          },
          justification: { type: 'string' },
        },
        required: ['primary', 'secondary', 'justification'],
      },

      do_not_work_on_yet: {
        type: 'array',
        minItems: 2,
        maxItems: 5,
        items: {
          type: 'object',
          properties: {
            area: { type: 'string' },
            reason: { type: 'string' },
          },
          required: ['area', 'reason'],
        },
      },

      roadmap: {
        type: 'object',
        properties: {
          horizon_days: { type: 'number', enum: [90] },
          outcome: { type: 'string' },
          phases: {
            type: 'array',
            minItems: 3,
            maxItems: 3,
            items: {
              type: 'object',
              properties: {
                name: { type: 'string', enum: ['Install', 'Run', 'Lock'] },
                focus: { type: 'string' },
              },
              required: ['name', 'focus'],
            },
          },
          kpis_to_watch: {
            type: 'array',
            minItems: 2,
            maxItems: 5,
            items: { type: 'string' },
          },
        },
        required: ['horizon_days', 'outcome', 'phases', 'kpis_to_watch'],
      },

      confidence: {
        type: 'object',
        properties: {
          score: { type: 'integer', enum: [1, 2, 3, 4, 5] },
          reasoning: { type: 'string' },
        },
        required: ['score', 'reasoning'],
      },

      missing_information: {
        type: 'array',
        minItems: 0,
        maxItems: 5,
        items: {
          type: 'object',
          properties: {
            field: { type: 'string' },
            why_it_matters: { type: 'string' },
            impact_if_known: { type: 'string' },
          },
          required: ['field', 'why_it_matters', 'impact_if_known'],
        },
      },

      assumptions: {
        type: 'array',
        minItems: 0,
        maxItems: 5,
        items: {
          type: 'object',
          properties: {
            assumption: { type: 'string' },
            basis: { type: 'string' },
            if_wrong: { type: 'string' },
          },
          required: ['assumption', 'basis', 'if_wrong'],
        },
      },
    },
    required: [
      '_review_version',
      '_reviewed_at',
      'client_id',
      'source_intake_session_id',
      'primary_constraint',
      'rationale',
      'recommended_os',
      'do_not_work_on_yet',
      'roadmap',
      'confidence',
      'missing_information',
      'assumptions',
    ],
  },
}
