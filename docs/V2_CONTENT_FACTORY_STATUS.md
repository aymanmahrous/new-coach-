# V2 Content Factory — 10-Post Approval Cycle

Branch: `feat/command-center-v2-shell`

## Implemented

- Content Factory generation uses the existing 10-post Coach Ayman batch builder.
- The legacy 30-day calendar generator remains available and unchanged in `content-batch-generator.ts`.
- Media attachment remains safe: approved marketing media is matched when available; otherwise the item receives a pending fallback plan.
- Existing Content Batch Review remains the approval gate.
- Approve All requires an explicit confirmation and only changes eligible content state; it does not schedule or publish from that action.
- Publish requests remain behind the existing `enqueue_publish_job` RPC and approval/media guards.
- No direct table writes, migrations, RLS changes, cron changes, or external paid API calls were added.
- No merge to `main` and no deployment.

## Target operating mix

- 10 posts per operating cycle.
- 4 educational.
- 2 trust.
- 2 engagement.
- 2 conversion.
- Facebook: 4.
- Instagram: 4.
- TikTok: 2.

## Safety gate

`Preview → Review/Changes → Approve → Request/Schedule Publish → Existing publish workflow → Receipt verification`

Real publishing is never triggered merely by opening the Content Factory or approving a batch.
