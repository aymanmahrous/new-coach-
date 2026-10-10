import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../supabase/migrations/20260920120000_safe_staff_job_commands.sql", import.meta.url), "utf8");
const app = await readFile(new URL("../src/operations-queue-view.tsx", import.meta.url), "utf8");

 test("safe job commands are audited and never delete rows", () => {
  assert.match(migration, /retry_staff_publish_job/);
  assert.match(migration, /cancel_staff_background_job/);
  assert.match(migration, /background_job_retried/);
  assert.match(migration, /background_job_cancelled/);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.background_jobs/i);
});

test("retry refuses ambiguous or active publish states", () => {
  assert.match(migration, /PUBLISH_RECEIPT_REQUIRES_MANUAL_CHECK/);
  assert.match(migration, /ACTIVE_JOB_ALREADY_EXISTS/);
  assert.match(migration, /PLANNED_FOR_NOT_FUTURE/);
});

test("operations UI exposes only guarded retry and cancel actions", () => {
  assert.match(app, /Safe retry/);
  assert.match(app, /Cancel job/);
  assert.match(app, /retry_staff_publish_job/);
  assert.match(app, /cancel_staff_background_job/);
  assert.match(app, /job\.status === "failed"/);
  assert.doesNotMatch(app, /\["failed", "dead"\]\.includes\(job\.status\)/);
});
