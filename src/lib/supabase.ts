/**
 * Supabase server-side client.
 *
 * Uses the SERVICE ROLE key (server-only) to bypass RLS. This is safe because
 * every Supabase call goes through our API routes — the key is never shipped
 * to the browser.
 *
 * Graceful degradation: if env vars are missing (e.g. in local dev before
 * Supabase is wired up), `getSupabase()` returns null and callers fall back
 * to memory-only mode. This keeps the app functional during development and
 * lets us ship without Supabase configured.
 *
 * Required env vars (set in .env.local and Vercel):
 *   SUPABASE_URL              — https://<project-ref>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY — service role key from Supabase dashboard
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let cached: SupabaseClient | null | undefined

export function getSupabase(): SupabaseClient | null {
  if (cached !== undefined) return cached

  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    cached = null
    return null
  }

  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return cached
}

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
}
