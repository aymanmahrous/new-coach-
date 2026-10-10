import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../supabase/migrations/20260920100000_knowledge_crud_phase2.sql", import.meta.url), "utf8");
const ui = await readFile(new URL("../src/knowledge-management.tsx", import.meta.url), "utf8");
const main = await readFile(new URL("../src/main.tsx", import.meta.url), "utf8");
const workspace = await readFile(new URL("../src/real-product-foundation.tsx", import.meta.url), "utf8");

test("Knowledge CRUD has real staff RPC contracts for create, update, duplicate, archive, and restore", () => {
  for (const fn of ["create_staff_knowledge_entry", "update_staff_knowledge_entry", "duplicate_staff_knowledge_entry", "set_staff_knowledge_entry_archived"]) assert.match(migration, new RegExp(`create or replace function public\\.${fn}`));
  assert.match(migration, /insert into public\.audit_logs/);
  assert.match(migration, /PERMISSION_DENIED/);
  assert.match(migration, /is_active=not p_archived/);
  assert.match(ui, /duplicate_staff_knowledge_entry/);
  assert.match(ui, /set_staff_knowledge_entry_archived/);
});

test("Knowledge search and taxonomy use stored data, not fabricated records", () => {
  assert.match(migration, /p_search text default null/);
  assert.match(migration, /ilike '%' \|\| v_search \|\| '%'/);
  assert.match(migration, /from public\.knowledge_entries/);
  assert.match(migration, /create_staff_knowledge_category/);
  assert.match(migration, /create_staff_knowledge_skill/);
  assert.match(ui, /get_staff_knowledge_management/);
  assert.match(ui, /No real records|لا توجد سجلات حقيقية/);
});

test("Relationships are explicit and auditable across knowledge, media, and content", () => {
  assert.match(migration, /create or replace function public\.link_staff_knowledge_entry/);
  assert.match(migration, /create or replace function public\.unlink_staff_knowledge_entry/);
  assert.match(migration, /media_asset_id uuid/);
  assert.match(migration, /content_item_id uuid/);
  assert.match(ui, /relationships/);
  assert.match(ui, /media_asset_id/);
  assert.match(ui, /content_item_id/);
});

test("Generation never claims success without a configured provider", () => {
  assert.match(migration, /generate_staff_knowledge_content_draft/);
  assert.match(migration, /SETUP_REQUIRED: existing content generation provider is not configured/);
  assert.match(ui, /Setup Required/);
  assert.match(ui, /generate_staff_knowledge_content_draft/);
});

test("Knowledge is lazy-loaded and does not add polling", () => {
  assert.match(workspace, /lazy\(\(\) => import\("\.\/knowledge-management"\)\)/);
  assert.doesNotMatch(ui, /setInterval/);
  assert.doesNotMatch(main, /setInterval/);
});

test("Mutation RPCs are granted only to authenticated callers", () => {
  assert.match(migration, /revoke all on function public\.update_staff_knowledge_entry/);
  assert.match(migration, /grant execute on function public\.update_staff_knowledge_entry.*to authenticated/);
  assert.match(migration, /grant execute on function public\.link_staff_knowledge_entry.*to authenticated/);
});

test("Knowledge UI does not expose RPC-rejected actions or allow duplicate mutations", () => {
  assert.match(ui, /const canGenerate = canWrite && session\.role !== "coach"/);
  assert.match(ui, /tab === "categories" \? canGenerate : canWrite/);
  assert.match(ui, /if \(mutationBusy\) return/);
  assert.match(ui, /disabled=\{busy\}/);
});
