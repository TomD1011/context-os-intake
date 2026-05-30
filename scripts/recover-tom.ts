/**
 * recover-tom.ts — hydrate Tom's own FounderOS clients row from an already-
 * completed intake.
 *
 * WHY THIS EXISTS
 * ---------------
 * Session f6e4d571 (Tom / FounderOS) is already status=complete with a full
 * V2.4 summary. But it has no clients row, because the 21 May recover-intake.mjs
 * only wrote to intake_sessions and never called completeSession (the clients-
 * hydration half). This script runs that missing half. NO Anthropic call — the
 * summary already exists; this is a pure, deterministic database replay through
 * the REAL completeSession (the same path the production fix will harden).
 *
 * TWO-PHASE (consistent with recover-chris.ts)
 * --------------------------------------------
 *   Phase 1 (default):  npx tsx scripts/recover-tom.ts
 *       → loads the existing summary, previews business_name / slug / the 7
 *         derived brain columns. NO database write.
 *   Phase 2 (--commit):  npx tsx scripts/recover-tom.ts --commit
 *       → runs completeSession to upsert the clients row, then prints it.
 *
 * RUN FROM:  Builds/Context OS/context-os-intake/
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const APP_ROOT = join(__dirname, '..')
const SESSION_ID = 'f6e4d571-4f6a-481a-9baa-3b5de72a67a3' // Tom / FounderOS
const EXPECTED_BUSINESS = 'founder' // sanity-check substring (lowercased)
const COMMIT = process.argv.includes('--commit')

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

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
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

  console.log('\n═══════════════════════════════════════════════')
  console.log('  CONTEXT OS — Tom / FounderOS brain hydration')
  console.log(`  mode: ${COMMIT ? 'COMMIT (writes to DB)' : 'DRY RUN (no DB write)'}`)
  console.log('  (pure DB replay — no Anthropic call)')
  console.log('═══════════════════════════════════════════════\n')

  const { data: session, error: loadErr } = await sb
    .from('intake_sessions')
    .select('id, status, messages, summary')
    .eq('id', SESSION_ID)
    .single()
  if (loadErr || !session) {
    console.error(`Failed to load session: ${loadErr?.message || 'not found'}`)
    process.exit(1)
  }
  if (!session.summary) {
    console.error('Session has no summary — wrong session, or it needs full recovery (use the chris-style path).')
    process.exit(1)
  }

  const summary = session.summary as Record<string, any>
  const businessName: string = summary?.context?.business_name ?? ''
  const slug = slugify(businessName)
  const businessOk = businessName.toLowerCase().includes(EXPECTED_BUSINESS)

  const { extractDomains } = await import('../src/lib/brain-domains.ts')
  const domains = extractDomains(summary)

  console.log(`   session status : ${session.status}`)
  console.log(`   business_name  : ${businessName}  ${businessOk ? '✓' : '⚠️  expected to contain "founder"'}`)
  console.log(`   slug           : ${slug}`)
  console.log(`   top-level keys : ${Object.keys(summary).join(', ')}`)
  console.log(`   derived brain columns: ${Object.keys(domains).map((k) => `${k}=${JSON.stringify((domains as any)[k]).length}ch`).join(', ')}`)

  if (!COMMIT) {
    console.log('\nDry run only. To hydrate the clients row:')
    console.log('   npx tsx scripts/recover-tom.ts --commit')
    console.log('═══════════════════════════════════════════════\n')
    return
  }

  const { completeSession } = await import('../src/lib/intake-store.ts')
  console.log('\n💾 Running completeSession (updates intake_sessions + upserts clients)...')
  await completeSession(SESSION_ID, session.messages, summary)

  const { data: client } = await sb
    .from('clients')
    .select('id, slug, display_name, owner_name, brain_version, created_at, updated_at')
    .eq('slug', slug)
    .maybeSingle()

  console.log('\n✅ completeSession returned. Hydrated clients row:')
  console.log(JSON.stringify(client, null, 2))
  console.log('═══════════════════════════════════════════════\n')
}

main().catch((e) => {
  console.error('\n❌ Hydration failed:', e?.message || e)
  process.exit(1)
})
