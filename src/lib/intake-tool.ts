/**
 * submit_intake_summary tool definition
 * V2.5 — Voice distillation (1 June 2026): banned_phrases / anti_voice_samples
 *        distilled from the full voice signal + flagged when inferred.
 *        Builds on V2.4 Sales OS extensions (21 May 2026).
 * Matches the Client Brain Template 10-domain schema + Marketing OS extensions
 * (V2.2, 10 May 2026) + Sales OS extensions (V2.4, 21 May 2026) defined in
 * src/lib/system-prompt.md
 */

import type Anthropic from '@anthropic-ai/sdk'

// Helper for building "object of string fields" at each leaf of the tree
const stringObject = (fields: string[]) => ({
  type: 'object' as const,
  properties: Object.fromEntries(fields.map((f) => [f, { type: 'string' }])),
  required: fields,
})

// Helper for fields that may be a value OR null (e.g. integer scores 1-5)
const nullableField = (type: 'string' | 'integer') => ({
  oneOf: [{ type }, { type: 'null' }],
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
            'origin_story',
            'why_now',
            'sacred_cows',
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
          acquisition: {
            type: 'object',
            properties: {
              lead_sources: { type: 'string' },
              full_flow: { type: 'string' },
              progression_triggers: { type: 'string' },
              no_buy_process: { type: 'string' },
              conversion_rate: { type: 'string' },
              time_to_cash: { type: 'string' },
              referral_share: { type: 'string' },
              content_channels: {
                type: 'array',
                description:
                  'Array of {platform, audience_size, frequency, what_works} for each platform the client posts on or has set up.',
                items: { type: 'object' },
              },
              existing_assets: {
                type: 'object',
                description:
                  'Existing marketing assets: {website_url, lead_magnets, sales_pages, social_handles, testimonials, ad_campaigns}',
                properties: {
                  website_url: { type: 'string' },
                  lead_magnets: { type: 'array', items: { type: 'string' } },
                  sales_pages: { type: 'array', items: { type: 'string' } },
                  social_handles: { type: 'object' },
                  testimonials: { type: 'array', items: { type: 'object' } },
                  ad_campaigns: { type: 'array', items: { type: 'string' } },
                },
              },
              past_failures: { type: 'string' },
            },
            required: [
              'lead_sources',
              'full_flow',
              'progression_triggers',
              'no_buy_process',
              'conversion_rate',
              'time_to_cash',
              'referral_share',
              'content_channels',
              'existing_assets',
              'past_failures',
            ],
          },
          delivery: stringObject([
            'unit_of_delivery',
            'how_work_happens',
            'documented_status',
            'current_capacity',
          ]),
          team: stringObject(['who_works_on_it', 'next_hire', 'operating_rhythm']),
          systems: stringObject(['tools_in_use', 'automations', 'numbers_reviewed']),
          constraints: stringObject([
            'weekly_revenue_actions',
            'inconsistencies',
            'founder_hours',
            'regular_decisions',
            'unnecessary_dependency',
            'system_breakpoints',
            'what_has_been_tried',
            'founder_perceived_bottleneck',
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

      // ============================================================
      // V2.2 Marketing OS extensions (added 10 May 2026)
      // ============================================================

      offer_architecture: {
        type: 'object',
        description:
          'The offer in marketing-production detail: mechanism, value equation, guarantee, amplifiers, ladder.',
        properties: {
          mechanism_name: { type: 'string' },
          offer_one_liner: { type: 'string' },
          value_equation: stringObject([
            'outcome',
            'likelihood',
            'risk',
            'time_delay',
          ]),
          guarantee: stringObject(['text', 'terms']),
          offer_amplifiers: {
            type: 'object',
            description:
              '8 amplifiers: focused_audience, results_oriented, tangible_life_impact, polarising_message, unique_method, time_bound_result, guaranteed_safety, pricing_easy_start',
          },
          product_ladder: {
            type: 'object',
            description:
              'Four Product Empire structure: incentive, core, high_ticket, subscription',
          },
          price_anchors: { type: 'string' },
          payment_options: { type: 'string' },
        },
        required: [
          'mechanism_name',
          'offer_one_liner',
          'value_equation',
          'guarantee',
          'offer_amplifiers',
          'product_ladder',
          'price_anchors',
          'payment_options',
        ],
      },

      avatar_deep: {
        type: 'object',
        description:
          'Avatar in copy-production depth: demographics, VoC quotes, daily frustrations, identity markers.',
        properties: {
          demographics: { type: 'object' },
          psychographics: { type: 'object' },
          pain_points_voc: { type: 'array', items: { type: 'string' } },
          daily_frustrations: { type: 'string' },
          what_keeps_them_awake: { type: 'string' },
          hidden_fears: { type: 'string' },
          humiliations: { type: 'string' },
          what_they_complain_about: { type: 'string' },
          dream_outcomes_voc: { type: 'array', items: { type: 'string' } },
          what_they_want_more_than_anything: { type: 'string' },
          cost_of_inaction: { type: 'string' },
          how_they_describe_themselves: { type: 'string' },
          who_they_aspire_to_be: { type: 'string' },
          channels_consumed: { type: 'array', items: { type: 'object' } },
          influencers_followed: { type: 'string' },
          competitors_compared: { type: 'string' },
          voc_quotes_raw: { type: 'array', items: { type: 'string' } },
          objection_voc: {
            type: 'array',
            description:
              'Verbatim objection phrases prospects use when not buying (Q4.6). Use exact words, not summaries.',
            items: { type: 'string' },
          },
        },
        required: [
          'demographics',
          'psychographics',
          'pain_points_voc',
          'daily_frustrations',
          'what_keeps_them_awake',
          'hidden_fears',
          'humiliations',
          'what_they_complain_about',
          'dream_outcomes_voc',
          'what_they_want_more_than_anything',
          'cost_of_inaction',
          'how_they_describe_themselves',
          'who_they_aspire_to_be',
          'channels_consumed',
          'influencers_followed',
          'competitors_compared',
          'voc_quotes_raw',
          'objection_voc',
        ],
      },

      voice_tone: {
        type: 'object',
        description:
          'Voice capture for bot mimicry: 5 projective Qs, voice samples, anti-voice, register.',
        properties: {
          camera_for_a_week: { type: 'string' },
          rant_about: { type: 'string' },
          story_told_often: { type: 'string' },
          audience_feel: { type: 'string' },
          voice_actor: { type: 'string' },
          voice_samples: {
            type: 'array',
            description:
              'Array of {source_url, content, type: post|email|transcript|about_page}',
            items: { type: 'object' },
          },
          anti_voice_samples: {
            type: 'array',
            description: 'Array of {source, content, why_avoid}',
            items: { type: 'object' },
          },
          banned_phrases: {
            type: 'array',
            items: { type: 'string' },
            description:
              "Specific words, phrases, tones, or formats the founder would never use. Distil from the FULL voice signal — explicit lists (Q12.8), the rant_about answer, the anti_voice_samples, and clichés that contradict their own voice_samples — not only explicit lists. Prefer concrete phrases over abstract styles. Any entry you inferred (not stated verbatim by the founder) must also trigger an unresolved_gaps note. Never invent bans that are not grounded in the founder's input.",
          },
          register_formal_casual: nullableField('integer'),
          jargon_level: nullableField('integer'),
          sentence_rhythm_preference: { type: 'string' },
          signature_phrases: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Recurring phrases, taglines, or constructions the founder actually uses. Lift verbatim from voice_samples and sign-offs.',
          },
        },
        required: [
          'camera_for_a_week',
          'rant_about',
          'story_told_often',
          'audience_feel',
          'voice_actor',
          'voice_samples',
          'anti_voice_samples',
          'banned_phrases',
          'register_formal_casual',
          'jargon_level',
          'sentence_rhythm_preference',
          'signature_phrases',
        ],
      },

      // ============================================================
      // V2.4 Sales OS extensions (added 21 May 2026)
      // ============================================================

      sales_machine: {
        type: 'object',
        description:
          'Sales motion in delivery-production detail: script, closing language, qualification criteria, follow-up cadence, pipeline visibility. Sales OS bot consumes this to generate NEPQ-aligned scripts, pipeline configs, and follow-up sequences.',
        properties: {
          sales_script: {
            type: 'string',
            description:
              'Q5.11 — Either the script text (if pasted), a reference to an uploaded file ("see Sales Script v3.pdf"), or a walk-through of how a typical sales conversation goes if no script exists.',
          },
          closing_language: {
            type: 'string',
            description:
              'Q5.12 — The exact line/phrase the founder uses to move a prospect from interested to committed. Word-for-word preferred. Walk-through fallback acceptable.',
          },
          qualification_criteria: {
            type: 'string',
            description:
              'Q5.13 — The filters the founder uses to decide a lead is worth pursuing (budget, timeline, role, business size, decision authority). Becomes the qualification logic in Sales OS pipeline config.',
          },
          followup_cadence: {
            type: 'string',
            description:
              'Q5.14 — Structured follow-up sequence: day-by-day what is sent, what channel, what trigger. Becomes the Sales OS follow-up sequence template.',
          },
          pipeline_visibility: {
            type: 'string',
            description:
              'Q5.15 — Current state of pipeline measurement: where data lives, who looks at it, how often, what decisions get made. Tells Sales OS what to add vs what already exists.',
          },
        },
        required: [
          'sales_script',
          'closing_language',
          'qualification_criteria',
          'followup_cadence',
          'pipeline_visibility',
        ],
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
      'offer_architecture',
      'avatar_deep',
      'voice_tone',
      'sales_machine',
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
  business: {
    identity: Record<string, string>
    revenue_model: Record<string, string>
    financials: Record<string, string>
    customer_reality: Record<string, string>
    acquisition: {
      lead_sources: string
      full_flow: string
      progression_triggers: string
      no_buy_process: string
      conversion_rate: string
      time_to_cash: string
      referral_share: string
      content_channels: Array<Record<string, unknown>>
      existing_assets: {
        website_url: string
        lead_magnets: string[]
        sales_pages: string[]
        social_handles: Record<string, string>
        testimonials: Array<Record<string, unknown>>
        ad_campaigns: string[]
      }
      past_failures: string
    }
    delivery: Record<string, string>
    team: Record<string, string>
    systems: Record<string, string>
    constraints: Record<string, string>
    temporal: Record<string, string>
  }
  marketing: { voice: { voice_notes: string } }
  sales: {
    objections_seed: { common_objections: string }
    pipeline_seed: Record<string, string>
  }
  offer_architecture: {
    mechanism_name: string
    offer_one_liner: string
    value_equation: {
      outcome: string
      likelihood: string
      risk: string
      time_delay: string
    }
    guarantee: { text: string; terms: string }
    offer_amplifiers: Record<string, unknown>
    product_ladder: Record<string, unknown>
    price_anchors: string
    payment_options: string
  }
  avatar_deep: {
    demographics: Record<string, unknown>
    psychographics: Record<string, unknown>
    pain_points_voc: string[]
    daily_frustrations: string
    what_keeps_them_awake: string
    hidden_fears: string
    humiliations: string
    what_they_complain_about: string
    dream_outcomes_voc: string[]
    what_they_want_more_than_anything: string
    cost_of_inaction: string
    how_they_describe_themselves: string
    who_they_aspire_to_be: string
    channels_consumed: Array<Record<string, unknown>>
    influencers_followed: string
    competitors_compared: string
    voc_quotes_raw: string[]
    objection_voc: string[]
  }
  sales_machine: {
    sales_script: string
    closing_language: string
    qualification_criteria: string
    followup_cadence: string
    pipeline_visibility: string
  }
  voice_tone: {
    camera_for_a_week: string
    rant_about: string
    story_told_often: string
    audience_feel: string
    voice_actor: string
    voice_samples: Array<Record<string, unknown>>
    anti_voice_samples: Array<Record<string, unknown>>
    banned_phrases: string[]
    register_formal_casual: number | null
    jargon_level: number | null
    sentence_rhythm_preference: string
    signature_phrases: string[]
  }
  sources: Array<Record<string, unknown>>
  additional_context: string
  unresolved_gaps: string[]
}
