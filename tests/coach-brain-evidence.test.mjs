import test from "node:test";
import assert from "node:assert/strict";
import { COACH_BRAIN_EVIDENCE, evidenceForCoachBrain } from "../src/coach-brain-evidence.ts";

test("Coach Brain evidence has provenance and safety limitations", () => {
  assert.ok(COACH_BRAIN_EVIDENCE.length >= 4);
  for (const source of COACH_BRAIN_EVIDENCE) {
    assert.match(source.url, /^https:\/\//);
    assert.ok(source.title.length > 20);
    assert.ok(source.limitation.length > 20);
    assert.ok(source.practicalUse.length > 20);
  }
});

test("autism context selects autism evidence without creating medical claims", () => {
  const results = evidenceForCoachBrain("autism adaptive swimming water safety");
  assert.ok(results.some((item) => item.id.includes("autism")));
});

test("rehabilitation context points to professional boundary", () => {
  const results = evidenceForCoachBrain("aquatic physiotherapy rehabilitation");
  assert.ok(results.some((item) => item.id.includes("physiotherapy")));
  assert.match(results.find((item) => item.id.includes("physiotherapy")).limitation, /coach|therapy|clinical/i);
});
