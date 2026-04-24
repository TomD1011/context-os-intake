# Context OS Intake — Full Handoff

Last updated: 24 April 2026 (session in progress)
Author: Tom Downs + Claude
Status: Local dev verified end-to-end. Awaiting Vercel deploy.

---

## TL;DR

We're building a Claude-powered chat intake at **intake.founderos.co.nz** that replaces Tom's V2 HTML form. Founders complete a ~50-question diagnostic via streaming chat; the output is a structured JSON brief matching the FounderOS Client Brain Template 10-domain schema. The full web app is built, streaming is working on `localhost`, and the system prompt is holding the line. Remaining work: push to GitHub → deploy to Vercel → point DNS → (later) build a post-intake Diagnostic Review layer.

---

## What we're building

A single-purpose web app — `context-os-intake` — that acts as the diagnostic intake layer for every new FounderOS engagement.

**The user experience:**

1. Founder lands on `https://intake.founderos.co.nz` and hits **Begin Intake**.
2. Claude opens with a framing message and walks them through nine sections (about 50 questions).
3. Claude asks questions one at a time, follows up for specificity, holds the line when answers are vague, and adapts to what the founder has already said.
4. At any point the founder can attach a file (screenshot of their CRM, P&L, existing sales doc) via the paperclip. Files go to Supabase Storage and Claude is told they were attached.
5. When Claude has covered everything, it calls the `submit_intake_summary` tool, which returns structured JSON. The UI flips to a summary screen with a **Download JSON** button and a preview of the output.
6. Founder sends the JSON to Tom. Tom uses it as the single input to prescribe their OS.

**Session resume:** the URL carries `?session=<uuid>` after the first turn. Founders who close the tab can come back via the same link and pick up where they left off (requires Supabase).

---

## What we're trying to achieve

**Business outcome:** reduce the time Tom spends extracting context from a new client from "2 hours of discovery calls + note-taking" to "Tom reads a structured JSON brief". Higher quality inputs → faster, better OS prescription → shorter time-to-value → cleaner deliverables.

