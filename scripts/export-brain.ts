/**
 * export-brain.ts — the keystone.
 *
 * Reads a hydrated client brain from Supabase (clients.client_brain JSONB +
 * the 7 brain_* domain columns) and renders a structured, voice-preserving
 * Client Brain.md into the FounderOS Clients/ folder.
 *
 * This is the connective tissue between Context OS (the brain) and every OS
 * skill (Marketing OS / Sales OS). The skills read this markdown the way they
 * currently read FounderOS's Reference/ files — but client-specific.
 *
 * Voice is the differentiator: the founder's pasted voice samples and the
 * founder story are rendered VERBATIM, never flattened.
 *
 * Usage:
 *   npx tsx scripts/export-brain.ts <slug> ["Client Folder Name"]
 *
 * Examples:
 *   npx tsx scripts/export-brain.ts koha-fitness-and-health-club "Koha Fitness — Chris"
 *   npx tsx scripts/export-brain.ts founder-os "FounderOS"
 *
 * If the folder name is omitted, the client's display_name is used.
 * Output: <FounderOS root>/Clients/<folder>/Client Brain.md
 *
 * RUN FROM: Builds/Context OS/context-os-intake/
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const APP_ROOT = join(__dirname, '..')
// scripts -> context-os-intake -> Context OS -> Builds -> FounderOS
const FOUNDEROS_ROOT = join(APP_ROOT, '..', '..', '..')
const CLIENTS_DIR = join(FOUNDEROS_ROOT, 'Clients')

const slug = process.argv[2]
const folderArg = process.argv[3]
const stampArg = process.argv[4] // optional ISO date for the "generated" line

if (!slug) {
  console.error('Usage: npx tsx scripts/export-brain.ts <slug> ["Client Folder Name"] [YYYY-MM-DD]')
  process.exit(1)
}

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

// ── Markdown render helpers ────────────────────────────────────────────────
const out: string[] = []
const w = (s = '') => out.push(s)
const h1 = (s: string) => w(`# ${s}\n`)
const h2 = (s: string) => w(`\n## ${s}\n`)
const h3 = (s: string) => w(`\n### ${s}\n`)

/** True if a value carries real content worth rendering. */
function has(v: unknown): boolean {
  if (v == null) return false
  if (typeof v === 'string') return v.trim().length > 0
  if (Array.isArray(v)) return v.length > 0
  if (typeof v === 'object') return Object.values(v as object).some(has)
  return true
}

const labelize = (k: string) =>
  k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

/** Render a flat object of string fields as a bolded definition list. */
function defs(obj: Record<string, unknown> | undefined) {
  if (!obj) return
  for (const [k, v] of Object.entries(obj)) {
    if (!has(v)) continue
    if (typeof v === 'string') {
      w(`**${labelize(k)}:** ${v.trim()}`)
      w('')
    } else if (Array.isArray(v) && v.every((x) => typeof x === 'string')) {
      w(`**${labelize(k)}:**`)
      for (const item of v as string[]) if (has(item)) w(`- ${item.trim()}`)
      w('')
    } else if (typeof v === 'object') {
      // nested object — render as sub-list
      w(`**${labelize(k)}:**`)
      for (const [k2, v2] of Object.entries(v as Record<string, unknown>)) {
        if (has(v2) && typeof v2 === 'string') w(`- *${labelize(k2)}:* ${(v2 as string).trim()}`)
      }
      w('')
    }
  }
}

function bullets(arr: unknown, prefix = '- ') {
  if (!Array.isArray(arr)) return
  for (const item of arr) {
    if (typeof item === 'string' && has(item)) w(`${prefix}${item.trim()}`)
    else if (item && typeof item === 'object') w(`${prefix}${JSON.stringify(item)}`)
  }
}

