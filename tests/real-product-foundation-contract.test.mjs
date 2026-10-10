import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../supabase/migrations/20260920050000_command_center_real_product_foundation.sql", import.meta.url), "utf8");

test("real product foundation keeps the update additive and relational", () => {
  for (const table of [
    "knowledge_categories",
    "knowledge_skills",
    "knowledge_entry_links",
    "student_progress_records",
    "student_badges",
    "student_certificates",
    "customer_reviews",
    "campaign_ctwa_drafts",
    "attribution_events",
  ]) assert.match(migration, new RegExp(`create table if not exists public\\.${table}`));
  assert.match(migration, /references public\.knowledge_entries\(id\)/);
  assert.match(migration, /references public\.content_items\(id\)/);
  assert.match(migration, /references public\.leads\(id\)/);
  assert.match(migration, /references public\.booking_requests\(id\)/);
  assert.match(migration, /alter table public\.student_certificates enable row level security/);
  assert.match(migration, /get_staff_real_product_workspace/);
  assert.match(migration, /meta_status.*setup_required/);
  assert.doesNotMatch(migration, /auto.?publish/i);
});

test("sensitive creation contracts are staff-gated and audited", () => {
  assert.match(migration, /create_staff_knowledge_entry/);
  assert.match(migration, /create_staff_ctwa_draft/);
  assert.match(migration, /PERMISSION_DENIED/);
  assert.match(migration, /insert into public\.audit_logs/);
});

test("attribution explicitly reports incomplete data when no events exist", () => {
  assert.match(migration, /'incomplete_data'/);
  assert.match(migration, /from public\.attribution_events/);
});
