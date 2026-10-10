# Controlled AI Inbox Handoff

Document status: historical stage evidence. PR #9 was merged after successful protected CI and independent approval on 2026-07-22.

## Scope completed

- AI Inbox renders real conversations from `get_staff_inbox`.
- Selecting a conversation loads its real message history through `get_staff_conversation_messages(p_conversation_id)`.
- Authorized staff can change the conversation mode only through `set_staff_conversation_mode(p_conversation_id, p_mode)`.
- Supported modes are `ai_active`, `human_required`, `human_takeover`, and `paused`.

## Safety controls

- UI write roles match the existing RPC contract: `super_admin`, `admin`, `reception`, and `coach`.
- Every mode change requires explicit confirmation.
- A per-conversation in-flight lock prevents repeated writes.
- The browser does not update `conversations`, `messages`, `leads`, or `audit_logs` directly.
- The existing RPC performs the conversation/lead update and records `conversation_mode_updated` in `audit_logs`.
- Invalid data and failed requests are shown as safe errors and never represented as successful writes.
- HTTP 401 clears the local session.
- No migration, RLS or policy change, cron, worker, service-role credential, external message, or public-site change is included.

## Verification

- `npm run typecheck`: passed.
- `npm test`: passed, 13/13 tests.
- `npm run build`: passed with Vite production output.
- Protected GitHub CI and independent review: passed on PR #9 for commit `820092f`.
- Merge: completed through the protected pull-request workflow.

## Rollback

Revert the AI Inbox feature merge commit or redeploy the previous successful Command Center deployment. The public Relax Fix UAE website remains unchanged.

## Next required action

Completed. Current project sequencing is maintained only in `PROJECT_HANDOFF.md`.
