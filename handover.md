# Handover — context from a previous session

> **What this file is:** notes written at the end of an earlier Claude Code session that built this project from scratch (2026-11-17). They aren't instructions from the user. Treat them as background to get oriented quickly.
>
> **How to use it:**
> 1. Read this file top to bottom. Read `README.md` for setup and deployment.
> 2. Check the "Current state" section against reality before relying on it: run `git status`, `npm test` and `docker ps`. Things may have changed since this was written.
> 3. Ask the user what they want to work on next. "Possible next steps" lists candidates, not commitments.
> 4. When this file is out of date, update it or delete it. Don't let it drift.

---

## The goal

This is a web app for personalised invitations:

1. A signed-in **owner** uploads an invite design as an image and marks fillable **text fields** on it in an editor (position, font, colour, alignment, auto-shrink).
2. The owner **publishes** it and creates **share links**.
3. Anyone with a link fills in the fields and downloads a **high-resolution PNG**, or **bulk-generates** from a CSV/XLSX file into a ZIP.
4. It must look good on **mobile and desktop**.

The original plan is at `~/.claude/plans/create-a-plan-to-synthetic-nova.md`. A few details changed during the build; this file reflects what was actually built.

## User constraints and preferences (important)

- **This project is standalone.** Don't read or borrow patterns from sibling repos in `~/dev-files/` such as `green-voyage-dmrv`. The user objected to that explicitly.
- **AWS cannot be used.** No S3, no `@aws-sdk/*`, no Amplify. Storage is **Cloudflare R2**, signed with `aws4fetch`. Vercel and Neon running on AWS underneath is fine.
- Hosting: **Vercel** + **Neon Postgres**. Auth: **multi-user accounts**.
- **Bulk generation is available to anyone with a link.** It's toggled per link via `maxBulkRows`, where 0 turns it off.
- **Email confirmation is OFF for now** (user request). It's controlled by `REQUIRE_EMAIL_VERIFICATION=true`; the code paths are kept.
- Field types: only **text / multi-line text** so far. The user skipped the question about photo, QR and date fields.
- The user hasn't asked for commits. **Nothing has been committed** beyond the create-next-app initial commit. Don't commit unless asked.
- Persistent memory for this project lives in `~/.claude/projects/-Users-clive-dev-files-invite-generator/memory/`, holding the standalone and no-AWS notes.

## Session 2 (2026-11-18): redesign + one-tap downloads

- **Design language** now follows postman.com on a warm light palette (default theme is light; nothing is pure white). The tokens are in `app/globals.css`: `--brand` is signal orange for fills, `--brand-ink` is orange text, `--surface` is for recessed bands, and `eyebrow`, `bg-grid`, `bg-contours` and `glow-warm` are utilities. Fonts are Inter, Inter Tight (headings) and IBM Plex Mono. Dark mode is Postman's warm-dark palette. Owner pages use `components/app/page-header.tsx`.
- **Guests download directly.** On a share link, **Download PNG** renders and downloads, then clears the form. Bulk **Download ZIP** downloads straight away, with no save dialog, then clears the uploaded list. A "Last batch" card keeps "download again" plus the failed and skipped CSVs. On iOS the ZIP still waits for a Save tap and the form clears afterwards.
  - **PNG is the main format, PDF the secondary.** Guests get **Download PNG** plus an outline **Download PDF** (just "PDF" in the phone bar), and bulk gets **Download ZIP · N invites** (PNGs) plus an outline **Download ZIP of PDFs**. The owner's Generate tab reuses these components. The editor's Test download and Activity's re-download are PNG only.
  - `Renderer.render(values, format = "png")`. PDFs come from `lib/render/pdf.ts` (single page at print size, JPEG embedded as-is) via `encode.ts`. PDF bulk runs show a spinner instead of a live thumbnail, since an `<img>` can't show a PDF.
  - The e2e test covers both: the PNG and the JPEG inside the PDF are compared with the same goldens. Downloading the same single invite again as a PDF isn't counted twice in Activity (the existing 24h repeat dedupe), so the count there is 19.
- **App name is "Chenah Invites"**: logo (`components/brand.tsx`), page titles, the guest-page footer, email sender and reset-email text. The landing page's mock share URL still reads `invites.app/…` until there's a real domain.
- **Gotcha:** the running `next dev` once kept serving an old `globals.css` compile after the file was rewritten, with no error shown. Any real content edit to the file, for example adding and then removing a line, made it recompile. `touch` was not enough.
- **Private beta.** Only `clivelimo84@gmail.com` and `chenahdiana001@gmail.com` (`lib/beta-allowlist.ts`) can sign up or sign in. Everyone else gets "still in beta" (`lib/beta.ts`, code `BETA_ACCESS_ONLY`).
  - Enforced in `lib/auth.ts`: a `hooks.before` refuses `/sign-up/email` and `/sign-in/email` up front; `databaseHooks.user.create` and `session.create` cover Google and any account made before the beta. Google failures redirect to `/sign-in?error=CODE`, which the form maps to a message.
  - `BETA_ALLOWLIST` (env) adds addresses or `@domain`. The committed `.env.development` allows `@example.com` for the e2e tests; production builds never load it.
  - Tests: `tests/unit/beta.test.ts`, `tests/integration/beta.test.ts` (the database hooks) and an e2e test that a stranger sees the message on sign-up and sign-in.

