/**
 * import-brain.ts — the reverse of export-brain.ts.
 *
 * export-brain.ts is LOSSY by design: it flattens the nested client_brain JSONB
 * to markdown and drops empty fields. So a naive "parse the markdown back into
 * JSON" importer would be fragile and could corrupt the production brain.
 *
 * Instead this is a TARGETED FIELD-PATCH importer. You author a small patch file
 * (JSON) listing the exact field paths that were hand-corrected in the working
 * copy, and this script deep-merges those — and only those — into the live
 * client_brain JSONB. Everything untouched stays exactly as Supabase has it.
 *
 * Safety:
 *   - DRY RUN by default. It prints a full OLD -> NEW diff and writes nothing.
 *   - Only `--commit` writes, and only after backing up the current client_brain
 *     to scripts/backups/<slug>-brain-pre-<timestamp>.json.
 *   - Upsert-by-slug semantics: updates the single matching client row. No deletes.
 *   - Idempotent appends: an append op can declare `skipIfContains` so re-running
 *     never duplicates text.
 *
 * Usage:
 *   # dry run (default) — shows the diff, writes nothing:
 *   npx tsx scripts/import-brain.ts scripts/patches/koha-2026-06-04.json
 *
 *   # actually write to Supabase:
 *   npx tsx scripts/import-brain.ts scripts/patches/koha-2026-06-04.json --commit
 *
 * Patch file shape:
 *   {
 *     "slug": "koha-fitness-and-health-club",
 *     "note": "what this patch fixes and why",
 *     "brain_version": "2.1",            // optional — bumps clients.brain_version on commit
 *     "sets":    [ { "path": "sales_machine.sales_script", "value": "..." } ],
 *     "appends": [ { "path": "marketing.voice.voice_notes", "value": "...",
 *                    "separator": "\n\n", "skipIfContains": "Selling posture" } ]
 *   }
 *
 * Paths are dot-paths into the client_brain JSONB (e.g. "business.identity.endgame").
 *
 * RUN FROM: Builds/Context OS/context-os-intake/
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join, isAbsolute } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const APP_ROOT = join(__dirname, '..')
const BACKUP_DIR = join(__dirname, 'backups')

const args = process.argv.slice(2)
const commit = args.includes('--commit')
const patchArg = args.find((a) => !a.startsWith('--'))

if (!patchArg) {
  console.error('Usage: npx tsx scripts/import-brain.ts <patch.json> [--commit]')
  process.exit(1)
}

const patchPath = isAbsolute(patchArg) ? patchArg : join(process.cwd(), patchArg)

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

// ── deep get / set on a plain-object tree ──────────────────────────────────
function deepGet(obj: any, path: string): unknown {
  return path.split('.').reduce((acc, k) => (acc == null ? undefined : acc[k]), obj)
}
function deepSet(obj: any, path: string, value: unknown) {
  const keys = path.split('.')
  let node = obj
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i]
    if (node[k] == null || typeof node[k] !== 'object') node[k] = {}
    node = node[k]
  }
  node[keys[keys.length - 1]] = value
}

// Order-independent stringify — Postgres JSONB does NOT preserve key order,
// so a read-back compare must sort keys or it false-alarms on ordering alone.
function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v)
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']'
  const keys = Object.keys(v as object).sort()
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify((v as any)[k])).join(',') + '}'
}

const trunc = (s: unknown, n = 240) => {
  const str = typeof s === 'string' ? s : JSON.stringify(s)
  if (str == null) return String(str)
  return str.length > n ? str.slice(0, n) + ` …(+${str.length - n} chars)` : str
}

type SetOp = { path: string; value: unknown }
type AppendOp = { path: string; value: string; separator?: string; skipIfContains?: string }
type Patch = {
  slug: string
  note?: string
  brain_version?: string
  sets?: SetOp[]
  appends?: AppendOp[]
}

async function main() {
  loadEnv()
  const supaUrl = process.env.SUPABASE_URL
  const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supaUrl || !supaKey) {
    console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local')
    process.exit(1)
  }

  const patch: Patch = JSON.parse(readFileSync(patchPath, 'utf-8'))
  if (!patch.slug) {
    console.error('Patch is missing "slug".')
    process.exit(1)
  }

  const sb = createClient(supaUrl, supaKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: client, error } = await sb
    .from('clients')
    .select('*')
    .eq('slug', patch.slug)
    .maybeSingle()
  if (error || !client) {
    console.error(`No client found for slug "${patch.slug}": ${error?.message ?? 'not found'}`)
    process.exit(1)
  }

  const before = (client.client_brain ?? {}) as Record<string, any>
  // deep clone so the diff compares against an untouched snapshot
  const after = JSON.parse(JSON.stringify(before)) as Record<string, any>

  console.log('\n' + '='.repeat(72))
  console.log(`BRAIN IMPORT — ${commit ? 'COMMIT' : 'DRY RUN (no write)'} `)
  console.log('='.repeat(72))
  console.log(`client        : ${client.display_name ?? patch.slug} (${patch.slug})`)
  console.log(`brain_version : ${client.brain_version ?? 'n/a'}${patch.brain_version ? `  ->  ${patch.brain_version}` : ''}`)
  if (patch.note) console.log(`note          : ${patch.note}`)
  console.log('')

  let changes = 0

  // ── SET ops ──────────────────────────────────────────────────────────────
  for (const op of patch.sets ?? []) {
    const oldVal = deepGet(before, op.path)
    const parentPath = op.path.split('.').slice(0, -1).join('.')
    const parent = parentPath ? deepGet(before, parentPath) : before
    const siblingKeys =
      parent && typeof parent === 'object' ? Object.keys(parent) : []
    const same = JSON.stringify(oldVal) === JSON.stringify(op.value)

    console.log(`SET  ${op.path}`)
    console.log(`     parent keys present : [${siblingKeys.join(', ')}]`)
    console.log(`     OLD: ${oldVal === undefined ? '(absent — this op CREATES a new key)' : trunc(oldVal)}`)
    console.log(`     NEW: ${trunc(op.value)}`)
    if (same) {
      console.log('     -> no change (already equal)')
    } else {
      deepSet(after, op.path, op.value)
      changes++
    }
    console.log('')
  }

  // ── APPEND ops ───────────────────────────────────────────────────────────
  for (const op of patch.appends ?? []) {
    const cur = deepGet(before, op.path)
    const curStr = typeof cur === 'string' ? cur : cur == null ? '' : String(cur)
    console.log(`APPEND ${op.path}`)
    console.log(`     CURRENT: ${cur === undefined ? '(absent)' : trunc(curStr)}`)
    if (op.skipIfContains && curStr.includes(op.skipIfContains)) {
      console.log(`     -> SKIP (already contains "${op.skipIfContains}")`)
    } else {
      const sep = curStr.length ? (op.separator ?? '\n\n') : ''
      const merged = curStr + sep + op.value
      deepSet(after, op.path, merged)
      console.log(`     APPEND: ${trunc(op.value)}`)
      changes++
    }
    console.log('')
  }

  console.log('-'.repeat(72))
  console.log(`fields changed: ${changes}`)

  if (changes === 0) {
    console.log('Nothing to do — Supabase already matches the patch. Exiting.')
    return
  }

  if (!commit) {
    console.log('\nDRY RUN — nothing written. Re-run with --commit to apply.')
    return
  }

  // ── COMMIT ───────────────────────────────────────────────────────────────
  if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupFile = join(BACKUP_DIR, `${patch.slug}-brain-pre-${stamp}.json`)
  writeFileSync(
    backupFile,
    JSON.stringify({ slug: patch.slug, brain_version: client.brain_version, client_brain: before }, null, 2),
  )
  console.log(`\nbackup written: ${backupFile}`)

  // provenance marker (top-level _patches; export-brain.ts ignores it)
  if (!Array.isArray(after._patches)) after._patches = []
  after._patches.push({
    date: stamp,
    note: patch.note ?? '',
    paths: [...(patch.sets ?? []).map((s) => s.path), ...(patch.appends ?? []).map((a) => a.path)],
  })

  const update: Record<string, unknown> = { client_brain: after }
  if (patch.brain_version) update.brain_version = patch.brain_version

  const { error: upErr } = await sb.from('clients').update(update).eq('slug', patch.slug)
  if (upErr) {
    console.error(`\n❌ Update failed: ${upErr.message}`)
    console.error(`   The backup is safe at: ${backupFile}`)
    process.exit(1)
  }

  // verify
  const { data: check } = await sb
    .from('clients')
    .select('brain_version, client_brain')
    .eq('slug', patch.slug)
    .maybeSingle()
  const ok = stableStringify(check?.client_brain) === stableStringify(after)
  console.log(`\n✅ Committed. read-back matches written value: ${ok ? 'YES' : 'NO (investigate)'}`)
  console.log(`   brain_version now: ${check?.brain_version ?? 'n/a'}`)
  console.log(`   restore if needed: re-import from ${backupFile}`)
}

main().catch((e) => {
  console.error('\n❌ Import failed:', e?.message || e)
  process.exit(1)
})
