# AUDITED_BASELINE_CONTENT_MANIFEST_COMMAND_CENTER_HUB_V1

> Historical provenance record: the statuses and next action below apply only to the original pre-implementation capture. They do not supersede the current repository state or `PROJECT_HANDOFF.md`.

## Manifest identity

```text
TARGET_REPOSITORY=aymanmahrous/command-center-hub
TARGET_VISIBILITY=PRIVATE
TARGET_DEFAULT_BRANCH=main
SOURCE_SNAPSHOT=outputs/REPLIT_FIXED_SOURCE_CAPTURE_f9473123
SOURCE_ORIGIN=AUTHENTICATED_REPLIT_UI_CAPTURE
SOURCE_REPLIT_PATH=/home/runner/workspace
SOURCE_REPLIT_BRANCH=work/security-foundation-replit-auth
SOURCE_REPLIT_HEAD=f94731239b4fcce048ab917f875183f7ed7b1121
CAPTURED_FILE_COUNT=35
CANONICAL_BYTES_TOTAL=154638
CANONICALIZATION=remove exactly one terminal LF introduced by editor clipboard serialization for measurement only
HISTORY_TRANSFER=BLOCKED
ATTACHED_ASSETS=BLOCKED
GENERATED_AND_LOCKFILES=BLOCKED
DATABASE_SCHEMA_AND_MIGRATIONS=BLOCKED
MANIFEST_STATUS=PARTIALLY_VERIFIED_PENDING_INDEPENDENT_QA
TRANSFER_STATUS=BLOCKED_PENDING_SECURITY_ALLOWLIST_AND_QA_PASS
```

This is a content-and-provenance manifest, not a claim that the source is production-ready. It does not include file contents, secrets, `.env`, customer data, database/schema, `.git`, history, generated output, lockfiles, or `attached_assets`.

## Classification rules

- `SOURCE_CANDIDATE_12`: historical source-reviewed candidates. They may be considered for a later selective transfer only after the security allowlist and independent QA both return `PASS`.
- `CONDITIONAL_HOLD_23`: captured paths retained as evidence but not transferable until their individual conditions are closed.
- `DENY_REGENERATE_OR_OUT_OF_SCOPE_25`: never included in this baseline transfer; regenerate or handle through a separate approved gate.
- A path/hash match proves content identity for the captured snapshot only; it does not prove license, runtime compatibility, or production security.

## Captured source manifest: 35 files

