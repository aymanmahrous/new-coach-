import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL("../supabase/migrations/20260914200000_prepare_approved_publish_schedule.sql", import.meta.url),
  "utf8",
);

test("prepare approved publish schedule is service_role automation prep only", () => {
  assert.match(migration, /prepare_approved_publish_schedule/);
  assert.match(migration, /SERVICE_ROLE_REQUIRED/);
  assert.match(migration, /publishPrepOnly', true/);
  assert.match(migration, /authorizationDeferred', true/);
  assert.doesNotMatch(migration, /owner_publish_authorizations/);
});
