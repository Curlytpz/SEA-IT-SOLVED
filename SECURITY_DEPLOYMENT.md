# SEA-IT-SOLVED production security checklist

This checklist is the deployment contract for the current Vercel frontend, Render backend, and Supabase PostgreSQL topology. It does not replace provider-specific access controls.

## Before the first production start

1. Back up the Supabase database.
2. Apply `backend/src/db/migration_student_email_verification.sql` with a migration-capable, restricted database account. The migration must complete before new student registrations are accepted.
3. Confirm FFmpeg and FFprobe are installed in the Render runtime, or set `FFMPEG_PATH` and `FFPROBE_PATH` to executable paths.
4. Configure a production mail provider (`resend`, `gmail_smtp`, or `microsoft_graph`). The development transport intentionally does not expose student-verification links.

## Required Render environment

- `NODE_ENV=production`
- `FRONTEND_URL=https://<the exact Vercel hostname>`
- `TRUST_PROXY_HOPS=1` only when Render is the sole trusted proxy directly in front of Express
- a unique `JWT_SECRET` of at least 32 random characters
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD` for a least-privilege application role
- `GEMINI_API_KEY`
- production mail-provider credentials and `MAIL_FROM`
- `STUDENT_EMAIL_DOMAIN` and `INSTRUCTOR_EMAIL_DOMAIN`

The backend fails startup when production secrets, HTTPS origin, mail provider, database password, or explicit proxy-hop configuration are missing. Do not set `trust proxy=true`. If another proxy or tunnel is inserted, recalculate the numeric hop count and verify `req.ip` using a controlled request before deployment.

## Network and origin controls

- Keep the Render origin private where the platform permits it; otherwise restrict access to the intended public API path and monitor direct-origin traffic.
- Allow CORS only from the exact `FRONTEND_URL`.
- Enforce HTTPS at Vercel and Render.
- Never expose PostgreSQL publicly beyond the Supabase connection policy required by Render.
- Use separate development and production credentials for the database, Gemini, and email provider.

## Resource limits

- Keep capture aggregate and concurrency limits conservative for the Render instance size.
- Keep `AI_MAX_PENDING_REQUESTS`, `AI_MAX_PENDING_PER_USER`, and `AI_QUEUE_TIMEOUT_MS` bounded.
- Keep recognition count/aggregate limits below the worker memory budget.
- Keep transcription duration, FFmpeg timeout, and output-size limits below the worker CPU/disk budget.
- Process-local concurrency limits assume one backend process. If Render is scaled horizontally, add a shared queue/admission controller before increasing instance count.

## Storage status

Protected uploads still use the project's existing storage abstraction. Migrating them to Supabase Storage is deliberately deferred; it must be a separate change with private buckets, short-lived signed access, server-side ownership checks, retention rules, and deletion reconciliation. Do not point public buckets at current storage keys.

## Release verification

Run the backend focused security tests, student-email/password-reset verification scripts, affected frontend tests, production build, configuration validation, dependency audits, and `git diff --check`. Exercise registration, verification, login, capture upload, recognition, transcription, AI generation, and password reset against a staging deployment before production traffic.
