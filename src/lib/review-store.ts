/**
 * Diagnostic Review persistence layer (V1).
 *
 * Thin Supabase wrappers for the three operations /api/review/[clientId]
 * performs:
 *   - loadClientForReview:     fetch a client's row + client_brain
 *   - latestCompletedIntake:   find the most recent completed intake for a client
 *   - insertReview:            append a new diagnostic_reviews row
 *
 * All functions return null / empty / no-op when Supabase isn't configured,
 * matching the pattern in intake-store.ts. The /api/review route will
 * 503 in that case — reviews have no in-memory fallback.
 */

import { getSupabase } from './supabase'

const CLIENTS_TABLE = 'clients'
const INTAKE_TABLE = 'intake_sessions'
const REVIEWS_TABLE = 'diagnostic_reviews'

// Actual intake status value. Matches the CHECK constraint in 0001_init.sql
// and the 'complete' literal set by completeSession() in intake-store.ts.
const INTAKE_COMPLETE_STATUS = 'complete' as const

export interface ClientRow {
  id: string
  slug: string
  display_name: string
  owner_name: string | null
  status: 'active' | 'archived'
  client_brain: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface LatestIntakeSummary {
  id: string
  completed_at: string | null
  summary: Record<string, unknown> | null
}

export interface InsertedReview {
  id: string
  client_id: string
  source_intake_session_id: string | null
  created_at: string
  review_status: 'draft' | 'approved' | 'revised'
  reviewer_type: 'ai' | 'tom'
  review: Record<string, unknown>
}

/**
 * Fetch a client row by id. Returns null if not found or Supabase unconfigured.
 */
export async function loadClientForReview(
  clientId: string
): Promise<ClientRow | null> {
  const sb = getSupabase()
  if (!sb) return null

  const { data, error } = await sb
    .from(CLIENTS_TABLE)
    .select('*')
    .eq('id', clientId)
    .maybeSingle()

  if (error) {
    console.error('[review-store] loadClientForReview failed:', error)
    return null
  }
  return (data as ClientRow) ?? null
}

/**
 * Latest completed intake for a client, or null if none exist yet.
 */
export async function latestCompletedIntake(
  clientId: string
): Promise<LatestIntakeSummary | null> {
  const sb = getSupabase()
  if (!sb) return null

  const { data, error } = await sb
    .from(INTAKE_TABLE)
    .select('id, completed_at, summary')
    .eq('client_id', clientId)
    .eq('status', INTAKE_COMPLETE_STATUS)
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[review-store] latestCompletedIntake failed:', error)
    return null
  }
  return (data as LatestIntakeSummary) ?? null
}

/**
 * Append a new diagnostic_reviews row. V1 always writes status='draft',
 * reviewer_type='ai'. V2 will add paths for other combinations.
 */
export async function insertReview(args: {
  clientId: string
  sourceIntakeSessionId: string | null
  review: Record<string, unknown>
}): Promise<InsertedReview | null> {
  const sb = getSupabase()
  if (!sb) return null

  const { data, error } = await sb
    .from(REVIEWS_TABLE)
    .insert({
      client_id: args.clientId,
      source_intake_session_id: args.sourceIntakeSessionId,
      review_status: 'draft',
      reviewer_type: 'ai',
      review: args.review,
    })
    .select('*')
    .single()

  if (error) {
    console.error('[review-store] insertReview failed:', error)
    return null
  }
  return data as InsertedReview
}
