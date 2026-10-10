import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { buildCreativeBrief, canSelectForCreative } from "../src/media-source-hub.ts";

const source = fs.readFileSync(new URL('../src/media-source-hub.ts', import.meta.url), 'utf8');
const view = fs.readFileSync(new URL('../src/media-source-hub-view.tsx', import.meta.url), 'utf8');

test('media source hub defines all four requested providers and OAuth scopes without adding OAuth', () => {
  assert.match(source, /google_drive/);
  assert.match(source, /google_photos/);
  assert.match(source, /dropbox/);
  assert.match(source, /onedrive/);
  assert.match(source, /photoslibrary\.readonly/);
  assert.match(source, /files\.content\.read/);
  assert.match(source, /Files\.Read/);
  assert.doesNotMatch(view, /access_token|client_secret|oauth2\.init/);
});

test('consent states are fail-closed: needs_review and blocked cannot create marketing briefs', () => {
  const base = { id: "1", name: "candidate.jpg", mimeType: "image/jpeg" };
  assert.equal(canSelectForCreative({ ...base, consent: "needs_review" }), false);
  assert.equal(canSelectForCreative({ ...base, consent: "blocked" }), false);
  assert.equal(buildCreativeBrief({ ...base, consent: "needs_review" }, "ar", "تعليم السباحة"), null);
  assert.equal(buildCreativeBrief({ ...base, consent: "blocked" }, "ar", "تعليم السباحة"), null);
  assert.equal(canSelectForCreative({ ...base, consent: "approved" }), true);
  assert.equal(buildCreativeBrief({ ...base, consent: "approved" }, "ar", "تعليم السباحة")?.approval, "needs_review");
});

test('creative briefs use the current Coach Ayman identity and retain owner review gates', () => {
  assert.match(source, /Coach Ayman Swimming Academy/);
  assert.doesNotMatch(source, /Relax Fix UAE/);
  assert.match(source, /لا نشر تلقائي قبل اعتماد المالك/);
  assert.match(source, /No automatic publishing before owner approval/);
});

test('provider results are filtered and the UI never fabricates provider assets', () => {
  assert.match(source, /filterRemoteMedia/);
  assert.match(source, /matchesProvider/);
  assert.match(source, /haystack\.includes\(normalized\)/);
  assert.match(view, /NO FABRICATED RESULTS/);
  assert.match(view, /No assets are shown until a real provider is connected/);
  assert.doesNotMatch(view, /demo-drive-pool|demo-photos-coach|demo-dropbox-family|demo-onedrive-brand/);
  assert.doesNotMatch(view, /تشغيل تجريبي|Turn demo on/);
});
