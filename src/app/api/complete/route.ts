import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import fs from 'fs'
import path from 'path'
import { INTAKE_TOOL } from '@/lib/intake-tool'
import { COMPLETION_INSTRUCTION } from '@/lib/completion-instruction'
import { getSession, completeSession, type IntakeMessage } from '@/lib/intake-store'

export const runtime = 'nodejs'

// THE point of this endpoint: the forced submit_intake_summary call generates
// the full 14-domain JSON (~7-8k output tokens → 60-120s of generation). That
// blows the chat route's budget and used to be killed mid-flight ("Load
// failed"), losing the brain. Pro allows up to 300s — give it the headroom so
// completion is reliable instead of racing a timeout.
export const maxDuration = 300

const MODEL = 'claude-sonnet-4-6'
const MAX_TOKENS = 16000 // the summary JSON is large; never truncate the brain

const systemPromptPath = path.join(process.cwd(), 'src/lib/system-prompt.md')
let cachedSystemPrompt: string | null = null
function getSystemPrompt(): string {
  if (!cachedSystemPrompt) {
    cachedSystemPrompt = fs.readFileSync(systemPromptPath, 'utf-8')
  }
  return cachedSystemPrompt
}

/**
 * POST { session_id }  →  { summary }   (or { error })
 *
 * Finalises an intake whose chat turn signalled completion. Decoupled from
 * /api/chat so it can run long without the stream timing out.
 *
 * IDEMPOTENT: if the session is already complete with a summary, returns it
 * without calling Anthropic. So a double-call, a client retry after a flaky
 * connection, or a re-run all resolve to the same state — no duplicate work,
 * no lost brain.
 */
export async function POST(request: NextRequest) {
  let sessionId: string | undefined
  try {
    const body = await request.json()
    sessionId = body.session_id
  } catch {
    return jsonError('Invalid JSON body', 400)
  }
  if (!sessionId) return jsonError('Missing session_id', 400)
  if (!process.env.ANTHROPIC_API_KEY) {
    return jsonError('ANTHROPIC_API_KEY is not configured', 500)
  }

  const session = await getSession(sessionId)
  if (!session) return jsonError('Session not found', 404)

  // ─── Idempotency gate ────────────────────────────────────────────────────
  // Already finalised? Hand back the stored summary. No Anthropic call.
  if (session.status === 'complete' && session.summary) {
    return jsonOk({ summary: session.summary, already_complete: true })
  }

  const messages = (session.messages || []) as IntakeMessage[]
  if (messages.length < 2) {
    return jsonError('Session has too little history to complete', 422)
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const systemPrompt = getSystemPrompt()

  // Force the tool. Same path the recovery scripts proved out — tool_choice
  // guarantees structured JSON instead of prose that gets dropped.
  let forced: Anthropic.Message
  try {
    forced = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
      tools: [{ ...INTAKE_TOOL, cache_control: { type: 'ephemeral' } }],
      tool_choice: { type: 'tool', name: 'submit_intake_summary' },
      messages: [
        ...(messages as Anthropic.MessageParam[]),
        {
          role: 'user',
          content: COMPLETION_INSTRUCTION,
        },
      ],
    })
  } catch (err) {
    console.error('[complete] forced tool call failed:', err)
    return jsonError(
      err instanceof Error ? err.message : 'Completion generation failed',
      502
    )
  }

  const toolUse = forced.content.find(
    (b): b is Anthropic.ToolUseBlock =>
      b.type === 'tool_use' && b.name === 'submit_intake_summary'
  )
  if (!toolUse) {
    return jsonError('Model did not return submit_intake_summary', 502)
  }

  const summary = toolUse.input as Record<string, unknown>

  // Persist: marks the session complete + hydrates the clients row (the brain).
  // completeSession resolves business_name via its fallback chain and upserts
  // on slug, so this is safe to re-run.
  try {
    await completeSession(sessionId, messages, summary)
  } catch (err) {
    console.error('[complete] completeSession failed:', err)
    // The summary generated fine; persistence failed. Surface it so the client
    // can retry — the idempotency gate means a retry won't regenerate.
    return jsonError('Generated the summary but failed to save it — retry', 500)
  }

  return jsonOk({ summary })
}

function jsonOk(obj: unknown): Response {
  return new Response(JSON.stringify(obj), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
