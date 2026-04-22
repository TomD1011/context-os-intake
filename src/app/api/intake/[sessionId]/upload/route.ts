import { NextRequest } from 'next/server'
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase'
import { getSession } from '@/lib/intake-store'

export const runtime = 'nodejs'

const STORAGE_BUCKET = 'intake-uploads'
const MAX_BYTES = 20 * 1024 * 1024 // 20 MB — plenty for PDFs/decks/screenshots

// Allowed content types. Covers docs, sheets, slides, images, text, PDFs.
const ALLOWED_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/json',
  'text/plain',
  'text/csv',
  'text/markdown',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
])

/**
 * POST /api/intake/[sessionId]/upload
 *
 * Multipart form:
 *   file: the uploaded file (required)
 *
 * Response 200:
 *   { id, filename, content_type, size_bytes, storage_path }
 *
 * Response non-200:
 *   { error: string }
 */
export async function POST(
  request: NextRequest,
  context: { params: { sessionId: string } }
) {
  if (!isSupabaseConfigured()) {
    return json({ error: 'File upload requires Supabase to be configured.' }, 503)
  }

  const sessionId = context.params.sessionId
  if (!sessionId) return json({ error: 'invalid session id' }, 400)

  // Verify the session actually exists before accepting a file for it.
  const session = await getSession(sessionId)
  if (!session) return json({ error: 'session not found' }, 404)

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return json({ error: 'invalid multipart body' }, 400)
  }

  const file = formData.get('file')
  if (!(file instanceof File)) {
    return json({ error: 'missing file' }, 400)
  }

  if (file.size === 0) return json({ error: 'empty file' }, 400)
  if (file.size > MAX_BYTES) {
    return json(
      { error: `file too large (max ${MAX_BYTES / 1024 / 1024} MB)` },
      413
    )
  }

  const contentType = file.type || 'application/octet-stream'
  if (!ALLOWED_TYPES.has(contentType)) {
    return json({ error: `file type not allowed: ${contentType}` }, 415)
  }

  // Slug the filename so object keys stay predictable and URL-safe.
  const safeName = sanitiseFilename(file.name)
  const storagePath = `${sessionId}/${Date.now()}-${safeName}`

  const sb = getSupabase()
  if (!sb) return json({ error: 'supabase unavailable' }, 503)

  // 1. Upload to Storage
  const arrayBuffer = await file.arrayBuffer()
  const { error: uploadError } = await sb.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, new Uint8Array(arrayBuffer), {
      contentType,
      upsert: false,
    })

  if (uploadError) {
    console.error('[upload] storage upload failed:', uploadError)
    return json({ error: `upload failed: ${uploadError.message}` }, 500)
  }

  // 2. Insert metadata row in intake_files
  const { data: row, error: insertError } = await sb
    .from('intake_files')
    .insert({
      session_id: sessionId,
      filename: file.name,
      storage_path: storagePath,
      content_type: contentType,
      size_bytes: file.size,
    })
    .select('id, filename, content_type, size_bytes, storage_path')
    .single()

  if (insertError || !row) {
    console.error('[upload] metadata insert failed:', insertError)
    // Best-effort cleanup of the orphaned blob
    await sb.storage.from(STORAGE_BUCKET).remove([storagePath])
    return json({ error: 'failed to record upload' }, 500)
  }

  return json(row, 200)
}

function sanitiseFilename(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'upload'
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
