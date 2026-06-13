/**
 * brain-domains.ts
 *
 * Extracts the 7 navigable domain objects from a completed intake summary,
 * ready to be written to the clients domain columns in Supabase.
 *
 * Each domain maps to a column:
 *   brain_identity    — who they are, what they sell, where, endgame
 *   brain_revenue     — revenue model + financials
 *   brain_customers   — customer reality + voice
 *   brain_acquisition — acquisition flow + sales pipeline
 *   brain_operations  — delivery + team + systems
 *   brain_constraints — all constraint signals + temporal + gaps
 *   brain_connections — tools mapped to tier-1 data domains
 */

export interface BrainDomains {
  brain_identity: BrainIdentity
  brain_revenue: BrainRevenue
  brain_customers: BrainCustomers
  brain_acquisition: BrainAcquisition
  brain_operations: BrainOperations
  brain_constraints: BrainConstraints
  brain_connections: BrainConnections
}

export interface BrainIdentity {
  business_name: string
  what_they_do: string
  where_and_tenure: string
  structure: string
  owner: string
  endgame: string
}

export interface BrainRevenue {
  products_services: string
  payment_model: string
  active_recurring_customers: string
  avg_monthly_value: string
  avg_sale_value: string
  sales_per_month: string
  customer_tenure: string
  repeat_purchase_rate: string
  gross_margin: string
  monthly_revenue: string
  revenue_concentration: string
  profitability_and_owner_income: string
  twelve_month_target: string
  cash_position: string
}

export interface BrainCustomers {
  icp: string
  not_a_fit: string
  pain_on_arrival: string
  buying_trigger: string
  objections: string
  voice_notes: string
}

export interface BrainAcquisition {
  lead_sources: string
  full_flow: string
  progression_triggers: string
  no_buy_process: string
  follow_up_process: string
  conversion_rate: string
  time_to_cash: string
  response_time: string // Q5.6b — first-response speed to a new enquiry
  quote_flow: string // Q5.6c (conditional) — quote/proposal volume + follow-up
  referral_share: string
}

export interface BrainOperations {
  delivery: {
    unit_of_delivery: string
    how_work_happens: string
    documented_status: string
    current_capacity: string
  }
  team: {
    who_works_on_it: string
    next_hire: string
    operating_rhythm: string
  }
  systems: {
    tools_in_use: string
    automations: string
    numbers_reviewed: string
    ai_usage: string // Q7.5 — current AI tool use + data exposure
    sensitive_data: string // Q7.6 — sensitive/regulated data + storage rules
    data_accessibility: string // Q7.7 (conditional) — clean-list production time/source
  }
}

export interface BrainConstraints {
  weekly_revenue_actions: string
  inconsistencies: string
  founder_hours: string
  regular_decisions: string
  unnecessary_dependency: string
  system_breakpoints: string
  what_has_been_tried: string
  founder_perceived_bottleneck: string
  automation_boundaries: string // Q8.7 — never-automate boundary, founder's words
  seasonality_and_milestones: string
  additional_context: string
  unresolved_gaps: string[]
  synthesized_statement: string | null
}

export type Tier1Domain =
  | 'revenue_financials'
  | 'customer_interactions'
  | 'calendar'
  | 'communication'
  | 'project_task_tracking'
  | 'meeting_intelligence'
  | 'knowledge_files'

export interface BrainConnections {
  raw_tools_mentioned: string
  automations_in_place: string
  tier1_domains: Record<Tier1Domain, string[]>
  mapped_at: string | null
}

