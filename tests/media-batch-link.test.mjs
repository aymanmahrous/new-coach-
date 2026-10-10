import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const batchLink = await readFile(new URL("../src/media-batch-link.ts", import.meta.url), "utf8");
const providers = await readFile(new URL("../src/media-providers.ts", import.meta.url), "utf8");
const growthHub = await readFile(new URL("../src/content-growth-hub.tsx", import.meta.url), "utf8");

test("fallback asset plans stay optional without blocking batch creation", () => {
  assert.match(providers, /status: "NOT_CONNECTED"/);
  assert.match(providers, /do not block batch creation/);
  assert.match(providers, /No suitable Swimming Business media found/);
});

test("coach ayman batch with media is wired through growth hub RPC flow", () => {
  assert.match(batchLink, /buildCoachAyman30DayBatchWithMedia/);
  assert.match(batchLink, /buildCoachAyman2026BatchWithMedia/);
  assert.match(growthHub, /get_staff_media_assets/);
  assert.match(growthHub, /create_staff_generated_content_batch/);
  assert.match(growthHub, /buildCoachAyman30DayBatchWithMedia/);
});
