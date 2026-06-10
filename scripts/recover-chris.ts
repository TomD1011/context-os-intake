/**
 * recover-chris.ts — recover Chris / Koha Fitness's brain from a stranded intake.
 *
 * WHY THIS EXISTS
 * ---------------
 * Session ffb2db56 (Koha) has 238 messages but status=in_progress and
 * summary=null: the completion chain timed out on Vercel's 60s cap before
 * submit_intake_summary ever ran. The chat history is intact server-side.
 * This script runs the completion LOCALLY (no 60s cap), then hydrates the
 * clients row through the REAL completeSession — the exact path the production
 * fix will harden. The old 21 May recover-intake.mjs only wrote to
 * intake_sessions and never called completeSession; that's why Tom's brain has
 * a summary but no clients row. This script does BOTH halves.
 *
 * TWO-PHASE BY DESIGN (cheap, safe, reviewable)
 * ---------------------------------------------
 *   Phase 1 (default):  npx tsx scripts/recover-chris.ts
 *       → loads the session, forces the structured summary via Anthropic,
 *         injects the 3 voice samples VERBATIM, writes the full summary to
 *         scripts/.recovered/chris-summary.json, prints a preview.
 *         NO database write. Tom (who knows Koha cold) eyeballs the JSON.
 *
 *   Phase 2 (--commit):  npx tsx scripts/recover-chris.ts --commit
 *       → reads the reviewed JSON from disk and runs the real completeSession,
 *         hydrating the clients row. Prints the hydrated row to verify.
 *
 * This separates the expensive/AI step from the irreversible DB write, lets
 * Tom approve the exact JSON that lands, and makes the DB write free to re-run.
 *
 * RUN FROM:  Builds/Context OS/context-os-intake/   (so node_modules resolves)
 */

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const APP_ROOT = join(__dirname, '..') // scripts/ -> app root
const SESSION_ID = 'ffb2db56-0740-4a0b-a82a-7ecafb517de8' // Koha / Chris
const EXPECTED_BUSINESS = 'koha' // sanity-check substring (lowercased)
const SUMMARY_PATH = join(__dirname, '.recovered', 'chris-summary.json')
const COMMIT = process.argv.includes('--commit')

// ---------------------------------------------------------------------------
// Env: parse .env.local by hand and push into process.env BEFORE we dynamic-
// import the app modules (intake-store builds its Supabase client from
// process.env). Proven pattern from the 21 May recovery scripts.
// ---------------------------------------------------------------------------
function loadEnv() {
  const raw = readFileSync(join(APP_ROOT, '.env.local'), 'utf-8')
  for (const line of raw.split('\n')) {
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const k = line.slice(0, eq).trim()
    const v = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
    if (!(k in process.env)) process.env[k] = v
  }
}

function log(msg = '') {
  console.log(msg)
}

