import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const envExample = await readFile(new URL("../.env.example", import.meta.url), "utf8");
const gitignore = await readFile(new URL("../.gitignore", import.meta.url), "utf8");
const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const app = await readFile(new URL("../src/main.tsx", import.meta.url), "utf8");
const operations = await readFile(new URL("../src/operations-queue-view.tsx", import.meta.url), "utf8");
const growthHub = await readFile(new URL("../src/content-growth-hub.tsx", import.meta.url), "utf8");
const batchReviewPanel = await readFile(new URL("../src/content-batch-review-panel.tsx", import.meta.url), "utf8");
const growthCopyEn = await readFile(new URL("../src/i18n/en.ts", import.meta.url), "utf8");
const mediaView = await readFile(new URL("../src/media-library-view.tsx", import.meta.url), "utf8");

test("environment example contains the browser-safe configuration contract", () => {
  assert.match(envExample, /^VITE_SUPABASE_URL=/m);
  assert.match(envExample, /^VITE_SUPABASE_PUBLISHABLE_KEY=/m);
  assert.match(envExample, /^VITE_SUPABASE_ANON_KEY=/m);
  assert.match(envExample, /^VITE_STAFF_PROFILE_TABLE=/m);
});

test("local environment files and generated output are ignored", () => {
  assert.match(gitignore, /^\.env$/m);
  assert.match(gitignore, /^\.env\.\*$/m);
  assert.match(gitignore, /^dist\/$/m);
});

test("application is excluded from search indexing", () => {
  assert.match(html, /noindex,nofollow,noarchive/);
});

test("staff authorization requires an active profile", () => {
  assert.match(app, /active: z\.literal\(true\)/);
  assert.match(app, /STAFF_ACCESS_DENIED/);
});

test("staff profile lookup matches the production primary-key contract", () => {
  assert.match(app, /\?id=eq\.\$\{encodeURIComponent\(userId\)\}/);
  assert.match(app, /loadStaffProfile\(auth\.access_token, auth\.user\.id\)/);
  assert.doesNotMatch(app, /\?user_id=eq\./);
  assert.match(envExample, /primary key `id`/);
});

