import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { isDatabaseBatchId, readBatchId, sharedDatabaseBatchId } from "../src/content-batch.ts";

const migration = await readFile(
  new URL("../supabase/migrations/20260911100000_content_batch_safety_foundation.sql", import.meta.url),
  "utf8",
);

test("migration is additive and preserves existing content access patterns", () => {
  assert.match(migration, /ADD COLUMN IF NOT EXISTS batch_id uuid NULL/);
  assert.match(migration, /'batchId', c\.batch_id/);
  assert.match(migration, /approve_staff_content_batch/);
  assert.doesNotMatch(migration, /\bDROP\b/i);
  assert.doesNotMatch(migration, /\bTRUNCATE\b/i);
  assert.doesNotMatch(migration, /\bDELETE FROM\b/i);
  assert.doesNotMatch(migration, /ALTER TABLE public\.content_items\s+DROP/i);
  assert.doesNotMatch(migration, /RENAME COLUMN/i);
});

test("batch approval RPC uses staff auth and never schedules or publishes", () => {
  assert.match(migration, /is_active_staff\(array\['super_admin','admin','content_manager'\]\)/);
  assert.match(migration, /status = 'approved', scheduled_for = null/);
  assert.match(migration, /if v_item\.status not in \('draft', 'generated', 'needs_review'\)/);
  assert.match(migration, /'code', 'ALREADY_APPROVED'/);
  assert.doesNotMatch(migration, /insert into public\.background_jobs[\s\S]*'publish_content'/i);
  assert.doesNotMatch(migration, /p_action.*schedule/i);
  assert.doesNotMatch(migration, /status = 'scheduled'/i);
  assert.doesNotMatch(migration, /status = 'published'/i);
});

test("batch approval RPC is granted only to authenticated roles", () => {
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.approve_staff_content_batch\(uuid\) TO authenticated, service_role/);
});

test("database batch id helper accepts UUID batch ids only", () => {
  assert.equal(isDatabaseBatchId("9cf29b08-aaa3-4278-80bc-08a4cf3bc381"), true);
  assert.equal(isDatabaseBatchId("review-window-2026-09-01T10:00:00.000Z"), false);
  assert.equal(isDatabaseBatchId("batch-a"), false);
});

test("shared database batch id requires one explicit UUID across items", () => {
  const uuid = "9cf29b08-aaa3-4278-80bc-08a4cf3bc381";
  const items = [
    { id: "1", batchId: uuid, status: "needs_review", createdAt: "2026-09-01T10:00:00.000Z", platform: "facebook", contentType: "post", caption: "a", topic: "a", scheduledFor: null },
    { id: "2", batch_id: uuid, status: "draft", createdAt: "2026-09-01T11:00:00.000Z", platform: "facebook", contentType: "post", caption: "b", topic: "b", scheduledFor: null },
  ];
  assert.equal(sharedDatabaseBatchId(items), uuid);
  assert.equal(sharedDatabaseBatchId([{ ...items[0], batchId: "other" }, items[1]]), null);
  assert.equal(sharedDatabaseBatchId([{ ...items[0], batchId: "review-window-x" }]), null);
});

test("readBatchId still supports passthrough keys", () => {
  assert.equal(readBatchId({ batchId: "x" }), "x");
  assert.equal(readBatchId({ batch_id: "y" }), "y");
});
