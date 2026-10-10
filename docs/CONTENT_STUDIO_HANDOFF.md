# Content Studio Operations Handoff

Document status: historical stage evidence. PR #11 was merged after successful protected CI and independent approval on 2026-07-22.

## Scope

- Real content records are read through the existing `get_staff_content_items` RPC.
- Editing uses only `update_staff_content_item`.
- Approval, return-to-review, scheduling, rescheduling, and unscheduling use only `transition_staff_content_item`.
- No publish action or external platform call is exposed by this interface.

## Safety controls

- Server-aligned RBAC: only `super_admin`, `admin`, and `content_manager` can mutate content.
- Every mutation requires an explicit browser confirmation.
- One global in-flight lock prevents duplicate or competing writes.
- Published content is read-only, matching the RPC contract.
- Editing scheduled content warns that its schedule will be cleared and the item returned to review.
- Scheduling requires a valid future time and server-side approval state.
- RPC failures are mapped to safe operator messages; expired sessions are closed.
- Audit Log entries are created inside the existing mutation RPCs.

## Verification

- `npm run typecheck`: passed on 2026-07-22.
- `npm test`: passed 18/18 on 2026-07-22.
- `npm run build`: passed on 2026-07-22.
- `git diff --check`: passed on 2026-07-22.

## Explicit exclusions

- No migration, RLS/policy, cron, worker, service-role credential, direct table write, secret, webhook, public-site change, or Production database write is included.
- No real content was scheduled or published during development or verification.
- This stage does not activate the later Content Publishing System track.
