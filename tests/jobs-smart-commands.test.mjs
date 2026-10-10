import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../src/control-tower-v2.tsx", import.meta.url), "utf8");
const style = await readFile(new URL("../src/v2-command-center.css", import.meta.url), "utf8");

test("Smart Commands derive job review results from live summary data", () => {
  assert.match(source, /commandActions/);
  assert.match(source, /summary\.automation\.failed/);
  assert.match(source, /section: "automations"/);
  assert.match(source, /No matching commands in the current data/);
});

test("Smart Commands remain review-only and do not execute publishing", () => {
  assert.match(source, /no publishing or external action runs here/);
  assert.match(source, /Review only/);
  assert.doesNotMatch(source, /executeExternal|service_role|publishContent|publishNow/i);
  assert.match(style, /v2-command-safety/);
});