**Strategic purpose:** the intake becomes an asset. It's the front door of FounderOS — every prospect who books a diagnostic can be pushed through this before the first call, so Tom walks into the call already having read the brief. It's also the foundation for the future Diagnostic Review layer (see Task #12).

**Why a chat, not a form:**
- A form collects what founders think to type. A chat extracts what they actually know.
- Claude follows up when answers are vague. A form can't.
- The system prompt enforces a minimum quality bar — founders can't say "cash up front" to a payment-structure question and move on; Claude clarifies recurring vs one-off until it has enough to fill the schema.
- Adaptive depth: a founder with a clean P&L and tight ICP moves through quickly; a founder who's never thought about their constraint gets pushed harder.

**Why not ChatGPT or a Claude.ai share link:**
- We need a deterministic structured output (the JSON schema) — that requires tool use, which is cleanest via the API.
- We need to own the data (Supabase) so we can build the Diagnostic Review layer on top.
- We need to persist mid-intake so founders can resume.
- We need the URL under `intake.founderos.co.nz` — it's a brand asset.

---

## The plan (12-task breakdown)

| #  | Task                                                        | Status        |
|----|-------------------------------------------------------------|---------------|
| 1  | Build `linkedin-content-writer` skill                       | ✅ completed   |
| 2  | Add Gap Matrix phase to `linkedin-post-review`              | ✅ completed   |
| 3  | Run QA checklist on both outputs                            | ✅ completed   |
| 4  | Draft and lock Context OS Intake system prompt              | ✅ completed   |
| 5  | Scaffold Next.js app with Claude API wired                  | ✅ completed   |
| 6  | Build chat UI with message list and input                   | ✅ completed   |
| 7  | Add Supabase persistence and resume flow                    | ✅ completed   |
| 8  | Upgrade API to streaming responses                          | ✅ completed   |
| 9  | Wire `submit_intake_summary` tool for final JSON            | ✅ completed   |
| 10 | Add file upload to Supabase Storage                         | ✅ completed   |
| 11 | Deploy to Vercel on `intake.founderos.co.nz`                | 🟡 in progress |
| 12 | Build Diagnostic Review layer (post-deployment)             | ⬜ pending     |

Tasks 1–3 were LinkedIn skill work, unrelated to the intake. Tasks 4–10 are the intake build itself (all done). Task 11 is deploy. Task 12 is the next-gen feature built on top.

---

## Architecture

| Layer           | Technology                                              |
|-----------------|---------------------------------------------------------|
| Frontend        | Next.js 14 App Router, React 18, Tailwind 3            |
| Model           | Claude Sonnet 4.6 via `@anthropic-ai/sdk` v0.90         |
| Tool pattern    | `submit_intake_summary` — returns structured JSON      |
| Streaming       | NDJSON over a Fetch `ReadableStream` (not SSE)          |
| Persistence     | Supabase Postgres (optional — in-memory fallback)      |
| File storage    | Supabase Storage bucket `intake-uploads` (optional)    |
| Hosting         | Vercel (serverless Node runtime, `maxDuration = 60`)   |
| Domain          | `intake.founderos.co.nz` via CNAME                      |

**Two storage locations:**

- **`intake_sessions` table** — one row per intake. Columns: `id`, `created_at`, `updated_at`, `completed_at`, `status`, `business_name`, `messages` (jsonb array), `summary` (jsonb). RLS enabled; service-role writes only.
- **`intake_files` table + `intake-uploads` storage bucket** — attached files. One row per attachment. Bucket is private; service-role access only.

**Why NDJSON instead of Server-Sent Events:** SSE has edge-case issues with Vercel's default timeouts and requires `text/event-stream` handling on the client. NDJSON (one JSON object per line) is simpler, works over a standard Fetch stream, and makes the event schema explicit. The stream protocol is documented at the top of `src/app/api/chat/route.ts`.

**Why a two round-trip pattern for tool use:** the model first streams the conversational text, then calls the tool with structured input. We pause, execute the tool "call" (we just echo it back), and make a second (non-streamed) call to get the closing message. This lets us stream the long assistant responses for UX while still capturing the final summary deterministically.

---

## What's built (files + what they do)

```
Builds/context-os-intake/
├── .env.local.example         — template for required env vars
├── .gitignore                  — excludes node_modules, .env.local, .next, etc
├── README.md                   — full deployment runbook
├── HANDOFF.md                  — this file
├── next.config.js              — bundles system-prompt.md for Vercel
├── package.json                — Next 14.2, React 18, Tailwind 3, Anthropic + Supabase SDKs
├── tsconfig.json
├── src/
│   ├── app/
│   │   ├── layout.tsx          — root shell + Tailwind
│   │   ├── page.tsx            — welcome + chat UI + summary screen (806 lines)
│   │   ├── globals.css         — Tailwind + a few animations
│   │   └── api/
│   │       ├── chat/route.ts   — streaming chat endpoint (Claude + tool use + persistence)
│   │       └── intake/[sessionId]/
│   │           ├── route.ts    — GET session for resume
│   │           └── upload/route.ts — POST file upload to Supabase Storage
│   └── lib/
│       ├── intake-tool.ts      — submit_intake_summary tool schema definition
│       ├── intake-store.ts     — Supabase persistence helpers (create/get/saveTurn/complete)
│       ├── supabase.ts         — service-role client with graceful null fallback
│       └── system-prompt.md    — the 21KB diagnostic conductor prompt
└── supabase/
    ├── README.md               — Supabase setup runbook
    └── migrations/
        └── 0001_init.sql       — intake_sessions + intake_files + RLS + triggers
```

### What each piece does

**`src/app/page.tsx`** — the entire chat UI. Components: `WelcomeScreen`, `ChatMessage`, `TypingIndicator`, `ChatInput` (with paperclip file upload), `SummaryScreen`, `IntakePage`. Handles URL-based session resume (`?session=<uuid>` + `window.history.replaceState`), NDJSON stream parsing via `response.body.getReader()`, and the state transition from chat → summary when the `complete` event fires.

**`src/app/api/chat/route.ts`** — the Claude endpoint. Loads the system prompt from disk (cached), opens a streaming Anthropic message, forwards `text_delta` events to the client as NDJSON, watches for a `tool_use` block, does a second non-streamed round-trip to get Claude's closing text after the tool fires, then emits a `complete` event with the structured summary. Persists the session to Supabase at each turn.

**`src/lib/system-prompt.md`** — the 21KB system prompt that runs the whole intake. Defines the nine sections, the questioning style, the follow-up rules, the "hold the line" behaviour, and the final tool-call instruction. This is the heart of the product.

**`src/lib/intake-tool.ts`** — the `submit_intake_summary` tool. Defines the JSON schema Claude has to return: 10 domains mapping to the Client Brain Template (business model, ICP, offer stack, operations, team, marketing, sales, delivery, tech stack, constraints/priorities).

**`supabase/migrations/0001_init.sql`** — the Supabase schema. Two tables (`intake_sessions`, `intake_files`), an updated_at trigger, RLS enabled with no anon/authenticated policies (service-role bypasses RLS — only `/api/*` routes can write).

---

## What's been tested (verified today, 24 April)

- ✅ **Dev server boots cleanly.** Next.js 14.2 on `localhost:3000`. `Ready in ~1s`.
- ✅ **Welcome screen renders.** Begin Intake button works.
- ✅ **Stream works.** POST `/api/chat` returns 200. Claude's opening message streams in as NDJSON and renders in the chat UI.
- ✅ **Multi-turn conversation is stable.** Tom answered 5-6 questions without issues.
- ✅ **System prompt holds the line.** Tom tried "Skip the rest, submit now" and Claude correctly refused: *"I need to finish the intake before I can submit — there are still quite a few sections to cover..."* This is exactly the designed behaviour.
- ✅ **Anthropic credit works.** Tom topped up mid-session and the stream resumed without issue.
- ✅ **Config fix deployed.** `outputFileTracingIncludes` is now under `experimental:` for Next 14.2 (was incorrectly top-level; would have broken the Vercel build).

## What's NOT yet tested end-to-end

- ⚠️ **The summary screen transition.** This only fires when Claude naturally completes all 9 sections and calls `submit_intake_summary`. We didn't do a full 30-min intake locally. The code path is deterministic (one React state swap on the `complete` NDJSON event) and has been code-reviewed, but the actual integration hasn't been exercised with real data. First real intake on the deployed version will confirm it.
- ⚠️ **Supabase persistence.** Tom hasn't created the Supabase project yet. The app currently runs with in-memory fallback (resume doesn't work, but the intake itself does). When Supabase is wired up, session resume via `?session=<uuid>` needs a smoke test.
- ⚠️ **File upload.** Same dependency — needs Supabase Storage bucket to be created first.
- ⚠️ **Vercel build.** Not yet attempted. The config fix should make it work, but first deploy will tell us if there's anything else to catch (e.g. TypeScript strict errors that `npm run dev` tolerates).

