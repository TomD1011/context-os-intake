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
import { extractDomains } from './brain-domains'

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
 * 1. client_brain is written ONLY for new clients / empty brains (BRAIN
 *    GUARD, 10 June 2026). When the client already has a non-empty brain,
 *    the clients row is left untouched and the new summary lives on
 *    intake_sessions.summary for a deliberate merge via import-brain.ts.
 *    Recovery scripts pass forceBrainOverwrite to rebuild intentionally.
 *    Full merge-aware update logic (per-field source + locked flags) is
 *    still the V2 plan — the guard is the interim that makes re-intakes
 *    safe instead of destructive.
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
  summary: Record<string, unknown>,
  opts: {
    /**
     * BRAIN GUARD OVERRIDE (added 10 June 2026). By default completeSession
     * REFUSES to touch the clients row when that client already has a
     * non-empty client_brain — re-running an intake must never clobber
     * hand-patched brain fields (Koha's brain carries operator corrections
     * applied via scripts/import-brain.ts; the old overwrite also silently
     * reset brain_version to 2.0). The new summary is always preserved on
     * intake_sessions.summary, so nothing is lost — merge it deliberately
     * via the patch flow. Recovery scripts that intentionally rebuild a
     * brain (recover-chris.ts / recover-tom.ts) pass forceBrainOverwrite.
     */
    forceBrainOverwrite?: boolean
  } = {}
): Promise<void> {
  const sb = getSupabase()
  if (!sb) return

  // Pull business_name + owner out of the summary.
  //
  // business_name fallback chain — the root cause of both Chris's and Tom's
  // lost brains. The V2.4 schema nests the name under `context.business_name`,
  // but older/edge summaries put it under `business.identity.business_name`.
  // Reading only the first path returned null → no slug → no clients row, and
  // the failure was swallowed silently. Resolve from either path before giving
  // up so a populated summary always hydrates a client.
  const ctx = (summary as { context?: { business_name?: string; owner?: string } })
    ?.context
  const identity = (
    summary as { business?: { identity?: { business_name?: string; owner?: string } } }
  )?.business?.identity
  const businessName = ctx?.business_name || identity?.business_name || null
  const ownerName = ctx?.owner || identity?.owner || null

  if (!businessName) {
    // Loud, not silent — a completed intake with no resolvable business_name is
    // a data problem worth surfacing, not a quiet no-op (the old behaviour).
    console.error(
      '[intake-store] completeSession: no business_name in summary (checked context + business.identity) — clients row NOT created for session',
      sessionId
    )
  }

  // 1. Resolve-or-create the client (TEMP: slug-based match — see comment above).
  let clientId: string | null = null
  if (businessName) {
    const slug = slugify(businessName)
    const domains = extractDomains(summary)

    // BRAIN GUARD (10 June 2026): check whether this client already has a
    // brain BEFORE writing anything. The old unconditional upsert overwrote
    // client_brain + all 7 domain columns + reset brain_version to '2.0' on
    // every completed intake — destroying hand-patched corrections invisibly.
    const { data: existing, error: existErr } = await sb
      .from('clients')
      .select('id, client_brain, brain_version')
      .eq('slug', slug)
      .maybeSingle()

    const hasBrain =
      !!existing?.client_brain &&
      typeof existing.client_brain === 'object' &&
      Object.keys(existing.client_brain as object).length > 0

    if (existErr) {
      // Fail SAFE: if we can't read the existing state, refuse to write over
      // a brain we couldn't see. The summary survives on intake_sessions.
      console.error(
        '[intake-store] BRAIN GUARD: existence check failed — refusing to write clients row blind. Summary preserved on intake_sessions.summary for session',
        sessionId,
        existErr
      )
    } else if (existing && hasBrain && !opts.forceBrainOverwrite) {
      // Existing brain, no override: link the session, write NOTHING to clients.
      clientId = existing.id
      console.error(
        `[intake-store] BRAIN GUARD: client "${slug}" already has a brain (version ${existing.brain_version ?? 'unknown'}) — intake summary NOT written to clients. ` +
          `It is preserved on intake_sessions.summary (session ${sessionId}). ` +
          `Merge deliberately via scripts/import-brain.ts, or pass forceBrainOverwrite for an intentional rebuild.`
      )
    } else {
      // New client, empty brain, or explicit force: original V1 behaviour.
      const { data: client, error: clientErr } = await sb
        .from('clients')
        .upsert(
          {
            slug,
            display_name: businessName,
            owner_name: ownerName,
            // Overwrite is safe here: either no brain exists yet, or the
            // caller explicitly forced a rebuild (recovery scripts).
            client_brain: summary,
            // V2: domain columns — each specialist agent reads only what it needs.
            brain_identity: domains.brain_identity,
            brain_revenue: domains.brain_revenue,
            brain_customers: domains.brain_customers,
            brain_acquisition: domains.brain_acquisition,
            brain_operations: domains.brain_operations,
            brain_constraints: domains.brain_constraints,
            brain_connections: domains.brain_connections,
            brain_version: '2.0',
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
