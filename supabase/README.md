# Supabase setup

The Context OS Intake app can run without Supabase — all state lives in memory
and the founder downloads the JSON when they're done. Turning Supabase on
adds **persistence** (server-side storage of every intake) and **resume**
(founders can refresh or return via a share link and pick up where they left
off).

## 1. Create the project

1. Go to <https://supabase.com> and create a new project (free tier is fine).
2. Grab the following from **Project Settings → API**:
   - Project URL → `SUPABASE_URL`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`
     (This is server-only. Never expose it in client code.)

## 2. Run the migration

Open the SQL editor in Supabase (**SQL Editor → New query**) and paste the
contents of `migrations/0001_init.sql`. Run it.

This creates `intake_sessions` and `intake_files`, enables RLS on both, and
adds the `updated_at` trigger.

## 3. Create the storage bucket

In the Supabase dashboard → **Storage** → **New bucket**:

- Name: `intake-uploads`
- Public: **off** (keep it private — files are accessed server-side only)
- File size limit: `20 MB` (matches the API route limit)

No bucket policies are needed — the service-role key used by `/api/intake/.../upload`
bypasses storage RLS.

## 4. Wire the env vars

Locally:

```bash
cp .env.local.example .env.local
# then edit .env.local with your real values
```

On Vercel: **Project → Settings → Environment Variables** — add both
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` for Production and Preview.

## 5. Verify

Start the app, begin an intake, answer a few questions, then refresh. The URL
now carries `?session=<uuid>`; the refresh should pull your answers back and
drop you in mid-conversation.

To test uploads: click the paperclip next to the chat input and attach any
supported file (PDF, DOCX, XLSX, PNG, etc). You should see a line appear in
the conversation confirming the attachment, and a new row land in
`intake_files` with a matching blob in the `intake-uploads` bucket.

## What gets stored

| Table              | Columns                                                                          |
|--------------------|----------------------------------------------------------------------------------|
| `intake_sessions`  | `id`, `created_at`, `updated_at`, `completed_at`, `status`, `business_name`, `messages` (jsonb), `summary` (jsonb) |
| `intake_files`     | `id`, `session_id`, `created_at`, `filename`, `storage_path`, `content_type`, `size_bytes` |

RLS is enabled and no policies exist for `anon`/`authenticated`, so the
database is only writable via the service-role key used by `/api/chat`.
