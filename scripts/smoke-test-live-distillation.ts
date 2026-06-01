/**
 * smoke-test-live-distillation.ts — LIVE production smoke test for V2.5.
 *
 * Unlike validate-voice-distillation.ts (which runs the extraction LOCALLY),
 * this seeds a throwaway intake session in the prod Supabase, then POSTs it to
 * the DEPLOYED endpoint at context.founderos.co.nz/api/complete — exercising the
 * actual deployed bundle, the 300s headroom, and persistence end to end.
 *
 * The fake founder gives a rich voice signal + a cringe rant but EXPLICITLY
 * withholds a banned-phrases list ("can't think of any") — the exact failure
 * mode V2.5 fixes. Pass = banned_phrases comes back populated + flagged inferred.
 *
 * Cleans up after itself: deletes the test clients row + intake_sessions row.
 *
 * Usage: npx tsx scripts/smoke-test-live-distillation.ts
 */
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const APP_ROOT = join(__dirname, '..')
const ENDPOINT = 'https://context.founderos.co.nz/api/complete'
const TEST_SLUG = 'smoke-test-voice-distillation-v25'
const TEST_BUSINESS = 'Smoke Test Voice Distillation V25'

function loadEnv() {
  const raw = readFileSync(join(APP_ROOT, '.env.local'), 'utf-8')
  for (const line of raw.split('\n')) {
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const k = line.slice(0, eq).trim()
    const v = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
    if (v) process.env[k] = v
  }
}

// A compact-but-coherent fake founder. Rich voice section, a clear cringe rant,
// and an EXPLICIT refusal to name banned phrases — so banned_phrases can only be
// populated by V2.5 distillation, not by routing an explicit list.
const MESSAGES = [
  { role: 'assistant', content: "What's the business and what does it do?" },
  { role: 'user', content: "It's called Slow Pour Coffee Club. We're a specialty coffee subscription out of Wellington — we roast small batches and ship beans to people's homes every fortnight, with a tasting card and brew notes in every box. Been going about 3 years." },
  { role: 'assistant', content: 'Roughly what does the business turn over, and how do people pay?' },
  { role: 'user', content: 'About 40k a month. Almost all of it is the fortnightly subscription on auto-billing. A bit of one-off gift boxes around Christmas.' },
  { role: 'assistant', content: 'Who is your ideal customer?' },
  { role: 'user', content: "Home coffee nerds, 28 to 45, mostly professionals who already own a decent grinder and an Aeropress or a V60. They care about origin and freshness and they're a bit over supermarket beans. Not after the cheapest option." },
  { role: 'assistant', content: 'How do people find you and become customers?' },
  { role: 'user', content: 'Mostly Instagram and word of mouth. People try a friend\'s box, or see our reels of the roasting, then sign up on the site. Not much of a follow-up system if someone doesn\'t convert.' },
  { role: 'assistant', content: 'If someone followed you with a camera for a week, what would they feel about your brand?' },
  { role: 'user', content: "Calm, curious, a bit nerdy in a good way. We're slow and deliberate — the whole point is slow pour, slow mornings. Warm but not loud. We want people to feel like they're being let in on a craft, not sold to." },
  { role: 'assistant', content: 'Paste a few pieces of your actual writing — recent posts or emails.' },
  { role: 'user', content: "Here's a recent email:\n\n\"Morning. This fortnight's box is a washed Ethiopian from Guji — all jasmine and stone fruit, the kind of cup that makes you slow down before the day starts. We roasted it light so the florals carry. Brew it gentle: 1:16, 92 degrees, give it time. No rush. That's rather the point.\n\nTell us how you find it. We read every reply.\"\n\nAnd a post:\n\n\"We roast on Mondays. Small batches, by hand, watching the colour turn. It's slow and a little obsessive and we wouldn't do it any other way. Good coffee is patience you can taste.\"" },
  { role: 'assistant', content: "Paste or describe a piece of marketing you'd NEVER want to sound like, and why it makes you cringe." },
  { role: 'user', content: "Ugh, those influencer launch emails. ALL CAPS subject lines, fake countdown timers, 'ONLY 3 SPOTS LEFT', exclamation marks everywhere, calling everyone 'fam' and 'legends', that hustle-bro energy — 'crush your morning', 'fuel your grind'. It's loud and fake and treats coffee like a pre-workout supplement. The opposite of what we are." },
  { role: 'assistant', content: 'Now the specific words, phrases, tones, or formats you would never use in your own writing.' },
  { role: 'user', content: "Honestly? I haven't really sat down and made a list. Nothing specific comes to mind off the top of my head. I just know it when I see it." },
  { role: 'assistant', content: "That's everything. Packaging it up now." },
]

