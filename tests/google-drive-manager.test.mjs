import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const view = await readFile(new URL("../src/google-drive-manager-view.tsx", import.meta.url), "utf8");
const archive = await readFile(new URL("../src/massive-archive-view.tsx", import.meta.url), "utf8");
const env = await readFile(new URL("../.env.example", import.meta.url), "utf8");

test("Drive manager uses browser-safe OAuth client configuration", () => {
  assert.match(view, /VITE_GOOGLE_DRIVE_CLIENT_ID/);
  assert.match(env, /VITE_GOOGLE_DRIVE_CLIENT_ID=/);
  assert.doesNotMatch(view, /client_secret|GOOGLE_CLIENT_SECRET|service_role/i);
});

test("Drive manager never persists the Google access token", () => {
  assert.doesNotMatch(view, /localStorage\.(setItem|getItem|removeItem)|sessionStorage\.(setItem|getItem|removeItem)/);
  assert.match(view, /useState\(""\)/);
});

test("Drive manager stays inert until the user connects", () => {
  assert.match(view, /Connect to Google Drive|الاتصال بـ Google Drive/);
  assert.match(view, /async function connect\(\)[\s\S]*await loadGoogleScript\(\)/);
  assert.match(view, /\{!token \? \(/);
  assert.doesNotMatch(view, /useEffect\(\(\) => \{[\s]*loadGoogleScript\(\)/);
  assert.doesNotMatch(view, /useEffect\(\(\) => \{[\s]*ensureGoogleScript\(\)/);
});

test("Drive manager exposes folder browsing and management operations", () => {
  assert.match(view, /in parents and trashed = false/);
  assert.match(view, /mimeType: FOLDER_MIME/);
  assert.match(view, /method: "PATCH"/);
  assert.match(view, /trashed: true/);
  assert.match(view, /uploadType=multipart/);
});

test("Massive Archive preserves existing launcher and adds manager additively", () => {
  assert.match(archive, /archive-launcher-grid/);
  assert.match(archive, /operations-boundary/);
  assert.match(archive, /getArchiveCopy/);
  assert.match(archive, /GoogleDriveManagerView/);
  assert.doesNotMatch(archive, /export \{ default \} from "\.\/google-drive-manager-view"/);
});

test("Drive links open with noopener protection", () => {
  assert.match(view, /target="_blank" rel="noopener noreferrer"/);
});

test("Drive manager supports Arabic and English copy", () => {
  assert.match(view, /useLanguage/);
  assert.match(view, /en:/);
  assert.match(view, /ar:/);
});
