/**
 * Intake persistence layer.
 *
 * Thin wrapper around Supabase for the two operations /api/chat performs:
 *   - saveTurn:         upsert the session with the latest message history
 *   - completeSession:  mark the session complete and attach the summary
 *
 * Plus read helpers for resume:
 *   - getSession:       load a session by id
 *
 * Every function is a no-op when Supabase isn't configured. Callers can
 * continue to work in memory and the responses still wire up correctly —
 * persistence just doesn't happen.
 */

import { getSupabase } from './supabase'

export type IntakeRole = 'user' | 'assistant'

export interface IntakeMessage {
  role: IntakeRole
  content: string
}

export interface IntakeSession {
  id: string
  created_at: string
  updated_at: string
  completed_at: string | null
  status: 'in_progress' | 'complete'
  business_name: string | null
  messages: IntakeMessage[]
  summary: Record<string, unknown> | null
}

const TABLE = 'intake_sessions'

/**
 * Create a new empty session row and return its id.
 * Returns null if Supabase isn't configured.
 */
export async function createSession(): Promise<string | null> {
  const sb = getSupabase()
  if (!sb) return null

  const { data, error } = await sb
    .from(TABLE)
    .insert({})
    .select('id')
    .single()

  if (error) {
    console.error('[intake-store] createSession failed:', error)
    return null
  }
  return data?.id ?? null
}

/**
 * Load a session by id. Returns null if not found or Supabase unconfigured.
 */
export async function getSession(id: string): Promise<IntakeSession | null> {
  const sb = getSupabase()
  if (!sb) return null

  const { data, error } = await sb
    .from(TABLE)
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    console.error('[intake-store] getSession failed:', error)
    return null
  }
  return (data as IntakeSession) ?? null
}

/**
 * Persist the latest message history for an in-progress session.
 * Optionally extract a business_name from the summary-in-progress.
 */
export async function saveTurn(
  sessionId: string,
  messages: IntakeMessage[]
): Promise<void> {
  const sb = getSupabase()
  if (!sb) return

  const { error } = await sb
    .from(TABLE)
    .update({ messages })
    .eq('id', sessionId)

  if (error) console.error('[intake-store] saveTurn failed:', error)
}

/**
 * Mark the session complete and attach the final structured summary.
 */
export async function completeSession(
  sessionId: string,
  messages: IntakeMessage[],
  summary: Record<string, unknown>
): Promise<void> {
  const sb = getSupabase()
  if (!sb) return

  // Best-effort: pull business_name out of the summary for quick lookup.
  const businessName =
    (summary as { context?: { business_name?: string } })?.context
      ?.business_name ?? null

  const { error } = await sb
    .from(TABLE)
    .update({
      messages,
      summary,
      status: 'complete',
      completed_at: new Date().toISOString(),
      business_name: businessName,
    })
    .eq('id', sessionId)

  if (error) console.error('[intake-store] completeSession failed:', error)
}
