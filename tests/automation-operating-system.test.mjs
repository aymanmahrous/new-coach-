import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const source = await readFile(new URL("../src/control-tower-v2.tsx", import.meta.url), "utf8");
test("Operating System renders workflow intelligence from the live summary", () => {
  assert.match(source, /deriveWorkflowActions/);
  assert.match(source, /workflowActions/);
  assert.match(source, /Data-derived operating actions/);
  assert.match(source, /summary\.automation\.failed/);
});
test("Operating System actions are review-only and route through existing sections", () => {
  assert.match(source, /Review only; any external action requires owner approval/);
  assert.match(source, /action\.area === "bookings" \? "planner"/);
  assert.match(source, /onClick=\{\(\) => onNavigate\(target\)\}/);
  assert.doesNotMatch(source, /fetch\([^)]*publish|service_role|executeExternal/i);
});
test("Failed content and automation actions route to their owning sections", () => {
  assert.match(source, /contentNeedsAttention = review \+ summary\.content\.failed/);
  assert.match(source, /count: contentNeedsAttention[\s\S]{0,180}section: "content"/);
  assert.match(source, /summary\.automation\.failed > 0[\s\S]{0,220}section: "automations"/);
  assert.doesNotMatch(source, /operational issues need review/);
});
