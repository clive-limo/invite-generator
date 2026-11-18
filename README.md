# Chenah Invites

Upload an invitation design, mark the fields that change per guest, and share a link. Anyone with the link can fill in the fields and download a print-ready PNG (or PDF) in one tap — or upload a CSV/Excel guest list and download a ZIP of personalised PNGs (or PDFs).

- **Rendering happens in the browser.** Invites are drawn on the guest's device at the template's full resolution (tagged 300 DPI) and downloaded directly. Nothing generated is uploaded or stored.
- **The server stores only template images** (Cloudflare R2) and metadata (Postgres): templates, published versions, share links, and an activity log of submitted values so owners can re-download any invite.

## Stack

Next.js 16 (App Router, Cache Components) · React 19 · Tailwind v4 + shadcn/ui · Prisma 7 + Postgres (Neon in production) · Better Auth (email/password, optional Google) · Resend · Cloudflare R2 via `aws4fetch` · Vitest · Playwright.

## Local development

Requirements: Node 20.9+, Docker.

```bash
npm install                 # also runs `prisma generate`
cp .env.example .env.local  # fill in BETTER_AUTH_SECRET at least (openssl rand -base64 32)
npm run db:up               # Postgres in Docker
npm run db:migrate          # apply migrations
npm run dev
```

Without R2 credentials, uploads use a **local development storage driver** (files under `.data/storage`, served by `/api/dev-storage` with signed URLs). It is disabled in production.

Email confirmation is **off** for now — new accounts are signed in immediately. Set `REQUIRE_EMAIL_VERIFICATION=true` to turn it on.

**Private beta:** only the accounts in `lib/beta-allowlist.ts` can sign up or sign in (email or Google); anyone else is told the product is still in beta. `BETA_ALLOWLIST` adds more, comma-separated, as addresses or `@domain`. `.env.development` (loaded by `next dev` only) allows `@example.com` so the e2e tests can create accounts.

Without `RESEND_API_KEY`, password-reset (and, if enabled, verification) emails are **printed to the dev server log** — copy the link from there.

### Tests

```bash
npm test            # unit tests (layout engine, validation, CSV mapping, PNG DPI, PDF writer…)
npx playwright install chromium webkit
npm run test:e2e    # full flow on desktop Chrome, iPhone 14 (WebKit) and Pixel 7
```

The e2e suite needs the database running; it starts the dev server itself if one isn't already on port 3000.

## How it fits together

| Path | What it does |
|---|---|
| `lib/render/layout.ts` | Pure text layout: wrapping, auto-shrink, ellipsis, alignment, letter spacing. |
| `lib/render/draw.ts` | Draws a template + values onto any 2D canvas. Used for both the live preview and the full-resolution export. |
| `lib/render/worker.ts`, `client.ts` | Full-resolution rendering in a Web Worker (`OffscreenCanvas`), falling back to the main thread. |
| `lib/render/encode.ts`, `pdf.ts` | Encodes a finished canvas: a PNG tagged 300 DPI (the main download), or a single-page PDF at the template's print size (JPEG inside, no dependency). |
| `lib/render/png-dpi.ts` | Adds a 300 DPI `pHYs` chunk to canvas-encoded PNGs. |
| `lib/claims.ts` | The only server step in generation: validate values, rate-limit, reserve link quota, log, return a short-lived URL for the original image. |
| `lib/bulk/` | CSV/XLSX parsing and ZIP output: downloads directly, in ≤150 MB parts for very large lists (on iOS each part waits for a Save tap). |
| `lib/storage/` | R2 (production) and local-disk (development) drivers behind one interface. |
| `components/editor/` | The field editor: drag, resize, rotate, snapping, undo/redo, properties panel. |

The look follows Postman's design language on a warm light palette: tokens live in `app/globals.css` (parchment background, cream surfaces — nothing pure white — signal orange `--brand`, `--brand-ink` for orange text), with Inter / Inter Tight / IBM Plex Mono and an `eyebrow` utility for the mono uppercase labels. Dark mode uses Postman's own warm-dark palette.

Templates are capped at 16 megapixels (iOS Safari's canvas limit) — e.g. 4000 × 4000, or A4 at 300 DPI (2480 × 3508).

## Deploying (Vercel + Neon + R2)

1. **Postgres:** create a Neon project (or add Neon from the Vercel Marketplace). Set `DATABASE_URL` (pooled) and `DIRECT_URL` (direct). Vercel builds with `scripts/vercel-build.sh` (set in `vercel.json`), which runs `prisma migrate deploy` on production deploys only, so the schema is created on the first deploy and kept current after.
2. **R2:** create a bucket and an API token with Object Read & Write on it. Set `R2_ENDPOINT` (`https://<account-id>.r2.cloudflarestorage.com`), `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`.
   - **CORS** (bucket → Settings → CORS policy) — required so browsers can upload and canvases can read images:
     ```json
     [
       {
         "AllowedOrigins": ["https://your-app.vercel.app"],
         "AllowedMethods": ["GET", "PUT", "HEAD"],
         "AllowedHeaders": ["content-type"],
         "MaxAgeSeconds": 3600
       }
     ]
     ```
   - **Lifecycle rule:** delete objects with prefix `pending/` after 1 day (abandoned uploads).
3. **Auth & email:** set `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` and `NEXT_PUBLIC_APP_URL` to the production URL, `RESEND_API_KEY` and `EMAIL_FROM` (a verified Resend domain). Optional Google: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXT_PUBLIC_GOOGLE_ENABLED=true` (redirect URI: `<app>/api/auth/callback/google`).
4. **Misc:** `IP_HASH_SECRET`, and `CRON_SECRET` for the daily cleanup in `vercel.json` (purges activity older than `ACTIVITY_RETENTION_DAYS`, default 90).

Vercel's Hobby plan is for non-commercial use; use Pro for a company deployment.
