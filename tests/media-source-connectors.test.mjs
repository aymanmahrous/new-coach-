import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const connectors = await readFile(new URL("../src/media-source-connectors.ts", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/20260922120000_media_external_sources.sql", import.meta.url), "utf8");
const hardeningMigration = await readFile(new URL("../supabase/migrations/20260922124500_harden_media_external_source_rpc.sql", import.meta.url), "utf8");
const hub = await readFile(new URL("../src/media-source-hub-view.tsx", import.meta.url), "utf8");
const library = await readFile(new URL("../src/media-library-view.tsx", import.meta.url), "utf8");
const growthHub = await readFile(new URL("../src/content-growth-hub.tsx", import.meta.url), "utf8");

test("all four media sources use read-only scopes and normalize real provider results", () => {
  for (const provider of ["google_drive", "google_photos", "dropbox", "onedrive"]) assert.match(connectors, new RegExp(provider));
  assert.match(connectors, /drive\.readonly/);
  assert.match(connectors, /photoslibrary\.readonly/);
  assert.match(connectors, /files\.content\.read/);
  assert.match(connectors, /Files\.Read/);
  assert.match(connectors, /fetchProviderMedia/);
  assert.match(connectors, /consent: "needs_review"/);
  assert.doesNotMatch(connectors, /client_secret|service_role|localStorage|sessionStorage/);
  assert.match(connectors, /const isVideo = \["mp4", "mov", "webm"\]\.includes\(extension\)/);
  assert.match(connectors, /https:\/\/www\.dropbox\.com\/home\$\{encodeURI\(path\)\}/);
});

test("external links are registered in Media Library without storing file bytes", () => {
  assert.match(hub, /register_staff_external_media_asset/);
  assert.match(hub, /p_web_url/);
  assert.match(hub, /Needs review/);
  assert.match(migration, /source = 'external'/);
  assert.match(migration, /storage_path, provider/);
  assert.match(migration, /auth\.uid\(\), p_asset_type, 'external', null/);
  assert.match(migration, /publishability_status, consent_status/);
  assert.match(migration, /'unclassified', 'unclassified', 'not_started', 'blocked', 'unknown'/);
  assert.match(migration, /review_status.*needs_review/);
  assert.match(migration, /external_media_asset_linked/);
  assert.match(hardeningMigration, /REVOKE EXECUTE.*FROM PUBLIC, anon/);
  assert.match(hardeningMigration, /GRANT EXECUTE.*TO authenticated, service_role/);
  assert.match(library, /external_web_url/);
  assert.match(library, /rel="noopener noreferrer"/);
});

test("external assets never become marketing-ready during linking", () => {
  assert.match(migration, /'unclassified', 'unclassified', 'not_started', 'blocked', 'unknown'/);
  assert.doesNotMatch(hub, /create_staff_generated_content_batch/);
  assert.doesNotMatch(hub, /create_staff_generated_content_batch|enqueue_publish_job/);
});

test("Media Library is the single connection control surface", () => {
  assert.match(library, /MediaProviderStrip/);
  assert.doesNotMatch(growthHub, /MediaProviderStrip/);
  assert.match(growthHub, /managed only in Media Library|تتم من مكتبة الوسائط فقط/);
});
