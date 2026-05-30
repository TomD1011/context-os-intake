import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import fs from 'fs'
import path from 'path'
import { INTAKE_TOOL } from '@/lib/intake-tool'
import {
  createSession,
  saveTurn,
  completeSession,
  type IntakeMessage,
} from '@/lib/intake-store'

export const runtime = 'nodejs'
// Stream can run up to a minute for long responses; default is 10s on Hobby,
// 60s on Pro. This bumps both.
export const maxDuration = 60

// Quality-first rule (21 May 2026): Sonnet on every turn. The intake becomes
// the FounderOS brain — thin synthesis here propagates to every downstream
// asset. Token savings come from prompt caching + output budget, not model
// downgrading. Revisit Haiku only after a quality baseline exists.
const MODEL = 'claude-sonnet-4-6'
const FOLLOW_UP_MODEL = 'claude-sonnet-4-6'
const MAX_TOKENS = 4096
// Follow-up call only generates a 1-sentence closing message. 256 is plenty.
const FOLLOW_UP_MAX_TOKENS = 256

// The system prompt lives inside the app so it deploys with the build.
// Next.js's file tracing picks it up automatically because this module
// reads a relative path rooted at process.cwd() (the app root at runtime).
const systemPromptPath = path.join(process.cwd(), 'src/lib/system-prompt.md')
let cachedSystemPrompt: string | null = null

function getSystemPrompt(): string {
  if (!cachedSystemPrompt) {
    cachedSystemPrompt = fs.readFileSync(systemPromptPath, 'utf-8')
  }
  return cachedSystemPrompt
}

/**
 * Stream protocol (NDJSON — one JSON object per line):
 *   {"type":"session","session_id":"..."}
 *                                          fired FIRST, once per request, so
 *                                          the client can save the id to the
 *                                          URL for resume
 *   {"type":"text_delta","delta":"..."}   incremental assistant text
 *   {"type":"complete","summary":{...},"closing_text":"..."}
 *                                          fired instead of "done" when the
 *                                          model called submit_intake_summary
 *   {"type":"done"}                       end of a regular conversational turn
 *   {"type":"error","message":"..."}      fatal error — stream will close
 */