// ---------------------------------------------------------------------------
// Tool → tier-1 domain mapping
// Each entry: [keyword to match (lowercase), tier-1 domain]
// ---------------------------------------------------------------------------
const TOOL_MAP: [string, Tier1Domain][] = [
  // Revenue / Financials
  ['xero', 'revenue_financials'],
  ['quickbooks', 'revenue_financials'],
  ['myob', 'revenue_financials'],
  ['freshbooks', 'revenue_financials'],
  ['wave', 'revenue_financials'],
  ['hnry', 'revenue_financials'],
  ['figured', 'revenue_financials'],
  ['stripe', 'revenue_financials'],
  ['paypal', 'revenue_financials'],
  ['gocardless', 'revenue_financials'],
  ['square', 'revenue_financials'],
  ['shopify', 'revenue_financials'],

  // Customer interactions (CRM + email marketing)
  ['hubspot', 'customer_interactions'],
  ['salesforce', 'customer_interactions'],
  ['pipedrive', 'customer_interactions'],
  ['zoho', 'customer_interactions'],
  ['activecampaign', 'customer_interactions'],
  ['mailchimp', 'customer_interactions'],
  ['klaviyo', 'customer_interactions'],
  ['kit', 'customer_interactions'],
  ['convertkit', 'customer_interactions'],
  ['infusionsoft', 'customer_interactions'],
  ['keap', 'customer_interactions'],
  ['gohighlevel', 'customer_interactions'],
  ['go high level', 'customer_interactions'],
  ['highlevel', 'customer_interactions'],
  ['intercom', 'customer_interactions'],
  ['drip', 'customer_interactions'],

  // Calendar
  ['google calendar', 'calendar'],
  ['outlook calendar', 'calendar'],
  ['calendly', 'calendar'],
  ['acuity', 'calendar'],
  ['tidycal', 'calendar'],
  ['cal.com', 'calendar'],
  ['appointlet', 'calendar'],

  // Communication
  ['gmail', 'communication'],
  ['outlook', 'communication'],
  ['slack', 'communication'],
  ['teams', 'communication'],
  ['whatsapp', 'communication'],
  ['zoom', 'communication'],
  ['discord', 'communication'],
  ['telegram', 'communication'],
  ['loom', 'communication'],

  // Project / task tracking
  ['linear', 'project_task_tracking'],
  ['asana', 'project_task_tracking'],
  ['monday', 'project_task_tracking'],
  ['trello', 'project_task_tracking'],
  ['clickup', 'project_task_tracking'],
  ['notion', 'project_task_tracking'],
  ['basecamp', 'project_task_tracking'],
  ['jira', 'project_task_tracking'],
  ['todoist', 'project_task_tracking'],
  ['airtable', 'project_task_tracking'],

  // Meeting intelligence
  ['fathom', 'meeting_intelligence'],
  ['otter', 'meeting_intelligence'],
  ['granola', 'meeting_intelligence'],
  ['fireflies', 'meeting_intelligence'],
  ['gong', 'meeting_intelligence'],
  ['chorus', 'meeting_intelligence'],
  ['tldv', 'meeting_intelligence'],
  ['tl;dv', 'meeting_intelligence'],
  ['read.ai', 'meeting_intelligence'],

  // Knowledge / files
  ['google drive', 'knowledge_files'],
  ['dropbox', 'knowledge_files'],
  ['onedrive', 'knowledge_files'],
  ['sharepoint', 'knowledge_files'],
  ['confluence', 'knowledge_files'],
  ['obsidian', 'knowledge_files'],
  ['roam', 'knowledge_files'],
  ['evernote', 'knowledge_files'],
  ['box', 'knowledge_files'],
]

function mapToolsToTier1(rawTools: string): Record<Tier1Domain, string[]> {
  const result: Record<Tier1Domain, string[]> = {
    revenue_financials: [],
    customer_interactions: [],
    calendar: [],
    communication: [],
    project_task_tracking: [],
    meeting_intelligence: [],
    knowledge_files: [],
  }

  if (!rawTools) return result

  const lower = rawTools.toLowerCase()

  for (const [keyword, domain] of TOOL_MAP) {
    if (lower.includes(keyword)) {
      // Use the original capitalisation where possible by scanning for the keyword
      const idx = lower.indexOf(keyword)
      const original = rawTools.substring(idx, idx + keyword.length)
      // Avoid duplicates within the same domain
      if (!result[domain].includes(original)) {
        result[domain].push(original)
      }
    }
  }

  return result
}

// ---------------------------------------------------------------------------
// Main extraction function
// ---------------------------------------------------------------------------
type RawSummary = {
  business?: {
    identity?: Record<string, string>
    revenue_model?: Record<string, string>
    financials?: Record<string, string>
    customer_reality?: Record<string, string>
    acquisition?: Record<string, string>
    delivery?: Record<string, string>
    team?: Record<string, string>
    systems?: Record<string, string>
    constraints?: Record<string, string>
    temporal?: Record<string, string>
  }
  marketing?: { voice?: Record<string, string> }
  sales?: {
    pipeline_seed?: Record<string, string>
    objections_seed?: Record<string, string>
  }
  unresolved_gaps?: string[]
  additional_context?: string
}