async function main() {
  loadEnv()

  const supaUrl = process.env.SUPABASE_URL
  const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anthKey = process.env.ANTHROPIC_API_KEY
  if (!supaUrl || !supaKey || !anthKey) {
    console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / ANTHROPIC_API_KEY in .env.local')
    process.exit(1)
  }

  const sb = createClient(supaUrl, supaKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  log('\n═══════════════════════════════════════════════')
  log('  CONTEXT OS — Chris / Koha brain recovery')
  log(`  mode: ${COMMIT ? 'COMMIT (writes to DB)' : 'DRY RUN (no DB write)'}`)
  log('═══════════════════════════════════════════════\n')

  // -------------------------------------------------------------------------
  // PHASE 2 — commit a previously-reviewed summary. No Anthropic call.
  // -------------------------------------------------------------------------
  if (COMMIT) {
    let summary: Record<string, unknown>
    try {
      summary = JSON.parse(readFileSync(SUMMARY_PATH, 'utf-8'))
    } catch {
      console.error(`No reviewed summary at ${SUMMARY_PATH}. Run the dry run first.`)
      process.exit(1)
    }
    stripInjectionGap(summary) // clean the reviewed JSON without re-running the AI call

    const { data: session, error: loadErr } = await sb
      .from('intake_sessions')
      .select('id, messages')
      .eq('id', SESSION_ID)
      .single()
    if (loadErr || !session) {
      console.error(`Failed to load session: ${loadErr?.message || 'not found'}`)
      process.exit(1)
    }

    // Use the REAL completeSession — the path the production fix will harden.
    const { completeSession } = await import('../src/lib/intake-store.ts')
    log('💾 Running completeSession (updates intake_sessions + upserts clients)...')
    // forceBrainOverwrite: this script's whole job is an intentional rebuild —
    // the BRAIN GUARD (10 June 2026) would otherwise refuse because the row has a brain.
    await completeSession(SESSION_ID, session.messages, summary, { forceBrainOverwrite: true })

    // Verify the hydrated clients row.
    const bn = (summary as any)?.context?.business_name ?? ''
    const slug = slugify(bn)
    const { data: client } = await sb
      .from('clients')
      .select('id, slug, display_name, owner_name, brain_version, created_at, updated_at')
      .eq('slug', slug)
      .maybeSingle()

    log('\n✅ completeSession returned. Hydrated clients row:')
    log(JSON.stringify(client, null, 2))
    log('\nRun the row check in chat to confirm the 7 brain columns + client_brain JSONB.')
    log('═══════════════════════════════════════════════\n')
    return
  }

  // -------------------------------------------------------------------------
  // PHASE 1 — generate the summary (dry run). Anthropic call + verbatim voice.
  // -------------------------------------------------------------------------
  log(`📥 Loading session ${SESSION_ID}...`)
  const { data: session, error: loadErr } = await sb
    .from('intake_sessions')
    .select('id, status, messages')
    .eq('id', SESSION_ID)
    .single()
  if (loadErr || !session) {
    console.error(`Failed to load session: ${loadErr?.message || 'not found'}`)
    process.exit(1)
  }

  const messages = (session.messages || []) as Array<{ role: string; content: string }>
  log(`   status: ${session.status}   messages: ${messages.length}`)
  if (messages.length < 50) {
    console.error('Unexpectedly few messages — aborting to avoid a thin brain.')
    process.exit(1)
  }

  // Capture the verbatim voice samples NOW, from the real chat — we will not
  // trust the model to reproduce ~12KB of text faithfully inside a tool call.
  // Rule (locked): the long pasted user messages in the tail are the founder
  // story / bio / posts. Store all three verbatim; the founder story is also
  // voice AND identity (mined into business.identity by the model below).
  const voiceSamples = messages
    .map((m, i) => ({ i, ...m }))
    .filter((m) => m.role === 'user' && (m.content || '').length > 2000)
    .map((m) => ({
      type: 'post' as const,
      source: `intake_paste_msg_${m.i}`,
      content: m.content,
    }))

  log(`   voice samples detected (verbatim, len>2000): ${voiceSamples.length}`)
  voiceSamples.forEach((v) =>
    log(`     - ${v.source}: ${v.content.length} chars :: "${v.content.replace(/\s+/g, ' ').slice(0, 60)}…"`)
  )
  if (voiceSamples.length < 3) {
    log('   ⚠️  fewer than 3 long samples — confirm before commit.')
  }

  const systemPrompt = readFileSync(join(APP_ROOT, 'src/lib/system-prompt.md'), 'utf-8')
  const { INTAKE_TOOL } = await import('../src/lib/intake-tool.ts')

  const forcingTurn: Anthropic.MessageParam = {
    role: 'user',
    content: `The intake is complete. Call submit_intake_summary now with the full structured JSON for everything captured across this conversation.

Rules:
- Populate EVERY required field. Where something was never asked or answered, use "" and add a matching entry to unresolved_gaps. Never invent facts.
- Pull Sales OS answers (objections, sales_machine.sales_script / closing_language / qualification_criteria / followup_cadence / pipeline_visibility) from the conversation verbatim — quote, do not summarise.
- The founder's long pasted messages (the 2017 founder story, the bio, the posts) are VOICE and, for the founder story, IDENTITY. Mine the founder story into business.identity.origin_story, why_now, endgame and sacred_cows. Capture the kaupapa / Te Whare Tapa Whā framing and the rebuild arc if present.
- For voice_tone.voice_samples you MAY return an empty array — this script injects the verbatim samples after you respond, so do not waste output reproducing them. Still fill the other voice_tone fields (projective answers, banned_phrases, register, jargon, signature_phrases) from the conversation.`,
  }

  log('\n🤖 Forcing submit_intake_summary via Sonnet 4.6 (local — no 60s cap)...')
  log('   (30–60s, consumes real tokens)\n')

  const response = await anthropic_create(anthKey, {
    model: 'claude-sonnet-4-6',
    max_tokens: 16000,
    system: systemPrompt,
    tools: [INTAKE_TOOL],
    tool_choice: { type: 'tool', name: 'submit_intake_summary' },
    messages: [...(messages as Anthropic.MessageParam[]), forcingTurn],
  })

  const toolUse = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === 'submit_intake_summary'
  )
  if (!toolUse) {
    console.error('Model did not emit submit_intake_summary. Raw content:')
    console.error(JSON.stringify(response.content, null, 2).slice(0, 2000))
    process.exit(1)
  }

  const summary = toolUse.input as Record<string, any>

  // Inject the verbatim voice samples (overwrite whatever the model produced).
  summary.voice_tone = summary.voice_tone ?? {}
  summary.voice_tone.voice_samples = voiceSamples
  stripInjectionGap(summary) // drop the now-false "samples empty pending injection" gap

  // --- sanity checks -------------------------------------------------------
  const businessName: string = summary?.context?.business_name ?? ''
  const slug = slugify(businessName)
  const businessOk = businessName.toLowerCase().includes(EXPECTED_BUSINESS)

  // Preview the 7 brain columns the way completeSession will derive them.
  const { extractDomains } = await import('../src/lib/brain-domains.ts')
  const domains = extractDomains(summary)

  writeFileSync(SUMMARY_PATH, JSON.stringify(summary, null, 2))

  log('✅ Summary generated. Preview:')
  log(`   business_name : ${businessName}  ${businessOk ? '✓' : '⚠️  expected to contain "koha"'}`)
  log(`   slug          : ${slug}`)
  log(`   top-level keys: ${Object.keys(summary).join(', ')}`)
  log(`   voice_samples : ${summary.voice_tone.voice_samples.length} (verbatim) — total ${summary.voice_tone.voice_samples.reduce((n: number, v: any) => n + (v.content?.length || 0), 0)} chars`)
  log(`   sales_machine : ${summary.sales_machine ? Object.keys(summary.sales_machine).length + ' fields' : 'MISSING'}`)
  log(`   objection_voc : ${Array.isArray(summary.avatar_deep?.objection_voc) ? summary.avatar_deep.objection_voc.length + ' items' : 'missing'}`)
  log(`   unresolved    : ${Array.isArray(summary.unresolved_gaps) ? summary.unresolved_gaps.length : 0} gaps`)
  log(`   identity.origin_story: ${(summary.business?.identity?.origin_story || '').length} chars`)
  log(`   brain_identity (col preview): ${JSON.stringify(domains.brain_identity).slice(0, 200)}…`)
  log(`\n   tokens: in=${response.usage.input_tokens.toLocaleString()} out=${response.usage.output_tokens.toLocaleString()}`)
  log(`\n📄 Full summary written to: ${SUMMARY_PATH}`)
  log('\nNext: review that JSON (Tom knows Koha cold). If it’s good, commit it:')
  log('   npx tsx scripts/recover-chris.ts --commit')
  log('═══════════════════════════════════════════════\n')
}

// Thin wrapper so the forced call reads cleanly above.
async function anthropic_create(apiKey: string, params: Anthropic.MessageCreateParamsNonStreaming) {
  const client = new Anthropic({ apiKey })
  return client.messages.create(params)
}

/** Same slug rule as intake-store.ts so the verify query matches. */
function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

/**
 * Strip the self-referential gap the model logs when told voice_samples will
 * be injected after it responds. This is a recovery-method artifact, not a real
 * data gap — once we inject the samples the entry is false. Generic: true for
 * any brain recovered through this script. Applied at both generate and commit.
 */
function stripInjectionGap(summary: Record<string, any>): void {
  if (!Array.isArray(summary.unresolved_gaps)) return
  summary.unresolved_gaps = summary.unresolved_gaps.filter(
    (g: string) => !/voice.?samples?\b[\s\S]*\bempty\b[\s\S]*\binject/i.test(g)
  )
}

main().catch((e) => {
  console.error('\n❌ Recovery failed:', e?.message || e)
  process.exit(1)
})