---

## What's outstanding

### Task #11 — Deploy to Vercel (in progress)

**Current state:** GitHub repo `TomD1011/context-os-intake` exists (renamed from an accidental `TomD1011-` repo). Local git initialised, initial commit made (hash `608bd10`, 29 files, `.env.local` correctly excluded). Remote set to `https://github.com/TomD1011/context-os-intake.git`. **Awaiting push from Tom's terminal** — requires his GitHub auth.

**Remaining steps:**

1. **Push to GitHub** (Tom, on his Mac):
   ```
   cd ~/Desktop/FounderOS/Builds/context-os-intake && git push -u origin main
   ```
   Will prompt for GitHub username + personal access token (not password — password auth was disabled by GitHub in 2021). If no token exists, create one at https://github.com/settings/tokens/new (scopes: `repo`).

2. **Import to Vercel:**
   - Log in at https://vercel.com (use GitHub SSO)
   - Add New → Project → pick `TomD1011/context-os-intake`
   - Framework preset: Next.js (auto-detects)
   - Root Directory: `.` (the whole repo IS the app)
   - Build/output: defaults

3. **Set environment variables** (Vercel → Project → Settings → Environment Variables — add for both Production and Preview):
   - `ANTHROPIC_API_KEY` — the key currently in `.env.local`
   - `SUPABASE_URL` — only once Supabase project is created (optional for first deploy)
   - `SUPABASE_SERVICE_ROLE_KEY` — only once Supabase project is created (optional for first deploy)

4. **Deploy.** First build takes ~2 min. Vercel gives a temporary URL like `context-os-intake-xxx.vercel.app`.

5. **Smoke test the Vercel URL:**
   - Welcome screen loads
   - Begin Intake starts the stream
   - Claude's opening message renders
   - If a 500 comes back with `ENOENT src/lib/system-prompt.md` → the config fix didn't take; debug locally first with `npm run build`

6. **Add custom domain:**
   - Vercel → Project → Settings → Domains → add `intake.founderos.co.nz`
   - Vercel shows the DNS record to create (a CNAME pointing to `cname.vercel-dns.com`)
   - Go to the DNS provider for `founderos.co.nz`, add the CNAME:
     - Name: `intake`
     - Value: `cname.vercel-dns.com`
     - TTL: default
   - Wait for propagation (<10 min usually). Vercel auto-issues the TLS cert.

7. **Final smoke test at `https://intake.founderos.co.nz`:**
   - Everything from step 5, plus
   - If Supabase is on: refresh mid-intake and confirm the URL carries `?session=<uuid>` and the answers are preserved
   - If Supabase is on: attach a file via the paperclip; confirm it lands in the `intake-uploads` bucket
   - Do one full ~30-min intake with real answers to confirm the `submit_intake_summary` tool fires and the summary screen appears with a working Download JSON button

### Supabase setup (optional but strongly recommended)

