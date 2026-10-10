# Integrations Operations Handoff

Document status: historical stage evidence. PR #14 was merged after successful protected CI and independent approval on 2026-07-22.

## Scope

- Replaced the generic Integrations JSON rendering with a dedicated operational health view.
- Reads only through the existing `get_staff_operations_queue` RPC.
- Validates `followUps`, `backgroundJobs`, and `generatedAt` before rendering.
- Adds status/search filters, combined health counts, overdue follow-up detection, bounded error details, and explicit source-limit disclosure.

## Trust and security boundary

- The view is read-only for every role authorized by the existing RPC.
- No direct table query or write was added.
- No retry, cancel, provider test, webhook, credential, or configuration action exists in the UI because no approved mutation RPC exists for those actions.
- Queue records are evidence of internal processing state, not proof of live external-provider connectivity.
- Provider errors and stop reasons are truncated in the interface to prevent unbounded rendering.
- Terminal `dead`/cancelled records are historical evidence, not active failures; the owner dashboard excludes them from urgent attention and does not offer a retry action for them.

## Verification

- `npm run typecheck`: passed on 2026-07-22.
- `npm test`: passed 24/24 on 2026-07-22.
- `npm run build`: passed on 2026-07-22.
- The job status allowlist was matched to the source enum: `queued`, `processing`, `completed`, `failed`, `retrying`, and `dead`.
- No migration, RLS/policy, cron, worker, service-role, public-site, or direct-table-write change exists in the branch.

## Rollback

Revert the Integrations feature merge commit or restore the previous Command Center deployment. No database or public-site rollback is required.