async function main() {
  loadEnv()
  const supaUrl = process.env.SUPABASE_URL
  const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supaUrl || !supaKey) {
    console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local')
    process.exit(1)
  }
  const sb = createClient(supaUrl, supaKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: client, error } = await sb
    .from('clients')
    .select('*')
    .eq('slug', slug)
    .maybeSingle()
  if (error || !client) {
    console.error(`No client found for slug "${slug}": ${error?.message ?? 'not found'}`)
    process.exit(1)
  }

  const brain = (client.client_brain ?? {}) as Record<string, any>
  const ctx = brain.context ?? {}
  const biz = brain.business ?? {}
  const displayName: string = client.display_name || ctx.business_name || slug
  const owner: string = client.owner_name || ctx.owner || biz.identity?.owner || ''

  // ── Header / frontmatter ──────────────────────────────────────────────
  h1(`${displayName} — Client Brain`)
  w('> Single source of truth for this client. Generated from the Context OS intake.')
  w('> Voice samples and the founder story are verbatim — do not paraphrase when using them.')
  w('')
  w(`- **Slug:** \`${slug}\``)
  if (owner) w(`- **Owner:** ${owner}`)
  w(`- **Brain version:** ${client.brain_version ?? 'n/a'}`)
  w(`- **Intake version:** ${brain._intake_version ?? 'n/a'}`)
  if (stampArg) w(`- **Generated:** ${stampArg}`)
  w('')

  // ── Identity ──────────────────────────────────────────────────────────
  const identity = biz.identity ?? {}
  h2('Identity')
  defs({
    business_name: identity.business_name ?? ctx.business_name,
    what_they_do: identity.what_they_do ?? ctx.what_they_do,
    where_and_tenure: identity.where_and_tenure ?? ctx.where_and_tenure,
    structure: identity.structure ?? ctx.structure,
    endgame: identity.endgame,
    why_now: identity.why_now,
    sacred_cows: identity.sacred_cows,
  })
  if (has(identity.origin_story)) {
    h3('Origin story (verbatim)')
    w('> ' + String(identity.origin_story).trim().replace(/\n/g, '\n> '))
    w('')
  }

  // ── Revenue & financials ──────────────────────────────────────────────
  if (has(biz.revenue_model) || has(biz.financials)) {
    h2('Revenue & Financials')
    defs(biz.revenue_model)
    defs(biz.financials)
  }

  // ── Customer reality ──────────────────────────────────────────────────
  if (has(biz.customer_reality)) {
    h2('Customer Reality')
    defs(biz.customer_reality)
  }

  // ── Acquisition ───────────────────────────────────────────────────────
  if (has(biz.acquisition)) {
    h2('Acquisition')
    defs(biz.acquisition)
  }

  // ── Operations ────────────────────────────────────────────────────────
  if (has(biz.delivery) || has(biz.team) || has(biz.systems)) {
    h2('Operations')
    if (has(biz.delivery)) { h3('Delivery'); defs(biz.delivery) }
    if (has(biz.team)) { h3('Team'); defs(biz.team) }
    if (has(biz.systems)) { h3('Systems & Tools'); defs(biz.systems) }
  }

  // ── Constraints (the leverage point) ──────────────────────────────────
  if (has(biz.constraints) || has(biz.temporal)) {
    h2('Constraints & Leverage')
    defs(biz.constraints)
    defs(biz.temporal)
  }

  // ── Offer architecture (Marketing OS) ─────────────────────────────────
  if (has(brain.offer_architecture)) {
    const oa = brain.offer_architecture
    h2('Offer Architecture')
    defs({
      mechanism_name: oa.mechanism_name,
      offer_one_liner: oa.offer_one_liner,
      price_anchors: oa.price_anchors,
      payment_options: oa.payment_options,
    })
    if (has(oa.value_equation)) { h3('Value Equation'); defs(oa.value_equation) }
    if (has(oa.guarantee)) { h3('Guarantee'); defs(oa.guarantee) }
    if (has(oa.offer_amplifiers)) { h3('Offer Amplifiers'); defs(oa.offer_amplifiers) }
    if (has(oa.product_ladder)) { h3('Product Ladder'); defs(oa.product_ladder) }
  }

  // ── Avatar (copy-production depth) ────────────────────────────────────
  if (has(brain.avatar_deep)) {
    const a = brain.avatar_deep
    h2('Avatar (Voice of Customer)')
    defs({
      daily_frustrations: a.daily_frustrations,
      what_keeps_them_awake: a.what_keeps_them_awake,
      hidden_fears: a.hidden_fears,
      what_they_want_more_than_anything: a.what_they_want_more_than_anything,
      cost_of_inaction: a.cost_of_inaction,
      how_they_describe_themselves: a.how_they_describe_themselves,
      who_they_aspire_to_be: a.who_they_aspire_to_be,
    })
    if (has(a.pain_points_voc)) { h3('Pain points (VoC)'); bullets(a.pain_points_voc) ; w('') }
    if (has(a.dream_outcomes_voc)) { h3('Dream outcomes (VoC)'); bullets(a.dream_outcomes_voc); w('') }
    if (has(a.voc_quotes_raw)) { h3('Raw VoC quotes (verbatim)'); bullets(a.voc_quotes_raw, '> '); w('') }
    if (has(a.objection_voc)) { h3('Objections (verbatim)'); bullets(a.objection_voc, '> '); w('') }
  }

  // ── Voice (the differentiator) ────────────────────────────────────────
  if (has(brain.voice_tone) || has(brain.marketing?.voice)) {
    const v = brain.voice_tone ?? {}
    h2('Voice')
    if (has(brain.marketing?.voice?.voice_notes)) {
      w(brain.marketing.voice.voice_notes.trim()); w('')
    }
    defs({
      register_formal_casual: v.register_formal_casual != null ? `${v.register_formal_casual}/5` : '',
      jargon_level: v.jargon_level != null ? `${v.jargon_level}/5` : '',
      sentence_rhythm_preference: v.sentence_rhythm_preference,
    })
    if (has(v.signature_phrases)) { h3('Signature phrases'); bullets(v.signature_phrases); w('') }
    if (has(v.banned_phrases)) { h3('Banned phrases'); bullets(v.banned_phrases); w('') }
    if (has(v.voice_samples)) {
      h3('Voice samples (VERBATIM — the gold)')
      for (const s of v.voice_samples as Array<Record<string, any>>) {
        const tag = s.type || s.source || 'sample'
        w(`**Sample — ${tag}:**`)
        w('')
        w('```')
        w(String(s.content ?? '').trim())
        w('```')
        w('')
      }
    }
  }

  // ── Sales machine (Sales OS) ──────────────────────────────────────────
  if (has(brain.sales_machine)) {
    h2('Sales Machine')
    defs(brain.sales_machine)
  } else if (has(brain.sales)) {
    h2('Sales (seed)')
    defs(brain.sales.objections_seed)
    defs(brain.sales.pipeline_seed)
  }

  // ── Additional context & gaps ─────────────────────────────────────────
  if (has(brain.additional_context)) {
    h2('Additional Context')
    w(String(brain.additional_context).trim()); w('')
  }
  if (has(brain.unresolved_gaps)) {
    h2('Unresolved Gaps')
    w('> Flagged during intake — verify with the client before relying on these areas.')
    w('')
    bullets(brain.unresolved_gaps)
    w('')
  }

  // ── Write file ────────────────────────────────────────────────────────
  const folder = folderArg || displayName
  const dir = join(CLIENTS_DIR, folder)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const target = join(dir, 'Client Brain.md')
  writeFileSync(target, out.join('\n'))

  console.log('\n✅ Client Brain exported.')
  console.log(`   client : ${displayName} (${slug})`)
  console.log(`   file   : ${target}`)
  console.log(`   size   : ${out.join('\n').length.toLocaleString()} chars`)
  const voiceN = (brain.voice_tone?.voice_samples ?? []).length
  console.log(`   voice samples included (verbatim): ${voiceN}`)
}

main().catch((e) => {
  console.error('\n❌ Export failed:', e?.message || e)
  process.exit(1)
})
