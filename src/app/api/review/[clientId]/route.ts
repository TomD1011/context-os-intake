import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import fs from 'fs'
import path from 'path'
import { REVIEW_TOOL } from '@/lib/review-tool'
import { isSupabaseConfigured } from '@/lib/supabase'
import {
  loadClientForReview,
  latestCompletedIntake,
  insertReview,
} from '@/lib/review-store'

export const runtime = 'nodejs'
// Non-streamed Claude call — short structured output. Keep maxDuration
// aligned with /api/chat in case tool-call responses run long.
export const maxDuration = 60

const MODEL = 'claude-sonnet-4-6'
const MAX_TOKENS = 4096

// Load review prompt from disk at runtime. Bundled on Vercel via
// experimental.outputFileTracingIncludes in next.config.js.
const reviewPromptPath = path.join(process.cwd(), 'src/lib/review-prompt.md')
let cachedReviewPrompt: string | null = null

function getReviewPrompt(): string {
  if (!cachedReviewPrompt) {
    cachedReviewPrompt = fs.readFileSync(reviewPromptPath, 'utf-8')
  }
  return cachedReviewPrompt
}

/**
 * POST /api/review/[clientId]
 *
 * Body (optional):
 *   { "source_intake_session_id": "<uuid>" }
 *   — if omitted, the latest completed intake for this client is used.
 *
 * Success: 200 with the inserted diagnostic_reviews row.
 * 404: client not found
 * 409: client has no completed intake to review against
 * 500: Claude didn't call the tool, or persistence failed
 * 502: upstream Anthropic error
 * 503: server not configured (missing Supabase or ANTHROPIC_API_KEY)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { clientId: string } }
) {
  const { clientId } = params
  if (!clientId) {
    return jsonError('Missing clientId in path', 400)
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return jsonError('ANTHROPIC_API_KEY is not configured', 503)
  }
  if (!isSupabaseConfigured()) {
    return jsonError(
      'Supabase is not configured — reviews require persistence',
      503
    )
  }

  // Optional body: an explicit source intake session id.
  let explicitIntakeId: string | undefined
  try {
    const raw = await request.text()
    if (raw.trim().length > 0) {
      const body = JSON.parse(raw)
      explicitIntakeId = body?.source_intake_session_id
    }
  } catch {
    return jsonError('Invalid JSON body', 400)
  }

  // 1. Load the client.
  const client = await loadClientForReview(clientId)
  if (!client) {
    return jsonError('Client not found', 404)
  }

  // 2. Resolve the source intake.
  const intake = await latestCompletedIntake(clientId)
  if (!intake) {
    return jsonError(
      'No completed intake found for this client — cannot review',
      409
    )
  }
  const sourceIntakeSessionId = explicitIntakeId ?? intake.id

  // 3. Build the Claude user message. The system prompt lives in review-prompt.md;
  //    the user turn carries the data.
  const unresolvedGaps = extractUnresolvedGaps(intake.summary)
  const userMessage = [
    'Here is the client_brain:',
    '```json',
    JSON.stringify(client.client_brain, null, 2),
    '```',
    '',
    'Here are the unresolved_gaps from the intake:',
    '```json',
    JSON.stringify(unresolvedGaps, null, 2),
    '```',
    '',
    `The client_id is: ${client.id}`,
    `The source_intake_session_id is: ${sourceIntakeSessionId}`,
    '',
    'Produce the Diagnostic Review by calling submit_diagnostic_review.',
  ].join('\n')

  // 4. Call Claude.
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  let message: Anthropic.Message
  try {
    message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: getReviewPrompt(),
      tools: [REVIEW_TOOL],
      tool_choice: { type: 'tool', name: 'submit_diagnostic_review' },
      messages: [{ role: 'user', content: userMessage }],
    })
  } catch (error) {
    console.error('[api/review] anthropic error:', error)
    const msg = error instanceof Error ? error.message : 'Anthropic error'
    return jsonError(msg, 502)
  }

  // 5. Extract the tool_use block.
  const toolUse = message.content.find(
    (b): b is Anthropic.ToolUseBlock =>
      b.type === 'tool_use' && b.name === 'submit_diagnostic_review'
  )
  if (!toolUse) {
    console.error(
      '[api/review] model did not call submit_diagnostic_review:',
      message.content
    )
    return jsonError(
      'Model did not produce a structured review',
      500
    )
  }

  // 6. Stamp provenance fields server-side (trust the server clock + ids,
  //    not whatever the model echoed back).
  const review = {
    ...(toolUse.input as Record<string, unknown>),
    client_id: client.id,
    source_intake_session_id: sourceIntakeSessionId,
    _reviewed_at: new Date().toISOString(),
  }

  // 7. Persist.
  const inserted = await insertReview({
    clientId: client.id,
    sourceIntakeSessionId,
    review,
  })
  if (!inserted) {
    return jsonError('Failed to persist review', 500)
  }

  return NextResponse.json(inserted, { status: 200 })
}

/** Pull unresolved_gaps out of an intake summary, safely. */
function extractUnresolvedGaps(
  summary: Record<string, unknown> | null
): string[] {
  if (!summary) return []
  const raw = (summary as { unresolved_gaps?: unknown }).unresolved_gaps
  return Array.isArray(raw) ? (raw as string[]) : []
}

function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status })
}
