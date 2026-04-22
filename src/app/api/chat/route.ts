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

const MODEL = 'claude-sonnet-4-6'
const MAX_TOKENS = 4096
const FOLLOW_UP_MAX_TOKENS = 1024

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

        const modelStream = anthropic.messages.stream({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          system: systemPrompt,
          tools: [INTAKE_TOOL],
          messages,
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
            model: MODEL,
            max_tokens: FOLLOW_UP_MAX_TOKENS,
            system: systemPrompt,
            tools: [INTAKE_TOOL],
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

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
