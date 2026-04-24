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
 * Mark the session complete, attach the final structured summary, and
 * hydrate the persistent client row (clients.client_brain).
 *
 * ───────────────────────────────────────────────────────────────────
 * V1 TEMPORARY BEHAVIOUR — replace later
 * ───────────────────────────────────────────────────────────────────
 * 1. client_brain is OVERWRITTEN with the latest summary on every
 *    completed intake. Historical summaries are preserved on
 *    intake_sessions.summary, so nothing is lost — but this will
 *    clobber manually-edited Brain fields once we add a Review/edit
 *    UI. Replace with merge-aware update logic at that point.
 *
 * 2. Client identity is resolved by slugifying the business_name from
 *    the summary and upserting on the unique `slug` column. This is
 *    fragile — two founders with the same business_name collide, and
 *    one founder who re-types their name differently on a second
 *    intake will create a duplicate client row. Acceptable for V1
 *    because Tom runs every intake. Replace later with manual client
 *    selection at intake start, or admin-assign after completion.
 * ───────────────────────────────────────────────────────────────────
 */
export async function completeSession(
  sessionId: string,
  messages: IntakeMessage[],
  summary: Record<string, unknown>
): Promise<void> {
  const sb = getSupabase()
  if (!sb) return

  // Pull business_name + owner out of the summary.
  const ctx = (summary as { context?: { business_name?: string; owner?: string } })
    ?.context
  const businessName = ctx?.business_name ?? null
  const ownerName = ctx?.owner ?? null

  // 1. Resolve-or-create the client (TEMP: slug-based match — see comment above).
  let clientId: string | null = null
  if (businessName) {
    const slug = slugify(businessName)
    const { data: client, error: clientErr } = await sb
      .from('clients')
      .upsert(
        {
          slug,
          display_name: businessName,
          owner_name: ownerName,
          // TEMP: overwrite on every intake — see comment above.
          client_brain: summary,
        },
        { onConflict: 'slug' }
      )
      .select('id')
      .single()

    if (clientErr) {
      console.error('[intake-store] client upsert failed:', clientErr)
    } else {
      clientId = client?.id ?? null
    }
  }

  // 2. Mark the intake complete and link it to the client.
  const { error } = await sb
    .from(TABLE)
    .update({
      messages,
      summary,
      status: 'complete',
      completed_at: new Date().toISOString(),
      business_name: businessName,
      client_id: clientId,
    })
    .eq('id', sessionId)

  if (error) console.error('[intake-store] completeSession failed:', error)
}

/**
 * Cheap URL-safe slug. Used for V1 client identity matching.
 * TEMP — see completeSession comment. Replace when manual client
 * selection / admin assignment lands.
 */
function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
