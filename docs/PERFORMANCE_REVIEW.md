# Command Center Hub Performance Review

Review date: 2026-07-23
Baseline: protected `main` through Final Security Review PR #17

## Outcome

No release-blocking performance regression was found. The production entry remains below a deliberately narrow initial-load budget, and that budget is now enforced after every production build in local verification and CI.

The review avoids a speculative component rewrite or dependency replacement. Current source-map inspection shows that React DOM, Zod validation, and the application itself are the dominant source inputs. React and Zod are both part of the current security and rendering architecture; replacing or duplicating them would add risk without evidence of a user-visible bottleneck.

## Measured baseline

| Initial resource | Raw | Gzip | Enforced limit (raw / gzip) |
| --- | ---: | ---: | ---: |
| JavaScript | 302,436 bytes | 87,906 bytes | 330,000 / 95,000 bytes |
| CSS | 30,809 bytes | 6,391 bytes | 33,000 / 7,000 bytes |

The limits leave controlled headroom while forcing future stages to justify growth or introduce genuine lazy loading before the initial experience becomes materially heavier. The CSS allowance reflects the current command-center operating-cockpit shell and its responsive navigation styles; feature-specific CSS remains lazy-loaded where the route is lazy-loaded.

## Runtime review

- All network requests are user/session scoped and stale dashboard or conversation reads are aborted during navigation and unmount.
- Search and filter derivations for content, media, bookings, and operational queues are memoized.
- The application creates no timer, polling loop, worker, subscription, object URL, or unbounded in-memory cache.
- Lists use server-provided stable identifiers in operational modules. The generic fallback renderer is read-only and is not used for controlled mutation identity.
- There are no image payloads or private media downloads in the initial entry.
- Switching operational sections intentionally requests fresh server data. A client cache was not added because stale operational state would be a correctness and safety tradeoff.

## Automated regression gate

`scripts/check-performance-budget.mjs` reads the JavaScript and CSS resources referenced by the built `index.html`, measures raw and gzip bytes, and fails the build when either budget is exceeded. It resolves resources only inside the selected build directory and also fails closed when no entry JavaScript exists.

The contract test creates an isolated build fixture and proves both paths:

- bounded initial assets pass;
- an oversized JavaScript entry fails with a non-zero status.

Only initial resources referenced by `index.html` count toward this gate. Future truly lazy chunks can therefore be introduced without falsely inflating the initial-load measurement.

## Deferred evidence-based optimizations

- Route or module splitting should be reconsidered only when a feature pushes the entry beyond the enforced budget. Most authenticated sessions restore the dashboard immediately, so splitting the current small dashboard solely for a login screen would add request and maintenance overhead with limited benefit.
- Virtualization or pagination should be introduced only if production-safe telemetry shows operational collections large enough to cause measurable input or render latency. No such telemetry is available in this repository review.
- Web-vitals monitoring requires an approved observability destination and production configuration. None was added or changed.

## Verification

- `npm run verify`: TypeScript, 33/33 tests, production build, and performance budget passed.
- Source-map measurement was run locally only; source maps are not emitted by the normal production build.
- No runtime dependency, application RPC, database object, production setting, public-site file, or secret changed.

## Rollback

Revert the Performance Review merge commit to remove the build budget and its tests. No database, deployment setting, content, message, booking, public-site, or production-data rollback is required.
