import { NextRequest } from 'next/server'
import { getSession } from '@/lib/intake-store'
import { isSupabaseConfigured } from '@/lib/supabase'

export const runtime = 'nodejs'

/**
 * GET /api/intake/[sessionId]
 *
 * Returns the persisted state for a session so the front-end can resume a
 * partially completed intake (or reopen a finished one to re-download the
 * summary).
 *
 * Response:
 *   200 {
 *     id, status, messages, summary, created_at, updated_at, completed_at
 *   }
 *   404 { error: 'not found' }
 *   503 { error: 'persistence not configured' }  — Supabase isn't wired up
 */
export async function GET(
  _request: NextRequest,
  context: { params: { sessionId: string } }
) {
  if (!isSupabaseConfigured()) {
    return json({ error: 'persistence not configured' }, 503)
  }

  const sessionId = context.params.sessionId
  if (!sessionId || typeof sessionId !== 'string') {
    return json({ error: 'invalid session id' }, 400)
  }

  const session = await getSession(sessionId)
  if (!session) return json({ error: 'not found' }, 404)

  return json({
    id: session.id,
    status: session.status,
    messages: session.messages ?? [],
    summary: session.summary ?? null,
    created_at: session.created_at,
    updated_at: session.updated_at,
    completed_at: session.completed_at,
  })
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
