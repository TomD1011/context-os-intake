/**
 * validate-voice-distillation.ts — DRY RUN, writes nothing.
 *
 * Replicates the exact /api/complete forced-extraction path against an existing
 * intake session, using the UPDATED system-prompt.md + INTAKE_TOOL +
 * COMPLETION_INSTRUCTION, and reports whether the V2.5 voice-distillation fix
 * now produces banned_phrases / anti_voice_samples (with inferred-flagging)
 * instead of leaving them empty.
 *
 * Usage:
 *   npx tsx scripts/validate-voice-distillation.ts <session_id>
 * Default session: Chris / Koha (ffb2db56...), the rich 238-message test harness.
 */
import Anthropic from '@anthropic-ai/sdk'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const APP_ROOT = join(__dirname, '..')
const SESSION_ID = process.argv[2] || 'ffb2db56-0740-4a0b-a82a-7ecafb517de8'
const MODEL = 'claude-sonnet-4-6'

function loadEnv() {
  const raw = readFileSync(join(APP_ROOT, '.env.local'), 'utf-8')
  for (const line of raw.split('\n')) {
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const k = line.slice(0, eq).trim()
    const v = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
    // .env.local wins — the harness shell may export an empty ANTHROPIC_API_KEY
    if (v) process.env[k] = v
  }
}

async function main() {
  loadEnv()
  const { INTAKE_TOOL } = await import('../src/lib/intake-tool.ts')
  const { COMPLETION_INSTRUCTION } = await import(
    '../src/lib/completion-instruction.ts'
  )
  const systemPrompt = readFileSync(join(APP_ROOT, 'src/lib/system-prompt.md'), 'utf-8')

  const sb = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
  const { data: session, error } = await sb
    .from('intake_sessions')
    .select('id, status, messages')
    .eq('id', SESSION_ID)
    .maybeSingle()
  if (error || !session) {
    console.error('No session:', error?.message ?? 'not found')
    process.exit(1)
  }
  const messages = (session.messages || []) as Array<{ role: string; content: string }>
  console.log(`Session ${SESSION_ID} — status ${session.status}, ${messages.length} messages`)
  console.log('Running forced extraction with V2.5 prompt + tool (this takes 60-120s)...\n')

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const forced = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 16000,
    system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
    tools: [{ ...INTAKE_TOOL, cache_control: { type: 'ephemeral' } }],
    tool_choice: { type: 'tool', name: 'submit_intake_summary' },
    messages: [
      ...(messages as Anthropic.MessageParam[]),
      { role: 'user', content: COMPLETION_INSTRUCTION },
    ],
  })
  const toolUse = forced.content.find(
    (b): b is Anthropic.ToolUseBlock =>
      b.type === 'tool_use' && b.name === 'submit_intake_summary'
  )
  if (!toolUse) {
    console.error('Model did not return the tool call.')
    process.exit(1)
  }
  const s = toolUse.input as any
  const v = s.voice_tone || {}
  const gaps: string[] = s.unresolved_gaps || []
  const voiceGaps = gaps.filter((g) =>
    /ban|anti.?voice|voice|infer|phrase/i.test(g)
  )

  console.log('===== VOICE NEGATIVE-SPACE RESULT (V2.5) =====')
  console.log(`banned_phrases (${(v.banned_phrases || []).length}):`)
  for (const b of v.banned_phrases || []) console.log(`   - ${b}`)
  console.log(`\nanti_voice_samples (${(v.anti_voice_samples || []).length}):`)
  for (const a of v.anti_voice_samples || [])
    console.log(`   - ${JSON.stringify(a).slice(0, 120)}`)
  console.log(`\nsignature_phrases (${(v.signature_phrases || []).length}):`)
  for (const sp of v.signature_phrases || []) console.log(`   - ${sp}`)
  console.log(`\nvoice-related unresolved_gaps (${voiceGaps.length}):`)
  for (const g of voiceGaps) console.log(`   ⚑ ${g}`)

  console.log('\n===== VERDICT =====')
  const banned = (v.banned_phrases || []).length
  const anti = (v.anti_voice_samples || []).length
  const flagged = voiceGaps.some((g) => /infer|confirm|empty/i.test(g))
  console.log(`banned_phrases populated: ${banned > 0 ? 'YES (' + banned + ')' : 'NO — still empty'}`)
  console.log(`anti_voice_samples populated: ${anti > 0 ? 'YES (' + anti + ')' : 'NO'}`)
  console.log(`inferred entries flagged for confirmation: ${flagged ? 'YES' : 'no flag present'}`)
  console.log('\n(DRY RUN — nothing written to Supabase or disk.)')
}

main().catch((e) => {
  console.error('Validation failed:', e?.message || e)
  process.exit(1)
})