test("password is not persisted", () => {
  assert.doesNotMatch(app, /setItem\([^\n]*password/i);
  assert.match(app, /sessionStorage/);
  assert.match(app, /JSON\.stringify\(\{ accessToken: session\.accessToken \}\)/);
  assert.doesNotMatch(app, /JSON\.stringify\(session\)/);
});

test("booking writes use the approved RPC and never direct table mutation", () => {
  assert.match(app, /update_booking_request_status/);
  assert.match(app, /p_booking_request_id/);
  assert.match(app, /p_status/);
  assert.doesNotMatch(app, /\/rest\/v1\/booking_requests[^\n]*(PATCH|PUT|DELETE)/i);
});

test("booking writes are role-gated and require explicit confirmation", () => {
  assert.match(app, /\["super_admin", "admin", "reception"\]\.includes\(session\.role\)/);
  assert.match(app, /window\.confirm/);
  assert.match(app, /Audit Log/);
});

test("booking operations prevent duplicate writes and handle expired sessions", () => {
  assert.match(app, /if \(!canWrite \|\| busyId \|\| booking\.status === next\) return/);
  assert.match(app, /disabled=\{!canWrite \|\| busyId !== null\}/);
  assert.match(app, /code === "SESSION_EXPIRED"/);
  assert.match(app, /onSessionExpired/);
});

test("booking operations expose full read-only context and client-side filters", () => {
  for (const field of ["other_location", "swam_before", "fear_of_water", "updated_at"]) assert.match(app, new RegExp(field));
  assert.match(app, /booking-search/);
  assert.match(app, /statusFilter/);
  assert.match(app, /filteredBookings/);
});

test("booking workspace opens on the owner confirmation queue", () => {
  assert.match(app, /statusFilter !== "all" \|\| bookings\.length === 0/);
  assert.match(app, /counts\.pending > 0 \? "pending"/);
});

test("booking status is constrained to the server-supported allowlist", () => {
  for (const status of ["pending", "contacted", "confirmed", "declined", "cancelled"]) assert.match(app, new RegExp(`"${status}"`));
  assert.doesNotMatch(app, /service_role/i);
});

test("AI Inbox reads messages and changes mode only through approved RPCs", () => {
  assert.match(app, /get_staff_conversation_messages/);
  assert.match(app, /set_staff_conversation_mode/);
  assert.match(app, /p_conversation_id/);
  assert.match(app, /p_mode/);
  assert.doesNotMatch(app, /\/rest\/v1\/(conversations|messages)[^\n]*(PATCH|PUT|DELETE)/i);
});

test("AI Inbox mode writes are role-gated, confirmed, and duplicate-safe", () => {
  assert.match(app, /canWriteMode = \["super_admin", "admin", "reception", "coach"\]/);
  assert.match(app, /if \(!canWriteMode \|\| busyId \|\| conversation\.mode === next\) return/);
  assert.match(app, /تأكيد تغيير وضع محادثة/);
  assert.match(app, /Audit Log/);
});

test("AI Inbox supports the complete server mode allowlist", () => {
  for (const mode of ["ai_active", "human_required", "human_takeover", "paused"]) assert.match(app, new RegExp(`"${mode}"`));
});

test("Content Studio reads and writes only through approved RPCs", () => {
  for (const rpc of ["get_staff_content_items", "update_staff_content_item", "transition_staff_content_item"]) assert.match(app, new RegExp(rpc));
  for (const parameter of ["p_content_item_id", "p_topic", "p_hook", "p_caption", "p_cta", "p_hashtags", "p_visual_prompt", "p_action", "p_scheduled_for"]) assert.match(app, new RegExp(parameter));
  assert.doesNotMatch(app, /\/rest\/v1\/(content_items|background_jobs|audit_logs)[^\n]*(PATCH|PUT|DELETE|POST)/i);
});

test("Content Studio mutations are role-gated, confirmed, audited, and duplicate-safe", () => {
  assert.match(app, /\["super_admin", "admin", "content_manager"\]\.includes\(session\.role\)/);
  assert.match(app, /if \(!canWrite \|\| busyId\) return/);
  assert.match(app, /disabled=\{!canWrite \|\| busyId !== null/);
  assert.match(app, /تأكيد حفظ تعديلات/);
  assert.match(app, /تأكيد «\$\{contentActionLabels\[action\]\}»/);
  assert.match(app, /Audit Log/);
  assert.match(app, /SESSION_EXPIRED/);
});

test("Content Studio honors server status and action allowlists", () => {
  for (const status of ["idea", "draft", "generated", "needs_review", "approved", "scheduled", "published", "failed", "cancelled"]) assert.match(app, new RegExp(`"${status}"`));
  for (const action of ["approve", "return_to_review", "schedule", "unschedule"]) assert.match(app, new RegExp(`"${action}"`));
  assert.match(app, /PUBLISHED_CONTENT_IMMUTABLE/);
  assert.match(app, /APPROVAL_REQUIRED/);
});

test("Content batch generation uses approved RPC and confirms before write", () => {
  assert.match(growthHub, /create_staff_generated_content_batch/);
  assert.match(growthHub, /window\.confirm\(copy\.generateConfirm\)/);
  assert.match(growthCopyEn, /Nothing will be scheduled or published/i);
  assert.doesNotMatch(growthHub, /graph\.facebook|buffer\.com/i);
});

test("Content batch review approves through approved RPCs only", () => {
  assert.match(app, /ContentGrowthHub/);
  assert.match(app, /approveAllBatch/);
  assert.match(app, /approve_staff_content_batch/);
  assert.match(app, /transition_staff_content_item/);
  assert.match(batchReviewPanel, /Nothing will be scheduled or published from this screen/);
  assert.match(app, /canApproveContentItem/);
  assert.match(app, /sharedDatabaseBatchId/);
  assert.doesNotMatch(app, /graph\.facebook|facebook\.com\/v\d+/i);
});

test("Media Library uses staff RPCs and blocks direct table mutation", () => {
  assert.match(app, /get_staff_media_assets/);
  assert.match(app, /import\("\.\/media-library-view"\)/);
  assert.match(mediaView, /fetchStaffMediaSignedUrl/);
  assert.match(mediaView, /openStaffMediaAsset/);
  assert.match(mediaView, /MediaLibraryUploadPanel/);
  assert.match(mediaView, /register_staff_media_upload|MediaLibraryUploadPanel/);
  assert.doesNotMatch(mediaView, /create_staff_media_asset_record|create_staff_video_generation_job|update_staff_video_generation_job/);
  assert.doesNotMatch(mediaView, /\/rest\/v1\/media_assets[^\n]*(PATCH|PUT|DELETE|POST)/i);
});

test("Media Library validates ownership-shaped records and exposes review controls", () => {
  for (const field of ["createdBy", "contentItemId", "assetType", "source", "storagePath", "providerJobId", "metadata", "createdAt"]) assert.match(mediaView, new RegExp(field));
  for (const type of ["image", "video", "logo", "other"]) assert.match(mediaView, new RegExp(`"${type}"`));
  for (const source of ["upload", "ai_generated", "external"]) assert.match(mediaView, new RegExp(`"${source}"`));
  assert.match(mediaView, /writeBannerTitle|مكتبة وسائط خاصة للقراءة فقط/);
  assert.match(mediaView, /MediaAssetControls/);
  assert.match(mediaView, /typeFilter/);
  assert.match(mediaView, /sourceFilter/);
});

test("Analytics uses the approved aggregate RPC and has no direct metric queries", () => {
  assert.match(app, /get_staff_growth_analytics/);
  assert.match(app, /active === "analytics" \? <AnalyticsView/);
  assert.doesNotMatch(app, /\/rest\/v1\/(content_metrics|leads|booking_requests|content_items)/i);
  assert.doesNotMatch(app, /update_staff_growth_analytics|create_staff_growth_analytics/);
});

test("Analytics validates every metric and preserves the attribution limitation", () => {
  for (const field of ["views", "dms", "qualifiedLeads", "bookingRequests", "publishedItems", "contentItems", "attributionReady", "note"]) assert.match(app, new RegExp(field));
  assert.match(app, /Attribution غير مكتمل/);
  assert.match(app, /لا تُفسر كتحويلات منسوبة/);
  assert.match(app, /إجمالي مستقل، غير منسوب/);
  assert.match(app, /safeRatio/);
  assert.match(app, /Math\.min\(publishedShare, 1\)/);
  assert.doesNotMatch(app, /style=\{\{/);
});

test("Integrations uses the approved operations queue RPC and guarded job commands", () => {
  assert.match(app, /get_staff_operations_queue/);
  assert.match(app, /active === "integrations" \? <Suspense/);
  assert.match(operations, /retry_staff_publish_job/);
  assert.match(operations, /cancel_staff_background_job/);
  assert.doesNotMatch(operations, /\/rest\/v1\/(follow_up_jobs|background_jobs)[^\n]*(PATCH|PUT|DELETE|POST)/i);
  assert.match(operations, /المهام المنتهية\/المؤرشفة للعرض فقط/);
});

test("Integrations validates queue records and states operational limits honestly", () => {
  for (const field of ["followUps", "backgroundJobs", "generatedAt", "leadName", "attemptNumber", "scheduledFor", "stoppedReason", "jobType", "attemptCount", "nextRetryAt", "lastError"]) assert.match(operations, new RegExp(field));
  for (const status of ["queued", "processing", "completed", "failed", "retrying", "dead"]) assert.match(operations, new RegExp(`"${status}"`));
  assert.match(operations, /لا تثبت اتصال مزود خارجي لحظيًا/);
  assert.match(operations, /حد المصدر 250 سجلًا لكل طابور/);
  assert.match(operations, /bounded/);
  assert.match(operations, /متابعات متأخرة/);
});

test("deployment configuration fails closed and never embeds a live Supabase project", () => {
  assert.match(app, /VITE_SUPABASE_URL \?\? ""/);
  assert.match(app, /VITE_SUPABASE_PUBLISHABLE_KEY \|\| import\.meta\.env\.VITE_SUPABASE_ANON_KEY/);
  assert.match(app, /CONFIGURATION_REQUIRED/);
  assert.doesNotMatch(app, /nmzxrjdxvmmzzmajrskm/);
  assert.doesNotMatch(app, /sb_publishable_[A-Za-z0-9_-]{30,}/);
});

test("browser API key validation rejects elevated or malformed credentials", () => {
  assert.match(app, /function browserSafeApiKey/);
  assert.match(app, /\^sb_publishable_/);
  assert.match(app, /key\.startsWith\("sb_secret_"\)/);
  assert.match(app, /legacyKeyRole\(key\) === "anon"/);
  assert.match(app, /browserSafeApiKey\(SUPABASE_PUBLIC_KEY\)/);
  assert.doesNotMatch(app, /SUPABASE_PUBLIC_KEY\.length > 20/);
});

test("restored sessions revalidate the JWT and active staff profile", () => {
  assert.match(app, /\/auth\/v1\/user/);
  assert.match(app, /async function restoreSession/);
  assert.match(app, /return loadStaffProfile\(accessToken, user\.id, signal\)/);
  assert.match(app, /active: z\.literal\(true\)/);
  assert.match(app, /cache: "no-store"/);
  assert.match(app, /جاري التحقق من الجلسة والموظف النشط/);
});

test("authentication rate limits fail safely without account disclosure", () => {
  assert.match(app, /authResponse\.status === 429/);
  assert.match(app, /TOO_MANY_ATTEMPTS/);
  assert.match(app, /Unable to reach the service/);
});

test("CONFIGURATION_REQUIRED is only returned when configurationReady() is false", () => {
  assert.match(app, /if \(!configurationReady\(\)\) throw new Error\("CONFIGURATION_REQUIRED"\)/);
  assert.doesNotMatch(app, /status === 401[^)]*CONFIGURATION_REQUIRED/);
  assert.doesNotMatch(app, /status === 403[^)]*CONFIGURATION_REQUIRED/);
});

test("auth 401 and 403 responses map to invalid credentials, not configuration error", () => {
  assert.match(app, /authResponse\.status === 401 \|\| authResponse\.status === 403.*INVALID_LOGIN/s);
  assert.match(app, /The email or password is incorrect/);
});

test("login error mapping is explicit and bilingual", () => {
  assert.match(app, /Connection settings are incomplete or unsafe/);
  assert.match(app, /The email or password is incorrect/);
  assert.match(app, /This account is not active for Command Center access/);
  assert.match(app, /Unable to reach the service/);
  assert.match(app, /Sign-in failed\. Please try again/);
  assert.match(app, /authMessage\(code: string\)/);
});

test("forgot-password flow uses public recover endpoint with non-enumerating success copy", () => {
  assert.match(app, /requestPasswordReset\(email: string\)/);
  assert.match(app, /\/auth\/v1\/recover/);
  assert.match(app, /RESET_SUCCESS/);
  assert.match(app, /If the email is registered, a password reset message will be sent/);
  assert.match(app, /نسيت كلمة المرور؟/);
  assert.match(app, /Forgot password\?/);
  assert.match(app, /PASSWORD_RESET_PATH/);
  assert.match(envExample, /^VITE_PASSWORD_RESET_PATH=/m);
});

test("System Polish cancels stale reads and handles session expiry consistently", () => {
  assert.match(app, /signal\?: AbortSignal/);
  assert.match(app, /const controller = new AbortController\(\)/);
  assert.match(app, /return \(\) => controller\.abort\(\)/);
  assert.match(app, /cause instanceof DOMException && cause\.name === "AbortError"/);
  assert.match(app, /function CRMView\(\{ value, session, onChanged, onSessionExpired \}/);
  assert.match(app, /if \(code === "SESSION_EXPIRED"\) \{ onSessionExpired\(\); return; \}/);
});

test("System Polish makes controlled interactions accessible and globally locked", () => {
  assert.match(app, /className="skip-link"/);
  assert.match(app, /aria-label="وحدات Command Center"/);
  assert.match(app, /aria-current=\{active === (?:id|sectionId) \? "page" : undefined\}/);
  assert.match(app, /aria-busy=\{status === "loading"\}/);
  assert.match(app, /role="status"/);
  assert.match(app, /disabled=\{!canWrite \|\| busyId !== null\}/);
  assert.match(app, /Number\.isNaN\(followUpDate\.getTime\(\)\)/);
});