| Relative path | Category | Canonical bytes | Canonical SHA-256 | Transfer state |
|---|---|---:|---|---|
| `artifacts/api-server/src/lib/audit.ts` | `SOURCE_CANDIDATE_12` | 1161 | `fa1453984bdadcf0624e09a4ccfebe4aa35e63ccc5b415b253f53739d9b19516` | `BLOCKED_PENDING_QA` |
| `artifacts/api-server/src/middlewares/rbacPolicy.ts` | `SOURCE_CANDIDATE_12` | 4240 | `4eff49a28b1eebbf53f6e12f88901044e942ba39a2de5f0e73a28b1f14722367` | `BLOCKED_PENDING_QA` |
| `artifacts/api-server/src/middlewares/requireAuth.ts` | `SOURCE_CANDIDATE_12` | 408 | `bee7f9c78684f34c3ab4d3ebb64904ef2142c5cdb2d88871a40dcb08c288ddf6` | `BLOCKED_PENDING_QA` |
| `artifacts/api-server/src/middlewares/requireRole.ts` | `SOURCE_CANDIDATE_12` | 2673 | `4de30c337c95f176f788803d45e8803b3294bb83867efceded06a2272223b8d6` | `BLOCKED_PENDING_QA` |
| `artifacts/api-server/src/routes/index.ts` | `SOURCE_CANDIDATE_12` | 2352 | `c2057cb59c29cfd83e62ea4c93e1ba7475dd516e949914a4e3b12d3b0a5b5084` | `BLOCKED_PENDING_QA` |
| `artifacts/api-server/src/routes/__tests__/auth-config.test.ts` | `SOURCE_CANDIDATE_12` | 4964 | `8bd85b17e1a338fa39d1b29d07d528b4c80d04d5436c8a07fe73739b30fdce4d` | `BLOCKED_PENDING_QA` |
| `artifacts/api-server/src/routes/__tests__/rate-limit.test.ts` | `SOURCE_CANDIDATE_12` | 11831 | `60e160a0ce8384ba60b78d29e6cb63e15806d75b157cac56034e8cc1dccc54fe` | `BLOCKED_PENDING_QA` |
| `artifacts/api-server/src/routes/__tests__/rbac.test.ts` | `SOURCE_CANDIDATE_12` | 14490 | `a15cb7b4aade5004bd2ef5a56ea636d6a3ff3096b52ba058aaef821099bb0cd8` | `BLOCKED_PENDING_QA` |
| `artifacts/api-server/src/routes/__tests__/security.test.ts` | `SOURCE_CANDIDATE_12` | 9169 | `419e8b6d7c7d8e5987022efacd375e176d5a166c1a4efc75a3b448d54af3e34c` | `BLOCKED_PENDING_QA` |
| `artifacts/api-server/src/routes/__tests__/session.test.ts` | `SOURCE_CANDIDATE_12` | 8015 | `bb1db631cbbb6151d4f114907aa27a1ebe1e1d052b760dc3381b47a82023dfc2` | `BLOCKED_PENDING_QA` |
| `artifacts/relax-fix-command-center/src/components/layout/Shell.tsx` | `SOURCE_CANDIDATE_12` | 9626 | `8423802ee491b68cec0336d4591dabce77f0e61ea9f25fdb454bae9e9c2f14ca` | `BLOCKED_PENDING_QA` |
| `artifacts/relax-fix-command-center/src/context/LanguageContext.tsx` | `SOURCE_CANDIDATE_12` | 12000 | `c76ac4d58a9fa21c4a48782162830aa323ac23fd671454320a935b2531d20b52` | `BLOCKED_PENDING_QA` |
| `artifacts/api-server/package.json` | `CONDITIONAL_HOLD_23` | 1053 | `29dd5f699de4d65302f87f21ee5bdb1292c34dbff00d2271ee852efae748c31f` | `BLOCKED_CONDITIONAL_HOLD` |
| `artifacts/api-server/src/app.ts` | `CONDITIONAL_HOLD_23` | 6858 | `44110f8850b129ffb9e262de748dd6a2bdcf8836f046eed6332b6eae9407e4d7` | `BLOCKED_CONDITIONAL_HOLD` |
| `artifacts/api-server/src/lib/auth.ts` | `CONDITIONAL_HOLD_23` | 2908 | `b62bd554102c2e9b4aaab1cea2372737b56468116169c3104db1d32105ff609a` | `BLOCKED_CONDITIONAL_HOLD` |
| `artifacts/api-server/src/middlewares/authMiddleware.ts` | `CONDITIONAL_HOLD_23` | 1881 | `75d8b931ffb0cec33c6410d88024b84479b8bf43e4c6910b959129734ae12b1e` | `BLOCKED_CONDITIONAL_HOLD` |
| `artifacts/api-server/src/middlewares/csrfProtection.ts` | `CONDITIONAL_HOLD_23` | 2446 | `41663d1daafbe7654577167ca3a4184b3539c8b49b90a1bb74061a930fa2fbfa` | `BLOCKED_CONDITIONAL_HOLD` |
| `artifacts/api-server/src/routes/auth.ts` | `CONDITIONAL_HOLD_23` | 10204 | `0014bc6ea22b24caf276de351038fb1638eb632bcf109d75688a9b5b6509e586` | `BLOCKED_CONDITIONAL_HOLD` |
| `artifacts/api-server/src/routes/contentItems.ts` | `CONDITIONAL_HOLD_23` | 1528 | `c28cdbeca8409f6552f1625780d2aa988124fc8f03b17a94a8d4ffc0078d0d69` | `BLOCKED_CONDITIONAL_HOLD` |
| `artifacts/api-server/src/routes/decisions.ts` | `CONDITIONAL_HOLD_23` | 1500 | `c2433b2684248716f6276a41439cd749f114021abc0cd3439c2d068b157639c3` | `BLOCKED_CONDITIONAL_HOLD` |
| `artifacts/api-server/src/routes/governanceGates.ts` | `CONDITIONAL_HOLD_23` | 1571 | `7d1676c57f69ee6814e9972d5f97f8387ae809311a1b69d7d366d42119faf63d` | `BLOCKED_CONDITIONAL_HOLD` |
| `artifacts/api-server/src/routes/health.ts` | `CONDITIONAL_HOLD_23` | 380 | `f92decd6ba0650669ab1470e5e912ce6ced4ebbab30a14ac1c572729a221e135` | `BLOCKED_CONDITIONAL_HOLD` |
| `artifacts/api-server/src/routes/publishingItems.ts` | `CONDITIONAL_HOLD_23` | 1738 | `b397527c5ee542b0e70d43399d63ffcbbf886ab4136a4a2149d7a5b6b97b9bb8` | `BLOCKED_CONDITIONAL_HOLD` |
| `artifacts/api-server/src/routes/qualityReviewItems.ts` | `CONDITIONAL_HOLD_23` | 1635 | `dcdf348a4b53ca76fab51f7b42c1708340f1d40af8b0325749b4a44b27b189e7` | `BLOCKED_CONDITIONAL_HOLD` |
| `artifacts/api-server/src/routes/risks.ts` | `CONDITIONAL_HOLD_23` | 1884 | `fb316183d44b6bd1f36ea68c6e57ffbdb7134b61c6c0db097c44e90935c6d5d4` | `BLOCKED_CONDITIONAL_HOLD` |
| `artifacts/api-server/src/routes/tasks.ts` | `CONDITIONAL_HOLD_23` | 1408 | `e1d5763bdd549cf595e64a372d1c8e2489ceb1b10abeabcca8b3b14888e1d2f0` | `BLOCKED_CONDITIONAL_HOLD` |
| `artifacts/relax-fix-command-center/package.json` | `CONDITIONAL_HOLD_23` | 2847 | `92249776ef684dab98a251c5ec65d22b76359868885527b02bb04619cc5cc47c` | `BLOCKED_CONDITIONAL_HOLD` |
| `artifacts/relax-fix-command-center/src/App.tsx` | `CONDITIONAL_HOLD_23` | 5374 | `16551658621fb11f7f6b5891297df7e594986489dc606685c3ec8fc542412524` | `BLOCKED_CONDITIONAL_HOLD` |
| `artifacts/relax-fix-command-center/tsconfig.json` | `CONDITIONAL_HOLD_23` | 575 | `64285fb9da9019842c4deeda19cb0830f45ec39a201644184602d353773c8901` | `BLOCKED_CONDITIONAL_HOLD` |
| `lib/api-spec/openapi.yaml` | `CONDITIONAL_HOLD_23` | 24944 | `9e83ecf97aa80b8231952befdd54606701f65a532e8e518e6218a59c64396484` | `BLOCKED_CONDITIONAL_HOLD` |
| `lib/replit-auth-web/package.json` | `CONDITIONAL_HOLD_23` | 332 | `2ce51e7637d7f73a12c441e494675c6722366837e1a25fa4a156ea6043794b47` | `BLOCKED_CONDITIONAL_HOLD` |
| `lib/replit-auth-web/src/index.ts` | `CONDITIONAL_HOLD_23` | 82 | `41943dc5040bd8368e75a1819628e7854efdc1abb8a9a2477179e04cb1201bea` | `BLOCKED_CONDITIONAL_HOLD` |
| `lib/replit-auth-web/src/use-auth.ts` | `CONDITIONAL_HOLD_23` | 1844 | `fa73c3b7e9100e9c927c95a04adb51fb4db763e36b581f35f7554019494957fe` | `BLOCKED_CONDITIONAL_HOLD` |
| `lib/replit-auth-web/tsconfig.json` | `CONDITIONAL_HOLD_23` | 430 | `205133cfb7bd9c8601993b37a49ee9acf7682040dc60c725ee9708d3b3e31383` | `BLOCKED_CONDITIONAL_HOLD` |
| `tsconfig.json` | `CONDITIONAL_HOLD_23` | 287 | `809bc9799b8898d382d0e0cf586138f583681fb43e97c524a0d601a63e6ac5ac` | `BLOCKED_CONDITIONAL_HOLD` |

