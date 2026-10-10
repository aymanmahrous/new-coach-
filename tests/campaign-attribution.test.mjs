import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../src/main.tsx", import.meta.url), "utf8");

test("Analytics exposes truthful attribution state from the live contract", () => {
  assert.match(source, /analytics\.attributionReady/);
  assert.match(source, /Attribution available/);
  assert.match(source, /Attribution incomplete/);
  assert.match(source, /analytics-trust/);
});

test("Analytics does not fabricate campaign performance or ROI", () => {
  assert.match(source, /do not interpret them as conversions attributed to a campaign or post/);
  assert.doesNotMatch(source, /mockCampaign|fakeCampaign|demoCampaign|synthetic.*ROI/i);
});
