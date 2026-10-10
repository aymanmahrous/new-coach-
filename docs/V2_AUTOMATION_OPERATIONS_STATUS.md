# V2 Automation + Operations Center

Status: implemented on `feat/command-center-v2-shell`.

## Automation Center

- Command Center V2 exposes active automation count and failed automation count from `get_staff_control_tower_summary`.
- The home cockpit links directly to the existing Automations workspace.
- The Automations workspace reads `get_staff_content_automation_status` only; no direct job/table mutation was introduced.
- Automation health is treated as operational visibility, not an instruction to execute external actions.

## Operations Center

- Existing Integrations workspace reads `get_staff_operations_queue`.
- Follow-up jobs and background jobs are shown with queued/processing/completed/failed/retrying/dead states.
- Failed/dead work is surfaced as human attention.
- Overdue queued/retrying follow-ups are detected.
- Search and status filters are available.
- Error text is bounded before display.
- The workspace explicitly exposes a read-only boundary: no Retry or Cancel command is offered from this surface.

## Safety

- No migration, RLS, policy, cron, worker, or service-role change.
- No new paid API call.
- No automatic publish/retry/cancel action was added.
- Existing RPC contracts remain the source of truth.
- `main` remains untouched; no merge or deploy performed.

## Remaining V2 work

1. Shell/navigation consolidation into the final V2 information architecture.
2. Smart Search across modules and natural-language command routing.
3. Today timeline + richer AI Activity feed.
4. Mobile bottom navigation and final responsive/accessibility pass.
5. End-to-end verification: typecheck, tests, build, browser verification where available.
6. Final review, PR, and merge only after explicit approval.