> Note: the `lib/replit-auth-web/tsconfig.json` hash above is preserved exactly as recorded in the historical manifest. Any mismatch against a newly recomputed source hash must stop the baseline gate.

## Explicit deny/regenerate/out-of-scope set: 25 paths

### Regenerate later (15)

```text
lib/api-client-react/src/generated/api.schemas.ts
lib/api-client-react/src/generated/api.ts
lib/api-zod/src/generated/api.ts
lib/api-zod/src/generated/types/authUser.ts
lib/api-zod/src/generated/types/authUserEnvelope.ts
lib/api-zod/src/generated/types/authorizationSessionHeaderParameter.ts
lib/api-zod/src/generated/types/beginBrowserLoginParams.ts
lib/api-zod/src/generated/types/errorEnvelope.ts
lib/api-zod/src/generated/types/handleBrowserLoginCallbackParams.ts
lib/api-zod/src/generated/types/index.ts
lib/api-zod/src/generated/types/logoutBrowserSessionParams.ts
lib/api-zod/src/generated/types/logoutSuccess.ts
lib/api-zod/src/generated/types/mobileTokenExchangeRequest.ts
lib/api-zod/src/generated/types/mobileTokenExchangeSuccess.ts
pnpm-lock.yaml
```

### Exclude from runtime transfer (7)

