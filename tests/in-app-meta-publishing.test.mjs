import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const panel = await readFile(new URL("../src/content-batch-review-panel.tsx", import.meta.url), "utf8");
const copy = await readFile(new URL("../src/content-publishing-copy.ts", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/20260923100000_record_staff_content_publish_result.sql", import.meta.url), "utf8");

test("approved publish runs through the protected in-app Meta function", () => {
  assert.match(panel, /functions\/v1\/safe-content-publisher/);
  assert.match(panel, /contentItemId/);
  assert.doesNotMatch(panel, /rest\/v1\/rpc\/enqueue_publish_job/);
});

test("publishing copy does not instruct staff to run an external n8n workflow", () => {
  assert.match(copy, /inside the app through the Meta Graph API/);
  assert.match(copy, /من داخل التطبيق عبر Meta Graph API/);
  assert.doesNotMatch(copy, /شغّل n8n|تشغيل n8n|run n8n|waiting for n8n/i);
});

test("publish result RPC is staff-gated, idempotent, and audited", () => {
  assert.match(migration, /is_active_staff\(array\['super_admin', 'admin', 'content_manager'\]\)/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /content_published/);
  assert.match(migration, /content_publish_failed/);
  assert.match(migration, /PUBLISHED_RECORDED/);
  assert.match(migration, /revoke all on function/);
});