export function extractDomains(summary: Record<string, unknown>): BrainDomains {
  const s = summary as RawSummary

  const b = s.business ?? {}
  const identity = b.identity ?? {}
  const revenue = b.revenue_model ?? {}
  const financials = b.financials ?? {}
  const customerReality = b.customer_reality ?? {}
  const acquisition = b.acquisition ?? {}
  const delivery = b.delivery ?? {}
  const team = b.team ?? {}
  const systems = b.systems ?? {}
  const constraints = b.constraints ?? {}
  const temporal = b.temporal ?? {}
  const voice = s.marketing?.voice ?? {}
  const pipeline = s.sales?.pipeline_seed ?? {}
  const objectionsSeed = s.sales?.objections_seed ?? {}

  const rawTools = systems.tools_in_use ?? ''

  return {
    brain_identity: {
      business_name: identity.business_name ?? '',
      what_they_do: identity.what_they_do ?? '',
      where_and_tenure: identity.where_and_tenure ?? '',
      structure: identity.structure ?? '',
      owner: identity.owner ?? '',
      endgame: identity.endgame ?? '',
    },

    brain_revenue: {
      products_services: revenue.products_services ?? '',
      payment_model: revenue.payment_model ?? '',
      active_recurring_customers: revenue.active_recurring_customers ?? '',
      avg_monthly_value: revenue.avg_monthly_value ?? '',
      avg_sale_value: revenue.avg_sale_value ?? '',
      sales_per_month: revenue.sales_per_month ?? '',
      customer_tenure: revenue.customer_tenure ?? '',
      repeat_purchase_rate: revenue.repeat_purchase_rate ?? '',
      gross_margin: revenue.gross_margin ?? '',
      monthly_revenue: financials.monthly_revenue ?? '',
      revenue_concentration: financials.revenue_concentration ?? '',
      profitability_and_owner_income: financials.profitability_and_owner_income ?? '',
      twelve_month_target: financials.twelve_month_target ?? '',
      cash_position: financials.cash_position ?? '',
    },

    brain_customers: {
      icp: customerReality.icp ?? '',
      not_a_fit: customerReality.not_a_fit ?? '',
      pain_on_arrival: customerReality.pain_on_arrival ?? '',
      buying_trigger: customerReality.buying_trigger ?? '',
      objections: customerReality.objections ?? objectionsSeed.common_objections ?? '',
      voice_notes: voice.voice_notes ?? '',
    },

    brain_acquisition: {
      lead_sources: acquisition.lead_sources ?? pipeline.lead_sources ?? '',
      full_flow: acquisition.full_flow ?? pipeline.conversion_flow ?? '',
      progression_triggers: acquisition.progression_triggers ?? pipeline.progression_triggers ?? '',
      no_buy_process: acquisition.no_buy_process ?? '',
      follow_up_process: pipeline.follow_up_process ?? acquisition.no_buy_process ?? '',
      conversion_rate: acquisition.conversion_rate ?? pipeline.conversion_rate ?? '',
      time_to_cash: acquisition.time_to_cash ?? '',
      response_time: acquisition.response_time ?? '',
      quote_flow: acquisition.quote_flow ?? '',
      referral_share: acquisition.referral_share ?? pipeline.referral_share ?? '',
    },

    brain_operations: {
      delivery: {
        unit_of_delivery: delivery.unit_of_delivery ?? '',
        how_work_happens: delivery.how_work_happens ?? '',
        documented_status: delivery.documented_status ?? '',
        current_capacity: delivery.current_capacity ?? '',
      },
      team: {
        who_works_on_it: team.who_works_on_it ?? '',
        next_hire: team.next_hire ?? '',
        operating_rhythm: team.operating_rhythm ?? '',
      },
      systems: {
        tools_in_use: rawTools,
        automations: systems.automations ?? '',
        numbers_reviewed: systems.numbers_reviewed ?? '',
        ai_usage: systems.ai_usage ?? '',
        sensitive_data: systems.sensitive_data ?? '',
        data_accessibility: systems.data_accessibility ?? '',
      },
    },

    brain_constraints: {
      weekly_revenue_actions: constraints.weekly_revenue_actions ?? '',
      inconsistencies: constraints.inconsistencies ?? '',
      founder_hours: constraints.founder_hours ?? '',
      regular_decisions: constraints.regular_decisions ?? '',
      unnecessary_dependency: constraints.unnecessary_dependency ?? '',
      system_breakpoints: constraints.system_breakpoints ?? '',
      what_has_been_tried: constraints.what_has_been_tried ?? '',
      founder_perceived_bottleneck: constraints.founder_perceived_bottleneck ?? '',
      automation_boundaries: constraints.automation_boundaries ?? '',
      seasonality_and_milestones: temporal.seasonality_and_milestones ?? '',
      additional_context: s.additional_context ?? '',
      unresolved_gaps: s.unresolved_gaps ?? [],
      synthesized_statement: null, // populated by Diagnostic Review
    },

    brain_connections: {
      raw_tools_mentioned: rawTools,
      automations_in_place: systems.automations ?? '',
      tier1_domains: mapToolsToTier1(rawTools),
      mapped_at: rawTools ? new Date().toISOString() : null,
    },
  }
}
