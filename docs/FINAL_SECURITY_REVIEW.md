# Command Center Hub Final Security Review

Review date: 2026-07-23
Baseline: protected `main` through Final Audit PR #16

## Outcome

The browser security boundary is stronger without changing the database, production configuration, or approved RPC contracts. The client now fails closed unless its API key is demonstrably browser-safe, revalidates both the Supabase user and active staff profile whenever a stored session is restored, and stores only the access token in window-scoped storage.

No service-role or secret key, direct table write, migration, RLS/policy change, cron, worker, public-site change, real message, publishing action, or production configuration mutation is included.

## Threat model and remediations

| Area | Finding | Remediation |
| --- | --- | --- |
| Browser API key | The previous configuration check accepted any sufficiently long value, so an accidentally supplied elevated key would not fail closed. | Prefer `VITE_SUPABASE_PUBLISHABLE_KEY`; accept the legacy key only when its JWT role is exactly `anon`; explicitly reject secret keys and malformed credentials. |
| Restored authorization | The previous session restoration trusted role and display-name values stored by the browser until the next server operation. | Restore through `/auth/v1/user`, then reload one active staff profile before rendering protected operations. |
| Session minimization | Role and display name were stored alongside the access token. | Persist only the access token in `sessionStorage`; derive staff identity and role again from the protected profile. |
| Stale sensitive responses | Authentication/profile reads had no explicit browser cache directive. | Use `cache: "no-store"` for user and staff-profile validation. |
| Login throttling | Authentication throttling was presented as a generic login failure. | Map HTTP 429 to a bounded retry-later message without exposing account existence. |
| Dynamic inline style | The analytics progress indicator required an inline style, limiting future CSP tightening. | Replace it with a semantic native `progress` element and static stylesheet rules. |

## Verified boundaries

- Operational writes remain limited to the existing approved RPCs: `update_booking_request_status`, `update_staff_crm_lead`, `set_staff_conversation_mode`, `update_staff_content_item`, and `transition_staff_content_item`.
- Operational reads remain on the existing staff RPCs. The only direct REST table access is the existing read-only active staff-profile authorization lookup.
- Client role checks remain defense in depth; database RPC authorization remains authoritative.
- The application still fails closed for an invalid URL, unsafe key, inactive/missing staff profile, expired token, malformed server response, or unavailable backend.
- React effects cancel in-flight session restoration and do not update state after unmount.

## Verification evidence

- `npm run verify`: TypeScript, 31/31 tests, and production build passed.
- `npx tsc --noEmit --noUnusedLocals --noUnusedParameters`: passed.
- `npm audit --audit-level=low`: zero vulnerabilities.
- React best-practices review: session restoration has cleanup, no conditional hooks, semantic progress UI, and no new unstable render dependency.
- Diff review: no prohibited path or production-setting change.

## Production controls not changed or claimed

These controls require deployment or Supabase dashboard access and are deliberately not changed in this review:

- Confirm the deployed environment uses a publishable key; the legacy `anon` fallback remains supported for a safe transition.
- Confirm Auth rate limits, CAPTCHA, password policy, MFA policy, redirect allowlist, and session lifetime against the organization risk policy.
- Confirm database RLS/policies and RPC grants independently. This review neither changes nor re-audits their production state.
- Further CSP tightening requires a separate deployment-config review and browser verification; no production header setting is changed here.

The code-side review does not claim that these external controls are enabled until Release Readiness verifies them with authorized evidence.

## References

- Supabase API key guidance: <https://supabase.com/docs/guides/api/api-keys>
- Supabase production checklist: <https://supabase.com/docs/guides/deployment/going-into-prod>
- Supabase Auth rate limits: <https://supabase.com/docs/guides/auth/rate-limits>

## Rollback

Revert the Final Security Review merge commit. No database, content, message, booking, secret, or public-site rollback is required. If deployment later switches to `VITE_SUPABASE_PUBLISHABLE_KEY`, retain the legacy key during a validated transition and roll back only the environment alias if the browser client cannot authenticate.
