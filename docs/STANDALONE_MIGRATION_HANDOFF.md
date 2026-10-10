# Standalone Command Center Migration Handoff

## Status

- Target repository: `aymanmahrous/command-center-hub` (private)
- Public production repository: `aymanmahrous/swim-fluent-uae`
- Public production deployment: unchanged
- Standalone deployment: `command-center-hub-lilac.vercel.app`
- Database migrations in this repository: not executed
- External messages or publishing: not executed

## Completed

1. A standalone Vite + React + TypeScript application is deployed independently from the public website.
2. Supabase Auth uses a browser-safe publishable key.
3. Authorization requires one active `staff_profiles` row whose primary key `id` equals `auth.uid()`.
4. Operational sections read through staff-only Supabase RPC functions:
   - Command Center
   - AI Inbox
   - CRM
   - Automations status
   - AI Content Studio
   - 30-Day Planner / bookings
   - Media Library
   - Analytics
   - Integrations / operations queue
5. Passwords are never persisted. Only the access token is held in `sessionStorage`; user and active staff authorization are revalidated during restoration.
6. CI verifies TypeScript, security-contract tests, and the production build.
7. Search indexing is blocked and deployment security headers are declared.

## Controlled write boundary

Controlled writes are limited to the existing approved RPCs for booking status, CRM workflow, conversation mode, and content review/scheduling. The first introduced write was the booking-request status transition through:

`update_booking_request_status(p_booking_request_id uuid, p_status text)`

Safety controls:

- UI write roles: `super_admin`, `admin`, `reception`.
- Database function independently rechecks the same active-staff roles.
- Allowed statuses: `pending`, `contacted`, `confirmed`, `declined`, `cancelled`.
- The browser never performs a direct table update.
- Every successful change inserts `booking_request_status_updated` into `audit_logs`.
- The user must explicitly confirm before the request is sent.
- A failed or rejected request is not represented as successful.
- No email, WhatsApp, publishing, cron, worker, or background job is triggered by this operation.

Media Library, Analytics, Integrations, Command Center summary, and automation status remain read-only. No interface sends real messages or publishes content.

## Environment contract

Only browser-safe variables may be used:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY` (preferred)
- `VITE_SUPABASE_ANON_KEY` (legacy `anon`-role fallback only)
- `VITE_STAFF_PROFILE_TABLE`

Never place a service-role key, database password, or server secret in a `VITE_*` variable.

## Required staff profile contract

- `id` UUID primary key matching `auth.uid()`
- `display_name` text
- `role`: `super_admin`, `admin`, `reception`, `coach`, or `content_manager`
- `active` boolean

## Rollback

Application rollback: redeploy the previous successful Vercel deployment or revert the booking-write merge commit.

Data rollback for a mistaken booking transition: an authorized staff member selects the previous valid status through the same audited RPC. The original and corrective actions remain visible in `audit_logs`.

The public production website remains unaffected by application rollback.