```text
.agents/memory/MEMORY.md
.agents/memory/security-foundation-decisions.md
attached_assets/Pasted-AGENT-TYPE-POST-OWNER-AUTH-VERIFICATION-AGENT-CURRENT-T_1784327077800.txt
attached_assets/Pasted-OWNER-AUTHORIZATION-ACCEPT-VERIFIED-REPLIT-AUTO-CHECKPO_1784325346164.txt
attached_assets/Pasted-OWNER-AUTHORIZATION-CLEAN-EXACT-TEST-DATA-AND-COMPLETE-_1784324054236.txt
attached_assets/Pasted-OWNER-AUTHORIZATION-IMPLEMENT-SECURITY-FOUNDATION-WITH-_1784321154669.txt
attached_assets/Pasted-OWNER-DECISION-SECURITY-IMPLEMENTATION-CONDITIONALLY-AC_1784322752075.txt
```

### Hold outside current transfer (3)

```text
.replit
lib/db/src/schema/auth.ts
lib/db/src/schema/index.ts
```

## Security and QA gates

```text
PATH_ALLOWLIST=VERIFIED
COUNT_35=VERIFIED
LOCAL_CANONICAL_HASH_ROWS=VERIFIED
SOURCE_PROVENANCE=PARTIALLY_VERIFIED
SECRET_REVIEW=PARTIALLY_VERIFIED
DEPENDENCY_CLOSURE=PARTIALLY_VERIFIED
PRIVACY_AND_LICENSING=NOT_VERIFIED
INDEPENDENT_QA=NOT_VERIFIED
BASELINE_COMMIT_GO_NO_GO=BLOCKED
BASELINE_PUSH_GO_NO_GO=BLOCKED
```

The independent QA gate must verify: 35/35 rows, category counts 12/23/25, exact path exclusions, canonical byte/hash consistency, no secrets or environment files in the candidate set, no `.git`/history/attached assets/generated/lock/database files, and explicit stop conditions for any mismatch.

## Safe rollback

Before the first commit, rollback is deletion/abandonment of this empty target only with owner direction. After a future baseline commit, rollback must use a recorded commit SHA and a reversible revert or repository archival decision; no history rewrite is authorized.

## Next required action

`NEXT_REQUIRED_ACTION=INDEPENDENT_QA_OF_AUDITED_BASELINE_MANIFEST_READ_ONLY`

No file transfer, baseline commit, push, branch protection, implementation, deployment, or production action is authorized until this QA gate returns `PASS`.