## Current state (at first hand-over)

- **The feature set in the plan is complete and verified.** 33 changed or new paths are uncommitted on `main`.
- **Local infrastructure left running:**
  - Docker Desktop was started by the previous session.
  - Postgres container `invite-generator-postgres-1` (from `docker-compose.yml`).
  - The dev server on `http://localhost:3000`, which was a background task of that session and is probably gone now.
- **Database:** one migration, `prisma/migrations/20261117195149_init`.
- **`.env.local`** exists with local values (DB URL, generated secrets). It's gitignored. There are no R2, Resend or Google credentials yet, so the **local storage driver** is in use (`.data/storage`).
- **Verification last run, all green:**
  - `npx tsc --noEmit` is clean.
  - `npx eslint .` is clean apart from 1 known warning: `react-hooks/incompatible-library` on TanStack Virtual, which is harmless.
  - `npm test`: 34 unit tests.
  - `npm run test:integration`: 7 DB tests, including concurrent quota reservation.
  - `npx next build` passes. Every app route is "◐ Partial Prerender".
  - `npx playwright test e2e/flow.spec.ts`: 6/6 across desktop-chrome, iphone-14 (WebKit) and pixel-7. Each project has a pixel golden of the exported PNG in `e2e/flow.spec.ts-snapshots/`.

## Stack and versions

| | |
|---|---|
| Framework | Next.js **16.4.6**, App Router, `cacheComponents: true`, `partialPrefetching: true`, Turbopack. React 19.3. |
| UI | Tailwind v4 via `@tailwindcss/turbopack` (no PostCSS config). shadcn/ui, style "radix-nova": components in `components/ui`, `cn` comes from the `cn` package. lucide, sonner, vaul. |
| DB | Prisma **7** (`prisma.config.ts`, generator `prisma-client` → `lib/generated/prisma`, `@prisma/adapter-pg`). Postgres 17 locally, Neon in production. |
| Auth | Better Auth 1.7 (email/password; Google if env set), Prisma adapter, `nextCookies()` plugin. Resend for email; logs to the console when there's no key. |
| Storage | R2 via `aws4fetch` (`lib/storage/r2.ts`), plus a dev-only local driver (`lib/storage/local.ts` + `app/api/dev-storage/[...key]`). |
| Tests | Vitest 4 (unit + integration configs), Playwright 1.65. |

**Next 16 is newer than model training data.** `AGENTS.md` says to read `node_modules/next/dist/docs/` before writing Next code. Lessons learned:

- **Data access needs a boundary.** Request or DB access must sit inside `<Suspense>` or a `loading.tsx` boundary. Segment config such as `dynamic` and `revalidate` errors.
- **Loading boundaries must be at the leaf.** Each leaf page under `app/(app)/templates/[id]/*` has its own `loading.tsx`. A shared parent `loading.tsx` doesn't cover client navigation between sibling pages, and the dev server logs "uncached data during prerendering or a navigation".
- **Layouts are not the auth gate.** Auth is checked in `lib/session.ts` (`requireUser`) inside pages and server actions, and `proxy.ts` (formerly middleware) only does an optimistic cookie redirect.
- **Global helper types:** `PageProps<'/route'>`, `LayoutProps`, `RouteContext<'/route'>`. Run `npx next typegen` after adding routes.
- **Server actions:** `refresh()` and `revalidatePath(path, "layout")` come from `next/cache`.
- **React compiler lint rules apply.** No ref writes during render (use `useEffectEvent`), no setState in effects (use drafts or `useSyncExternalStore`), no `Date.now()` in render.

## Architecture in one page

- **Rendering happens in the browser and outputs are never stored.**
  - `lib/render/layout.ts` is the pure text layout (wrap, binary-search auto-shrink, ellipsis, manual letter spacing, alignment).
  - `lib/render/draw.ts` draws onto any 2D context in template coordinates × `scale`. The live preview (`components/invite/preview-canvas.tsx`, over a ≤1600px preview image) and the full-resolution export use the same code.
  - The export runs in `lib/render/worker.ts` (OffscreenCanvas). `lib/render/client.ts` falls back to the main thread.
  - `lib/render/png-dpi.ts` adds the 300 DPI pHYs chunk.
  - `lib/render/decode.ts` handles old-Safari `imageOrientation`.
