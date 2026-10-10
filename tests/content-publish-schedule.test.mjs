import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL("../supabase/migrations/20260914180000_align_publish_schedule_with_planned_for.sql", import.meta.url),
  "utf8",
);

test("enqueue publish job schedules at planned_for instead of now", () => {
  assert.match(migration, /scheduled_for = v_publish_at/);
  assert.match(migration, /v_publish_at,\s*\n\s*v_now,\s*\n\s*v_now/);
  assert.match(migration, /v_publish_at := v_content\.planned_for/);
  assert.match(migration, /'code', 'PLANNED_FOR_PASSED'/);
  assert.match(migration, /v_now \+ make_interval\(mins => v_ttl\)/);
  assert.doesNotMatch(migration, /\n\s*scheduled_for = v_now,/);
});

test("publish schedule repair aligns future queued jobs with planned_for", () => {
  assert.match(migration, /ci\.planned_for > now\(\)/);
  assert.match(migration, /set next_retry_at = ci\.planned_for/);
  assert.match(migration, /set scheduled_for = ci\.planned_for/);
});
