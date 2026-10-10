# Analytics Operations Handoff

Document status: historical stage evidence. PR #13 was merged after successful protected CI and independent approval on 2026-07-22.

## Scope

- Reads real aggregate metrics exclusively through `get_staff_growth_analytics`.
- Displays audience signals, pipeline totals, content totals, and descriptive ratios with zero-safe calculations.
- Validates the complete RPC response before showing any metric.

## Trust boundary

- The module is strictly read-only.
- `attributionReady` is treated as a first-class trust signal.
- When attribution is unavailable, the interface explicitly prevents interpreting totals as campaign conversions, causality, or ROI.
- Booking requests and qualified leads remain separately labelled totals.
- The RPC methodology note is shown to operators rather than hidden.

## Verification

- `npm run typecheck`: passed on 2026-07-22.
- `npm test`: passed 22/22 on 2026-07-22.
- `npm run build`: passed on 2026-07-22.
- No Production data write or external analytics call was performed.

## Explicit exclusions

- No migration, RLS/policy, cron, worker, service-role credential, direct table query, metric write, secret, public-site change, or Production deployment is included.
- Campaign attribution is not claimed or synthesized where the backend contract reports it unavailable.
