# Command Center Hub

## MANDATORY AGENT STARTUP

Before any task on this repository, read, in order: [`MASTER_PROJECT_HANDOFF.md`](MASTER_PROJECT_HANDOFF.md), [`OWNER_WORKING_PROFILE.md`](OWNER_WORKING_PROFILE.md), [`OWNER_PROTECTION_AND_BUDGET_POLICY.md`](OWNER_PROTECTION_AND_BUDGET_POLICY.md), and [`PROJECT_HANDOFF.md`](PROJECT_HANDOFF.md). See [`AGENTS.md`](AGENTS.md) for the full execution rules.

Private internal operations application for RelaxFix UAE. This repository is independent from the public Relax Fix UAE website and must never be used to modify or deploy that site.

## Current capabilities

- Staff authentication through Supabase Auth plus one active `staff_profiles` record.
- Operational dashboards for Command Center, AI Inbox, CRM, automation status, Content Studio, Bookings, Media Library, Analytics, and Integrations.
- Controlled writes only through approved RPCs for booking status, CRM workflow, conversation mode, and content review/scheduling transitions.
- Explicit confirmation, UI RBAC, duplicate-write locking, safe session expiry, and RPC-side audit logging.
- No real outbound messaging or direct publishing interface.

The authoritative current status and next action are in [PROJECT_HANDOFF.md](PROJECT_HANDOFF.md).

## Local verification

Requirements: Node.js 22 (CI runtime; Node.js 20 or newer is supported by the package contract) and npm.

```bash
npm ci --ignore-scripts
npm run verify
```

`npm run verify` runs TypeScript validation, all contract tests, the production build, and the initial-load performance budget.

Run `npm run deps:check` to report outdated direct/transitive packages and known vulnerabilities. It requires dependencies to be installed and npm registry access; it is read-only, never updates packages or the lockfile, and exits nonzero when it finds issues.

## Browser-safe environment contract

Copy `.env.example` to an untracked local `.env` and provide:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY` (preferred)
- `VITE_SUPABASE_ANON_KEY` (legacy fallback only; JWT role must be `anon`)
- `VITE_STAFF_PROFILE_TABLE`

Never place a secret key, service-role key, database password, webhook secret, or provider credential in a `VITE_*` variable. The application rejects unsafe or malformed API keys and fails closed when configuration or staff authorization is invalid.

## Data and mutation boundary

Operational reads use existing staff RPCs. The only direct REST table access is the read-only active staff-profile authorization check. Approved mutations are limited to:

- `update_booking_request_status`
- `update_staff_lead_workflow`
- `set_staff_conversation_mode`
- `update_staff_content_item`
- `transition_staff_content_item`

The browser must not write directly to tables. Do not add migrations, RLS/policy changes, cron, workers, service-role access, publishing secrets, or production-setting changes through feature work in this repository.

## Documentation map

- [Current handoff](PROJECT_HANDOFF.md)
- [Final audit](docs/FINAL_AUDIT.md)
- [Final security review](docs/FINAL_SECURITY_REVIEW.md)
- [Performance review](docs/PERFORMANCE_REVIEW.md)
- [Documentation review](docs/DOCUMENTATION_REVIEW.md)
- [Standalone architecture and rollback](docs/STANDALONE_MIGRATION_HANDOFF.md)
- Feature evidence: [AI Inbox](docs/AI_INBOX_HANDOFF.md), [Bookings](docs/BOOKINGS_OPERATIONS_HANDOFF.md), [Content Studio](docs/CONTENT_STUDIO_HANDOFF.md), [Media Library](docs/MEDIA_LIBRARY_HANDOFF.md), [Analytics](docs/ANALYTICS_HANDOFF.md), [Integrations](docs/INTEGRATIONS_HANDOFF.md), and [System Polish](docs/SYSTEM_POLISH_HANDOFF.md)

`BASELINE_GOVERNANCE.md` and `AUDITED_BASELINE_CONTENT_MANIFEST.md` are retained as historical provenance records. They are not the current implementation plan.
