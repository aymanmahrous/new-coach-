import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL("../supabase/migrations/20260914190000_defer_publish_authorization_to_due_time.sql", import.meta.url),
  "utf8",
);

test("enqueue publish job defers authorization until due time", () => {
  assert.match(migration, /authorizationDeferred', true/);
  assert.match(migration, /'code', 'SCHEDULED_FOR_PUBLISH'/);
  assert.match(migration, /publishPrepOnly', true/);
  assert.match(migration, /content_publish_job_scheduled/);
  assert.doesNotMatch(migration, /insert into public\.owner_publish_authorizations/);
});

test("enqueue publish job clears premature manual authorizations", () => {
  assert.match(migration, /PREMATURE_MANUAL_AUTH_CLEARED/);
  assert.match(migration, /expires_at < ci\.scheduled_for/);
});
