# Context OS Intake

A Claude-powered chat intake for FounderOS. Founders answer ~50 diagnostic
questions via chat; the output is a structured JSON brief that slots into the
FounderOS Client Brain Template 10-domain schema.

Production URL (target): **https://intake.founderos.co.nz**

---

## Architecture

| Layer              | Tech                                                     |
|--------------------|----------------------------------------------------------|
| Frontend           | Next.js 14 App Router (React 18, Tailwind 3)             |
| Model              | Claude Sonnet 4.6 via `@anthropic-ai/sdk`                |
| Tool pattern       | `submit_intake_summary` tool — returns structured JSON    |
| Streaming          | NDJSON over a Fetch `ReadableStream`                     |
| Persistence        | Supabase (Postgres + Storage) — optional, in-memory fallback |
| Hosting            | Vercel                                                    |

All state lives in two places:

- **Supabase `intake_sessions`** — one row per intake, with `messages` jsonb
  and `summary` jsonb. Lets founders resume via `?session=<uuid>`.
- **Supabase `intake-uploads` bucket** — any files attached mid-intake,
  referenced from `intake_files`.

If Supabase isn't configured, the app still works end-to-end — state lives in
the browser only and there's no resume.

---

## Local development

```bash
cp .env.local.example .env.local   # fill in ANTHROPIC_API_KEY
npm install
npm run dev
```

Open http://localhost:3000 — click **Begin Intake**.

### Optional — turn on persistence and resume

Follow [`supabase/README.md`](./supabase/README.md): create a project, run
`supabase/migrations/0001_init.sql`, create the `intake-uploads` bucket, then
add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to `.env.local`.

---

## Deploying to Vercel

### One-time setup

1. **Push the repo to GitHub** (private repo is fine).
2. **Vercel dashboard → Add New → Project** → import the GitHub repo.
3. **Framework preset:** Next.js (auto-detected).
4. **Root Directory:** `Builds/context-os-intake` (if the repo root is the
   FounderOS vault) or `.` if the app is its own repo.
5. **Environment Variables** — add these for Production *and* Preview:
   - `ANTHROPIC_API_KEY` (required)
   - `SUPABASE_URL` (optional; required for persistence/resume)
   - `SUPABASE_SERVICE_ROLE_KEY` (optional; required for persistence/resume)
6. Click **Deploy**. First build takes ~2 minutes.

### Custom domain

7. **Project → Settings → Domains** → add `intake.founderos.co.nz`.
8. Vercel will show the DNS record to create. In your DNS provider for
   `founderos.co.nz`, add a CNAME:
   - Name: `intake`
   - Value: `cname.vercel-dns.com`
9. Wait for propagation (usually <10 minutes). Vercel auto-issues the TLS cert.

### Post-deploy checks

- Hit `https://intake.founderos.co.nz` — welcome screen should render.
- Click **Begin Intake** — Claude's opening should stream in.
- Answer a question, then refresh — if Supabase is wired up, the URL has
  `?session=<uuid>` and the refresh should resume the intake.
- Attach a file via the paperclip — should land in `intake-uploads`.

### Troubleshooting

- **`ENOENT src/lib/system-prompt.md`** on Vercel → confirm
  `outputFileTracingIncludes` is still present in `next.config.js`. Without
  it, Vercel's build trace won't bundle the prompt.
- **`Your credit balance is too low`** → top up at
  <https://console.anthropic.com/settings/billing>.
- **Stream stalls for ~30s then 504s** → Vercel's default function timeout is
  10s on Hobby, 60s on Pro. A full intake turn fits in ~10–30s; if timeouts
  show up, upgrade to Pro or add `export const maxDuration = 60` to
  `src/app/api/chat/route.ts`.
- **Uploads return 503** → Supabase env vars aren't set, or the
  `intake-uploads` bucket doesn't exist. See `supabase/README.md`.

---

## File tour

```
src/
  app/
    api/
      chat/route.ts              — streaming chat endpoint (Claude + tool use)
      intake/[sessionId]/
        route.ts                 — GET session for resume
        upload/route.ts          — POST file upload to Supabase Storage
    page.tsx                     — welcome + chat UI + summary screen
    globals.css                  — Tailwind + small animations
  lib/
    intake-tool.ts               — submit_intake_summary tool definition
    intake-store.ts              — Supabase persistence helpers
    supabase.ts                  — server-side client (service-role)
    system-prompt.md             — the 21KB diagnostic conductor prompt
supabase/
  migrations/0001_init.sql       — intake_sessions + intake_files + triggers
  README.md                      — Supabase setup runbook
next.config.js                   — outputFileTracingIncludes for the prompt
```
