import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const panel = await readFile(new URL("../src/content-batch-review-panel.tsx", import.meta.url), "utf8");
const veo = await readFile(new URL("../supabase/functions/generate-veo-video/index.ts", import.meta.url), "utf8");
const hub = await readFile(new URL("../src/content-growth-hub.tsx", import.meta.url), "utf8");

test("Reels workspace describes actual Google Veo generation independently from Runway status", () => {
  assert.match(panel, /Actual video generation uses Google Veo/);
  assert.match(panel, /توليد الفيديو الفعلي يتم عبر Google Veo/);
  assert.match(panel, /functions\/v1\/generate-veo-video/);
  assert.match(veo, /provider: "google_veo"/);
  assert.match(hub, /videoCapabilityState = integrations\.find\(\(integration\) => integration\.key === "runway"\)/);
});
