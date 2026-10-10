# Content Batch — Day 9 Review Notification (n8n Design Only)

Status: **design document only** — no workflow execution, no polling, no credentials stored in this repo.

Approved n8n workflow reference: `xNwYPSXQiUyzDSyZ` (existing Owner Approval path — do not replace).

## Goal

On **day 9** of a 10-day content batch cycle, remind the owner/staff that reviewable items remain — without publishing, scheduling, or connecting Buffer.

## Safest notification path (recommended order)

1. **Command Center in-app banner (already implemented)**  
   - `buildDayNineReminder()` in `src/content-batch.ts`  
   - Shown in Content Growth Hub and Today view when cycle day ≥ 9 and reviewable items exist  
   - No external credentials required

2. **Optional n8n one-shot webhook (future, owner-approved)**  
   - Trigger: manual or single scheduled call — **not** app polling  
   - Input: `batch_id`, `reviewable_count`, `cycle_day`  
   - Action: email or WhatsApp template to owner — **only after explicit channel credentials are approved**

## Proposed n8n execution design (0 workflows executed in this phase)

| Step | Node type | Purpose |
|------|-----------|---------|
| 1 | Webhook (POST) | Receives `{ batchId, cycleDay, reviewableCount }` from Command Center or Supabase edge hook |
| 2 | IF | `cycleDay >= 9` AND `reviewableCount > 0` |
| 3 | Supabase (read) | Optional verify batch still has `needs_review` items |
| 4 | Notify | Email only (WhatsApp **not connected** in this phase) |
| 5 | Respond | `{ notified: true, batchId }` |

**Execution count for this phase: 0** — design only.

## Duplicate-safe rules

- Idempotency key: `batchId + cycleDay` stored in n8n static data or Supabase audit log  
- Never call `transition_staff_content_item(schedule)` or publish nodes  
- Never auto-approve — use `approve_staff_content_batch` only from Command Center staff action

## Integration status in Command Center

Buffer · Canva · Runway · Facebook · Instagram · TikTok · n8n — shown as **NOT CONNECTED** until verified credentials exist (`readIntegrationStatuses` in `src/content-growth.ts`).

## Next implementation step (after owner approval)

1. Owner generates batch in Command Center (`create_staff_generated_content_batch`)  
2. Owner reviews in Content Growth Hub  
3. Optionally enable n8n webhook + email notification for day 9  
4. Buffer / publish phases remain blocked until Facebook controlled publishing phase is closed