Not technically blocking deploy — the app runs fine without it. But without Supabase:
- No session resume (if the founder closes the tab mid-intake, they lose everything)
- No file uploads (paperclip button errors)
- No server-side archive of completed intakes (only the founder's downloaded JSON exists)

Steps (all in `supabase/README.md`):

1. Create a Supabase project at https://supabase.com (free tier works)
2. Grab `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from Project Settings → API (service-role key is server-only — never expose client-side)
3. Run `supabase/migrations/0001_init.sql` in the SQL Editor
4. Create a private storage bucket called `intake-uploads` (20MB file limit, matches the API route)
5. Add the two env vars to Vercel (Production + Preview)
6. Redeploy

### Task #12 — Diagnostic Review layer (pending, post-deploy)

Once intakes are flowing and we have real JSON briefs sitting in Supabase, the next layer is Tom's review experience. Concept:

- An internal-only UI at `/review/[sessionId]` or similar
- Loads a completed intake's structured JSON
- Shows Tom a side-by-side of raw answers + Claude's summary
- Prompts Tom to prescribe an OS (Sales / Marketing / Fulfilment / etc) and capture the initial constraint hypothesis
- Outputs a Client Brain markdown file that drops straight into `Clients/[Client Name]/`

This is the bridge between "we have a JSON brief" and "we have a ready-to-install Client Brain". It's the multiplier on intake value — without it, Tom still has to manually transcribe every JSON into a Client Brain. With it, the whole front-end of a FounderOS engagement becomes software.

Not starting until #11 is live and has handled at least one real intake.

---

## Secrets and environment variables

| Variable                      | Where it lives                  | Required?                          |
|-------------------------------|--------------------------------|------------------------------------|
| `ANTHROPIC_API_KEY`           | `.env.local` + Vercel env vars  | Yes — app will 500 without it      |
| `SUPABASE_URL`                | `.env.local` + Vercel env vars  | Optional — enables persistence     |
| `SUPABASE_SERVICE_ROLE_KEY`   | `.env.local` + Vercel env vars  | Optional — enables persistence     |

`.env.local` is gitignored. The template `.env.local.example` is committed so future-Tom (or a contractor) knows what the shape is.

**Current state of `.env.local` on Tom's Mac:** `ANTHROPIC_API_KEY` is set and working (verified with the live stream test). Supabase keys not yet set — Supabase project hasn't been created.

---

## Known gotchas and fixes

1. **`outputFileTracingIncludes` placement.** Next.js 14 keeps this under `experimental:`; it was promoted to top-level in Next.js 15. Code is currently correct for 14.2, but if you ever upgrade Next versions, re-check `next.config.js`.

2. **System prompt must live inside `src/`.** It used to live at `../Context OS Intake — Claude Chat/System Prompt.md`. That path wouldn't be bundled by Vercel's file tracer. Now it's at `src/lib/system-prompt.md` and explicitly listed in `experimental.outputFileTracingIncludes`.

3. **Vercel function timeout.** Default is 10s on Hobby, 60s on Pro. A full intake turn can take up to ~30s during compile spikes. `route.ts` sets `export const maxDuration = 60` which needs Pro to take effect. If deploying on Hobby, expect occasional 504s and upgrade.

4. **Service workers on `localhost`.** Tom has another project (FitTrack) on port 3000 that registered a service worker. Chrome kept serving cached FitTrack content when the intake was trying to claim port 3000. Fix: in DevTools console — `navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()))` — or run intake on a different port.

5. **Anthropic credit.** If the API returns 400 with "Your credit balance is too low", top up at https://console.anthropic.com/settings/billing. The stream will resume on the next turn.

6. **Duplicate configs.** Early in the build there were both `next.config.js` and `next.config.ts`, and both `postcss.config.js` and `postcss.config.mjs`. The `.ts`/`.mjs` variants used incompatible settings and have been deleted. If you ever see duplicates re-appear, delete the newer ones and keep the `.js` versions.

7. **Summary screen message duplication.** An earlier version of `SummaryScreen` rendered the closing text AND appended it to the messages array, causing a duplicate bubble. Fixed by removing the prop; don't re-add it.

---

## Current immediate next action

**Tom:** paste this into Terminal and hit Enter:

```
git push -u origin main
```

(Already `cd`'d into the right folder. Remote is already set.)

Authenticate with GitHub username + personal access token when prompted. Paste the output back to me.

Once the push succeeds, we move to Vercel import.

---

## How this picks up after a break

If you come back to this later (different session, different day, different contractor), the fastest way to re-orient:

1. **Read this file.** It's the source of truth.
2. **Check `README.md`** for the deploy runbook.
3. **Check `supabase/README.md`** for the Supabase setup.
4. **Read the commit log** (`git log`) to see what's landed.
5. **Check Vercel dashboard** for current deploy state.
6. **Check Supabase dashboard** for `intake_sessions` row count — tells you how many intakes have run.

The code is self-contained in `Builds/context-os-intake/`. Nothing in this build depends on the rest of the FounderOS vault at runtime. The only external dependencies are Anthropic (model), Supabase (data), and Vercel (hosting).