async function main() {
  loadEnv()
  const sb = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )

  // Pre-clean any stale test rows from a prior run.
  await sb.from('clients').delete().eq('slug', TEST_SLUG)

  // 1. Seed a throwaway in_progress session with the fake transcript.
  const { data: inserted, error: insErr } = await sb
    .from('intake_sessions')
    .insert({ messages: MESSAGES, status: 'in_progress' })
    .select('id')
    .single()
  if (insErr || !inserted) {
    console.error('Seed failed:', insErr?.message)
    process.exit(1)
  }
  const sessionId = inserted.id as string
  console.log(`Seeded throwaway session ${sessionId} (${MESSAGES.length} messages)`)
  console.log(`Calling LIVE endpoint ${ENDPOINT} (forced extraction, 60-120s)...\n`)

  // 2. Hit the DEPLOYED endpoint.
  let summary: any
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId }),
    })
    const json: any = await res.json()
    if (!res.ok) {
      console.error(`Endpoint returned ${res.status}:`, json?.error)
      await cleanup(sb, sessionId)
      process.exit(1)
    }
    summary = json.summary
    console.log(`HTTP ${res.status} — extraction returned.${json.already_complete ? ' (already_complete)' : ''}\n`)
  } catch (e: any) {
    console.error('Request failed:', e?.message || e)
    await cleanup(sb, sessionId)
    process.exit(1)
  }

  // 3. Inspect the voice negative-space.
  const v = summary?.voice_tone || {}
  const gaps: string[] = summary?.unresolved_gaps || []
  const voiceGaps = gaps.filter((g) => /ban|anti.?voice|voice|infer|phrase/i.test(g))

  console.log('===== LIVE VOICE NEGATIVE-SPACE RESULT (V2.5) =====')
  console.log(`business_name resolved: ${summary?.context?.business_name || '(none)'}`)
  console.log(`\nbanned_phrases (${(v.banned_phrases || []).length}):`)
  for (const b of v.banned_phrases || []) console.log(`   - ${b}`)
  console.log(`\nanti_voice_samples (${(v.anti_voice_samples || []).length}):`)
  for (const a of v.anti_voice_samples || []) console.log(`   - ${JSON.stringify(a).slice(0, 140)}`)
  console.log(`\nsignature_phrases (${(v.signature_phrases || []).length}):`)
  for (const sp of v.signature_phrases || []) console.log(`   - ${sp}`)
  console.log(`\nvoice-related unresolved_gaps (${voiceGaps.length}):`)
  for (const g of voiceGaps) console.log(`   flag: ${g}`)

  const banned = (v.banned_phrases || []).length
  const anti = (v.anti_voice_samples || []).length
  const flagged = voiceGaps.some((g) => /infer|confirm|empty/i.test(g))
  console.log('\n===== VERDICT =====')
  console.log(`banned_phrases populated: ${banned > 0 ? 'YES (' + banned + ')' : 'NO — STILL EMPTY (fix not live)'}`)
  console.log(`anti_voice_samples populated: ${anti > 0 ? 'YES (' + anti + ')' : 'NO'}`)
  console.log(`inferred entries flagged for confirmation: ${flagged ? 'YES' : 'no flag present'}`)
  console.log(`PASS: ${banned > 0 && anti > 0 && flagged ? 'YES — live deploy distils + flags' : 'REVIEW NEEDED'}`)

  // 4. Cleanup.
  await cleanup(sb, sessionId)
  console.log('\nCleaned up test rows (clients + intake_sessions).')
}

async function cleanup(sb: any, sessionId: string) {
  await sb.from('clients').delete().eq('slug', TEST_SLUG)
  await sb.from('intake_sessions').delete().eq('id', sessionId)
}

main().catch((e) => {
  console.error('Smoke test failed:', e?.message || e)
  process.exit(1)
})