- **Claim flow** (`lib/claims.ts`). This is the only server step in generation:
  1. Validate values with the dynamic zod schema from `lib/fields/validate.ts`.
  2. Postgres rate limit (`lib/ratelimit.ts`).
  3. **Atomic quota reservation** with an `UPDATE … WHERE generationsUsed + n <= maxGenerations`.
  4. Log `Generation` / `BulkRun` rows.
  5. Return a signed URL for the original, stable for an hour so it can be cached, plus cleaned values.

  Endpoints are `POST /api/i/[token]/claim` (public) and `POST /api/templates/[id]/claim` (owner, no quota).
- **Upload** (`lib/upload/ingest-client.ts`, `components/upload/template-upload.tsx`):
  1. In the browser: decode, cap at 16 MP, bake EXIF rotation into a PNG, and build the preview and thumbnail.
  2. Presigned PUTs to `pending/{uploadId}/…`.
  3. `finalizeUploadAction` sniffs the real size and type with `image-size`, copies to `templates/{id}/…` and creates the Template.
- **Versions:** the editor autosaves `Template.draftFields`. **Publish** snapshots `TemplateVersion`, and links always serve the published version.
- **Bulk** (`components/bulk/bulk-generator.tsx`, `lib/bulk/*`):
  1. Parse CSV/XLSX in the browser.
  2. Auto-map columns, review rows (fix or skip), set the filename pattern.
  3. Claim, then render rows one by one.
  4. `lib/bulk/zip-output.ts` either streams to disk via `showSaveFilePicker` (Chromium desktop) or builds ZIP **parts**. Parts auto-download, except on iOS, where they wait for a **Save** tap and generation pauses when 2 are unsaved.
- **Editor** (`components/editor/*`): a zustand store with its own undo history (`checkpoint()` once per gesture, then `patchField`). The stage handles drag, resize in the rotated frame, rotate, snapping, drag-to-draw on desktop and pinch zoom. Mobile uses a bottom bar plus a vaul drawer.
- **Data model** (`prisma/schema.prisma`): Better Auth tables, Template, TemplateVersion, ShareLink, Generation, BulkRun, RateLimit. A daily cron (`app/api/cron/cleanup`, `vercel.json`) purges activity older than `ACTIVITY_RETENTION_DAYS`.

## Running things

```bash
npm run db:up && npm run db:migrate   # Postgres in Docker (Docker Desktop must be running)
npm run dev                           # http://localhost:3000
npm test                              # unit
npm run test:integration              # needs the DB
npx playwright test e2e/flow.spec.ts  # e2e on 3 devices (starts dev server if none)
E2E_CHROME=1 npx playwright test ...  # use installed Google Chrome instead of bundled Chromium
SHOTS_DIR=/abs/dir E2E_CHROME=1 npx playwright test e2e/screens.spec.ts --project=desktop-chrome  # screenshot tour for visual review
```

## Known issues and caveats

- **WebKit-only console message.** In Playwright's WebKit (iphone-14 project), the owner context logs "Failed to fetch RSC payload for /dashboard … access control checks" after sign-in. Next.js falls back to a full navigation and the tests pass. The root cause wasn't investigated, and it's unknown whether real iOS Safari shows it.
- **The network on this machine is slow.** npm installs took minutes and the GitHub API was rate-limited. Run long installs in the background.
- **Not verified against real cloud services:**
  - R2 signing is only unit-tested offline (`tests/unit/r2.test.ts`); no real R2 bucket has been used.
  - Resend has never actually sent an email.
  - Nothing has been deployed to Vercel or Neon.
- **Quotas are a soft guard.** Rendering happens on the guest's device, so someone holding the signed original could render more. This trade-off was accepted in the plan.
- **Hobby plan restriction.** Vercel Hobby is non-commercial; a company deployment needs Pro.

## Possible next steps (ask the user first)

1. **Commit the work.** Only if asked; suggest a branch or a sensible split.
2. **Deploy.** Create the R2 bucket (CORS + `pending/` lifecycle rule, see README), Neon, Resend and the Vercel env vars, then smoke-test with real R2. The dev storage driver is disabled in production.
3. **More field types.** Photo upload with circle/rect crop, QR code, date with formatting. `fieldSchema` in `lib/fields/schema.ts` is already a discriminated union, and `draw.ts` and the forms would need branches.
4. **Other candidates:**
   - Custom font uploads.
   - Link passcodes.
   - Team workspaces.
   - Replacing a template's image while keeping its fields.
5. Investigate the WebKit RSC message above.
6. Re-enable email confirmation before launch if wanted: `REQUIRE_EMAIL_VERIFICATION=true` plus `RESEND_API_KEY`.