export async function POST(request: NextRequest) {
  let messages: IntakeMessage[]
  let incomingSessionId: string | undefined

  try {
    const body = await request.json()
    messages = body.messages
    incomingSessionId = body.session_id
    if (!messages || !Array.isArray(messages)) {
      return jsonError('Invalid messages array', 400)
    }
  } catch {
    return jsonError('Invalid JSON body', 400)
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return jsonError('ANTHROPIC_API_KEY is not configured', 500)
  }

  // Resolve session id. If the client didn't send one, try to create a fresh
  // row in Supabase. If Supabase isn't configured, sessionId stays null and
  // every persistence call is a no-op.
  const sessionId: string | null =
    incomingSessionId || (await createSession())

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const systemPrompt = getSystemPrompt()
  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => {
        controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'))
      }

      try {
        // Surface the session id to the client as the first event so it can
        // persist it to the URL for resume.
        if (sessionId) send({ type: 'session', session_id: sessionId })

        // Prompt caching — system prompt + tool schema are static across the
        // intake, so cache them. Cached input tokens cost ~10% of fresh tokens
        // ($0.30/MTok vs $3/MTok on Sonnet). Saves roughly 5x on input spend
        // for a 30-turn intake. Cache TTL is 5 min by default.
        //
        // Message history caching: we mark the LAST message before the new
        // user turn with cache_control. Every prior turn becomes a cache hit
        // on the next request, saving another ~30-50% on input across the
        // intake. Anthropic allows up to 4 cache breakpoints; we use 3
        // (system + tools + history boundary).
        const cachedMessages = applyHistoryCacheBreakpoint(messages)

        const modelStream = anthropic.messages.stream({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          system: [
            {
              type: 'text',
              text: systemPrompt,
              cache_control: { type: 'ephemeral' },
            },
          ],
          tools: [
            {
              ...INTAKE_TOOL,
              cache_control: { type: 'ephemeral' },
            },
          ],
          messages: cachedMessages,
        })

        // Accumulate assistant text as it streams so we can persist the final
        // assembled message alongside the user message history.
        let assistantText = ''

        for await (const event of modelStream) {
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            assistantText += event.delta.text
            send({ type: 'text_delta', delta: event.delta.text })
          }
        }

        const finalMessage = await modelStream.finalMessage()

        const toolUseBlock = finalMessage.content.find(
          (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
        )

        if (toolUseBlock && toolUseBlock.name === 'submit_intake_summary') {
          // Second round-trip (non-streamed — short, just a closing message)
          const followUp = await anthropic.messages.create({
            model: FOLLOW_UP_MODEL,
            max_tokens: FOLLOW_UP_MAX_TOKENS,
            system: [
              {
                type: 'text',
                text: systemPrompt,
                cache_control: { type: 'ephemeral' },
              },
            ],
            tools: [
              {
                ...INTAKE_TOOL,
                cache_control: { type: 'ephemeral' },
              },
            ],
            messages: [
              ...messages,
              { role: 'assistant', content: finalMessage.content },
              {
                role: 'user',
                content: [
                  {
                    type: 'tool_result',
                    tool_use_id: toolUseBlock.id,
                    content:
                      'Summary received. Please deliver the closing message.',
                  },
                ],
              },
            ],
          })

          const closingText =
            followUp.content.find(
              (b): b is Anthropic.TextBlock => b.type === 'text'
            )?.text ||
            "Thanks — that's the intake done. You'll see the structured summary below."

          const summaryInput = toolUseBlock.input as Record<string, unknown>

          // Persist completion. Messages history = original messages + the
          // closing message from Claude (the tool call itself is internal).
          if (sessionId) {
            const finalMessages: IntakeMessage[] = [
              ...messages,
              { role: 'assistant', content: closingText },
            ]
            await completeSession(sessionId, finalMessages, summaryInput)
          }

          send({
            type: 'complete',
            summary: summaryInput,
            closing_text: closingText,
          })
        } else if (looksLikeCompletion(assistantText)) {
          // The bot verbalised completion ("packaging it up", "that's
          // everything") but did NOT call submit_intake_summary. Previously we
          // forced the summary inline here — a 60-120s call that exceeded
          // maxDuration, dropped the connection ("Load failed"), and lost the
          // brain because nothing was persisted first.
          //
          // New flow: persist this turn so the wrap-up is NEVER lost, then hand
          // off to /api/complete (300s headroom) to generate + save the
          // structured summary. The client calls it on `complete_pending`.
          if (sessionId) {
            const updatedMessages: IntakeMessage[] = [
              ...messages,
              { role: 'assistant', content: assistantText },
            ]
            await saveTurn(sessionId, updatedMessages)
            send({ type: 'complete_pending', session_id: sessionId })
          } else {
            // No Supabase session to hand off to — nothing persists anyway.
            send({ type: 'done' })
          }
        } else {
          // Regular conversational turn — persist the latest history.
          if (sessionId && assistantText) {
            const updatedMessages: IntakeMessage[] = [
              ...messages,
              { role: 'assistant', content: assistantText },
            ]
            await saveTurn(sessionId, updatedMessages)
          }
          send({ type: 'done' })
        }
      } catch (error) {
        console.error('Error in /api/chat stream:', error)
        const message =
          error instanceof Error ? error.message : 'Internal server error'
        send({ type: 'error', message })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  })
}

/**
 * Mark the most recent assistant message with cache_control so all prior
 * turns become a cacheable prefix on the next request. The current user
 * message stays uncached (it's new every time). Returns a fresh array with
 * the marked message wrapped in the content-blocks form Anthropic requires.
 *
 * Falls back to the original messages array if there's no assistant message
 * to mark (i.e. first turn of a session).
 */
function applyHistoryCacheBreakpoint(
  messages: IntakeMessage[]
): Anthropic.MessageParam[] {
  // Find the last assistant message index — that's our cache boundary.
  let lastAssistantIdx = -1
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant') {
      lastAssistantIdx = i
      break
    }
  }

  // First turn (no assistant message yet) — no cache breakpoint to apply.
  if (lastAssistantIdx === -1) {
    return messages as Anthropic.MessageParam[]
  }

  // Build the new array. Everything before/at the boundary is unchanged
  // except the boundary message itself, which gets cache_control.
  return messages.map((msg, i) => {
    if (i !== lastAssistantIdx) return msg as Anthropic.MessageParam

    // Wrap the boundary message's string content as a single text block with
    // cache_control. IntakeMessage.content is always string per intake-store.ts.
    const content = [
      {
        type: 'text' as const,
        text: msg.content,
        cache_control: { type: 'ephemeral' as const },
      },
    ]

    return { role: msg.role, content } as Anthropic.MessageParam
  })
}

/**
 * Detect when the assistant has signalled "intake is done" in prose but did
 * not call submit_intake_summary. Triggers the tool-forcing safety net.
 *
 * False positives are tolerable — the worst case is one extra tool call. False
 * negatives lose data, so the regex leans permissive.
 */
function looksLikeCompletion(text: string): boolean {
  if (!text || text.length < 20) return false
  const t = text.toLowerCase()
  const cues = [
    "that's everything",
    'thats everything',
    'packaging it up',
    'packaging up',
    'wrapping up',
    'wrap that up',
    'tom will review',
    'intake is complete',
    'intake is done',
    "we're done",
    'were done',
    'that wraps',
    'all done',
  ]
  return cues.some((c) => t.includes(c))
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
