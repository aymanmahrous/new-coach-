import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildCoachAyman2026BatchItems,
  buildCoachAyman30DayCalendarItems,
  COACH_AYMAN_BATCH_SIZE,
  COACH_AYMAN_MONTH_BATCH_SIZE,
  COACH_AYMAN_PROVIDER_ID,
  CONFIRMED_CTA,
  summarizeCoachAyman30DayBatch,
  summarizeCoachAymanBatch,
  validateCoachAyman30DayBatch,
  validateCoachAymanBatch,
} from "../src/content-batch-generator.ts";

const migration = await readFile(
  new URL("../supabase/migrations/20260911113000_content_batch_generation_batch_id.sql", import.meta.url),
  "utf8",
);

test("batch generation migration assigns one shared batch_id", () => {
  assert.match(migration, /v_batch_id uuid := gen_random_uuid\(\)/);
  assert.match(migration, /batch_id,/);
  assert.match(migration, /'batchId', v_batch_id/);
  assert.doesNotMatch(migration, /\bDROP\b/i);
});

test("coach ayman 2026 batch has 10 platform-specific items", async () => {
  const items = await buildCoachAyman2026BatchItems(new Date("2026-09-11T00:00:00.000Z"), "test-nonce");
  assert.equal(items.length, COACH_AYMAN_BATCH_SIZE);
  const summary = summarizeCoachAymanBatch(items);
  assert.equal(summary.total, 10);
  assert.equal(summary.conversion, 1);
  assert.equal(summary.educational, 9);
  assert.equal(summary.reels, 4);
  assert.ok(summary.contentTypes.length >= 3, "expected varied content types");
  assert.deepEqual(summary.platforms.sort(), ["facebook", "instagram"]);
});

test("coach ayman batch passes safety validation", async () => {
  const items = await buildCoachAyman2026BatchItems(new Date("2026-09-11T00:00:00.000Z"), "validation-nonce");
  const result = validateCoachAymanBatch(items);
  assert.equal(result.valid, true, result.errors.join("; "));
  assert.match(items[0]?.caption ?? "", /058 821 9130 — messages & booking/);
  assert.match(items[0]?.caption ?? "", /055 137 8660 — admin team \(phone calls only\)/);
  assert.match(items[0]?.caption ?? "", /Free initial assessment/);
  assert.match(items.map((item) => item.caption).join("\n"), /Relax Fix UAE/i);
  assert.equal(items.filter((item) => item.platform === "facebook").every((item) => item.hashtags.length === 1), true);
  assert.equal(items.every((item) => item.hashtags[0] === "#RelaxFixUAE"), true);
  assert.doesNotMatch(items.map((item) => item.caption).join("\n"), /guarantee|testimonial|award-winning/i);
});

test("coach ayman batch uses unique fingerprints and planned times", async () => {
  const items = await buildCoachAyman2026BatchItems(new Date("2026-09-11T00:00:00.000Z"), "unique-nonce");
  const fingerprints = new Set(items.map((item) => item.contentFingerprint));
  const planned = new Set(items.map((item) => item.plannedFor));
  assert.equal(fingerprints.size, items.length);
  assert.equal(planned.size, items.length);
  for (const item of items) {
    assert.match(item.contentFingerprint, /^[0-9a-f]{64}$/);
    assert.match(item.visualPrompt, /FORMAT:/);
    assert.match(item.visualPrompt, /CANVA:/);
    assert.match(item.visualPrompt, /CAPCUT:/);
    assert.ok(item.hashtags.length >= 1);
  }
  const contentTypes = new Set(items.map((item) => item.contentType));
  assert.ok(contentTypes.has("carousel"));
  assert.ok(contentTypes.has("reel"));
  assert.ok(contentTypes.has("post"));
  const reelItems = items.filter((item) => item.contentType === "reel");
  assert.equal(reelItems.length, 4);
  for (const reel of reelItems) {
    assert.match(reel.visualPrompt, /VIDEO BRIEF:/);
    assert.match(reel.visualPrompt, /DURATION: 10 seconds \(allowed 5–15 seconds\)/);
  }
});

test("content growth hub links media-aware batch generation", async () => {
  const hub = await readFile(new URL("../src/content-growth-hub.tsx", import.meta.url), "utf8");
  assert.match(hub, /buildCoachAyman30DayBatchWithMedia/);
  assert.match(hub, /get_staff_media_assets/);
  assert.match(hub, /buildNextBatchReadyNotice/);
});

test("coach ayman 30-day calendar has full month mix", async () => {
  const items = await buildCoachAyman30DayCalendarItems(new Date("2026-09-11T00:00:00.000Z"), "month-nonce");
  assert.equal(items.length, COACH_AYMAN_MONTH_BATCH_SIZE);
  const summary = summarizeCoachAyman30DayBatch(items);
  assert.equal(summary.total, 30);
  assert.equal(summary.reels, 12);
  assert.equal(summary.posts, 10);
  assert.equal(summary.stories, 8);
  assert.equal(summary.publishable, 22);
  assert.deepEqual(summary.platforms.sort(), ["facebook", "instagram"]);
});

test("coach ayman 30-day calendar passes safety validation", async () => {
  const items = await buildCoachAyman30DayCalendarItems(new Date("2026-09-11T00:00:00.000Z"), "month-validation");
  const result = validateCoachAyman30DayBatch(items);
  assert.equal(result.valid, true, result.errors.join("; "));
  assert.match(items.map((item) => item.caption).join("\n"), /058 821 9130 — messages & booking/);
  assert.match(items.map((item) => item.caption).join("\n"), /055 137 8660 — admin team \(phone calls only\)/);
  assert.match(items.map((item) => item.caption).join("\n"), /Free initial assessment/);
  for (const story of items.filter((item) => item.contentType === "story")) {
    assert.match(story.visualPrompt, /STORY BRIEF:/);
  }
  for (const reel of items.filter((item) => item.contentType === "reel")) {
    assert.match(reel.visualPrompt, /VIDEO BRIEF:/);
  }
});

test("30-day planned_for migration extends horizon to 45 days", async () => {
  const migration = await readFile(
    new URL("../supabase/migrations/20260914210000_extend_content_batch_planned_for_window.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /interval '45 days'/);
  assert.doesNotMatch(migration, /interval '31 days'/);
});

test("provider id is stable for automation handoff", () => {
  assert.equal(COACH_AYMAN_PROVIDER_ID, "command-center-coach-ayman-2026");
  assert.match(CONFIRMED_CTA, /058 821 9130 — messages & booking/);
});
